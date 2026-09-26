"""Tap to verify: both phones claim each other's live Bluetooth token at touching range."""
import pytest

from conftest import add_user, auth


@pytest.fixture(autouse=True)
def _reset():
    from app.routers import tap
    tap.reset()
    yield
    tap.reset()


@pytest.fixture
def pair(dbclient, db):
    a, b = add_user(db, "Ana Diaz"), add_user(db, "Ben Ong")
    ta = dbclient.post("/ble/tokens", headers=auth(a), json={}).json()["tokens"][0]["token"]
    tb = dbclient.post("/ble/tokens", headers=auth(b), json={}).json()["tokens"][0]["token"]
    return a, b, ta, tb


def claim(client, who, token, rssi=-38):
    return client.post("/tap/claim", headers=auth(who), json={"token": token, "rssi": rssi})


def test_both_claims_verify_one_conversation(dbclient, db, pair):
    a, b, ta, tb = pair
    assert claim(dbclient, a, tb).json() == {"status": "waiting"}
    rb = claim(dbclient, b, ta).json()
    assert rb["status"] == "verified" and rb["other"]["user_id"] == a
    ra = claim(dbclient, a, tb).json()          # A's next poll sees it too
    assert ra["status"] == "verified" and ra["conversation_id"] == rb["conversation_id"]
    row = db.fetchone("select method, count(*) over () as n from conversations")
    assert row == {"method": "ble", "n": 1}
    kinds = db.fetchall("select kind from notifications")
    assert [k["kind"] for k in kinds] == ["connect_prompt", "connect_prompt"]


def test_one_sided_claim_never_verifies(dbclient, db, pair):
    a, b, ta, tb = pair
    for _ in range(3):
        assert claim(dbclient, a, tb).json() == {"status": "waiting"}
    assert db.fetchone("select count(*) as n from conversations")["n"] == 0


def test_too_far_self_and_unknown(dbclient, db, pair):
    a, b, ta, tb = pair
    r = claim(dbclient, a, tb, rssi=-65)
    assert r.status_code == 400 and r.json() == {"error": "too_far"}
    assert claim(dbclient, a, ta).json() == {"error": "self_scan"}
    assert claim(dbclient, a, "zzzzzzzz").status_code == 404


def test_blocked_pair_cannot_tap(dbclient, db, pair):
    a, b, ta, tb = pair
    db.execute("insert into blocks (blocker_id, blocked_id) values (%s, %s)", (b, a))
    assert claim(dbclient, a, tb).status_code == 403


def test_claims_expire_after_window(dbclient, db, pair, monkeypatch):
    from app.routers import tap
    a, b, ta, tb = pair
    t = [1000.0]
    monkeypatch.setattr(tap.time, "monotonic", lambda: t[0])
    claim(dbclient, a, tb)
    t[0] += tap.TAP_WINDOW + 1
    assert claim(dbclient, b, ta).json() == {"status": "waiting"}


def test_tap_needs_auth(dbclient):
    assert dbclient.post("/tap/claim", json={"token": "abcdefgh", "rssi": -30}).status_code == 401
