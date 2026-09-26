"""Organizer community map for one event (docs/api.md 14; MASTER_SPEC 3.11, 6.13, 11).

Aggregate and anonymized: node ids are keyed hashes (stable within the event, unlinkable to user ids),
no names, clusters smaller than 5 are folded into -1 ("unclustered"), and gaps only between real clusters.
Public for the demo, as docs/api.md 14 says. Set DASHBOARD_REQUIRE_AUTH=1 to require a signed-in member of
the event's organization.

gaps: expected connections between two clusters (sum of V1 scores, clipped to [0, 1], over each person's
top-10 matches) vs connections actually formed at this event. The V1 score stands in for the ranker's
probability until the learned ranker (AL9) is served.
"""
import hashlib
import hmac
import os
import threading
import time
from collections import Counter

import numpy as np
from fastapi import APIRouter, Header

from ml import scoring, viz

from .. import db, population
from ..auth import verify_token
from ..errors import ApiError
from ..settings import get_settings

router = APIRouter(prefix="/dashboard")
MIN_GROUP = 5
TOP_K = 10
CACHE_S = 10
_cache: dict[int, tuple[float, int, dict]] = {}
_lock = threading.Lock()


def anon_id(event_id: int, user_id: str) -> str:
    key = (get_settings().qr_signing_key or "dashboard").encode()
    return "n" + hmac.new(key, f"{event_id}|{user_id}".encode(), hashlib.sha256).hexdigest()[:10]


def _require_organizer(event_id: int, authorization: str | None) -> None:
    if os.getenv("DASHBOARD_REQUIRE_AUTH", "0") != "1":
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "missing bearer token")
    user = verify_token(authorization.split(" ", 1)[1].strip())
    ok = db.fetchone("select 1 as ok from events e join org_members m on m.org_id = e.org_id "
                     "where e.id = %s and m.user_id = %s", (event_id, user.id))
    if not ok:
        raise ApiError(403, "organizers only")


def build(event_id: int) -> dict:
    m = population.event_model(event_id)
    people = [p for p in m.people.values() if p["combined"].any()]
    if not people:
        return {"nodes": [], "clusters": [], "edges": [], "gaps": []}
    if event_id not in population._clusters:
        population.recompute_clusters(event_id)       # first request only; the worker refreshes every 5 min
    cluster = population._clusters.get(event_id, {})
    cluster = {p["id"]: cluster.get(p["id"], -1) for p in people}
    sizes = Counter(cluster.values())
    cluster = {u: (c if c >= 0 and sizes[c] >= MIN_GROUP else -1) for u, c in cluster.items()}
    pos = population._layouts.get(event_id, {})
    centers = {}                                      # people who arrived since the last layout sit at their
    for u, (x, y) in pos.items():                     # cluster's center until the worker places them
        centers.setdefault(cluster.get(u, -1), []).append((x, y))
    centers = {c: tuple(np.mean(v, axis=0)) for c, v in centers.items()}
    xy = np.array([pos.get(p["id"], centers.get(cluster[p["id"]], (0.0, 0.0))) for p in people], dtype=float)
    ids = [p["id"] for p in people]
    predicted = []
    for p in people:
        scored = [(o["id"], scoring.v1_score(scoring.pair_features(p, o, m.index, cluster)))
                  for o in people if o["id"] != p["id"]]
        for oid, s in sorted(scored, key=lambda t: -t[1])[:TOP_K]:
            predicted.append((p["id"], oid, float(np.clip(s, 0, 1))))
    formed = db.fetchall(
        "select c.user_a::text as a, c.user_b::text as b from connections c "
        "left join conversations cv on cv.id = c.conversation_id "
        "join events e on e.id = %s "
        "where c.user_a = any(%s::uuid[]) and c.user_b = any(%s::uuid[]) "
        "and (cv.event_id = e.id or (cv.event_id is null and e.starts_at is not null and c.created_at >= e.starts_at))",
        (event_id, ids, ids))
    edges = [(r["a"], r["b"]) for r in formed]
    out = viz.dashboard_json(people, m.index, cluster, xy, edges, predicted)
    anon = {u: anon_id(event_id, u) for u in ids}
    for n in out["nodes"]:
        n["id"] = anon[n["id"]]
    out["edges"] = [{"source": anon[e["source"]], "target": anon[e["target"]]} for e in out["edges"]]
    out["clusters"] = [c for c in out["clusters"] if c["id"] == -1 or c["size"] >= MIN_GROUP]
    for g in out["gaps"]:
        g["clusters"] = list(g["clusters"])
    out["event_id"] = event_id
    out["people"] = len(people)
    return out


@router.get("/{event_id}")
def dashboard(event_id: int, authorization: str | None = Header(default=None)):
    if not db.fetchone("select 1 as ok from events where id = %s", (event_id,)):
        raise ApiError(404, "event not found")
    _require_organizer(event_id, authorization)
    now = time.time()
    with _lock:
        hit = _cache.get(event_id)
        if hit and now - hit[0] < CACHE_S and hit[1] == population._version:
            return hit[2]
    out = build(event_id)
    with _lock:
        _cache[event_id] = (now, population._version, out)
    return out
