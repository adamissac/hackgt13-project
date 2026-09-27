"""Pairwise features, V1 hand-tuned score, explanations, checklist, ranking."""
import numpy as np
from .config import FACETS, V1_WEIGHTS, HIGHLIGHT_PERCENTILE

FEATURES = [f"sim_{f}" for f in FACETS] + ["idf_overlap", "complementarity", "bridge", "role_pair"]

# Plain-English name for each feature, used by explain_match(). Kept next to FEATURES so the two
# never drift; explain_match() asserts every feature has a label.
FEATURE_LABELS = {
    "sim_technical": "technical overlap",
    "sim_career": "career overlap",
    "sim_personal": "shared personal interests",
    "sim_academic": "academic background",
    "idf_overlap": "shared niche interests",
    "complementarity": "what each of you wants and offers",
    "bridge": "different circles, same thread",
    "role_pair": "student and recruiter fit",
}


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


# ------------------------------------------------------------------ why you matched (MASTER_SPEC 6.9)
def score_contributions(f, model=None):
    """Split the score this pair actually got into one number per feature.

    Returns (contributions, basis). Nothing is recomputed from scratch: `f` is the same dict the
    ranker scored, so the parts always sum back to the whole.

      v1  - the score IS sum(weight * value), so contribution = weight * value, exactly.
      lr  - LogisticRegression on standardised features is linear in the logit, so the logit term
            coef * (value - mean) / scale is the honest per-feature contribution.
      other - tree models (LGBMRanker) are not linearly decomposable. Rather than invent numbers we
            fall back to the v1 weights and say so, so a caller can label the bars as approximate.
    """
    pipe = getattr(model, "pipe", None)
    if pipe is not None:                                   # LRModel: scaler + logistic regression
        try:
            scaler, lr = pipe[0], pipe[-1]
            coef = lr.coef_[0]
            contributions = {k: float(coef[i] * (f[k] - scaler.mean_[i]) / scaler.scale_[i])
                             for i, k in enumerate(FEATURES)}
            return contributions, "lr"
        except Exception:                                  # not the shape we expected; be honest below
            pass
    basis = "v1" if model is None else "v1_proxy"
    return {k: float(V1_WEIGHTS.get(k, 0.0) * f.get(k, 0.0)) for k in FEATURES}, basis


_VERB = {"technical": "both work on", "academic": "both study",
         "career": "are both in", "personal": "are both into"}


def _lead(topics, index):
    """'You both work on rust and cybersecurity.' Verb comes from the topic's own facet, so a
    personal interest does not read as work."""
    if not topics:
        return ""
    verb = _VERB.get(index.facets[topics[0]["id"]], "both work on")
    names = [t["name"] for t in topics[:2]]
    joined = f"{names[0]} and {names[1]}" if len(names) >= 2 else names[0]
    return f"You {verb} {joined}."


def _summary(factors, topics, f, index):
    """One or two sentences from the factors that actually scored. No LLM, no invented facts.

    The bars rank by contribution. The sentence deliberately does not: `bridge` and `role_pair`
    carry small weights, so they never top the bars, yet they are the most interesting thing you
    can say about a pair. Lead with whichever signal is *distinctive*, then fall back to the
    biggest contributor.
    """
    lead = _lead(topics, index)
    top = factors[0] if factors else None
    if top is None or top["contribution"] <= 0:
        return lead or "Not much overlap yet - this one is a long shot."
    first = topics[0]["name"] if topics else None

    if f.get("bridge", 0.0) > 0 and first:
        # The non-obvious match: different communities, one strong shared thread.
        tail = (f"You are in different circles at this event, so {first} is the thread worth "
                f"pulling on.")
    elif f.get("role_pair", 0.0) > 0:
        tail = "One of you is hiring and the other is looking, on overlapping ground."
    elif top["name"] == "complementarity":
        tail = "What one of you is looking for lines up with what the other offers."
    elif top["name"] == "idf_overlap" and first:
        tail = f"{first.capitalize()} is uncommon here, so sharing it means more than it looks."
    elif top["name"].startswith("sim_"):
        tail = f"Your strongest overlap is {top['name'][4:]}."
    else:
        tail = f"Strongest signal: {top['label']}."
    return (lead + " " + tail).strip() if lead else tail


def explain_match(a, b, index, features=None, model=None, cluster=None, top_k=3):
    """Why did these two match? Grounded in the features the ranker used, not a generated blurb.

    Pass `features` when the caller already has them (rank_candidates, graph) so we explain the
    exact numbers that produced the ranking rather than a fresh computation that could differ.

    {"summary": str, "factors": [...], "shared_topics": [...], "basis": "v1"|"lr"|"v1_proxy"}
    Each factor: name, label, value, contribution, share (fraction of the positive total).
    """
    f = features if features is not None else pair_features(a, b, index, cluster)
    contributions, basis = score_contributions(f, model)
    total = sum(c for c in contributions.values() if c > 0) or 1.0
    factors = sorted(
        ({"name": k, "label": FEATURE_LABELS[k], "value": round(float(f.get(k, 0.0)), 4),
          "contribution": round(contributions[k], 4), "share": round(max(contributions[k], 0.0) / total, 4)}
         for k in FEATURES),
        key=lambda r: -r["contribution"])
    topics = shared_interests(a, b, index, 5)
    top = [r for r in factors if r["contribution"] > 0][:top_k]
    return {"summary": _summary(top, topics, f, index),
            "factors": top,
            "all_factors": factors,
            "shared_topics": [{"id": t["id"], "name": t["name"],
                               "contribution": round(float(t["contribution"]), 4),
                               "evidence_a": t["evidence_a"], "evidence_b": t["evidence_b"]} for t in topics],
            "basis": basis}


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
        # One explanation per candidate, built from the features that produced this ranking.
        # `why` is derived from it rather than calling shared_interests() a second time.
        e = explain_match(me, o, index, features=f, model=model)
        out.append({"id": o["id"], "name": o.get("name"), "rank": rank, "score": float(scores[j]),
                    "highlight": bool(scores[j] >= cutoff), "features": f,
                    "why": [t["name"] for t in e["shared_topics"][:3]],
                    "explanation": e})
    return out
