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

Wiring (AL1): `app.include_router(ble.router)`, override `deps.get_user_id` and `ble.get_ble_store`.
"""
import base64
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Protocol

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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
    def token_exists(self, token: str) -> bool: ...
    def insert_tokens(self, rows: List[Dict]) -> None: ...
    def resolve_token(self, token: str, ts: datetime) -> Optional[str]: ...
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

    def token_exists(self, token):
        return token in self.tokens

    def insert_tokens(self, rows):
        for r in rows:
            self.tokens[r["token"]] = dict(r)

    def resolve_token(self, token, ts):
        r = self.tokens.get(token)
        return r["user_id"] if r and r["valid_from"] <= ts < r["valid_to"] else None

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


def get_ble_store() -> BleStore:
    raise NotImplementedError("wire a Supabase-backed BleStore (AL1) via app.dependency_overrides")


# ---------- logic ----------

def issue_tokens(store: BleStore, user_id: str, now: datetime) -> List[Dict]:
    """One token per 10-minute window from the current window through the next 24 hours.
    Idempotent: windows that already have a token keep it, so re-fetching never changes what
    the phone is advertising right now."""
    start = window_start(now)
    end = start + BATCH_SPAN
    have = {r["valid_from"]: r for r in store.tokens_for_user(user_id, start, end)}
    new_rows = []
    t = start
    while t < end:
        if t not in have:
            tok = new_token()
            while store.token_exists(tok) or any(r["token"] == tok for r in new_rows):
                tok = new_token()
            row = {"token": tok, "user_id": user_id, "valid_from": t, "valid_to": t + WINDOW}
            new_rows.append(row)
            have[t] = row
        t += WINDOW
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
    for s in body.sightings:
        ts = s.ts if s.ts.tzinfo else s.ts.replace(tzinfo=timezone.utc)
        owner = store.resolve_token(s.token, ts)
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
