"""Pairwise features, V1 hand-tuned score, explanations, checklist, ranking."""
import numpy as np
from .config import FACETS, V1_WEIGHTS, HIGHLIGHT_PERCENTILE

FEATURES = [f"sim_{f}" for f in FACETS] + ["idf_overlap", "complementarity", "bridge", "role_pair"]


def _cos(u, v):
    if not u.any() or not v.any():
        return 0.0
    return float(u @ v)


def idf_overlap(a, b, idf):
    A, B = a["interests"], b["interests"]
    num = sum(min(A[i]["weight"], B[i]["weight"]) * idf[i] for i in A.keys() & B.keys())
    den = sum(max(A.get(i, {"weight": 0})["weight"], B.get(i, {"weight": 0})["weight"]) * idf[i]
              for i in A.keys() | B.keys())
    return num / den if den else 0.0


def complementarity(a, b):
    return 0.5 * (_cos(a["seek_vec"], b["offer_vec"]) + _cos(b["seek_vec"], a["offer_vec"]))


def pair_features(a, b, index, cluster=None):
    f = {f"sim_{fc}": _cos(a["vec"][fc], b["vec"][fc]) for fc in FACETS}
    f["idf_overlap"] = idf_overlap(a, b, index.idf)
    f["complementarity"] = complementarity(a, b)
    if cluster is not None and cluster.get(a["id"], -1) != cluster.get(b["id"], -1):
        f["bridge"] = max(f[f"sim_{fc}"] for fc in FACETS) * (1 - _cos(a["combined"], b["combined"]))
    else:
        f["bridge"] = 0.0
    roles = {a.get("role"), b.get("role")}
    f["role_pair"] = f["complementarity"] if roles == {"student", "recruiter"} else 0.0
    return f


def v1_score(f):
    return sum(V1_WEIGHTS.get(k, 0) * v for k, v in f.items())


def shared_interests(a, b, index, k=5):
    """Top shared interests by contribution min(w_a, w_b) * idf. Powers 'why you matched' + checklist."""
    A, B = a["interests"], b["interests"]
    rows = [{"id": i, "name": index.names[i],
             "contribution": min(A[i]["weight"], B[i]["weight"]) * index.idf[i],
             "evidence_a": A[i]["evidence"], "evidence_b": B[i]["evidence"]}
            for i in A.keys() & B.keys()]
    return sorted(rows, key=lambda r: -r["contribution"])[:k]


def checklist(a, b, index):
    return [s["name"] for s in shared_interests(a, b, index, 5)] + ["something else"]


def rank_candidates(me, others, index, cluster=None, model=None, explore_eps=0.1, rng=None):
    """Return ranked list with score, highlight flag, and explanation.

    model: optional trained ranker with .predict_score(feature_matrix). Falls back to V1.
    explore_eps: with this probability, swap one top-10 slot with a bridge match (exploration).
    """
    rng = rng or np.random.default_rng()
    rows = []
    for o in others:
        if o["id"] == me["id"]:
            continue
        f = pair_features(me, o, index, cluster)
        rows.append((o, f))
    X = np.array([[f[k] for k in FEATURES] for _, f in rows]) if rows else np.zeros((0, len(FEATURES)))
    scores = model.predict_score(X) if model is not None else np.array([v1_score(f) for _, f in rows])
    order = list(np.argsort(-scores))
    if len(order) > 12 and rng.random() < explore_eps:
        tail = order[10:]
        bridge_pick = max(tail, key=lambda j: rows[j][1]["bridge"])
        order.insert(9, order.pop(order.index(bridge_pick)))
    cutoff = np.percentile(scores, HIGHLIGHT_PERCENTILE) if len(scores) else 0
    out = []
    for rank, j in enumerate(order):
        o, f = rows[j]
        out.append({"id": o["id"], "name": o.get("name"), "rank": rank, "score": float(scores[j]),
                    "highlight": bool(scores[j] >= cutoff), "features": f,
                    "why": [s["name"] for s in shared_interests(me, o, index, 3)]})
    return out
