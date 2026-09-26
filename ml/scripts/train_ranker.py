"""Retrain the learned match ranker and print the report (AL9).

  cd ml && python scripts/train_ranker.py                 # auto: real outcomes if enough, else simulated
  cd ml && python scripts/train_ranker.py --source synthetic --n 200
  cd ml && python scripts/train_ranker.py --source real   # needs DATABASE_URL

Writes data/ranker_report.json, data/ranker_lr.pkl, data/ranker_lgbm.pkl. Serve the LR model with MATCH_MODEL=lr.
"""
import argparse
import json
import os
import sys
import warnings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
warnings.filterwarnings("ignore")

from app import db, ranker_job  # noqa: E402
from app.settings import get_settings  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--source", choices=["auto", "real", "synthetic"], default="auto")
ap.add_argument("--n", type=int, default=200, help="synthetic population size")
ap.add_argument("--no-clusters", action="store_true", help="skip UMAP/HDBSCAN (bridge feature = 0), much faster")
args = ap.parse_args()

source = args.source
if source != "synthetic":
    if get_settings().database_url:
        db.open_pool()
    elif source == "real":
        sys.exit("DATABASE_URL is not set")
    else:
        source = "synthetic"
report = ranker_job.train(source, args.n, clusters=not args.no_clusters)
print(json.dumps(report, indent=2))
print(f"\nAll numbers above are on {report['data'].upper()}.")
