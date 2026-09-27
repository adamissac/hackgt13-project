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

Demo shortcuts (only ever with a synthetic attendee; the real flows above stay in place for real people):
- POST /suggestions/demo: the real person asks to meet a synthetic attendee without waiting for both to be
  "around". The attendee says yes immediately (and is open to meet), so the match and chat open on that request.
- After a verified conversation, the attendee also says yes to connecting on the same pass, before any chat reply.
- Location: once the real person shares their location on a matched meetup, the synthetic attendee shares a
  made-up point about 48 m away that walks toward them.
"""
import hashlib
import logging
import math

from . import db, social

log = logging.getLogger("synthetic")
MAX_REPLIES_PER_CHAT = 12
REPLY_AFTER_S = 2
RETRY_AFTER_FAILURE_S = 60
_retry_at: dict[int, float] = {}   # chat_id -> monotonic time; don't hammer the model while it's failing


def synthetic_ids(ids: list[str]) -> set[str]:
    if not ids:
        return set()
    return {r["id"] for r in db.fetchall(
        "select id::text as id from profiles where coalesce(is_synthetic, false) and id = any(%s::uuid[])", (ids,))}


def is_synthetic(user_id: str) -> bool:
    return bool(synthetic_ids([user_id]))


# ---------------------------------------------------------------- suggestions
DEMO_MARK = "demo-request"     # suggestions.building_id of a meet request started with POST /suggestions/demo
APPROACH_START_M = 48.0
WALK_M_PER_S = 3.0
CLOSEST_M = 12.0


def _h(*parts) -> int:
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest(), 16)


def shy(syn: str) -> bool:
    """Demo attendees always answer. Kept so older callers can still ask."""
    return False


def answer_after_s(suggestion_id: int) -> int:
    return 0


def request_meet(viewer: str, other: str) -> dict:
    """POST /suggestions/demo: the viewer says yes to meeting a synthetic attendee right away."""
    from ml import scoring

    from . import matching, population
    from .auth import User
    from .errors import ApiError
    from .routers.suggestions import Respond, respond
    if is_synthetic(viewer) or not is_synthetic(other):
        raise ApiError(403, "only available with demo attendees")
    lo, hi = sorted([viewer, other])
    if db.fetchone("select 1 as ok from blocks where (blocker_id = %s and blocked_id = %s) "
                   "or (blocker_id = %s and blocked_id = %s)", (lo, hi, hi, lo)):
        raise ApiError(404, "person not found")
    open_s = db.fetchone("select id from suggestions where user_a = %s and user_b = %s and status in ('pending', 'matched') "
                         "and (expires_at is null or expires_at > now()) order by created_at desc limit 1", (lo, hi))
    if open_s:
        respond(open_s["id"], Respond(response="yes"), User(id=viewer))
        _accept_rows(_pending_rows(open_s["id"]))
        return _meet_status(open_s["id"])
    people, index = population.build([lo, hi])
    by_id = {p["id"]: p for p in people}
    score, shared = 0.0, []
    if len(by_id) == 2:
        score, _ = matching.pair_score(by_id[lo], by_id[hi], index)
        shared = [{"interest_id": x["id"], "name": x["name"], "contribution": round(x["contribution"], 4)}
                  for x in scoring.shared_interests(by_id[lo], by_id[hi], index, 5)]
    from psycopg.types.json import Jsonb
    event_id = matching.shared_event(viewer, other)
    mine = "a_response" if viewer == lo else "b_response"
    sid = db.fetchone(
        f"insert into suggestions (user_a, user_b, context, event_id, building_id, score, shared_topics, {mine}, expires_at) "
        "values (%s, %s, %s, %s, %s, %s, %s, 'yes', now() + interval '30 minutes') returning id",
        (lo, hi, "event" if event_id else "public", event_id, DEMO_MARK, float(score), Jsonb(shared)))["id"]
    _accept_rows(_pending_rows(sid))
    return _meet_status(sid)


def _meet_status(suggestion_id: int) -> dict:
    s = db.fetchone("select user_a, user_b, status from suggestions where id = %s", (suggestion_id,))
    if not s or s["status"] != "matched":
        return {"suggestion_id": suggestion_id, "status": "waiting"}
    chat = db.fetchone("select id from chats where user_a = %s and user_b = %s", (s["user_a"], s["user_b"]))
    return {"suggestion_id": suggestion_id, "status": "matched", "chat_id": chat["id"] if chat else None}


def _pending_rows(suggestion_id: int | None = None) -> list:
    """Real person already said yes; the synthetic side has not."""
    sql = (
        "select s.id, s.building_id, extract(epoch from now() - s.created_at) as age, "
        "case when pa.is_synthetic then s.user_a else s.user_b end::text as syn "
        "from suggestions s join profiles pa on pa.id = s.user_a join profiles pb on pb.id = s.user_b "
        "where s.status = 'pending' and (s.expires_at is null or s.expires_at > now()) "
        "and ((coalesce(pa.is_synthetic, false) and not coalesce(pb.is_synthetic, false) "
        "      and s.a_response = 'pending' and s.b_response = 'yes') "
        "  or (coalesce(pb.is_synthetic, false) and not coalesce(pa.is_synthetic, false) "
        "      and s.b_response = 'pending' and s.a_response = 'yes'))")
    if suggestion_id is None:
        return db.fetchall(sql)
    return db.fetchall(sql + " and s.id = %s", (suggestion_id,))


def _accept_rows(rows: list) -> int:
    """Synthetic side says yes. Goes through the real respond endpoint."""
    from .auth import User
    from .routers.suggestions import Respond, respond
    for r in rows:
        try:
            if r["building_id"] == DEMO_MARK:   # they said yes to meeting: they're open to meet (location sharing needs it)
                db.execute("update profiles set open_to_meet = true where id = %s and is_synthetic", (r["syn"],))
            respond(r["id"], Respond(response="yes"), User(id=r["syn"]))
        except Exception:
            log.exception("synthetic accept failed for suggestion %s", r["id"])
    return len(rows)


def accept_pending_suggestions() -> int:
    return _accept_rows(_pending_rows())


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
        import time
        if _retry_at.get(r["id"], 0) > time.monotonic():
            continue
        try:
            text = _reply_text(_persona(r["syn"]), [{"mine": m["sender"] == r["syn"], "body": m["body"]} for m in msgs])
        except Exception:
            log.exception("synthetic reply failed for chat %s; retrying in %ss", r["id"], RETRY_AFTER_FAILURE_S)
            _retry_at[r["id"]] = time.monotonic() + RETRY_AFTER_FAILURE_S
            continue
        _retry_at.pop(r["id"], None)
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


# ---------------------------------------------------------------- location (made up)
def approach_point(lat: float, lng: float, syn: str, elapsed_s: float) -> tuple[float, float]:
    """A point that starts ~48 m from the real person and walks toward them, from a direction fixed per person."""
    d = max(CLOSEST_M, APPROACH_START_M - WALK_M_PER_S * max(0.0, elapsed_s))
    bearing = math.radians(_h("bearing", syn) % 360)
    dlat = d * math.cos(bearing) / 111_320
    dlng = d * math.sin(bearing) / (111_320 * max(0.2, math.cos(math.radians(lat))))
    return lat + dlat, lng + dlng


def share_locations() -> int:
    """For each matched meetup where the real person shares and the other is synthetic, move the synthetic point."""
    rows = db.fetchall(
        "select ls.suggestion_id, ls.lat, ls.lng, ls.expires_at, extract(epoch from now() - (ls.expires_at - "
        "interval '30 minutes')) as elapsed, case when s.user_a = ls.user_id then s.user_b else s.user_a end::text as syn "
        "from location_shares ls join suggestions s on s.id = ls.suggestion_id and s.status = 'matched' "
        "join profiles me on me.id = ls.user_id and not coalesce(me.is_synthetic, false) "
        "join profiles o on o.id = case when s.user_a = ls.user_id then s.user_b else s.user_a end "
        "and coalesce(o.is_synthetic, false) where ls.expires_at > now()")
    for r in rows:
        lat, lng = approach_point(r["lat"], r["lng"], r["syn"], float(r["elapsed"]))
        db.execute("update profiles set open_to_meet = true where id = %s and is_synthetic", (r["syn"],))
        db.execute("insert into location_shares (suggestion_id, user_id, lat, lng, updated_at, expires_at) "
                   "values (%s, %s, %s, %s, now(), %s) on conflict (suggestion_id, user_id) do update "
                   "set lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at",
                   (r["suggestion_id"], r["syn"], lat, lng, r["expires_at"]))
    return len(rows)


def tick() -> dict:
    # Connect before chat replies: a slow model call must not hold up "yes, let's connect".
    return {"accepted": accept_pending_suggestions(), "connected": agree_to_connect(), "replied": reply_to_chats(),
            "located": share_locations()}


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
    agree_to_connect()
    return cid
