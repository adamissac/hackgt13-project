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
    """Everyone the viewer must never be matched with right now."""
    out = {r["id"] for r in db.fetchall(
        "select blocked_id::text as id from blocks where blocker_id = %s "
        "union select blocker_id::text from blocks where blocked_id = %s "
        "union select case when user_a = %s then user_b else user_a end::text from connections "
        "where user_a = %s or user_b = %s",
        (viewer, viewer, viewer, viewer, viewer))}
    if table_exists("suggestions"):
        out |= {r["id"] for r in db.fetchall(
            "select case when user_a = %s then user_b else user_a end::text as id from suggestions "
            "where (user_a = %s or user_b = %s) and (a_response = 'no' or b_response = 'no')",
            (viewer, viewer, viewer))}
    if table_exists("conversations"):
        out |= {r["id"] for r in db.fetchall(
            "select case when c.user_a = %s then c.user_b else c.user_a end::text as id "
            "from conversations c join feedback f on f.conversation_id = c.id "
            "where (c.user_a = %s or c.user_b = %s) and not f.wants_connect",
            (viewer, viewer, viewer))}
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
    return scoring.rank_candidates(me, others, m.index, cluster=cluster, explore_eps=explore_eps,
                                   rng=rng or np.random.default_rng()), m


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
