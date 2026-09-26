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
    for s in summaries:
        p = people.get(s["user_id"])
        for f, text in (s["summary"] or {}).items():
            if p and f in p["summary"] and text:
                p["summary"][f] = (p["summary"][f] + " " + text).strip()[:600]
    return [people[u] for u in user_ids if u in people], names, facets, vecs


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


_events: dict[int, EventModel] = {}
_clusters: dict[int, dict] = {}         # event_id -> {user_id: label}, refreshed every 5 minutes


def attendee_ids(event_id: int) -> list[str]:
    return [r["id"] for r in db.fetchall(
        "select user_id::text as id from attendance where event_id = %s order by checked_in_at, user_id",
        (event_id,))]


def event_model(event_id: int) -> EventModel:
    """Attendees of one event with per-event IDF and vectors. Rebuilt when anything changed."""
    cached = _events.get(event_id)
    if cached and cached.version == _version:
        cached.cluster = _clusters.get(event_id, {})
        return cached
    v = _version
    t0 = time.time()
    people, index = build(attendee_ids(event_id))
    m = EventModel(event_id, v, time.time(), {p["id"]: p for p in people}, index, _clusters.get(event_id, {}))
    _events[event_id] = m
    log.info("event %s model: %d people, %d interests in %.2fs", event_id, len(people), len(index.names),
             time.time() - t0)
    return m


def recompute_clusters(event_id: int) -> dict:
    """UMAP(10) + HDBSCAN(min 5) on combined vectors (MASTER_SPEC 6.13). Needs enough people."""
    from ml.viz import communities
    m = event_model(event_id)
    people = [p for p in m.people.values() if p["combined"].any()]
    if len(people) < 10:
        labels = {p["id"]: -1 for p in people}
    else:
        labels = communities(people, min_cluster_size=5)
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
