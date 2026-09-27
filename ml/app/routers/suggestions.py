"""AL5: "Do you want to meet X?" (MASTER_SPEC 3.3, 7.5, 9).

Silent consent: POST /suggestions/{id}/respond returns {"status": "waiting"} for every outcome except a
mutual yes, whatever the other person did (pending, no, or the suggestion expired). Only a mutual yes
returns {"status": "matched", "chat_id": ...}.
"""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import db, social
from ..auth import User, current_user
from ..errors import ApiError

router = APIRouter(prefix="/suggestions")


@router.get("")
def list_suggestions(user: User = Depends(current_user)):
    """Open suggestions waiting for MY answer. Never shows the other person's answer."""
    rows = db.fetchall(
        "select s.id, s.context, s.event_id, s.building_id, s.score, s.shared_topics, s.expires_at, "
        "o.id::text as other_id, o.name, o.photo_url, o.role, o.headline "
        "from suggestions s join profiles o on o.id = case when s.user_a = %s then s.user_b else s.user_a end "
        "where (s.user_a = %s and s.a_response = 'pending' or s.user_b = %s and s.b_response = 'pending') "
        "and s.status = 'pending' and (s.expires_at is null or s.expires_at > now()) "
        "order by s.created_at desc", (user.id, user.id, user.id))
    return {"suggestions": [{
        "suggestion_id": r["id"], "context": r["context"], "event_id": r["event_id"], "building_id": r["building_id"],
        "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
        "other": {"user_id": r["other_id"], "name": r["name"], "photo_url": r["photo_url"], "role": r["role"],
                  "headline": r["headline"] or ""},
        "score": round(float(r["score"] or 0), 4),
        "shared_topics": [t["name"] for t in (r["shared_topics"] or [])],
    } for r in rows]}


class Respond(BaseModel):
    response: Literal["yes", "no"]


class DemoMeet(BaseModel):
    user_id: str


@router.post("/demo")
def demo_meet(body: DemoMeet, user: User = Depends(current_user)):
    """Demo attendees only (profiles.is_synthetic): say yes to meeting them now, without waiting until you're both
    around. Same silent-consent answer as /respond: "waiting" unless they said yes."""
    from .. import synthetic
    return synthetic.request_meet(user.id, body.user_id)


@router.post("/{suggestion_id}/respond")
def respond(suggestion_id: int, body: Respond, user: User = Depends(current_user)):
    with db.conn() as c:
        s = c.execute("select * from suggestions where id = %s for update", (suggestion_id,)).fetchone()
        if not s or user.id not in (str(s["user_a"]), str(s["user_b"])):
            raise ApiError(404, "suggestion not found")
        mine, theirs = ("a_response", "b_response") if str(s["user_a"]) == user.id else ("b_response", "a_response")
        if s["status"] == "matched":
            chat = c.execute("select id from chats where user_a = %s and user_b = %s",
                             (s["user_a"], s["user_b"])).fetchone()
            return {"status": "matched", "chat_id": chat["id"] if chat else None}
        live = s["status"] == "pending" and (s["expires_at"] is None or c.execute(
            "select %s > now() as ok", (s["expires_at"],)).fetchone()["ok"])
        if live and s[mine] == "pending":
            c.execute(f"update suggestions set {mine} = %s where id = %s", (body.response, suggestion_id))
            if body.response == "yes" and s[theirs] == "yes":
                a, b = str(s["user_a"]), str(s["user_b"])
                chat_id = social.ensure_chat(c, a, b, "suggestion")
                c.execute("update suggestions set status = 'matched' where id = %s", (suggestion_id,))
                for u, other in ((a, b), (b, a)):
                    social.notify(c, u, "suggestion", {"suggestion_id": suggestion_id, "status": "matched",
                                                       "chat_id": chat_id, "other_user_id": other})
                return {"status": "matched", "chat_id": chat_id}
    return {"status": "waiting"}
