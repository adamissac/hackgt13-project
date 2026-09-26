"""Convert AK6 recordings (the app's Record session screen, one JSON per phone per recording) into the
labeled CSVs Alan's encounter trainer reads (app/encounters.py load_labeled):

    ml/datasets/ble_labeled/<recording>.csv   columns: session_id,label,observer,observed,ts,rssi

One session per (observer phone, heard phone). `ts` is unix seconds. Then retrain:
    python scripts/train_encounter.py

Usage: python scripts/ak6_to_sessions.py ~/Downloads/ak6_*.json [--out datasets/ble_labeled]
"""
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "datasets" / "ble_labeled"
FIELDS = ["session_id", "label", "observer", "observed", "ts", "rssi"]


def recording_to_rows(rec):
    by_peer = defaultdict(list)
    for s in rec["sightings"]:
        by_peer[s["peer"]].append((s["ts"] / 1000.0, s["rssi"]))
    rows = []
    for peer, pts in sorted(by_peer.items()):
        for ts, rssi in sorted(pts):
            rows.append({"session_id": f"{rec['self_name']}>{peer}", "label": rec["label"],
                         "observer": rec["self_name"], "observed": peer, "ts": f"{ts:.3f}", "rssi": rssi})
    return rows


def write_csv(rec, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = rec["started_at"].replace(":", "-").replace(".", "-")
    path = out_dir / f"{rec['label']}_{rec['self_name']}_{stamp}.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(recording_to_rows(rec))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    for p in args.files:
        with open(p) as f:
            rec = json.load(f)
        out = write_csv(rec, args.out)
        print(f"{p} -> {out} ({len(rec['sightings'])} readings, label {rec['label']})")


if __name__ == "__main__":
    main()
