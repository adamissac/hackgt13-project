"""Verified conversations, the post-conversation checklist, and mutual connect (MASTER_SPEC 3.6, 7.4).

Silent consent for connecting:
- both said yes            -> "connected" (connections row how_met='in_person' + chat + notifications)
- I said no                -> "no_connection" (I already know my own answer)
- I said yes, other no/pending -> "waiting", forever. Their "no" leaves no trace.
"""
from ml import scoring

from . import db, matching, population, social

DEDUPE_MINUTES = 10
CHECKLIST_SIZE = 5


def create_conversation(conn, a: str, b: str, method: str, event_id: int | None = None,
                        suggestion_id: int | None = None, minutes: float | None = None,
                        p_conversation: float | None = None, started_at=None, ended_at=None) -> tuple[int, bool]:
    """Returns (conversation_id, created). Both people scanning each other within a few minutes (or BLE and
    QR both firing) reuse the same conversation instead of prompting twice."""
    lo, hi = sorted([a, b])
    recent = conn.execute(
        "select id from conversations where user_a = %s and user_b = %s "
        "and created_at > now() - make_interval(mins => %s) order by created_at desc limit 1",
        (lo, hi, DEDUPE_MINUTES)).fetchone()
    if recent:
        return recent["id"], False
    if suggestion_id is None and matching.table_exists("suggestions"):
        s = conn.execute("select id from suggestions where user_a = %s and user_b = %s and status = 'matched' "
                         "order by created_at desc limit 1", (lo, hi)).fetchone()
        suggestion_id = s["id"] if s else None
    cid = conn.execute(
        "insert into conversations (user_a, user_b, method, event_id, suggestion_id, started_at, ended_at, minutes, "
        "p_conversation) values (%s, %s, %s, %s, %s, coalesce(%s, now()), %s, %s, %s) returning id",
        (lo, hi, method, event_id, suggestion_id, started_at, ended_at, minutes, p_conversation)).fetchone()["id"]
    # verified proximity ends any live meetup location sharing between them (MASTER_SPEC 7.6)
    if matching.table_exists("location_shares"):
        conn.execute("delete from location_shares where suggestion_id in "
                     "(select id from suggestions where user_a = %s and user_b = %s)", (lo, hi))
    for u, other in ((lo, hi), (hi, lo)):
        social.notify(conn, u, "connect_prompt", {"conversation_id": cid, "other_user_id": other})
    return cid, True


def get_for(conversation_id: int, viewer: str) -> dict | None:
    c = db.fetchone("select id, user_a::text as user_a, user_b::text as user_b, method, event_id, minutes, created_at "
                    "from conversations where id = %s", (conversation_id,))
    if not c or viewer not in (c["user_a"], c["user_b"]):
        return None
    c["other"] = c["user_b"] if c["user_a"] == viewer else c["user_a"]
    return c


def checklist(viewer: str, other: str, event_id: int | None) -> list[dict]:
    """Shared topics ranked by min(w_a, w_b) * idf (MASTER_SPEC 6.6). The UI adds 'something else'."""
    me, them, index, _ = population.pair_model(viewer, other, event_id)
    return [{"interest_id": s["id"], "name": s["name"]}
            for s in scoring.shared_interests(me, them, index, CHECKLIST_SIZE)]


def other_card(user_id: str) -> dict:
    p = db.fetchone("select id::text as user_id, name, photo_url from profiles where id = %s", (user_id,))
    return p or {"user_id": user_id, "name": None, "photo_url": None}


def pending(viewer: str) -> list[dict]:
    rows = db.fetchall(
        "select c.id from conversations c where (c.user_a = %s or c.user_b = %s) "
        "and c.created_at > now() - interval '7 days' "
        "and not exists (select 1 from feedback f where f.conversation_id = c.id and f.rater_id = %s) "
        "order by c.created_at desc", (viewer, viewer, viewer))
    out = []
    for r in rows:
        c = get_for(r["id"], viewer)
        out.append({"conversation_id": c["id"], "method": c["method"], "event_id": c["event_id"],
                    "minutes": c["minutes"], "created_at": c["created_at"].isoformat(),
                    "other": other_card(c["other"]), "checklist": checklist(viewer, c["other"], c["event_id"])})
    return out


def submit_feedback(conversation_id: int, viewer: str, talked_about: list[int], other_topic: str,
                    wants_connect: bool) -> dict:
    with db.conn() as conn:
        c = conn.execute("select id, user_a::text as user_a, user_b::text as user_b from conversations "
                         "where id = %s for update", (conversation_id,)).fetchone()
        other = c["user_b"] if c["user_a"] == viewer else c["user_a"]
        # Your latest answer counts: re-verifying the same person within the dedupe window reuses this
        # conversation, and a first "no" (or an abandoned attempt) must not silently swallow a later "yes".
        # Changing your own answer never signals anything to the other person.
        conn.execute(
            "insert into feedback (conversation_id, rater_id, talked_about, other_topic, wants_connect) "
            "values (%s, %s, %s, %s, %s) on conflict (conversation_id, rater_id) do update set "
            "talked_about = excluded.talked_about, other_topic = excluded.other_topic, "
            "wants_connect = excluded.wants_connect",
            (conversation_id, viewer, talked_about, other_topic, wants_connect))
        mine = conn.execute("select wants_connect from feedback where conversation_id = %s and rater_id = %s",
                            (conversation_id, viewer)).fetchone()
        theirs = conn.execute("select wants_connect from feedback where conversation_id = %s and rater_id = %s",
                              (conversation_id, other)).fetchone()
        if not mine["wants_connect"]:
            return {"status": "no_connection"}
        lo, hi = sorted([viewer, other])
        already = conn.execute("select 1 as ok from connections where user_a = %s and user_b = %s", (lo, hi)).fetchone()
        if (theirs and theirs["wants_connect"]) or already:
            new = conn.execute("insert into connections (user_a, user_b, how_met, conversation_id) values (%s, %s, 'in_person', %s) "
                               "on conflict (user_a, user_b) do nothing returning user_a", (lo, hi, conversation_id)).fetchone()
            chat_id = social.ensure_chat(conn, lo, hi, "connection")
            if new:  # notify once, not every time two existing connections re-verify
                for u, o in ((lo, hi), (hi, lo)):
                    social.notify(conn, u, "connected", {"conversation_id": conversation_id, "other_user_id": o,
                                                        "chat_id": chat_id})
            name = conn.execute("select name from profiles where id = %s", (other,)).fetchone()["name"]
            return {"status": "connected", "connection": {"user_id": other, "name": name}, "chat_id": chat_id}
    return {"status": "waiting"}
