"""Private invites: people you already know (MASTER_SPEC 3.7, task AK4). Owner: Akshar.

Rules this file enforces (AGENTS.md product rules):
- Token: random 128 bits (secrets.token_urlsafe(16)). Only its SHA-256 hash is stored.
- 7-day expiry, revocable by the sender, single use, 10 new invites per sender per rolling 24 hours.
- Accept creates the connection (how_met = 'invite'). Decline or ignore writes nothing,
  so the sender can never tell a "no" from silence.

Mounted via ROUTERS in app/main.py. Storage goes through `InviteStore`: `PgInviteStore` (Postgres,
service connection) in the app, `MemoryInviteStore` in tests/test_invites.py.
"""
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Protocol

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import db
from app.deps import get_user_id
from app.errors import ApiError

INVITE_TTL = timedelta(days=7)
DAILY_LIMIT = 10
# https link served by the dashboard (works from any camera app), which redirects to
# formalconnect://invite/<token>. Falls back to the raw deep link until the dashboard page exists.
INVITE_BASE_URL = os.getenv("INVITE_BASE_URL", "formalconnect://invite").rstrip("/")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _err(status: int, code: str) -> JSONResponse:
    return JSONResponse({"error": code}, status_code=status)


# ---------- storage ----------

class InviteStore(Protocol):
    def count_created_since(self, sender_id: str, since: datetime) -> int: ...
    def insert_invite(self, row: Dict) -> Dict: ...
    def get_by_hash(self, token_hash: str) -> Optional[Dict]: ...
    def get_by_id(self, invite_id: int) -> Optional[Dict]: ...
    def update_invite(self, invite_id: int, fields: Dict) -> None: ...
    def list_by_sender(self, sender_id: str) -> List[Dict]: ...
    def get_profile(self, user_id: str) -> Optional[Dict]: ...
    def is_blocked(self, a: str, b: str) -> bool: ...
    def connection_exists(self, a: str, b: str) -> bool: ...
    def accept(self, invite_id: int, sender_id: str, recipient_id: str) -> None: ...


class MemoryInviteStore:
    """In-memory store with the same semantics as the `invites`/`connections` tables."""

    def __init__(self) -> None:
        self.invites: Dict[int, Dict] = {}
        self.profiles: Dict[str, Dict] = {}
        self.blocks: set = set()
        self.connections: Dict[tuple, Dict] = {}
        self._next_id = 1

    def count_created_since(self, sender_id, since):
        return sum(1 for r in self.invites.values() if r["sender_id"] == sender_id and r["created_at"] >= since)

    def insert_invite(self, row):
        row = dict(row, id=self._next_id)
        self.invites[self._next_id] = row
        self._next_id += 1
        return row

    def get_by_hash(self, token_hash):
        return next((r for r in self.invites.values() if r["token_hash"] == token_hash), None)

    def get_by_id(self, invite_id):
        return self.invites.get(invite_id)

    def update_invite(self, invite_id, fields):
        self.invites[invite_id].update(fields)

    def list_by_sender(self, sender_id):
        return sorted((r for r in self.invites.values() if r["sender_id"] == sender_id),
                      key=lambda r: r["created_at"], reverse=True)

    def get_profile(self, user_id):
        return self.profiles.get(user_id)

    def is_blocked(self, a, b):
        return (a, b) in self.blocks or (b, a) in self.blocks

    def connection_exists(self, a, b):
        return tuple(sorted((a, b))) in self.connections

    def insert_connection(self, user_a, user_b, how_met, invite_id):
        self.connections[(user_a, user_b)] = {"how_met": how_met, "invite_id": invite_id}

    def accept(self, invite_id, sender_id, recipient_id):
        if not self.connection_exists(sender_id, recipient_id):
            self.insert_connection(*sorted((sender_id, recipient_id)), "invite", invite_id)
        self.update_invite(invite_id, {"status": "accepted", "used_by": recipient_id})


def _norm(row: Optional[Dict]) -> Optional[Dict]:
    """psycopg returns uuid columns as UUID objects; the router compares them with the caller's id string."""
    if row is None:
        return None
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in row.items()}


class PgInviteStore:
    """Postgres via Alan's pool (service role: every query filters by the caller itself)."""

    def count_created_since(self, sender_id, since):
        return db.fetchone("select count(*) as n from invites where sender_id = %s and created_at >= %s",
                           (sender_id, since))["n"]

    def insert_invite(self, row):
        return _norm(db.fetchone(
            "insert into invites (sender_id, token_hash, channel, recipient_hint, note, status, expires_at, created_at) "
            "values (%(sender_id)s, %(token_hash)s, %(channel)s, %(recipient_hint)s, %(note)s, %(status)s, "
            "%(expires_at)s, %(created_at)s) returning *", row))

    def get_by_hash(self, token_hash):
        return _norm(db.fetchone("select * from invites where token_hash = %s", (token_hash,)))

    def get_by_id(self, invite_id):
        return _norm(db.fetchone("select * from invites where id = %s", (invite_id,)))

    def update_invite(self, invite_id, fields):
        sets = ", ".join(f"{k} = %({k})s" for k in fields)  # keys are ours, never user input
        db.execute(f"update invites set {sets} where id = %(id)s", {**fields, "id": invite_id})

    def list_by_sender(self, sender_id):
        return [_norm(r) for r in db.fetchall(
            "select * from invites where sender_id = %s order by created_at desc limit 100", (sender_id,))]

    def get_profile(self, user_id):
        return db.fetchone("select name, photo_url, headline from profiles where id = %s", (user_id,))

    def is_blocked(self, a, b):
        return db.fetchone("select 1 as ok from blocks where (blocker_id = %s and blocked_id = %s) "
                           "or (blocker_id = %s and blocked_id = %s)", (a, b, b, a)) is not None

    def connection_exists(self, a, b):
        lo, hi = sorted((a, b))
        return db.fetchone("select 1 as ok from connections where user_a = %s and user_b = %s", (lo, hi)) is not None

    def accept(self, invite_id, sender_id, recipient_id):
        from app import population, social
        lo, hi = sorted((sender_id, recipient_id))
        with db.conn() as c:  # one transaction: connection, invite, chat, notification
            # Re-check under a row lock so two people can't both use a single-use invite.
            row = c.execute("select status from invites where id = %s for update", (invite_id,)).fetchone()
            if row["status"] != "active":
                raise ApiError(410, "expired")
            new = c.execute("insert into connections (user_a, user_b, how_met, invite_id) values (%s, %s, 'invite', %s) "
                            "on conflict (user_a, user_b) do nothing returning user_a", (lo, hi, invite_id)).fetchone()
            c.execute("update invites set status = 'accepted', used_by = %s where id = %s", (recipient_id, invite_id))
            if new:
                social.ensure_chat(c, sender_id, recipient_id, "connection")
                social.notify(c, sender_id, "connected", {"user_id": recipient_id, "how_met": "invite"})
                social.notify(c, recipient_id, "connected", {"user_id": sender_id, "how_met": "invite"})
        population.invalidate()


# ---------- dependencies (overridden by the app) ----------

def get_invite_store() -> InviteStore:
    return PgInviteStore()


# ---------- request bodies ----------

class CreateInviteBody(BaseModel):
    channel: str = Field("link", pattern="^(link|qr|contact)$")
    recipient_hint: Optional[str] = Field(None, max_length=120)  # sender's private label, never shown to anyone else
    note: Optional[str] = Field(None, max_length=280)            # shown to the recipient


class RespondBody(BaseModel):
    response: str = Field(..., pattern="^(accept|decline)$")


# ---------- helpers ----------

def _effective_status(row: Dict, now: datetime) -> str:
    if row["status"] == "active" and row["expires_at"] <= now:
        return "expired"
    return row["status"]


def _public_invite(row: Dict, now: datetime) -> Dict:
    """Sender's view of their own invite. Never includes the token or who declined."""
    return {
        "invite_id": row["id"],
        "channel": row["channel"],
        "recipient_hint": row.get("recipient_hint"),
        "note": row.get("note"),
        "status": _effective_status(row, now),
        "expires_at": _iso(row["expires_at"]),
        "created_at": _iso(row["created_at"]),
    }


def _usable_invite(store: InviteStore, token: str, user_id: str, now: datetime):
    """Returns (row, None) or (None, error response). Blocked pairs look like a missing invite."""
    row = store.get_by_hash(hash_token(token))
    if row is None or store.is_blocked(row["sender_id"], user_id):
        return None, _err(404, "not_found")
    if _effective_status(row, now) != "active":
        return None, _err(410, "expired")
    return row, None


# ---------- routes ----------

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", status_code=201)
def create_invite(body: CreateInviteBody, user_id: str = Depends(get_user_id),
                  store: InviteStore = Depends(get_invite_store)):
    now = _now()
    if store.count_created_since(user_id, now - timedelta(days=1)) >= DAILY_LIMIT:
        return _err(429, "rate_limited")
    token = secrets.token_urlsafe(16)
    expires_at = now + INVITE_TTL
    row = store.insert_invite({
        "sender_id": user_id, "token_hash": hash_token(token), "channel": body.channel,
        "recipient_hint": body.recipient_hint, "note": body.note, "status": "active",
        "used_by": None, "expires_at": expires_at, "created_at": now,
    })
    url = f"{INVITE_BASE_URL}/{token}"
    # The token itself is returned exactly once, here. It is never stored or logged.
    return JSONResponse({"invite_id": row["id"], "url": url, "qr_payload": url,
                         "expires_at": _iso(expires_at)}, status_code=201)


@router.get("")
def list_my_invites(user_id: str = Depends(get_user_id), store: InviteStore = Depends(get_invite_store)):
    now = _now()
    return {"invites": [_public_invite(r, now) for r in store.list_by_sender(user_id)]}


@router.delete("/{invite_id}")
def revoke_invite(invite_id: int, user_id: str = Depends(get_user_id),
                  store: InviteStore = Depends(get_invite_store)):
    row = store.get_by_id(invite_id)
    if row is None or row["sender_id"] != user_id:  # someone else's invite looks missing
        return _err(404, "not_found")
    if row["status"] == "active":
        store.update_invite(invite_id, {"status": "revoked"})
    return {"ok": True}


@router.get("/resolve/{token}")
def resolve_invite(token: str, user_id: str = Depends(get_user_id),
                   store: InviteStore = Depends(get_invite_store)):
    now = _now()
    row, err = _usable_invite(store, token, user_id, now)
    if err:
        return err
    sender = store.get_profile(row["sender_id"]) or {}
    return {
        "sender": {"user_id": row["sender_id"], "name": sender.get("name"),
                   "photo_url": sender.get("photo_url"), "headline": sender.get("headline") or ""},
        "note": row.get("note"),
        "expires_at": _iso(row["expires_at"]),
        "is_own": row["sender_id"] == user_id,
        "already_connected": store.connection_exists(row["sender_id"], user_id),
    }


@router.post("/{token}/respond")
def respond_invite(token: str, body: RespondBody, user_id: str = Depends(get_user_id),
                   store: InviteStore = Depends(get_invite_store)):
    now = _now()
    row, err = _usable_invite(store, token, user_id, now)
    if err:
        return err
    sender_id = row["sender_id"]
    if sender_id == user_id:
        return _err(400, "self_invite")
    if body.response == "decline":
        # Deliberately a no-op: the invite stays active and nothing records the "no".
        return {"status": "ok"}
    store.accept(row["id"], sender_id, user_id)
    sender = store.get_profile(sender_id) or {}
    return {"status": "connected", "connection": {"user_id": sender_id, "name": sender.get("name")}}
