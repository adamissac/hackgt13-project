"""AK6 recordings -> Alan's labeled CSV format, checked through his own loader."""
from scripts.ak6_to_sessions import recording_to_rows, write_csv

REC = {"label": "talking", "conversation": True, "self_name": "fc-AAAA", "started_at": "2026-09-26T15:00:00.000Z",
       "sightings": [
           {"peer": "fc-BBBB", "ts": 2000, "rssi": -60, "app_state": "active"},
           {"peer": "fc-BBBB", "ts": 1000, "rssi": -55, "app_state": "active"},
           {"peer": "fc-CCCC", "ts": 1500, "rssi": -80, "app_state": "active"}]}


def test_rows_are_per_pair_sorted_unix_seconds():
    rows = recording_to_rows(REC)
    assert [(r["session_id"], r["ts"], r["rssi"]) for r in rows] == [
        ("fc-AAAA>fc-BBBB", "1.000", -55), ("fc-AAAA>fc-BBBB", "2.000", -60), ("fc-AAAA>fc-CCCC", "1.500", -80)]
    assert {r["label"] for r in rows} == {"talking"}


def test_alans_loader_reads_our_csv(tmp_path):
    from app.encounters import load_labeled
    write_csv(REC, tmp_path)
    write_csv({**REC, "label": "walking_past", "started_at": "2026-09-26T15:05:00.000Z"}, tmp_path)
    sessions = load_labeled(tmp_path)
    assert len(sessions) == 4
    talk = [s for s in sessions if s["cls"] == "conversation"]
    assert len(talk) == 2 and all(s["label"] == 1 for s in talk)
    assert {s["cls"] for s in sessions} == {"conversation", "walk_past"}
    b = next(s for s in talk if len(s["t"]) == 2)
    assert b["t"] == [0.0, 1.0] and b["rssi"] == [-55.0, -60.0]
