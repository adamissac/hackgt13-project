"""AL10: connections feed endpoints (MASTER_SPEC 3.8, 6.11, 9)."""
import base64
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ml.embed import embed

from .. import db, feed, matching
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter(prefix="/feed")


def _decode(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
    except Exception:
        raise ApiError(400, "invalid cursor")


@router.get("")
def get_feed(cursor: str | None = None, limit: int = Query(feed.PAGE, ge=1, le=50), event_id: int | None = None,
             user: User = Depends(current_user)):
    start = _decode(cursor)
    entries = feed.build_feed(user.id)
    if event_id is not None:
        # Inside an event: only updates from people also checked in there (you must be checked in yourself).
        if not matching.is_checked_in(user.id, event_id):
            raise ApiError(403, "check in to this event first")
        here = {r["id"] for r in db.fetchall("select user_id::text as id from attendance where event_id = %s", (event_id,))}
        entries = [e for e in entries if (e.get("author") or {}).get("user_id") in here]
    page = entries[start:start + limit]
    nxt = start + limit
    return {"items": page,
            "next_cursor": base64.urlsafe_b64encode(str(nxt).encode()).decode() if nxt < len(entries) else None}


class PostBody(BaseModel):
    kind: Literal["post", "update"]
    body: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=500)


@router.post("/posts", status_code=201)
def create_post(body: PostBody, user: User = Depends(current_user)):
    ensure_profile(user.id)
    text = " ".join(x for x in (body.title, body.body) if x)
    r = db.fetchone(
        "insert into feed_items (author_id, kind, title, body, url, embedding) values (%s, %s, %s, %s, %s, %s) "
        "returning id, created_at", (user.id, body.kind, body.title, body.body, body.url, embed([text])[0]))
    return {"item_id": r["id"], "kind": body.kind, "title": body.title, "body": body.body, "url": body.url,
            "created_at": r["created_at"].isoformat()}


@router.post("/{item_id}/reply-suggestion")
def reply_suggestion(item_id: int, user: User = Depends(current_user)):
    from ml import generation
    visible = {r["id"]: r for r in feed.visible_items(user.id, days=60, include_own=False)}
    r = visible.get(item_id)
    if r is None:
        raise ApiError(404, "item not found")
    me = db.fetchone("select name from profiles where id = %s", (user.id,)) or {}
    talked = feed.talked_topics(user.id).get(r["author_id"], [])
    first = lambda n: (n or "").split(" ")[0] or "there"
    try:
        text = generation.reply_suggestion(first(me.get("name")), first(r["name"]), r, talked)
    except Exception:
        text = generation.template_reply(first(r["name"]), r, talked)
    return {"reply": text}


@router.get("/insights")
def get_insights(days: int = Query(7, ge=1, le=30), user: User = Depends(current_user)):
    return feed.insights(user.id, days)
