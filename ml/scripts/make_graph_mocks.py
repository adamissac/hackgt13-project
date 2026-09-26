"""Write docs/mocks/graph_matches.json, graph_network.json, graph_expand.json (AR4/AR5).

Shape = MASTER_SPEC Section 9 `GET /graph` (nodes + edges; ids "me", "u_*", "t_*"; edge kinds
match | connection | has_topic), plus additive display fields documented in docs/api.md.
Scores are a quick IDF-weighted overlap, not the real V1 scorer, so this runs without
sentence-transformers:

    cd ml && .venv/bin/python scripts/make_graph_mocks.py && cd ../dashboard && npm run sync-mocks
"""
import json
import math
import os
import random
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ml.synth import ARCHETYPES, make_population  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "mocks")
MAX_PEOPLE = 30
EXPAND_TOPIC = "reinforcement learning"
random.seed(4)

people = make_population(n=120, seed=21)
CLUSTER = {k: i for i, k in enumerate(ARCHETYPES)}
me = {"id": "me", "name": "You", "role": "student", "raw_interests": [
    {"name": n, "facet": f, "strength": s, "evidence": e} for n, f, s, e in [
        ("reinforcement learning", "technical", 0.95, "Built an RL trading agent (repo: rl-trader)"),
        ("time series analysis", "technical", 0.8, "Forecasting coursework and a Kaggle notebook"),
        ("pytorch", "technical", 0.7, "Most repos use PyTorch"),
        ("python", "technical", 0.6, "72% of GitHub bytes"),
        ("quantitative research", "career", 0.85, "Seeking a quant research internship"),
        ("ai research", "career", 0.6, "Undergrad research in an ML lab"),
        ("mathematics", "academic", 0.7, "Math minor"),
        ("rock climbing", "personal", 0.7, "Climbs at the CRC twice a week"),
        ("chess", "personal", 0.5, "Plays blitz on lichess"),
    ]]}

N = len(people) + 1
df = Counter(i["name"] for p in people + [me] for i in {x["name"]: x for x in p["raw_interests"]}.values())
idf = {k: math.log((N + 1) / (v + 1)) + 0.1 for k, v in df.items()}
facet_of = {i["name"]: i["facet"] for p in people + [me] for i in p["raw_interests"]}
topic_ids = {name: f"t_{i + 1}" for i, name in enumerate(sorted(facet_of))}


def weights(p):
    w = {}
    for i in p["raw_interests"]:
        w[i["name"]] = max(w.get(i["name"], 0), round(min(1.0, i["strength"]), 2))
    return w


mine = weights(me)


def score(p):
    theirs = weights(p)
    shared = set(mine) & set(theirs)
    contrib = {s: min(mine[s], theirs[s]) * idf[s] for s in shared}
    den = sum(mine[s] * idf[s] for s in mine) or 1
    bonus = 0.12 if p["role"] == "recruiter" and "quantitative research" in theirs else 0
    return min(0.97, sum(contrib.values()) / den * 1.6 + bonus), sorted(shared, key=lambda s: -contrib[s]), contrib


def dominant_facet(contrib):
    by = Counter()
    for s, c in contrib.items():
        by[facet_of[s]] += c
    return by.most_common(1)[0][0] if by else "technical"


scored = sorted(((score(p), p) for p in people), key=lambda t: -t[0][0])
candidates = [t for t in scored if t[0][1]]
# hold two mid-ranked people who share EXPAND_TOPIC back, so expanding that topic pulls them in (demo 12.1)
held = [t for t in candidates[10:] if EXPAND_TOPIC in t[0][1]][:2]
ranked = [t for t in candidates if t not in held][:MAX_PEOPLE]
in_view = {p["id"] for _, p in ranked}
cut = sorted(s for (s, _, _), _p in ranked)[int(0.8 * len(ranked))]


def uid(p):
    return "u_" + p["id"].lstrip("u")


def topic_node(name):
    return {"id": topic_ids[name], "type": "topic", "label": name, "facet": facet_of[name], "idf": round(idf[name], 2)}


def person_node(p, s, shared, contrib, rank, mode):
    theirs = weights(p)
    first = p["name"].split()[0]
    node = {"id": uid(p), "type": "person", "label": first, "name": p["name"], "role": p["role"],
            "score": round(s, 3), "highlight": s >= cut, "open_to_meet": False, "cluster": CLUSTER[p["archetype"]],
            "connected": mode == "network", "connected_at": None, "top_topic": shared[0],
            "why": shared[:3], "topics": sorted(theirs, key=lambda k: -theirs[k])[:8],
            "shared_count": len(shared), "rank": rank, "photo_url": None}
    if mode == "matches":
        node["open_to_meet"] = random.random() < 0.25
    else:
        node["highlight"] = False
        hour = 10 + (rank * 37) % 14
        day = 26 if rank % 3 else 27
        node["connected_at"] = f"2026-09-{day}T{hour:02d}:{(rank * 13) % 60:02d}:00-04:00"
        node["met_at"] = "HackGT 13"
        node["how_met"] = "invite" if rank % 5 == 0 else "in_person"
    return node


def build(mode, chosen):
    nodes = [{"id": "me", "type": "self", "label": "You"}]
    edges, seen_topics = [], set()

    def add_topic(name):
        if name not in seen_topics:
            seen_topics.add(name)
            nodes.append(topic_node(name))
        return topic_ids[name]

    for name, w in sorted(mine.items(), key=lambda kv: -kv[1]):
        edges.append({"source": "me", "target": add_topic(name), "kind": "has_topic", "weight": w})
    for rank, ((s, shared, contrib), p) in enumerate(chosen, 1):
        theirs = weights(p)
        nodes.append(person_node(p, s, shared, contrib, rank, mode))
        edges.append({"source": "me", "target": uid(p), "kind": "match" if mode == "matches" else "connection",
                      "weight": round(s, 3), "facet": dominant_facet(contrib)})
        for t in shared[:4]:
            edges.append({"source": uid(p), "target": add_topic(t), "kind": "has_topic", "weight": theirs[t]})
    return {"mode": mode, "event_id": 1, "self_id": "me", "generated_at": "2026-09-26T12:00:00-04:00",
            "synthetic": True, "nodes": nodes, "edges": edges}


def build_expand():
    """GET /graph/expand?node_id=<topic>: two more allowed people who share the topic, ranked by score."""
    extra = held
    nodes, edges = [], []
    for i, ((s, shared, contrib), p) in enumerate(extra, 1):
        nodes.append(person_node(p, s, shared or [EXPAND_TOPIC], contrib, MAX_PEOPLE + i, "matches"))
        edges.append({"source": "me", "target": uid(p), "kind": "match", "weight": round(s, 3),
                      "facet": dominant_facet(contrib) if contrib else "technical"})
        edges.append({"source": uid(p), "target": topic_ids[EXPAND_TOPIC], "kind": "has_topic",
                      "weight": weights(p)[EXPAND_TOPIC]})
    return {"node_id": topic_ids[EXPAND_TOPIC], "mode": "matches", "event_id": 1, "synthetic": True,
            "nodes": nodes, "edges": edges}


def check(g):
    """Privacy invariant: no person-person edges; every person edge touches `me`."""
    people_ids = {n["id"] for n in g["nodes"] if n["type"] == "person"}
    for e in g["edges"]:
        assert not (e["source"] in people_ids and e["target"] in people_ids), e


os.makedirs(OUT, exist_ok=True)
network_pool = [t for t in ranked if int(t[1]["id"].lstrip("u")) % 2 == 0][:14]
for fname, g in [("graph_matches.json", build("matches", ranked)),
                 ("graph_network.json", build("network", network_pool)),
                 ("graph_expand.json", build_expand())]:
    check(g)
    with open(os.path.join(OUT, fname), "w") as f:
        json.dump(g, f, indent=1)
    print(f"{fname}: {dict(Counter(n['type'] for n in g['nodes']))}, {len(g['edges'])} edges")
