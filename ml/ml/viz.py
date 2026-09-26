"""Dashboard data: UMAP layout, HDBSCAN communities, c-TF-IDF labels, connection gaps.

Unsupervised, nothing to train. Output JSON the Next.js / D3 dashboard renders.
"""
from collections import Counter, defaultdict
import logging
import math
import numpy as np


def layout(people, seed=42):
    X = np.vstack([p["combined"] for p in people])
    try:
        import umap
        xy = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=seed).fit_transform(X)
    except Exception:
        from sklearn.decomposition import PCA
        xy = PCA(2, random_state=seed).fit_transform(X)
    return xy


def umap_available() -> bool:
    """Reported by /health: without umap, communities() clusters raw 384-d vectors and
    HDBSCAN labels almost everyone as noise, which empties the organizer map."""
    try:
        import umap  # noqa: F401
        return True
    except Exception:
        return False


def communities(people, min_cluster_size=5):
    from sklearn.cluster import HDBSCAN
    X = np.vstack([p["combined"] for p in people])
    # cluster in a lower-dim UMAP space (10-d) for stability; fall back to raw vectors
    try:
        import umap
        Z = umap.UMAP(n_neighbors=15, n_components=10, min_dist=0.0, metric="cosine",
                      random_state=0).fit_transform(X)
    except Exception as e:
        # Loud on purpose: measured on 78 planted clusters, this fallback labels every point
        # noise (0 clusters) instead of finding them. A server here serves an empty map.
        logging.getLogger("viz").error(
            "umap unavailable (%s: %s); clustering raw vectors, communities will be empty",
            type(e).__name__, e)
        Z = X
    labels = HDBSCAN(min_cluster_size=min_cluster_size, copy=True).fit_predict(Z)
    return {p["id"]: int(l) for p, l in zip(people, labels)}


def ctfidf_labels(people, cluster, index, top=3):
    """Class-based TF-IDF: interests frequent in THIS cluster but rare overall."""
    per = defaultdict(Counter)
    total = Counter()
    for p in people:
        c = cluster[p["id"]]
        for i, it in p["interests"].items():
            per[c][i] += it["weight"]
            total[i] += it["weight"]
    A = sum(sum(c.values()) for c in per.values()) / max(len(per), 1)
    labels = {}
    for c, cnt in per.items():
        if c == -1:
            labels[c] = "unclustered"
            continue
        n = sum(cnt.values())
        sc = {i: (v / n) * math.log(1 + A / total[i]) for i, v in cnt.items()}
        labels[c] = " + ".join(index.names[i] for i, _ in sorted(sc.items(), key=lambda kv: -kv[1])[:top])
    return labels


def connection_gaps(people, cluster, connections, predicted_pairs):
    """Compare actual cross-cluster connections to what match scores predicted.

    predicted_pairs: [(id_a, id_b, prob)] e.g. top-10 matches per person with model probability.
    """
    exp, act = defaultdict(float), defaultdict(int)
    key = lambda a, b: tuple(sorted((cluster[a], cluster[b])))
    for a, b, pr in predicted_pairs:
        exp[key(a, b)] += pr
    for a, b in connections:
        act[key(a, b)] += 1
    # cross-cluster only: within-cluster pairs connect on their own; the insight is missed bridges
    rows = [{"clusters": k, "expected": round(v, 1), "actual": act.get(k, 0),
             "gap": round(v - act.get(k, 0), 1),
             "ratio": round(act.get(k, 0) / v, 2) if v else None}
            for k, v in exp.items() if -1 not in k and k[0] != k[1] and v >= 1.0]
    return sorted(rows, key=lambda r: -r["gap"])


def dashboard_json(people, index, cluster, xy, connections, predicted_pairs):
    labels = ctfidf_labels(people, cluster, index)
    return {
        "nodes": [{"id": p["id"], "x": float(x), "y": float(y), "cluster": cluster[p["id"]],
                   "role": p.get("role")} for p, (x, y) in zip(people, xy)],   # no names: organizers see aggregates
        "clusters": [{"id": c, "label": l, "size": sum(1 for v in cluster.values() if v == c)}
                     for c, l in labels.items()],
        "edges": [{"source": a, "target": b} for a, b in connections],
        "gaps": connection_gaps(people, cluster, connections, predicted_pairs)[:10],
    }
