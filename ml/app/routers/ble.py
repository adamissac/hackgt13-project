"""Ephemeral Bluetooth tokens and sighting uploads (MASTER_SPEC 7.1, 7.3, 7.7; task AK2). Owner: Akshar.

Privacy rules this file enforces (AGENTS.md):
- Tokens are random and rotate every 10 minutes. Only the server maps token -> user (ephemeral_ids).
- Phones upload what they heard (token, RSSI, time). Nothing identifying about the observed
  phone is accepted: no MAC address, no device name.
- Raw sightings older than 24 hours are deleted (`purge_old_sightings`, run it from the app's
  scheduled loop).

Token size: 5 random bytes as 8 base32 characters. iOS only advertises a local name next to our
128-bit service UUID, leaving about 8 to 10 bytes, so a 13-character (8-byte) token risks truncation.
40 bits keeps collisions negligible at event scale, and issuance retries on the rare clash.

Mounted via ROUTERS in app/main.py. Alan's AL8 reads `sightings` + `ephemeral_ids`; his retention task also
deletes sightings older than 24 h. Tests use `MemoryBleStore`; the app uses `PgBleStore`.
"""
import base64
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Protocol

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import db
from app.deps import get_user_id

WINDOW = timedelta(minutes=10)
BATCH_SPAN = timedelta(hours=24)
RETENTION = timedelta(hours=24)
MAX_SIGHTINGS_PER_BATCH = 2000
MAX_CLOCK_SKEW = timedelta(minutes=2)
TOKEN_LEN = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_token() -> str:
    """8 lowercase base32 characters from 5 random bytes (40 bits)."""
    return base64.b32encode(secrets.token_bytes(5)).decode().lower()


def window_start(t: datetime) -> datetime:
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    n = (t - epoch) // WINDOW
    return epoch + n * WINDOW


# ---------- storage ----------

class BleStore(Protocol):
    def tokens_for_user(self, user_id: str, start: datetime, end: datetime) -> List[Dict]: ...
    def existing_tokens(self, tokens: List[str]) -> set: ...
    def insert_tokens(self, rows: List[Dict]) -> None: ...
    def token_rows(self, tokens: List[str]) -> Dict[str, Dict]: ...
    def insert_sightings(self, rows: List[Dict]) -> None: ...
    def delete_sightings_before(self, cutoff: datetime) -> int: ...
    def delete_tokens_before(self, cutoff: datetime) -> int: ...


class MemoryBleStore:
    """In-memory store with the semantics of the `ephemeral_ids` and `sightings` tables."""

    def __init__(self) -> None:
        self.tokens: Dict[str, Dict] = {}
        self.sightings: List[Dict] = []

    def tokens_for_user(self, user_id, start, end):
        rows = [r for r in self.tokens.values()
                if r["user_id"] == user_id and r["valid_to"] > start and r["valid_from"] < end]
        return sorted(rows, key=lambda r: r["valid_from"])

    def existing_tokens(self, tokens):
        return {t for t in tokens if t in self.tokens}

    def insert_tokens(self, rows):
        for r in rows:
            self.tokens[r["token"]] = dict(r)

    def token_rows(self, tokens):
        return {t: self.tokens[t] for t in set(tokens) if t in self.tokens}

    def insert_sightings(self, rows):
        self.sightings.extend(dict(r) for r in rows)

    def delete_sightings_before(self, cutoff):
        before = len(self.sightings)
        self.sightings = [s for s in self.sightings if s["ts"] >= cutoff]
        return before - len(self.sightings)

    def delete_tokens_before(self, cutoff):
        old = [t for t, r in self.tokens.items() if r["valid_to"] < cutoff]
        for t in old:
            del self.tokens[t]
        return len(old)


class PgBleStore:
    """Postgres via Alan's pool. `sightings` has no event_id/device_model/foreground columns yet, so
    those fields are accepted but not stored (see PROGRESS)."""

    def tokens_for_user(self, user_id, start, end):
        return db.fetchall("select token, user_id, valid_from, valid_to from ephemeral_ids "
                           "where user_id = %s and valid_to > %s and valid_from < %s order by valid_from",
                           (user_id, start, end))

    # Every method is ONE round trip: Railway -> Supabase is ~150 ms per query, so per-row queries turned a
    # 144-token batch into ~290 round trips (40+ s) and starved the connection pool.
    def existing_tokens(self, tokens):
        return {r["token"] for r in db.fetchall("select token from ephemeral_ids where token = any(%s)", (list(tokens),))}

    def insert_tokens(self, rows):
        db.execute("insert into ephemeral_ids (token, user_id, valid_from, valid_to) "
                   "select * from unnest(%s::text[], %s::uuid[], %s::timestamptz[], %s::timestamptz[])",
                   ([r["token"] for r in rows], [r["user_id"] for r in rows],
                    [r["valid_from"] for r in rows], [r["valid_to"] for r in rows]))

    def token_rows(self, tokens):
        return {r["token"]: r for r in db.fetchall(
            "select token, user_id::text as user_id, valid_from, valid_to from ephemeral_ids where token = any(%s)",
            (list(set(tokens)),))}

    def insert_sightings(self, rows):
        db.execute("insert into sightings (observer_id, observed_token, rssi, ts, zone_id) "
                   "select * from unnest(%s::uuid[], %s::text[], %s::smallint[], %s::timestamptz[], %s::bigint[])",
                   ([r["observer_id"] for r in rows], [r["observed_token"] for r in rows], [r["rssi"] for r in rows],
                    [r["ts"] for r in rows], [r["zone_id"] for r in rows]))

    def delete_sightings_before(self, cutoff):
        with db.conn() as c:
            return c.execute("delete from sightings where ts < %s", (cutoff,)).rowcount

    def delete_tokens_before(self, cutoff):
        with db.conn() as c:
            return c.execute("delete from ephemeral_ids where valid_to < %s", (cutoff,)).rowcount


def get_ble_store() -> BleStore:
    return PgBleStore()


# ---------- logic ----------

def issue_tokens(store: BleStore, user_id: str, now: datetime) -> List[Dict]:
    """One token per 10-minute window from the current window through the next 24 hours.
    Idempotent: windows that already have a token keep it, so re-fetching never changes what
    the phone is advertising right now."""
    start = window_start(now)
    end = start + BATCH_SPAN
    have = {r["valid_from"]: r for r in store.tokens_for_user(user_id, start, end)}
    missing = []
    t = start
    while t < end:
        if t not in have:
            missing.append(t)
        t += WINDOW
    # Draw candidates for every missing window, then check them all in one query; redraw only clashes.
    chosen: Dict[datetime, str] = {}
    todo = list(missing)
    while todo:
        cand = {w: new_token() for w in todo}
        taken = store.existing_tokens(list(cand.values())) | set(chosen.values())
        seen = set()
        for w, tok in cand.items():
            if tok not in taken and tok not in seen:
                chosen[w] = tok
                seen.add(tok)
        todo = [w for w in todo if w not in chosen]
    new_rows = [{"token": chosen[w], "user_id": user_id, "valid_from": w, "valid_to": w + WINDOW} for w in missing]
    for r in new_rows:
        have[r["valid_from"]] = r
    if new_rows:
        store.insert_tokens(new_rows)
    return [have[k] for k in sorted(have)]


def purge_old_sightings(store: BleStore, now: Optional[datetime] = None) -> Dict[str, int]:
    """Retention (MASTER_SPEC 7.7): raw sightings and expired tokens older than 24 h are deleted."""
    cutoff = (now or _now()) - RETENTION
    return {"sightings": store.delete_sightings_before(cutoff), "tokens": store.delete_tokens_before(cutoff)}


# ---------- request bodies ----------

class SightingIn(BaseModel):
    token: str = Field(..., min_length=TOKEN_LEN, max_length=TOKEN_LEN, pattern="^[a-z2-7]+$")
    rssi: int = Field(..., ge=-127, le=20)
    ts: datetime
    zone_id: Optional[int] = None


class SightingsBody(BaseModel):
    event_id: Optional[int] = None
    device_model: Optional[str] = Field(None, max_length=80)  # the observer's own model, for per-model calibration
    foreground: Optional[bool] = None
    sightings: List[SightingIn] = Field(..., max_length=MAX_SIGHTINGS_PER_BATCH)


# ---------- routes ----------

router = APIRouter(prefix="/ble", tags=["ble"])


@router.post("/tokens")
def post_tokens(user_id: str = Depends(get_user_id), store: BleStore = Depends(get_ble_store)):
    rows = issue_tokens(store, user_id, _now())
    return {"tokens": [{"token": r["token"], "valid_from": _iso(r["valid_from"]), "valid_to": _iso(r["valid_to"])}
                       for r in rows]}


@router.post("/sightings")
def post_sightings(body: SightingsBody, user_id: str = Depends(get_user_id),
                   store: BleStore = Depends(get_ble_store)):
    now = _now()
    rows, dropped = [], 0
    known = store.token_rows([s.token for s in body.sightings]) if body.sightings else {}
    for s in body.sightings:
        ts = s.ts if s.ts.tzinfo else s.ts.replace(tzinfo=timezone.utc)
        k = known.get(s.token)
        owner = k["user_id"] if k and k["valid_from"] <= ts < k["valid_to"] else None
        # Drop: stale or future timestamps, tokens that weren't live at that time, and our own tokens.
        if ts < now - RETENTION or ts > now + MAX_CLOCK_SKEW or owner is None or owner == user_id:
            dropped += 1
            continue
        rows.append({"observer_id": user_id, "observed_token": s.token, "rssi": s.rssi, "ts": ts,
                     "zone_id": s.zone_id, "event_id": body.event_id,
                     "device_model": body.device_model, "foreground": body.foreground})
    if rows:
        store.insert_sightings(rows)
    return JSONResponse({"accepted": len(rows), "dropped": dropped})
