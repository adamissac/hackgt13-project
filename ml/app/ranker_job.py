"""AL9: retrain the learned match ranker and write an honest report (MASTER_SPEC 6.7).

Data sources:
- "simulated outcomes": ml.synth population + simulate_meetings (hidden ground truth that differs from V1).
- "real outcomes": verified conversations with checklist answers in Postgres. One row per (viewer, other):
  y = both said wants_connect, rel = 2 connected / 1 talked 8+ minutes / 0 otherwise, group = viewer.
  Profiles with is_synthetic = true are excluded. Split by user, never by row (ranker.group_split).

Every report carries "data": "simulated outcomes" | "real outcomes" so no number is quoted without its source.
"""
import json
import logging
import os
import time
from pathlib import Path

import numpy as np

from ml import ranker

log = logging.getLogger("ranker_job")
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MIN_REAL_PAIRS = 60          # below this, real data is reported but not trained on
MIN_REAL_VIEWERS = 8


def synthetic_rows(n: int = 200, clusters: bool = True, seed: int = 7):
    from ml import profiles, scoring, synth, viz
    people = synth.make_population(n, seed=seed)
    by_id = {p["id"]: p for p in people}
    index = profiles.build_population(people)
    cluster = viz.communities(people) if clusters else None
    rows = synth.simulate_meetings(people, lambda p: scoring.rank_candidates(p, people, index, cluster, explore_eps=0.0))
    return rows, by_id, index, cluster


def real_rows():
    """(rows, people_by_id, index) from verified conversations with feedback, real profiles only."""
    from . import db, population
    convs = db.fetchall(
        "select c.id, c.user_a::text as a, c.user_b::text as b, c.minutes, "
        "fa.wants_connect as a_yes, fb.wants_connect as b_yes "
        "from conversations c "
        "join profiles pa on pa.id = c.user_a and not coalesce(pa.is_synthetic, false) "
        "join profiles pb on pb.id = c.user_b and not coalesce(pb.is_synthetic, false) "
        "left join feedback fa on fa.conversation_id = c.id and fa.rater_id = c.user_a "
        "left join feedback fb on fb.conversation_id = c.id and fb.rater_id = c.user_b "
        "where fa.rater_id is not null or fb.rater_id is not null")
    ids = sorted({x for c in convs for x in (c["a"], c["b"])})
    people, index = population.build(ids)
    by_id = {p["id"]: p for p in people}
    rows = []
    for c in convs:
        if c["a"] not in by_id or c["b"] not in by_id:
            continue
        y = int(bool(c["a_yes"]) and bool(c["b_yes"]))
        rel = 2 if y else (1 if (c["minutes"] or 0) >= 8 else 0)
        rows.append({"viewer": c["a"], "other": c["b"], "y": y, "rel": rel})
        rows.append({"viewer": c["b"], "other": c["a"], "y": y, "rel": rel})
    return rows, by_id, index


def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (np.floating, float)):
        return None if np.isnan(obj) else round(float(obj), 4)
    if isinstance(obj, np.integer):
        return int(obj)
    return obj


def train(source: str = "auto", n_synthetic: int = 200, clusters: bool = True, out_dir: Path = DATA_DIR) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    real_summary = None
    if source in ("auto", "real"):
        rows, by_id, index = real_rows()
        viewers = len({r["viewer"] for r in rows})
        real_summary = {"pairs": len(rows) // 2, "rows": len(rows), "viewers": viewers,
                        "positive_rate": round(float(np.mean([r["y"] for r in rows])), 4) if rows else None}
        enough = len(rows) >= MIN_REAL_PAIRS and viewers >= MIN_REAL_VIEWERS and len({r["y"] for r in rows}) == 2
        if source == "real" and not enough:
            report = {"data": "real outcomes", "trained": False, "real_data": real_summary,
                      "reason": f"need >= {MIN_REAL_PAIRS} rows, >= {MIN_REAL_VIEWERS} viewers and both outcomes"}
            (out_dir / "ranker_report.json").write_text(json.dumps(report, indent=2))
            return report
        if enough:
            X, y, rel, groups, v1 = ranker.build_dataset(rows, by_id, index)
            report, lr, lgbm = ranker.train_and_evaluate(X, y, rel, groups, v1)
            report = {"data": "real outcomes", "trained": True, **report}
            return _save(report, lr, lgbm, out_dir, real_summary)
    rows, by_id, index, cluster = synthetic_rows(n_synthetic, clusters)
    X, y, rel, groups, v1 = ranker.build_dataset(rows, by_id, index, cluster)
    report, lr, lgbm = ranker.train_and_evaluate(X, y, rel, groups, v1)
    report = {"data": "simulated outcomes", "trained": True, "n_people": n_synthetic, **report}
    return _save(report, lr, lgbm, out_dir, real_summary)


def _save(report, lr, lgbm, out_dir: Path, real_summary) -> dict:
    report["real_data_available"] = real_summary
    report["trained_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    report = _clean(report)
    ranker.save_model(lr, out_dir / "ranker_lr.pkl")
    ranker.save_model(lgbm, out_dir / "ranker_lgbm.pkl")
    (out_dir / "ranker_report.json").write_text(json.dumps(report, indent=2))
    log.info("ranker trained on %s: %s", report["data"], report.get("AUC"))
    return report


_served = {"mtime": None, "model": None}


def serving_model():
    """MATCH_MODEL=lr serves data/ranker_lr.pkl (reloaded when the file changes); default None = V1."""
    if os.getenv("MATCH_MODEL", "v1") != "lr":
        return None
    path = DATA_DIR / "ranker_lr.pkl"
    if not path.exists():
        return None
    m = path.stat().st_mtime
    if _served["mtime"] != m:
        _served.update(mtime=m, model=ranker.load_model(path))
    return _served["model"]
