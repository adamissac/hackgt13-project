"""Tap to verify: "hold your phones together" (Akshar; MASTER_SPEC 3.5 / 7.4 in-person verification).

Both people open the Tap screen and hold their phones together. Each phone keeps advertising its rotating token
(AK2) and, once it has heard the other's token at a very strong signal (>= TAP_RSSI_DBM, i.e. touching) for about
2 seconds, claims it here. When BOTH directions are claimed within TAP_WINDOW, the conversation is verified
(method 'ble': it is Bluetooth proximity evidence) and both get the usual checklist + silent connect prompt.

Why both directions: one phone alone can't prove the other person agreed to be there. A bystander who merely
hears a token can't finish a tap without the other phone also claiming them back.
The signed QR stays the always-available fallback.

Pending claims live in process memory for TAP_WINDOW seconds (single uvicorn process for the hackathon).
"""
import threading
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import conversations, db, matching
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter(prefix="/tap", tags=["tap"])

TAP_RSSI_DBM = -50    # phones touching or a few cm apart; across a table is ~-60 to -70
TAP_WINDOW = 15.0     # seconds both claims must fall within
_claims: dict[tuple[str, str], float] = {}   # (claimer, claimed) -> monotonic time
_lock = threading.Lock()


class Claim(BaseModel):
    token: str = Field(min_length=8, max_length=8, pattern="^[a-z2-7]+$")
    rssi: int = Field(ge=-127, le=20)          # the claimer's smoothed RSSI for that token
    event_id: int | None = None


def _owner_now(token: str) -> str | None:
    """Token owner if the token is live now (or was in the last minute: rotation can happen mid-tap)."""
    r = db.fetchone("select user_id::text as u from ephemeral_ids where token = %s "
                    "and valid_from <= now() and valid_to > now() - interval '1 minute'", (token,))
    return r["u"] if r else None


def _record(me: str, other: str) -> bool:
    """Store my claim; True if the other person claimed me within the window."""
    now = time.monotonic()
    with _lock:
        for k in [k for k, t in _claims.items() if now - t > TAP_WINDOW]:
            del _claims[k]
        _claims[(me, other)] = now
        return (other, me) in _claims


def reset() -> None:  # tests
    with _lock:
        _claims.clear()


@router.post("/claim")
def claim(body: Claim, user: User = Depends(current_user)):
    if body.rssi < TAP_RSSI_DBM:
        raise ApiError(400, "too_far")
    other = _owner_now(body.token)
    if other is None:
        raise ApiError(404, "not_found")
    if other == user.id:
        raise ApiError(400, "self_scan")
    blocked = db.fetchone("select 1 as ok from blocks where (blocker_id = %s and blocked_id = %s) "
                          "or (blocker_id = %s and blocked_id = %s)", (user.id, other, other, user.id))
    if blocked:
        raise ApiError(403, "this profile isn't available")
    if not _record(user.id, other):
        return {"status": "waiting"}
    ensure_profile(user.id)
    event_id = body.event_id if body.event_id is not None else matching.shared_event(user.id, other)
    with db.conn() as c:
        # Both phones end up here (each sees the other's claim); the 10-minute dedupe returns the same row.
        conv_id, _ = conversations.create_conversation(c, user.id, other, "ble", event_id)
    return {"status": "verified", "conversation_id": conv_id, "handshake_id": None,
            "other": conversations.other_card(other),
            "checklist": conversations.checklist(user.id, other, event_id)}
