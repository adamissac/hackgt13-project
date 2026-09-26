"""Stand-in behavior for seeded demo attendees (profiles.is_synthetic = true), so the live app's core loop
can be shown against Arjun's population. Real people are never affected: every query here requires the
acting profile to be synthetic.

What a synthetic attendee does (tick every few seconds, tasks.synthetic_tick):
- says yes to a suggestion once the real person has said yes (-> mutual match, chat opens),
- replies to chat messages in character (Claude Haiku, grounded in their seeded profile),
- says yes to connecting after a verified conversation (so the real person's yes completes it).
Suggestions (suggestions.plan_room) never pair two synthetic people, and a synthetic person's own
percentile/daily cap never blocks a real person's suggestion.

Meeting in person can't be simulated by a phone, so POST /conversations/simulate (routers/verification)
creates the verified conversation for a mutual match with a synthetic attendee only.
"""
import logging

from . import db, social

log = logging.getLogger("synthetic")
MAX_REPLIES_PER_CHAT = 12
REPLY_AFTER_S = 2


def synthetic_ids(ids: list[str]) -> set[str]:
    if not ids:
        return set()
    return {r["id"] for r in db.fetchall(
        "select id::text as id from profiles where coalesce(is_synthetic, false) and id = any(%s::uuid[])", (ids,))}


def is_synthetic(user_id: str) -> bool:
    return bool(synthetic_ids([user_id]))


# ---------------------------------------------------------------- suggestions
def accept_pending_suggestions() -> int:
    """Synthetic side says yes after the real side said yes. Goes through the real respond endpoint."""
    rows = db.fetchall(
        "select s.id, case when pa.is_synthetic then s.user_a else s.user_b end::text as syn "
        "from suggestions s join profiles pa on pa.id = s.user_a join profiles pb on pb.id = s.user_b "
        "where s.status = 'pending' and (s.expires_at is null or s.expires_at > now()) "
        "and ((coalesce(pa.is_synthetic, false) and not coalesce(pb.is_synthetic, false) "
        "      and s.a_response = 'pending' and s.b_response = 'yes') "
        "  or (coalesce(pb.is_synthetic, false) and not coalesce(pa.is_synthetic, false) "
        "      and s.b_response = 'pending' and s.a_response = 'yes'))")
    from .auth import User
    from .routers.suggestions import Respond, respond
    for r in rows:
        try:
            respond(r["id"], Respond(response="yes"), User(id=r["syn"]))
        except Exception:
            log.exception("synthetic accept failed for suggestion %s", r["id"])
    return len(rows)


# ---------------------------------------------------------------- chat
def _persona(user_id: str) -> dict:
    p = db.fetchone("select name, headline, role, seeking, offering from profiles where id = %s", (user_id,)) or {}
    interests = [r["name"] for r in db.fetchall(
        "select i.canonical_name as name from user_interests ui join interests i on i.id = ui.interest_id "
        "where ui.user_id = %s and not ui.hidden order by ui.weight desc limit 10", (user_id,))]
    return {**p, "interests": interests}


def _reply_text(persona: dict, history: list[dict]) -> str:
    from ml.config import LLM_FAST
    from ml.llm import client
    first = (persona.get("name") or "there").split(" ")[0]
    system = (
        f"You are {persona.get('name')}, an attendee at HackGT 13 (Georgia Tech hackathon), texting someone the app "
        f"matched you with; you both said you want to meet in person. You are a {persona.get('role') or 'student'}. "
        f"Headline: {persona.get('headline') or 'n/a'}. Interests: {', '.join(persona.get('interests') or []) or 'n/a'}. "
        f"Looking for: {persona.get('seeking') or 'n/a'}. Can offer: {persona.get('offering') or 'n/a'}.\n"
        "Reply like a real person texting at a hackathon: 1-2 short, friendly sentences, casual, no emoji spam, "
        "no markdown. Talk about your actual interests when relevant. If they suggest meeting, agree and name a "
        "concrete spot (e.g. the sponsor tables, the Klaus atrium, the snack table). Never say you are an AI "
        f"or a demo. Sign nothing; you are {first}.")
    msgs = [{"role": "assistant" if m["mine"] else "user", "content": m["body"]} for m in history[-10:]]
    while msgs and msgs[0]["role"] == "assistant":
        msgs.pop(0)
    if not msgs:
        return ""
    resp = client().messages.create(model=LLM_FAST, max_tokens=200, system=system, messages=msgs)
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()


def reply_to_chats() -> int:
    """Chats with one synthetic participant whose latest message is from the real person."""
    rows = db.fetchall(
        "select c.id, case when pa.is_synthetic then c.user_a else c.user_b end::text as syn "
        "from chats c join profiles pa on pa.id = c.user_a join profiles pb on pb.id = c.user_b "
        "where coalesce(pa.is_synthetic, false) <> coalesce(pb.is_synthetic, false)")
    n = 0
    for r in rows:
        msgs = db.fetchall("select sender_id::text as sender, body, created_at from messages where chat_id = %s "
                           "order by created_at, id", (r["id"],))
        if not msgs or msgs[-1]["sender"] == r["syn"]:
            continue
        if sum(1 for m in msgs if m["sender"] == r["syn"]) >= MAX_REPLIES_PER_CHAT:
            continue
        age = db.fetchone("select extract(epoch from now() - %s) as s", (msgs[-1]["created_at"],))["s"]
        if age < REPLY_AFTER_S:
            continue
        try:
            text = _reply_text(_persona(r["syn"]), [{"mine": m["sender"] == r["syn"], "body": m["body"]} for m in msgs])
        except Exception:
            log.exception("synthetic reply failed for chat %s", r["id"])
            continue
        if text:
            db.execute("insert into messages (chat_id, sender_id, body, is_ai_draft) values (%s, %s, %s, false)",
                       (r["id"], r["syn"], text[:1000]))
            n += 1
    return n


# ---------------------------------------------------------------- connecting
def agree_to_connect() -> int:
    """Synthetic side of every verified conversation answers 'yes, connect' (topics: what they share)."""
    rows = db.fetchall(
        "select c.id, p.id::text as syn from conversations c "
        "join profiles p on p.id in (c.user_a, c.user_b) and coalesce(p.is_synthetic, false) "
        "where not exists (select 1 from feedback f where f.conversation_id = c.id and f.rater_id = p.id) "
        "and exists (select 1 from profiles q where q.id in (c.user_a, c.user_b) and not coalesce(q.is_synthetic, false))")
    from .conversations import submit_feedback
    for r in rows:
        try:
            submit_feedback(r["id"], r["syn"], [], "", True)
        except Exception:
            log.exception("synthetic connect failed for conversation %s", r["id"])
    return len(rows)


def tick() -> dict:
    return {"accepted": accept_pending_suggestions(), "replied": reply_to_chats(), "connected": agree_to_connect()}


def simulate_conversation(viewer: str, other: str) -> int:
    """Verified conversation with a synthetic attendee the viewer mutually matched with (demo only)."""
    from .conversations import create_conversation
    from .errors import ApiError
    if not is_synthetic(other) or is_synthetic(viewer):
        raise ApiError(403, "only available with demo attendees")
    lo, hi = sorted([viewer, other])
    s = db.fetchone("select id, event_id from suggestions where user_a = %s and user_b = %s and status = 'matched' "
                    "order by created_at desc limit 1", (lo, hi))
    if not s:
        raise ApiError(403, "you can simulate meeting only after you both said yes")
    with db.conn() as c:
        cid, _ = create_conversation(c, viewer, other, "qr", event_id=s["event_id"], suggestion_id=s["id"], minutes=8.0)
    return cid
