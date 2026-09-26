"""Write docs/mocks/graph_matches.json and docs/mocks/graph_network.json for the dashboard (AR4).

PROVISIONAL shape: MASTER_SPEC Section 9's /graph example isn't in the repo yet. When it lands,
align these files (and dashboard/lib/types.ts) to it. Scores here are a quick IDF-weighted overlap,
not the real V1 scorer, so run it without sentence-transformers:

    cd ml && .venv/bin/python scripts/make_graph_mocks.py
"""
import json
import math
import os
import random
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ml.synth import make_population  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "mocks")
MAX_PEOPLE = 30
random.seed(4)

people = make_population(n=120, seed=21)
me = {"id": "self", "name": "You", "role": "student", "raw_interests": [
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


def weights(p):
    w = {}
    for i in p["raw_interests"]:
        w[i["name"]] = max(w.get(i["name"], 0), round(min(1.0, i["strength"]), 2))
    return w


mine = weights(me)


def score(p):
    theirs = weights(p)
    shared = set(mine) & set(theirs)
    num = sum(min(mine[s], theirs[s]) * idf[s] for s in shared)
    den = sum(mine[s] * idf[s] for s in mine) or 1
    bonus = 0.12 if p["role"] == "recruiter" and "quantitative research" in theirs else 0
    return min(0.97, num / den * 1.6 + bonus), sorted(shared, key=lambda s: -min(mine[s], theirs[s]) * idf[s])


def first_last(name):
    return name


ranked = sorted(((score(p), p) for p in people), key=lambda t: -t[0][0])[:MAX_PEOPLE]
cut = sorted(s for (s, _), _p in ranked)[int(0.8 * len(ranked))]


def build(mode):
    nodes = [{"id": "self", "type": "self", "label": "You", "role": "student"}]
    links, topic_ids = [], {}

    def topic(name):
        if name not in topic_ids:
            topic_ids[name] = f"t:{name}"
            nodes.append({"id": topic_ids[name], "type": "topic", "label": name, "facet": facet_of[name],
                          "idf": round(idf[name], 2)})
        return topic_ids[name]

    for name, w in sorted(mine.items(), key=lambda kv: -kv[1]):
        links.append({"source": "self", "target": topic(name), "kind": "interest", "weight": w,
                      "facet": facet_of[name]})

    chosen = ranked if mode == "matches" else ranked[:14]
    for rank, ((s, shared), p) in enumerate(chosen, 1):
        if not shared:
            continue
        theirs = weights(p)
        node = {"id": p["id"], "type": "person", "label": p["name"], "role": p["role"],
                "score": round(s, 3), "why": shared[:3], "top_topic": shared[0],
                "topics": sorted(theirs, key=lambda k: -theirs[k])[:8], "photo_url": None}
        if mode == "matches":
            node.update(rank=rank, highlight=s >= cut, open_to_meet=random.random() < 0.25)
        else:
            day = random.choice([0, 0, 0, 1, 1, 2])
            node.update(connected_at=f"2026-09-{26 + day // 2:02d}T{10 + (rank * 37) % 12:02d}:{(rank * 13) % 60:02d}:00-04:00",
                        met_at="HackGT 13", via=random.choice(["in_person", "in_person", "in_person", "invite"]))
        nodes.append(node)
        links.append({"source": "self", "target": p["id"], "kind": "suggested" if mode == "matches" else "connection",
                      "weight": round(s, 3)})
        for t in shared[:4]:
            links.append({"source": p["id"], "target": topic(t), "kind": "interest", "weight": theirs[t],
                          "facet": facet_of[t]})
    # topics only the viewer has and nobody in view shares stay (they're the viewer's own profile)
    return {"mode": mode, "event_id": 1, "self_id": "self", "generated_at": "2026-09-26T12:00:00-04:00",
            "synthetic": True, "nodes": nodes, "links": links}


os.makedirs(OUT, exist_ok=True)
for mode, fname in [("matches", "graph_matches.json"), ("network", "graph_network.json")]:
    g = build(mode)
    # privacy invariant: no person-person edge except to self
    people_ids = {n["id"] for n in g["nodes"] if n["type"] == "person"}
    assert not any(l["source"] in people_ids and l["target"] in people_ids for l in g["links"])
    with open(os.path.join(OUT, fname), "w") as f:
        json.dump(g, f, indent=1)
    kinds = Counter(n["type"] for n in g["nodes"])
    print(f"{fname}: {dict(kinds)}, {len(g['links'])} links")
