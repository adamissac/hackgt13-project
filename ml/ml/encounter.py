"""Encounter classifier: was this BLE co-presence session a real conversation?

Training data:
  Bootstrap: synth.simulate_ble_sessions() (5 classes incl. the hard negative
             'same table, not talking').
  Real (do this Saturday morning, ~45 min): pairs of teammates record labeled sessions with the
             app in Event Mode: talk face to face, stand in a line, walk past, sit across the room,
             sit at the same table on laptops. 5-10 sessions each. Label in a spreadsheet.
  Production: sessions ending in a QR handshake = weak positives; short no-handshake = negatives.
"""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from .config import RSSI_NEAR_DBM, SESSION_GAP_S

ENC_FEATURES = ["duration_s", "rssi_median", "rssi_iqr", "rssi_std", "frac_near", "max_gap_s",
                "scan_rate", "slope", "stationary_a", "stationary_b", "same_zone"]


def smooth(rssi, win=5):
    """Rolling median (the 5-second smoothing the app also does on-device)."""
    r = np.asarray(rssi, float)
    if len(r) < win:
        return r
    pad = np.pad(r, (win // 2, win // 2), mode="edge")
    return np.array([np.median(pad[i:i + win]) for i in range(len(r))])


def estimate_distance_m(rssi, a_1m=-59.0, n=2.5):
    return 10 ** ((a_1m - rssi) / (10 * n))


def session_features(s):
    t = np.asarray(s["t"], float)
    r = smooth(s["rssi"])
    if len(t) < 2:
        return dict.fromkeys(ENC_FEATURES, 0.0)
    dur = t[-1] - t[0]
    q75, q25 = np.percentile(r, [75, 25])
    slope = float(np.polyfit(t - t[0], r, 1)[0]) if len(t) > 3 else 0.0
    return {"duration_s": dur, "rssi_median": float(np.median(r)), "rssi_iqr": float(q75 - q25),
            "rssi_std": float(r.std()), "frac_near": float((r > RSSI_NEAR_DBM).mean()),
            "max_gap_s": float(np.diff(t).max()), "scan_rate": len(t) / max(dur, 1), "slope": slope,
            "stationary_a": s.get("stationary_a", 0.5), "stationary_b": s.get("stationary_b", 0.5),
            "same_zone": float(s.get("same_zone", 0))}


def sessionize(sightings):
    """Production: raw sightings [(pair_key, ts, rssi), ...] sorted by ts -> sessions per pair."""
    by_pair = {}
    for pair, ts, rssi in sightings:
        by_pair.setdefault(pair, []).append((ts, rssi))
    sessions = []
    for pair, pts in by_pair.items():
        pts.sort()
        cur = [pts[0]]
        for p in pts[1:]:
            if p[0] - cur[-1][0] > SESSION_GAP_S:
                sessions.append({"pair": pair, "t": [x[0] for x in cur], "rssi": [x[1] for x in cur]})
                cur = []
            cur.append(p)
        sessions.append({"pair": pair, "t": [x[0] for x in cur], "rssi": [x[1] for x in cur]})
    return sessions


def train(sessions):
    X = np.array([[session_features(s)[k] for k in ENC_FEATURES] for s in sessions])
    y = np.array([s["label"] for s in sessions])
    cls = np.array([s["cls"] for s in sessions])
    Xtr, Xte, ytr, yte, _, cte = train_test_split(X, y, cls, test_size=0.25, random_state=0, stratify=y)
    gbm = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1).fit(Xtr, ytr)
    lr = LogisticRegression(max_iter=3000, class_weight="balanced").fit(Xtr, ytr)
    p = gbm.predict_proba(Xte)[:, 1]
    hard = cte == "same_table_not_talking"
    report = {"gbm_auc": roc_auc_score(yte, p),
              "lr_auc": roc_auc_score(yte, lr.predict_proba(Xte)[:, 1]),
              "hard_negative_false_positive_rate": float((p[hard] > 0.7).mean()) if hard.any() else None,
              "gbm_report": classification_report(yte, (p > 0.7).astype(int), output_dict=False)}
    gbm_full = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1).fit(X, y)
    return report, gbm_full
