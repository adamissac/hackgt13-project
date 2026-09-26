"""Write docs/mocks/dashboard_event.json: the organizer community map (GET /dashboard/{event_id}, api.md 14).

Built with the real pipeline on synthetic attendees: bge-small vectors -> UMAP 10d + HDBSCAN communities ->
UMAP 2d layout -> c-TF-IDF labels -> connection gaps (MASTER_SPEC 6.13). Connections are simulated
across the event's hours so the page can replay them "live".

Privacy (MASTER_SPEC 11): node ids are anonymous per payload (n1, n2, ...), no names, and any cluster
smaller than 5 is folded into -1 (unclustered) before labels or gaps are computed.

    cd ml && .venv/bin/python scripts/make_dashboard_mock.py && cd ../dashboard && npm run sync-mocks
"""
import datetime as dt
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np  # noqa: E402

from ml import viz  # noqa: E402
from ml.profiles import build_population  # noqa: E402
from ml.synth import make_population  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "mocks", "dashboard_event.json")
MIN_GROUP = 5
EVENT_START = dt.datetime(2026, 9, 26, 9, 0, tzinfo=dt.timezone(dt.timedelta(hours=-4)))
EVENT_HOURS = 14

rng = np.random.default_rng(5)
people = make_population(n=140, seed=31)
index = build_population(people)
cluster = viz.communities(people, min_cluster_size=MIN_GROUP)
sizes = Counter(cluster.values())
cluster = {k: (c if c != -1 and sizes[c] >= MIN_GROUP else -1) for k, c in cluster.items()}
xy = viz.layout(people)

# predicted pairs: each person's top 10 by combined cosine, probability ~ squashed similarity
X = np.vstack([p["combined"] for p in people])
S = X @ X.T
np.fill_diagonal(S, -1)
predicted = []
for i, p in enumerate(people):
    for j in np.argsort(-S[i])[:10]:
        prob = float(1 / (1 + np.exp(-(S[i, j] - 0.6) * 12)))
        predicted.append((p["id"], people[j]["id"], prob))

# simulated connections: mostly within cluster (people meet who they're similar to), few bridges
connections, made = [], set()
ids = [p["id"] for p in people]
for a, b, prob in sorted(predicted, key=lambda t: -t[2]):
    k = tuple(sorted((a, b)))
    if k in made:
        continue
    same = cluster[a] == cluster[b] and cluster[a] != -1
    if rng.random() < prob * (0.22 if same else 0.035):
        made.add(k)
        connections.append(k)

dash = viz.dashboard_json(people, index, cluster, xy, connections, predicted)

# anonymize: per-payload ids, drop anything that could identify a person
anon = {p["id"]: f"n{i + 1}" for i, p in enumerate(rng.permutation(people))}
labels = {c["id"]: c["label"] for c in dash["clusters"]}
for n in dash["nodes"]:
    n["id"] = anon[n["id"]]
    n["x"], n["y"] = round(n["x"], 3), round(n["y"], 3)
times = sorted(EVENT_START + dt.timedelta(minutes=float(m)) for m in rng.uniform(0, EVENT_HOURS * 60, len(connections)))
dash["edges"] = [{"source": anon[a], "target": anon[b], "created_at": t.isoformat(timespec="minutes")}
                 for (a, b), t in zip(rng.permutation(connections).tolist(), times)]
dash["clusters"] = sorted([c for c in dash["clusters"] if c["id"] == -1 or c["size"] >= MIN_GROUP],
                          key=lambda c: -c["size"])
for g in dash["gaps"]:
    g["labels"] = [labels.get(c, "") for c in g["clusters"]]
dash.update({"event_id": 1, "event_name": "HackGT 13", "synthetic": True,
             "generated_at": (EVENT_START + dt.timedelta(hours=EVENT_HOURS)).isoformat(timespec="minutes"),
             "window": {"start": EVENT_START.isoformat(timespec="minutes"),
                        "end": (EVENT_START + dt.timedelta(hours=EVENT_HOURS)).isoformat(timespec="minutes")},
             "stats": {"attendees": len(people), "connections": len(connections),
                       "clusters": sum(1 for c in dash["clusters"] if c["id"] != -1)}})

assert all(set(n) <= {"id", "x", "y", "cluster", "role"} for n in dash["nodes"]), "no identifying fields on nodes"
assert all(c["size"] >= MIN_GROUP for c in dash["clusters"] if c["id"] != -1)
with open(OUT, "w") as f:
    json.dump(dash, f, indent=1)
print(f"{len(dash['nodes'])} nodes, {dash['stats']['clusters']} clusters, {len(dash['edges'])} connections, "
      f"{len(dash['gaps'])} gaps")
for c in dash["clusters"][:12]:
    print(f"  cluster {c['id']:>2} ({c['size']:>2}): {c['label']}")
print("top gap:", dash["gaps"][0] if dash["gaps"] else None)
