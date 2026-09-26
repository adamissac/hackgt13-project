"""Retrain the encounter classifier (AL8): synthetic sessions + ml/datasets/ble_labeled/*.csv (weighted 3x).

  cd ml && python scripts/train_encounter.py      # needs DATABASE_URL to know which features are observable
Writes data/encounter_gbm.pkl and data/encounter_report.json (the report states its data source and the
"same table, not talking" false-positive rate separately).
"""
import json
import os
import sys
import warnings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
warnings.filterwarnings("ignore")

from app import db, encounters  # noqa: E402
from ml.encounter import ENC_FEATURES  # noqa: E402

if os.getenv("DATABASE_URL"):
    db.open_pool()
    feats = encounters.observable_features()
else:
    feats = [f for f in ENC_FEATURES if f not in ("stationary_a", "stationary_b", "same_zone")]
bundle = encounters.train_model(feats)
encounters.save_bundle(bundle)
print(json.dumps(bundle["report"], indent=2))
