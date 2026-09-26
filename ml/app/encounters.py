"""AL8: Bluetooth-verified conversations (MASTER_SPEC 3.5, 6.8, 7.4, 7.7).

Every 30 s: resolve sightings' rotating tokens to users (ephemeral_ids, server-only), merge both phones'
sightings per pair, sessionize (gaps < 60 s), compute features, score with the encounter classifier.
A session is a verified conversation when p >= 0.7 AND at least 3 minutes above -65 dBm (smoothed).
Verified -> conversations row (method 'ble') + connect prompts, and an encounters row with the features.
Unverified sessions store nothing (raw sightings are deleted after 24 h by the retention job).

Classifier training data: synthetic sessions (ml.synth) + team-recorded labeled sessions from
ml/datasets/ble_labeled/*.csv weighted 3x. Features the pipeline can't observe (accelerometer stillness,
event zones) are left out of the served model instead of being faked with constants.
"""
import csv
import json
import logging
import pickle
import threading
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from psycopg.types.json import Jsonb

from ml import synth
from ml.config import P_CONVERSATION_THRESHOLD, RSSI_NEAR_DBM, SESSION_GAP_S
from ml.encounter import ENC_FEATURES, session_features, smooth

from . import conversations, db, matching

log = logging.getLogger("encounters")
ML_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = ML_DIR / "data" / "encounter_gbm.pkl"
LABELED_DIR = ML_DIR / "datasets" / "ble_labeled"
MIN_NEAR_S = 180
REAL_WEIGHT = 3.0
LOOKBACK_HOURS = 3
LABEL_MAP = {"talking": "conversation", "in_line": "in_line", "walking_past": "walk_past",
             "across_room": "across_room", "same_table_laptops": "same_table_not_talking"}
_lock = threading.Lock()
_bundle: dict | None = None


def observable_features() -> list[str]:
    drop = set()
    cols = {r["column_name"] for r in db.fetchall(
        "select column_name from information_schema.columns where table_schema='public' and table_name='sightings'")}
    if "stationary" not in cols:
        drop |= {"stationary_a", "stationary_b"}
    if not db.fetchone("select 1 as ok from event_zones limit 1"):
        drop.add("same_zone")
    return [f for f in ENC_FEATURES if f not in drop]


# ------------------------------------------------------------------ training
def load_labeled(directory: Path = LABELED_DIR) -> list[dict]:
    """CSV columns: session_id,label,observer,observed,ts,rssi (ts = unix seconds or ISO)."""
    sessions: dict[str, dict] = {}
    for f in sorted(directory.glob("*.csv")) if directory.exists() else []:
        with open(f, newline="") as fh:
            for row in csv.DictReader(fh):
                cls = LABEL_MAP.get(row["label"].strip())
                if cls is None:
                    continue
                ts = row["ts"].strip()
                t = float(ts) if ts.replace(".", "", 1).isdigit() else datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
                s = sessions.setdefault(f"{f.name}:{row['session_id']}", {"cls": cls, "label": int(cls == "conversation"),
                                                                          "pts": []})
                s["pts"].append((t, float(row["rssi"])))
    out = []
    for s in sessions.values():
        pts = sorted(s["pts"])
        out.append({"cls": s["cls"], "label": s["label"], "t": [p[0] - pts[0][0] for p in pts],
                    "rssi": [p[1] for p in pts]})
    return out


def train_model(features: list[str], n_synthetic: int = 1500, labeled_dir: Path = LABELED_DIR) -> dict:
    syn = synth.simulate_ble_sessions(n_synthetic)
    real = load_labeled(labeled_dir)
    sessions = syn + real
    X = np.array([[session_features(s)[k] for k in features] for s in sessions])
    y = np.array([s["label"] for s in sessions])
    cls = np.array([s["cls"] for s in sessions])
    w = np.array([1.0] * len(syn) + [REAL_WEIGHT] * len(real))
    is_real = np.array([False] * len(syn) + [True] * len(real))
    tr, te = train_test_split(np.arange(len(y)), test_size=0.25, random_state=0, stratify=y)
    Xtr, Xte, ytr, yte, wtr, cte, rte = X[tr], X[te], y[tr], y[te], w[tr], cls[te], is_real[te]
    gbm = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1).fit(Xtr, ytr, sample_weight=wtr)
    p = gbm.predict_proba(Xte)[:, 1]
    hard = cte == "same_table_not_talking"

    def fp_rate(mask):
        m = hard & mask
        return round(float((p[m] >= P_CONVERSATION_THRESHOLD).mean()), 3) if m.any() else None
    report = {"data": "real + simulated sessions" if real else "simulated sessions",
              "n_synthetic": len(syn), "n_real": len(real), "real_weight": REAL_WEIGHT, "features": features,
              "auc": round(float(roc_auc_score(yte, p)), 3),
              "same_table_not_talking_false_positive_rate": fp_rate(np.ones_like(hard)),
              "same_table_false_positive_rate_real_only": fp_rate(rte),
              "threshold": P_CONVERSATION_THRESHOLD}
    full = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1).fit(X, y, sample_weight=w)
    return {"features": features, "model": full, "report": report}


def model_bundle() -> dict:
    global _bundle
    with _lock:
        feats = observable_features()
        if _bundle is None or _bundle["features"] != feats:
            if MODEL_PATH.exists():
                b = pickle.loads(MODEL_PATH.read_bytes())
                if isinstance(b, dict) and b.get("features") == feats:
                    _bundle = b
            if _bundle is None or _bundle["features"] != feats:
                _bundle = train_model(feats)
                log.info("encounter model trained: %s", _bundle["report"])
        return _bundle


def save_bundle(bundle: dict, path: Path = MODEL_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pickle.dumps(bundle))
    (path.parent / "encounter_report.json").write_text(json.dumps(bundle["report"], indent=2))


# ------------------------------------------------------------------ sessions from sightings
def resolved_sightings(hours: int = LOOKBACK_HOURS) -> list[dict]:
    """Sightings with both ends resolved to users (never leaves the server)."""
    return db.fetchall(
        "select s.observer_id::text as observer, e.user_id::text as observed, extract(epoch from s.ts) as t, "
        "s.rssi, s.zone_id from sightings s join ephemeral_ids e on e.token = s.observed_token "
        "and (e.valid_from is null or s.ts >= e.valid_from - interval '1 minute') "
        "and (e.valid_to is null or s.ts <= e.valid_to + interval '1 minute') "
        "where s.ts > now() - make_interval(hours => %s) and e.user_id <> s.observer_id order by s.ts",
        (hours,))


def sessions_from(rows: list[dict]) -> list[dict]:
    """One stream per direction (observer -> observed), split at gaps > 60 s. Each phone's own scans match
    what the classifier was trained on; a pair is verified if either direction qualifies (MASTER_SPEC 7.2)."""
    by_dir: dict[tuple, list] = {}
    zones: dict[tuple, set] = {}
    for r in rows:
        by_dir.setdefault((r["observer"], r["observed"]), []).append((float(r["t"]), float(r["rssi"])))
        if r["zone_id"] is not None:
            zones.setdefault((r["observer"], r["observed"]), set()).add(r["zone_id"])
    sessions = []
    for (obs, seen), pts in by_dir.items():
        pts.sort()
        same_zone = int(bool(zones.get((obs, seen), set()) & zones.get((seen, obs), set())))
        cur = [pts[0]]
        for p in pts[1:] + [None]:
            if p is None or p[0] - cur[-1][0] > SESSION_GAP_S:
                sessions.append({"pair": tuple(sorted((obs, seen))), "observer": obs, "t": [x[0] for x in cur],
                                 "rssi": [x[1] for x in cur], "same_zone": same_zone})
                cur = []
            if p is not None:
                cur.append(p)
    return sessions


def seconds_near(s: dict) -> float:
    """Time (s) with smoothed RSSI above -65 dBm, counting gaps only up to the session gap."""
    t = np.asarray(s["t"], float)
    r = smooth(s["rssi"])
    if len(t) < 2:
        return 0.0
    dt = np.minimum(np.diff(t), SESSION_GAP_S)
    return float(dt[(r[:-1] > RSSI_NEAR_DBM)].sum())


def score_session(s: dict, bundle: dict) -> tuple[float, dict]:
    f = session_features(s)
    x = np.array([[f[k] for k in bundle["features"]]])
    return float(bundle["model"].predict_proba(x)[0, 1]), f


def process() -> int:
    """One worker tick. Returns the number of new Bluetooth-verified conversations."""
    rows = resolved_sightings()
    if not rows:
        return 0
    bundle = model_bundle()
    created = 0
    for s in sessions_from(rows):
        near = seconds_near(s)
        if near < MIN_NEAR_S:
            continue
        p, feats = score_session(s, bundle)
        if p < P_CONVERSATION_THRESHOLD:
            continue
        a, b = s["pair"]
        start = datetime.fromtimestamp(s["t"][0], timezone.utc)
        end = datetime.fromtimestamp(s["t"][-1], timezone.utc)
        minutes = round((s["t"][-1] - s["t"][0]) / 60, 1)
        with db.conn() as c:
            seen = c.execute(   # the same session seen again, or from the other phone: extend, don't re-prompt
                "select id, start_ts from encounters where user_a = %s and user_b = %s "
                "and start_ts <= %s + make_interval(secs => %s) and end_ts >= %s - make_interval(secs => %s)",
                (a, b, end, SESSION_GAP_S, start, SESSION_GAP_S)).fetchone()
            if seen:
                c.execute("update encounters set end_ts = greatest(end_ts, %s), p_conversation = greatest(p_conversation, %s) "
                          "where id = %s", (end, p, seen["id"]))
                c.execute("update conversations set ended_at = greatest(ended_at, %s), "
                          "minutes = round((extract(epoch from greatest(ended_at, %s) - started_at) / 60)::numeric, 1), "
                          "p_conversation = greatest(p_conversation, %s) "
                          "where user_a = %s and user_b = %s and method = 'ble' and started_at = %s",
                          (end, end, p, a, b, seen["start_ts"]))
                continue
            event_id = matching.shared_event(a, b)
            _, new = conversations.create_conversation(c, a, b, "ble", event_id, minutes=minutes, p_conversation=p,
                                                       started_at=start, ended_at=end)
            c.execute("insert into encounters (user_a, user_b, event_id, start_ts, end_ts, features, p_conversation) "
                      "values (%s, %s, %s, %s, %s, %s, %s)",
                      (a, b, event_id, start, end, Jsonb({**feats, "seconds_near": near}), p))
            created += int(new)
    if created:
        log.info("bluetooth verified %d conversations", created)
    return created
