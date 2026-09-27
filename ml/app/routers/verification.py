"""AL6: QR verification and the post-conversation flow (MASTER_SPEC 3.6, 7.4, 9).

Spec endpoints: GET /qr/verify-token, POST /qr/verify, GET /conversations/pending,
GET /conversations/{id}/checklist, POST /conversations/{id}/feedback.
Compatibility aliases for the older docs/api.md 8-10 names the mobile client was typed against:
GET /qr/token, POST /handshake, POST /feedback.
"""
from fastapi import APIRouter, Depends
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, Field, model_validator

from .. import conversations, db, gps, matching, qr
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter()


@router.get("/qr/verify-token")
@router.get("/qr/token")
def verify_token(user: User = Depends(current_user)):
    """Shown as a QR code; refresh every 30 s (expires after 60 s, single use)."""
    return qr.sign(user.id)


class VerifyBody(BaseModel):
    payload: str = Field(max_length=500)
    signature: str = Field(max_length=200)
    event_id: int | None = None


@router.post("/qr/verify")
@router.post("/handshake")
def verify(body: VerifyBody, user: User = Depends(current_user)):
    ensure_profile(user.id)
    other, nonce = qr.verify(body.payload, body.signature)
    if other == user.id:
        raise ApiError(400, "self_scan")
    if not db.fetchone("select 1 as ok from profiles where id = %s", (other,)):
        raise ApiError(400, "invalid_signature")
    blocked = db.fetchone("select 1 as ok from blocks where (blocker_id = %s and blocked_id = %s) "
                          "or (blocker_id = %s and blocked_id = %s)", (user.id, other, other, user.id))
    if blocked:
        raise ApiError(403, "this profile isn't available")
    event_id = matching.conversation_event(user.id, other, body.event_id)
    try:
        with db.conn() as c:
            hs = c.execute("insert into handshakes (scanner_id, scanned_id, event_id, nonce) values (%s, %s, %s, %s) "
                           "returning id", (user.id, other, event_id, nonce)).fetchone()["id"]
            conv_id, _ = conversations.create_conversation(c, user.id, other, "qr", event_id)
    except UniqueViolation:
        raise ApiError(409, "already_used")
    return {"conversation_id": conv_id, "handshake_id": hs, "other": conversations.other_card(other),
            "checklist": conversations.checklist(user.id, other, event_id)}


@router.get("/conversations/pending")
def pending(user: User = Depends(current_user)):
    return {"conversations": conversations.pending(user.id)}


def _conversation(conversation_id: int, user: User) -> dict:
    c = conversations.get_for(conversation_id, user.id)
    if c is None:
        raise ApiError(404, "conversation not found")
    return c


@router.get("/conversations/{conversation_id}/checklist")
def checklist(conversation_id: int, user: User = Depends(current_user)):
    c = _conversation(conversation_id, user)
    return {"conversation_id": c["id"], "other": conversations.other_card(c["other"]),
            "checklist": conversations.checklist(user.id, c["other"], c["event_id"])}


class FeedbackBody(BaseModel):
    talked_about: list[int] = Field(default_factory=list, max_length=50)
    other_topic: str = Field(default="", max_length=300)
    wants_connect: bool


@router.post("/conversations/{conversation_id}/feedback")
def feedback(conversation_id: int, body: FeedbackBody, user: User = Depends(current_user)):
    _conversation(conversation_id, user)
    return conversations.submit_feedback(conversation_id, user.id, body.talked_about, body.other_topic,
                                         body.wants_connect)


class LegacyFeedbackBody(FeedbackBody):
    conversation_id: int | None = None
    handshake_id: int | None = None

    @model_validator(mode="after")
    def _one_id(self):
        if self.conversation_id is None and self.handshake_id is None:
            raise ValueError("conversation_id or handshake_id is required")
        return self


@router.post("/feedback")
def legacy_feedback(body: LegacyFeedbackBody, user: User = Depends(current_user)):
    conv_id = body.conversation_id
    if conv_id is None:
        h = db.fetchone("select scanner_id::text as a, scanned_id::text as b, ts from handshakes where id = %s",
                        (body.handshake_id,))
        if not h or user.id not in (h["a"], h["b"]):
            raise ApiError(404, "conversation not found")
        lo, hi = sorted([h["a"], h["b"]])
        row = db.fetchone("select id from conversations where user_a = %s and user_b = %s "
                          "order by abs(extract(epoch from created_at - %s)) limit 1", (lo, hi, h["ts"]))
        if not row:
            raise ApiError(404, "conversation not found")
        conv_id = row["id"]
    return feedback(conv_id, FeedbackBody(talked_about=body.talked_about, other_topic=body.other_topic,
                                          wants_connect=body.wants_connect), user)


class SimulateBody(BaseModel):
    user_id: str


@router.post("/conversations/simulate")
def simulate(body: SimulateBody, user: User = Depends(current_user)):
    """Demo attendees can't tap phones: after a mutual yes, create the verified conversation (demo only)."""
    from .. import conversations, synthetic
    cid = synthetic.simulate_conversation(user.id, body.user_id)
    return next((p for p in conversations.pending(user.id) if p["conversation_id"] == cid),
                {"conversation_id": cid})


# Explicit opt-in exchange; neither endpoint persists or returns raw coordinates.


@router.post("/proximity/token")
def proximity_token(body: gps.Fix, user: User = Depends(current_user)):
    return gps.issue(user.id, body)


class ProximityVerifyBody(BaseModel):
    code: str = Field(min_length=1, max_length=4096)
    location: gps.Fix
    event_id: int | None = None


@router.post("/proximity/verify")
def proximity_verify(body: ProximityVerifyBody, user: User = Depends(current_user)):
    signed = gps.check(body.code, body.location)
    return verify(VerifyBody(payload=signed["payload"], signature=signed["signature"],
                             event_id=body.event_id), user)
