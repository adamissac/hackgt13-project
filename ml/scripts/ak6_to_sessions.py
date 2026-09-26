"""Convert AK6 recording files (from the app's Record session screen) into encounter sessions.

Each recording is one phone's view; every other phone it heard becomes one session in the shape
ml/encounter.py expects: {"t": [seconds from start], "rssi": [...], "label": 0|1, ...}.

Usage: python scripts/ak6_to_sessions.py recordings/*.json > data/ak6_sessions.json
"""
import json
import sys
from collections import defaultdict


def recording_to_sessions(rec):
    by_peer = defaultdict(list)
    for s in rec["sightings"]:
        by_peer[s["peer"]].append((s["ts"], s["rssi"]))
    sessions = []
    for peer, pts in sorted(by_peer.items()):
        pts.sort()
        t0 = pts[0][0]
        sessions.append({
            "t": [(ts - t0) / 1000.0 for ts, _ in pts],
            "rssi": [r for _, r in pts],
            "label": int(bool(rec["conversation"])),
            "situation": rec["label"],
            "observer": rec["self_name"],
            "peer": peer,
            "device_model": rec.get("device_model"),
            "platform": rec.get("platform"),
            "distance_note": rec.get("distance_note", ""),
        })
    return sessions


def main(paths):
    sessions = []
    for p in paths:
        with open(p) as f:
            sessions.extend(recording_to_sessions(json.load(f)))
    json.dump(sessions, sys.stdout)
    print(f"{len(sessions)} sessions from {len(paths)} recordings", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
