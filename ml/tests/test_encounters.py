"""AL8: sightings -> sessions -> classifier -> Bluetooth-verified conversations."""
import numpy as np
import pytest

from conftest import add_event, seed_person


@pytest.fixture(scope="module")
def bundle():
    from app import encounters
    from ml.encounter import ENC_FEATURES
    feats = [f for f in ENC_FEATURES if f not in ("stationary_a", "stationary_b", "same_zone")]
    return encounters.train_model(feats, n_synthetic=800)


@pytest.fixture
def use_bundle(bundle, monkeypatch):
    from app import encounters
    monkeypatch.setattr(encounters, "model_bundle", lambda: bundle)
    return bundle


def phone(db, uid, token):
    db.execute("insert into ephemeral_ids (token, user_id, valid_from, valid_to) "
               "values (%s, %s, now() - interval '3 hours', now() + interval '1 hour')", (token, uid))


def sightings(db, observer, token, seconds, mean, sd=4.0, every=1.0, start_ago=None, seed=0, dips=0.0):
    """Same generative shape as ml.synth.simulate_ble_sessions (sd ~4 dB, 25% dropped scans; talking has
    occasional ~8 dB body-block dips)."""
    rng = np.random.default_rng(seed)
    start_ago = start_ago if start_ago is not None else seconds + 5
    t = np.arange(0, seconds, every)
    t = t[rng.random(len(t)) > 0.25]                        # dropped scans, like real BLE
    rows = [(observer, token, int(round(mean + sd * rng.standard_normal() - 8 * (rng.random() < dips))),
             float(start_ago - x)) for x in t]
    with db.conn() as c:
        with c.cursor() as cur:
            cur.executemany("insert into sightings (observer_id, observed_token, rssi, ts) "
                            "values (%s, %s, %s, now() - make_interval(secs => %s))", rows)


@pytest.fixture
def pair(db):
    ev = add_event(db)
    a = seed_person(db, "Ana", [("robotics", "technical", 0.9)], event_id=ev)
    b = seed_person(db, "Ben", [("robotics", "technical", 0.9)], event_id=ev)
    phone(db, a, "tokA")
    phone(db, b, "tokB")
    return ev, a, b


def test_real_conversation_is_verified_once(db, pair, use_bundle):
    from app import encounters
    ev, a, b = pair
    sightings(db, a, "tokB", 360, -57, seed=1, dips=0.05)  # 6 minutes face to face, both phones scanning
    sightings(db, b, "tokA", 360, -58, seed=2, dips=0.05)
    assert encounters.process() == 1
    c = db.fetchone("select method, event_id, minutes, p_conversation, user_a::text a, user_b::text b from conversations")
    assert c["method"] == "ble" and c["event_id"] == ev and 5 <= c["minutes"] <= 6.1 and c["p_conversation"] >= 0.7
    assert {c["a"], c["b"]} == {a, b}
    assert db.fetchone("select count(*) n from notifications where kind = 'connect_prompt'")["n"] == 2
    enc = db.fetchone("select features from encounters")
    assert enc["features"]["seconds_near"] >= 180
    assert encounters.process() == 0                       # next tick: no duplicate prompt
    assert db.fetchone("select count(*) n from conversations")["n"] == 1
    assert db.fetchone("select count(*) n from encounters")["n"] == 1


def test_non_conversations_store_nothing(db, pair, use_bundle):
    from app import encounters
    ev, a, b = pair
    sightings(db, a, "tokB", 40, -62, seed=3)              # walking past
    sightings(db, b, "tokA", 900, -80, start_ago=3000, seed=4)   # across the room for 15 minutes
    assert encounters.process() == 0
    assert db.fetchone("select count(*) n from conversations")["n"] == 0
    assert db.fetchone("select count(*) n from encounters")["n"] == 0   # features kept only when verified


def test_unknown_or_expired_tokens_are_ignored(db, pair, use_bundle):
    from app import encounters
    ev, a, b = pair
    sightings(db, a, "not-a-token", 360, -55, seed=5)
    db.execute("update ephemeral_ids set valid_to = now() - interval '2 hours' where token = 'tokB'")
    sightings(db, a, "tokB", 360, -55, seed=6)            # token expired before these sightings
    assert encounters.process() == 0


def test_short_close_session_needs_three_minutes_near(db, pair, use_bundle):
    from app import encounters
    ev, a, b = pair
    sightings(db, a, "tokB", 120, -55, seed=7)            # close but only 2 minutes
    assert encounters.process() == 0


def test_report_and_labeled_csv(tmp_path):
    from app import encounters
    f = tmp_path / "rec1.csv"
    lines = ["session_id,label,observer,observed,ts,rssi"]
    for sid, label, mean in (("s1", "talking", -55), ("s2", "same_table_laptops", -58), ("s3", "walking_past", -70)):
        for i in range(200):
            lines.append(f"{sid},{label},a,b,{1000 + i},{mean + (i % 5) - 2}")
    f.write_text("\n".join(lines))
    sess = encounters.load_labeled(tmp_path)
    assert sorted(s["cls"] for s in sess) == ["conversation", "same_table_not_talking", "walk_past"]
    assert sum(s["label"] for s in sess) == 1 and sess[0]["t"][0] == 0
    rep = encounters.train_model(["duration_s", "rssi_median", "frac_near", "scan_rate"], n_synthetic=300,
                                 labeled_dir=tmp_path)["report"]
    assert rep["data"] == "real + simulated sessions" and rep["n_real"] == 3 and rep["real_weight"] == 3.0
    assert "same_table_not_talking_false_positive_rate" in rep
