from scripts.ak6_to_sessions import recording_to_sessions


def test_one_session_per_peer_with_relative_seconds():
    rec = {"label": "talking", "conversation": True, "self_name": "fc-AAAA", "device_model": "iPhone 15",
           "platform": "ios", "sightings": [
               {"peer": "fc-BBBB", "ts": 2000, "rssi": -60, "app_state": "active"},
               {"peer": "fc-BBBB", "ts": 1000, "rssi": -55, "app_state": "active"},
               {"peer": "fc-CCCC", "ts": 1500, "rssi": -80, "app_state": "active"}]}
    sessions = recording_to_sessions(rec)
    assert [s["peer"] for s in sessions] == ["fc-BBBB", "fc-CCCC"]
    assert sessions[0]["t"] == [0.0, 1.0] and sessions[0]["rssi"] == [-55, -60]
    assert all(s["label"] == 1 and s["situation"] == "talking" for s in sessions)


def test_non_conversation_label_is_zero():
    rec = {"label": "walking_past", "conversation": False, "self_name": "x",
           "sightings": [{"peer": "p", "ts": 0, "rssi": -70, "app_state": "active"}]}
    assert recording_to_sessions(rec)[0]["label"] == 0
