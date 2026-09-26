"""AL11: POST /assistant/chat (MASTER_SPEC 6.12, 9)."""
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from .. import assistant
from ..auth import User, current_user
from ..errors import ApiError

router = APIRouter(prefix="/assistant")


class Msg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatBody(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=30)
    event_id: int | None = None


class DemoBody(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=20)
    context: dict


# Demo mode has no account, so it's rate limited per client IP and globally (in-memory, per process).
_demo_hits: dict[str, list[float]] = {}
DEMO_PER_IP_PER_MIN = 12
DEMO_GLOBAL_PER_HOUR = 600


def _demo_allowed(ip: str) -> bool:
    import time
    now = time.time()
    hits = [t for t in _demo_hits.get(ip, []) if now - t < 60]
    total = sum(1 for ts in _demo_hits.values() for t in ts if now - t < 3600)
    if len(hits) >= DEMO_PER_IP_PER_MIN or total >= DEMO_GLOBAL_PER_HOUR:
        return False
    _demo_hits[ip] = hits + [now]
    return True


@router.post("/demo")
def demo(body: DemoBody, request: Request):
    """Assistant for the app's demo mode: real model, but it only sees the demo data the app sends."""
    if body.messages[-1].role != "user":
        raise ApiError(422, "invalid request: the last message must be from the user")
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0]
    if not _demo_allowed(ip.strip()):
        raise ApiError(429, "slow down a little and try again in a minute")
    try:
        reply = assistant.demo_chat([m.model_dump() for m in body.messages], body.context)
    except Exception:
        assistant.log.exception("demo assistant failed")
        raise ApiError(503, "the assistant is unavailable right now")
    return {"reply": reply}


@router.post("/chat")
def chat(body: ChatBody, user: User = Depends(current_user)):
    if body.messages[-1].role != "user":
        raise ApiError(422, "invalid request: the last message must be from the user")
    try:
        reply = assistant.chat(user.id, [m.model_dump() for m in body.messages], body.event_id)
    except Exception:
        assistant.log.exception("assistant failed")
        raise ApiError(503, "the assistant is unavailable right now")
    return {"reply": reply}
