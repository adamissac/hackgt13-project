"""AL11: POST /assistant/chat (MASTER_SPEC 6.12, 9)."""
from typing import Literal

from fastapi import APIRouter, Depends
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
