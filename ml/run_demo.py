"""End-to-end dry run of every AI component on synthetic data.

python run_demo.py              # offline, no API key needed
python run_demo.py --llm        # also calls Claude for starters (needs ANTHROPIC_API_KEY)
"""
import argparse
import warnings
warnings.filterwarnings("ignore")
import json
import os
import numpy as np
from ml import synth, profiles, scoring, ranker, encounter, viz

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=200)
ap.add_argument("--llm", action="store_true")
args = ap.parse_args()
os.makedirs("data", exist_ok=True)

print("1) synthetic population")
people = synth.make_population(args.n)
by_id = {p["id"]: p for p in people}

print("2) canonicalize, weight, IDF, facet vectors")
index = profiles.build_population(people)
print(f"   {len(index.names)} canonical interests")

print("3) communities (HDBSCAN) + layout (UMAP)")
cluster = viz.communities(people)
xy = viz.layout(people)
labels = viz.ctfidf_labels(people, cluster, index)
for c, l in sorted(labels.items()):
    print(f"   cluster {c:>2}: {l}")

print("4) simulate meetings using V1 ranking")
rank_fn = lambda p: scoring.rank_candidates(p, people, index, cluster, explore_eps=0.0)
rows = synth.simulate_meetings(people, rank_fn)
print(f"   {len(rows)} met pairs, {sum(r['y'] for r in rows)} mutual connections")

print("5) train learned ranker")
X, y, rel, groups, v1 = ranker.build_dataset(rows, by_id, index, cluster)
report, lr_model, lgbm_model = ranker.train_and_evaluate(X, y, rel, groups, v1)
print(json.dumps({k: v for k, v in report.items()}, indent=2, default=float))
ranker.save_model(lr_model, "data/ranker_lr.pkl")
ranker.save_model(lgbm_model, "data/ranker_lgbm.pkl")

print("6) encounter classifier")
sessions = synth.simulate_ble_sessions()
enc_report, enc_model = encounter.train(sessions)
print(f"   GBM AUC {enc_report['gbm_auc']:.3f} | LR AUC {enc_report['lr_auc']:.3f} | "
      f"hard-negative FP rate {enc_report['hard_negative_false_positive_rate']:.2f}")
print(enc_report["gbm_report"])
ranker.save_model(enc_model, "data/encounter_gbm.pkl")

print("7) sample ranking with learned model")
me = people[0]
ranked = scoring.rank_candidates(me, people, index, cluster, model=lr_model)
print(f"   for {me['name']} ({me['archetype']}, {me['role']}):")
for r in ranked[:5]:
    o = by_id[r["id"]]
    print(f"   #{r['rank']+1} {o['name']:<10} {o['archetype']:<12} {o['role']:<9} "
          f"p={r['score']:.2f} why={r['why']}")
print("   checklist:", scoring.checklist(me, by_id[ranked[0]['id']], index))

if args.llm:
    from ml import llm
    top = by_id[ranked[0]["id"]]
    print("   starters:", llm.conversation_starters(me["name"], top["name"],
                                                     scoring.shared_interests(me, top, index)))

print("8) dashboard JSON")
connections = [(r["viewer"], r["other"]) for r in rows if r["y"]]
predicted = []
for p in people:
    for r in scoring.rank_candidates(p, people, index, cluster, model=lr_model, explore_eps=0)[:10]:
        predicted.append((p["id"], r["id"], r["score"]))
dash = viz.dashboard_json(people, index, cluster, xy, connections, predicted)
synth.save(dash, "data/dashboard.json")
print("   top gaps:", [(labels[g["clusters"][0]], labels[g["clusters"][1]], g["gap"]) for g in dash["gaps"][:3]])
print("done -> data/")
