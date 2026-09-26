"""Private invites: people you already know (MASTER_SPEC 3.7, task AK4). Owner: Akshar.

Rules this file enforces (AGENTS.md product rules):
- Token: random 128 bits (secrets.token_urlsafe(16)). Only its SHA-256 hash is stored.
- 7-day expiry, revocable by the sender, single use, 10 new invites per sender per rolling 24 hours.
- Accept creates the connection (how_met = 'invite'). Decline or ignore writes nothing,
  so the sender can never tell a "no" from silence.

Wiring (for AL1's app): `app.include_router(invites.router)` and override the two
dependencies below, e.g.
    app.dependency_overrides[invites.get_user_id] = verify_supabase_jwt
    app.dependency_overrides[invites.get_invite_store] = lambda: SupabaseInviteStore(...)
The store only needs the methods on `InviteStore`; `MemoryInviteStore` is the reference
implementation used by tests/test_invites.py.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Protocol

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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
    def insert_connection(self, user_a: str, user_b: str, how_met: str, invite_id: int) -> None: ...


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


# ---------- dependencies (overridden by the app) ----------

def get_user_id() -> str:
    raise NotImplementedError("wire Supabase JWT verification (AL1) via app.dependency_overrides")


def get_invite_store() -> InviteStore:
    raise NotImplementedError("wire a Supabase-backed InviteStore (AL1) via app.dependency_overrides")


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
    if not store.connection_exists(sender_id, user_id):
        a, b = sorted((sender_id, user_id))  # connections requires user_a < user_b
        store.insert_connection(a, b, "invite", row["id"])
    store.update_invite(row["id"], {"status": "accepted", "used_by": user_id})
    sender = store.get_profile(sender_id) or {}
    return {"status": "connected", "connection": {"user_id": sender_id, "name": sender.get("name")}}
