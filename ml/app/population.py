"""Load people from Postgres into the in-memory format ml/ml/profiles.py and scoring.py expect,
with IDF over a chosen population (one event, or everyone), and cache per event.

person = {id, name, photo_url, role, headline, open_to_meet, seeking, offering,
          interests: {interest_id: {weight, facet, evidence}}, summary: {facet: text},
          vec: {facet: np.ndarray}, combined, seek_vec, offer_vec}

Hidden interests are never loaded, so they never affect matching.
"""
import logging
import math
import threading
import time
from dataclasses import dataclass, field

import numpy as np

from ml.config import FACETS
from ml.embed import embed
from ml.profiles import build_vectors

from . import db

log = logging.getLogger("population")


class Index:
    """The subset of ml.profiles.InterestIndex that build_vectors / scoring use, keyed by DB id."""

    def __init__(self, names: dict, facets: dict, vecs: dict, idf: dict):
        self.names, self.facets, self.vecs, self.idf = names, facets, vecs, idf


def load_people(user_ids: list[str]) -> tuple[list[dict], dict, dict, dict]:
    """Returns (people, names, facets, vecs) for the given users (order preserved)."""
    if not user_ids:
        return [], {}, {}, {}
    profs = {r["id"]: r for r in db.fetchall(
        "select id::text as id, name, photo_url, role, seeking, offering, headline, open_to_meet "
        "from profiles where id = any(%s::uuid[])", (user_ids,))}
    rows = db.fetchall(
        "select ui.user_id::text as user_id, ui.interest_id, ui.weight, ui.evidence, "
        "i.canonical_name, i.facet, i.embedding from user_interests ui join interests i on i.id = ui.interest_id "
        "where ui.user_id = any(%s::uuid[]) and not ui.hidden", (user_ids,))
    summaries = db.fetchall(
        "select distinct on (user_id, source) user_id::text as user_id, meta->'extraction'->'summary' as summary "
        "from raw_documents where user_id = any(%s::uuid[]) and meta ? 'extraction' "
        "order by user_id, source, fetched_at desc, id desc", (user_ids,))
    names, facets, vecs = {}, {}, {}
    people = {}
    for uid in user_ids:
        p = profs.get(uid)
        if not p:
            continue
        people[uid] = {**p, "seeking": p.get("seeking") or "", "offering": p.get("offering") or "",
                       "interests": {}, "summary": {f: "" for f in FACETS}}
    for r in rows:
        p = people.get(r["user_id"])
        if p is None or r["embedding"] is None:
            continue
        iid = r["interest_id"]
        names[iid], facets[iid] = r["canonical_name"], r["facet"]
        emb = r["embedding"]
        vecs[iid] = np.asarray(emb.to_numpy() if hasattr(emb, "to_numpy") else emb, dtype=np.float32)
        p["interests"][iid] = {"weight": float(r["weight"]), "facet": r["facet"], "evidence": r["evidence"] or ""}
    # Active skill profile (docs/ONBOARDING.md): skills found only there (frameworks from manifests,
    # languages by bytes, resume skill lists) join the person's interests. No profile = nothing added.
    for r in _active_profile_skills(user_ids):
        p = people.get(r["user_id"])
        iid = r["interest_id"]
        if p is None or r["embedding"] is None or iid in p["interests"] or iid in r["hidden"]:
            continue
        names[iid], facets[iid] = r["canonical_name"], r["facet"]
        emb = r["embedding"]
        vecs[iid] = np.asarray(emb.to_numpy() if hasattr(emb, "to_numpy") else emb, dtype=np.float32)
        p["interests"][iid] = {"weight": SKILL_PROFILE_WEIGHT * float(r["confidence"]), "facet": r["facet"],
                               "evidence": f"From your {' and '.join(r['sources'])}"}
    for s in summaries:
        p = people.get(s["user_id"])
        for f, text in (s["summary"] or {}).items():
            if p and f in p["summary"] and text:
                p["summary"][f] = (p["summary"][f] + " " + text).strip()[:600]
    return [people[u] for u in user_ids if u in people], names, facets, vecs


SKILL_PROFILE_WEIGHT = 0.8  # profile-only skills count a little less than LLM-extracted interests


def _active_profile_skills(user_ids: list[str]) -> list[dict]:
    """(user_id, interest_id, confidence, sources, canonical_name, facet, embedding, hidden) for every skill
    with an interest id in each user's active skill profile. Empty if the table doesn't exist yet."""
    try:
        return db.fetchall(
            "select usp.user_id::text as user_id, (s->>'interest_id')::bigint as interest_id, "
            "(s->>'confidence')::float as confidence, coalesce(s->'sources', '[]'::jsonb) as sources, "
            "i.canonical_name, i.facet, i.embedding, "
            "coalesce((select array_agg(ui.interest_id) from user_interests ui "
            "          where ui.user_id = usp.user_id and ui.hidden), '{}') as hidden "
            "from user_skill_profiles usp cross join lateral jsonb_array_elements(usp.skills) s "
            "join interests i on i.id = (s->>'interest_id')::bigint "
            "where usp.is_active and usp.user_id = any(%s::uuid[]) and s->>'interest_id' is not null",
            (user_ids,))
    except Exception as e:  # missing table (older DB) or bad row: match on user_interests alone
        log.warning("skill profiles not loaded: %s", e)
        return []


def compute_idf(people: list[dict], interest_ids) -> dict:
    """idf(i) = ln((N + 1) / (df_i + 1)) + 0.1 over this population (MASTER_SPEC 6.5)."""
    n = len(people)
    df: dict[int, int] = {}
    for p in people:
        for i in p["interests"]:
            df[i] = df.get(i, 0) + 1
    return {i: math.log((n + 1) / (df.get(i, 0) + 1)) + 0.1 for i in interest_ids}


def build(user_ids: list[str]) -> tuple[list[dict], Index]:
    people, names, facets, vecs = load_people(user_ids)
    # build_vectors embeds each summary / seeking / offering one sentence at a time. On a cold process
    # (every Railway redeploy) that was ~6 model calls x ~80 people = ~96 s. One batched call fills the
    # embed() cache first, so build_vectors only hits the cache. Same vectors, same results.
    texts = [t for p in people for t in (*p["summary"].values(), p["seeking"], p["offering"]) if t]
    if texts:
        embed(texts)
    index = Index(names, facets, vecs, compute_idf(people, names.keys()))
    for p in people:
        build_vectors(p, index)
    return people, index


# ------------------------------------------------------------------ event cache
_version = 0            # bumped whenever a profile or an attendance list changes
_lock = threading.Lock()


def invalidate() -> None:
    global _version
    with _lock:
        _version += 1


@dataclass
class EventModel:
    event_id: int
    version: int
    built_at: float
    people: dict                       # id -> person
    index: Index
    cluster: dict = field(default_factory=dict)   # id -> HDBSCAN label (from the worker)
    ids: tuple = ()                               # attendee ids the model was built from


_events: dict[int, EventModel] = {}
_build_locks: dict[int, threading.Lock] = {}   # one build per event at a time; concurrent callers reuse it
_clusters: dict[int, dict] = {}         # event_id -> {user_id: label}, refreshed every 5 minutes
_layouts: dict[int, dict] = {}          # event_id -> {user_id: (x, y)} 2-D UMAP, refreshed with the clusters


def attendee_ids(event_id: int) -> list[str]:
    return [r["id"] for r in db.fetchall(
        "select user_id::text as id from attendance where event_id = %s order by checked_in_at, user_id",
        (event_id,))]


def event_model(event_id: int) -> EventModel:
    """Attendees of one event with per-event IDF and vectors. Rebuilt when anything changed."""
    cached = _events.get(event_id)
    # attendance can change outside this process (seed scripts, another replica, Supabase directly), so a
    # changed attendee list also triggers a rebuild, not only this process's invalidate()
    ids = tuple(attendee_ids(event_id))
    if cached and cached.version == _version and cached.ids == ids:
        cached.cluster = _clusters.get(event_id, {})
        return cached
    with _lock:
        build_lock = _build_locks.setdefault(event_id, threading.Lock())
    # Stale-while-rebuilding: if a model exists and another thread is already rebuilding, answer with the cached
    # model (seconds out of date) instead of queueing behind the rebuild. A slow rebuild must never stall matches,
    # graph, quick profiles or the dashboard for everyone. Only the very first build (nothing cached) waits.
    if cached is not None and not build_lock.acquire(blocking=False):
        cached.cluster = _clusters.get(event_id, {})
        return cached
    if cached is not None:
        try:
            return _build_event(event_id, ids)
        finally:
            build_lock.release()
    with build_lock:
        # Another request may have finished the same build while this one waited (phones poll every 15 s).
        cached = _events.get(event_id)
        if cached and cached.version == _version and cached.ids == ids:
            cached.cluster = _clusters.get(event_id, {})
            return cached
        return _build_event(event_id, ids)


def _build_event(event_id: int, ids: tuple) -> EventModel:
    v = _version
    t0 = time.time()
    people, index = build(list(ids))
    m = EventModel(event_id, v, time.time(), {p["id"]: p for p in people}, index, _clusters.get(event_id, {}), ids)
    _events[event_id] = m
    log.info("event %s model: %d people, %d interests in %.2fs", event_id, len(people), len(index.names),
             time.time() - t0)
    return m


# UMAP compiles with numba, whose default threading layer is not safe to use from several threads at once
# (it can deadlock). The clusters worker, the ranker job and the dashboard's first request all run UMAP, so they
# take turns. HDBSCAN is heavy too, so it shares the lock.
HEAVY_LOCK = threading.Lock()


def recompute_clusters(event_id: int, wait: bool = True) -> dict | None:
    """UMAP(10) + HDBSCAN(min 5) on combined vectors (MASTER_SPEC 6.13). Needs enough people.
    wait=False: if another heavy job is running, return None instead of queueing (request threads)."""
    if not HEAVY_LOCK.acquire(blocking=wait):
        return None
    try:
        return _recompute_clusters(event_id)
    finally:
        HEAVY_LOCK.release()


def _recompute_clusters(event_id: int) -> dict:
    from ml.viz import communities
    m = event_model(event_id)
    people = [p for p in m.people.values() if p["combined"].any()]
    if len(people) < 10:
        labels = {p["id"]: -1 for p in people}
    else:
        labels = communities(people, min_cluster_size=5)
    from ml.viz import layout
    xy = layout(people) if len(people) >= 5 else [(0.0, 0.0)] * len(people)
    _layouts[event_id] = {p["id"]: (float(x), float(y)) for p, (x, y) in zip(people, xy)}
    _clusters[event_id] = labels
    m.cluster = labels
    return labels


def active_event_ids() -> list[int]:
    return [r["id"] for r in db.fetchall(
        "select distinct e.id from events e join attendance a on a.event_id = e.id "
        "where e.ends_at is null or e.ends_at > now() - interval '12 hours'")]


def pair_model(a: str, b: str, event_id: int | None) -> tuple[dict, dict, Index, dict | None]:
    """Two people ready for scoring: the event's model (event IDF) when both attend it,
    else a small model with global IDF from interests.idf (written by the global_vectors worker)."""
    if event_id is not None:
        m = event_model(event_id)
        if a in m.people and b in m.people:
            return m.people[a], m.people[b], m.index, (m.cluster or None)
    people, names, facets, vecs = load_people([a, b])
    idf = {r["id"]: float(r["idf"]) for r in db.fetchall(
        "select id, idf from interests where id = any(%s)", (list(names),))} if names else {}
    index = Index(names, facets, vecs, {i: idf.get(i, 1.0) for i in names})
    for p in people:
        build_vectors(p, index)
    by_id = {p["id"]: p for p in people}
    return by_id[a], by_id[b], index, None
