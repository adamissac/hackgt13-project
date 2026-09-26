"""Open to Meet suggestion generation (MASTER_SPEC 3.3, 7.5, 6.6).

Groups ("rooms"): checked-in attendees of an active event (context 'event') and people present in the
same building (context 'public'). Only people with profiles.open_to_meet = true take part.

A pair is suggested when:
- neither blocked the other, they aren't connected, neither ever said no to the other,
- they weren't suggested to each other in the last 7 days,
- the pair's V1 score is above BOTH people's own 80th percentile within the room,
- each person has had fewer than 3 suggestions today and gets at most 1 new one per tick,
- it's not quiet hours (QUIET_HOURS="23-8" in server local time; empty = never quiet).
"""
import datetime as dt
import logging
import os

import numpy as np
from psycopg.types.json import Jsonb

from ml import scoring
from ml.config import HIGHLIGHT_PERCENTILE

from . import db, population, social

log = logging.getLogger("suggestions")

MAX_PER_DAY = 3
REPEAT_DAYS = 7
EXPIRES_MIN = 30


def quiet_now(now: dt.datetime | None = None) -> bool:
    spec = os.getenv("QUIET_HOURS", "")
    if not spec:
        return False
    start, end = (int(x) for x in spec.split("-"))
    h = (now or dt.datetime.now()).hour
    return (start <= h or h < end) if start > end else (start <= h < end)


def _blocked_pairs(ids: list[str]) -> set[frozenset]:
    rows = db.fetchall(
        "select blocker_id::text as a, blocked_id::text as b from blocks "
        "where blocker_id = any(%s::uuid[]) and blocked_id = any(%s::uuid[]) "
        "union select user_a::text, user_b::text from connections "
        "where user_a = any(%s::uuid[]) and user_b = any(%s::uuid[]) "
        "union select user_a::text, user_b::text from suggestions "
        "where user_a = any(%s::uuid[]) and user_b = any(%s::uuid[]) "
        "and (a_response = 'no' or b_response = 'no' or created_at > now() - make_interval(days => %s))",
        (ids, ids, ids, ids, ids, ids, REPEAT_DAYS))
    return {frozenset((r["a"], r["b"])) for r in rows}


def _today_counts(ids: list[str]) -> dict[str, int]:
    rows = db.fetchall(
        "select u::text as id, count(*) as n from suggestions, unnest(array[user_a, user_b]) as u "
        "where created_at > now() - interval '1 day' and u = any(%s::uuid[]) group by u", (ids,))
    return {r["id"]: r["n"] for r in rows}


def plan_room(people: dict, index, cluster, banned: set[frozenset], today: dict[str, int],
              synthetic: set[str] | None = None) -> list[tuple]:
    """Pure function: which pairs to suggest in one room. Returns [(a, b, score, shared)].

    Synthetic (seeded demo) attendees are never paired with each other, and their own percentile bar and
    daily cap never block a real person: only the real person's rules apply to a real-synthetic pair."""
    synthetic = synthetic or set()
    ids = sorted(people)
    if len(ids) < 2:
        return []
    scores: dict[frozenset, float] = {}
    per_user: dict[str, list[float]] = {u: [] for u in ids}
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            f = scoring.pair_features(people[a], people[b], index, cluster)
            s = scoring.v1_score(f)
            per_user[a].append(s)      # percentiles use EVERY pair in the room, so using up or
            per_user[b].append(s)      # banning a top pair never lowers anyone's bar
            if frozenset((a, b)) not in banned and not (a in synthetic and b in synthetic):
                scores[frozenset((a, b))] = s
    cutoff = {u: (np.percentile(v, HIGHLIGHT_PERCENTILE) if v else np.inf) for u, v in per_user.items()}
    eligible = sorted(((s, tuple(sorted(p))) for p, s in scores.items()
                       if all(s >= cutoff[u] for u in p if u not in synthetic)), reverse=True)
    used, out = set(), []
    for s, (a, b) in eligible:
        real = [u for u in (a, b) if u not in synthetic]
        if any(u in used or today.get(u, 0) >= MAX_PER_DAY for u in real):
            continue
        used |= set(real)
        shared = [{"interest_id": x["id"], "name": x["name"], "contribution": round(x["contribution"], 4)}
                  for x in scoring.shared_interests(people[a], people[b], index, 5)]
        out.append((a, b, s, shared))
    return out


def _rooms() -> list[dict]:
    rooms = []
    for event_id in population.active_event_ids():
        m = population.event_model(event_id)
        open_ids = {r["id"] for r in db.fetchall(
            "select id::text as id from profiles where open_to_meet and id = any(%s::uuid[])", (list(m.people),))}
        rooms.append({"context": "event", "event_id": event_id, "building_id": None,
                      "people": {u: p for u, p in m.people.items() if u in open_ids},
                      "index": m.index, "cluster": m.cluster or None})
    for r in db.fetchall(
            "select building_id, array_agg(pr.user_id::text) as ids from presence pr join profiles p on p.id = pr.user_id "
            "where pr.expires_at > now() and p.open_to_meet group by building_id having count(*) > 1"):
        people, index = population.build(r["ids"])
        rooms.append({"context": "public", "event_id": None, "building_id": r["building_id"],
                      "people": {p["id"]: p for p in people}, "index": index, "cluster": None})
    return rooms


def generate() -> int:
    """One worker tick. Returns how many suggestions were created."""
    if quiet_now():
        return 0
    created = 0
    for room in _rooms():
        ids = list(room["people"])
        if len(ids) < 2:
            continue
        from .synthetic import synthetic_ids
        plan = plan_room(room["people"], room["index"], room["cluster"], _blocked_pairs(ids), _today_counts(ids),
                         synthetic_ids(ids))
        with db.conn() as c:
            for a, b, score, shared in plan:
                sid = c.execute(
                    "insert into suggestions (user_a, user_b, context, event_id, building_id, score, shared_topics, expires_at) "
                    "values (%s, %s, %s, %s, %s, %s, %s, now() + make_interval(mins => %s)) returning id",
                    (a, b, room["context"], room["event_id"], room["building_id"], score, Jsonb(shared),
                     EXPIRES_MIN)).fetchone()["id"]
                for u in (a, b):
                    social.notify(c, u, "suggestion", {"suggestion_id": sid})
                created += 1
    if created:
        log.info("created %d suggestions", created)
    return created


def expire() -> int:
    with db.conn() as c:
        return c.execute("update suggestions set status = 'expired' where status = 'pending' "
                         "and expires_at < now()").rowcount
