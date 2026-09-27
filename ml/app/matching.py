"""Candidate pool and ranking (MASTER_SPEC 6.6, 6.7). Shared by matches, suggestions, graph, chatbot.

Candidate pool for a viewer at an event: checked-in attendees, minus the viewer, anyone blocked in
either direction, previous declines, and existing connections (those go to the reconnect path).
"""
from functools import lru_cache

import numpy as np

from ml import scoring

from . import db, population


@lru_cache(maxsize=None)
def table_exists(name: str) -> bool:
    return db.fetchone("select to_regclass(%s) is not null as ok", (f"public.{name}",))["ok"]


def excluded_ids(viewer: str) -> set[str]:
    """Everyone the viewer must not see as a match right now: blocks (either direction), existing
    connections, and people the viewer declined. Another person's "no" is never used here."""
    out = {r["id"] for r in db.fetchall(
        "select blocked_id::text as id from blocks where blocker_id = %s "
        "union select blocker_id::text from blocks where blocked_id = %s "
        "union select case when user_a = %s then user_b else user_a end::text from connections "
        "where user_a = %s or user_b = %s",
        (viewer, viewer, viewer, viewer, viewer))}
    if table_exists("suggestions"):
        # only the VIEWER's own "no": hiding people who declined the viewer would reveal their "no"
        out |= {r["id"] for r in db.fetchall(
            "select case when user_a = %s then user_b else user_a end::text as id from suggestions "
            "where (user_a = %s and a_response = 'no') or (user_b = %s and b_response = 'no')",
            (viewer, viewer, viewer))}
    if table_exists("conversations"):
        out |= {r["id"] for r in db.fetchall(
            "select case when c.user_a = %s then c.user_b else c.user_a end::text as id "
            "from conversations c join feedback f on f.conversation_id = c.id "
            "where (c.user_a = %s or c.user_b = %s) and f.rater_id = %s and not f.wants_connect",
            (viewer, viewer, viewer, viewer))}
    return out


def is_checked_in(user_id: str, event_id: int) -> bool:
    return db.fetchone("select 1 as ok from attendance where event_id = %s and user_id = %s",
                       (event_id, user_id)) is not None


def rank_for_viewer(viewer: str, event_id: int, explore_eps: float = 0.1, rng=None) -> tuple[list[dict], population.EventModel]:
    """Ranked candidates with score, highlight, features, why. Viewer must be an attendee."""
    m = population.event_model(event_id)
    me = m.people.get(viewer)
    if me is None:
        return [], m
    banned = excluded_ids(viewer)
    others = [p for pid, p in m.people.items() if pid != viewer and pid not in banned]
    cluster = m.cluster or None
    from .ranker_job import serving_model
    return scoring.rank_candidates(me, others, m.index, cluster=cluster, explore_eps=explore_eps,
                                   model=serving_model(), rng=rng or np.random.default_rng()), m


def model_name() -> str:
    from .ranker_job import serving_model
    return "lr" if serving_model() is not None else "v1"


def pair_score(a: dict, b: dict, index, cluster=None) -> tuple[float, dict]:
    f = scoring.pair_features(a, b, index, cluster)
    return scoring.v1_score(f), f


def log_impressions(viewer: str, event_id: int | None, rows: list[dict], model: str = "v1") -> None:
    if not rows:
        return
    with db.conn() as c:
        with c.cursor() as cur:
            cur.executemany(
                "insert into impressions (viewer_id, shown_id, event_id, rank, score, model) "
                "values (%s, %s, %s, %s, %s, %s)",
                [(viewer, r["id"], event_id, r["rank"] + 1, r["score"], model) for r in rows])  # 1-based, as shown


def is_connected(a: str, b: str) -> bool:
    lo, hi = sorted([a, b])
    return db.fetchone("select 1 as ok from connections where user_a = %s and user_b = %s", (lo, hi)) is not None


def conversation_event(a: str, b: str, claimed: int | None) -> int | None:
    """Event to file a verified conversation under. A client-claimed event only counts when BOTH people are checked
    in to it (company events: registered and scanned the QR), so nobody is attributed to an event they never entered.
    Otherwise fall back to the most recent event both attend, or None (a normal, non-event conversation)."""
    if claimed is not None and is_checked_in(a, claimed) and is_checked_in(b, claimed):
        return claimed
    return shared_event(a, b)


def shared_event(a: str, b: str) -> int | None:
    """Most recent event both people are checked in to."""
    r = db.fetchone(
        "select x.event_id from attendance x join attendance y on y.event_id = x.event_id and y.user_id = %s "
        "join events e on e.id = x.event_id where x.user_id = %s "
        "order by greatest(x.checked_in_at, y.checked_in_at) desc limit 1", (b, a))
    return r["event_id"] if r else None


def relationship(viewer: str, other: str) -> dict | None:
    """Why the viewer may see `other` at all, or None (MASTER_SPEC 11: no stranger discovery).

    - connection: they are connected
    - match: both checked in to the same event and `other` is in the viewer's candidate pool
    - suggestion: an open suggestion between them (e.g. Open to Meet in a building)
    """
    if viewer == other:
        return None
    if is_connected(viewer, other):
        return {"kind": "connection", "event_id": shared_event(viewer, other)}
    banned = excluded_ids(viewer)
    if other in banned:
        return None
    ev = shared_event(viewer, other)
    if ev is not None:
        return {"kind": "match", "event_id": ev}
    if table_exists("suggestions"):
        lo, hi = sorted([viewer, other])
        s = db.fetchone(
            "select id, event_id from suggestions where user_a = %s and user_b = %s and status in ('pending','matched') "
            "and (expires_at is null or expires_at > now()) order by created_at desc limit 1", (lo, hi))
        if s:
            return {"kind": "suggestion", "event_id": s["event_id"]}
    return None


def is_valid_uuid(s: str) -> bool:
    import uuid
    try:
        uuid.UUID(s)
        return True
    except (ValueError, TypeError):
        return False


PROXIMITY_WINDOW_S = 60


def proximity_bands(viewer: str, others: list[str], window_s: int = PROXIMITY_WINDOW_S) -> dict[str, str]:
    """Rough distance band per person from the last minute of Bluetooth sightings in either direction
    (the viewer's phone hearing them, or theirs hearing the viewer). Median RSSI: > -60 dBm 'immediate',
    -60 to -75 'near', weaker 'far'. People with no recent sightings are absent (API shows null).
    Bands only, never distances or positions (MASTER_SPEC 3.4)."""
    if not others:
        return {}
    rows = db.fetchall(
        "select case when s.observer_id = %(v)s then e.user_id else s.observer_id end::text as other, "
        "percentile_cont(0.5) within group (order by s.rssi) as med "
        "from sightings s join ephemeral_ids e on e.token = s.observed_token "
        "and (e.valid_from is null or s.ts >= e.valid_from) and (e.valid_to is null or s.ts < e.valid_to) "
        "where s.ts > now() - make_interval(secs => %(w)s) and ("
        "  (s.observer_id = %(v)s and e.user_id = any(%(o)s::uuid[])) or "
        "  (e.user_id = %(v)s and s.observer_id = any(%(o)s::uuid[]))) "
        "group by 1", {"v": viewer, "o": others, "w": window_s})
    return {r["other"]: ("immediate" if r["med"] > -60 else "near" if r["med"] >= -75 else "far") for r in rows}
