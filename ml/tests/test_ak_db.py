"""AK2 + AK4 against real Postgres through the mounted app (PgBleStore, PgInviteStore).

Needs TEST_DATABASE_URL (see conftest.py); skips otherwise.
"""
from conftest import add_user, auth


# ---------------------------------------------------------------- invites (AK4)
def test_invite_accept_creates_connection_chat_notifications(dbclient, db):
    alice, bob = add_user(db, "Alice A."), add_user(db, "Bob B.")
    inv = dbclient.post("/invites", headers=auth(alice), json={"note": "hi"}).json()
    token = inv["url"].rsplit("/", 1)[1]
    row = db.fetchone("select token_hash, status from invites where id = %s", (inv["invite_id"],))
    assert row["status"] == "active" and token not in row["token_hash"]

    r = dbclient.get(f"/invites/resolve/{token}", headers=auth(bob))
    assert r.status_code == 200 and r.json()["sender"]["name"] == "Alice A."

    r = dbclient.post(f"/invites/{token}/respond", headers=auth(bob), json={"response": "accept"})
    assert r.json() == {"status": "connected", "connection": {"user_id": alice, "name": "Alice A."}}
    lo, hi = sorted((alice, bob))
    conn = db.fetchone("select how_met, invite_id from connections where user_a = %s and user_b = %s", (lo, hi))
    assert conn == {"how_met": "invite", "invite_id": inv["invite_id"]}
    assert db.fetchone("select count(*) as n from chats where user_a = %s and user_b = %s", (lo, hi))["n"] == 1
    kinds = db.fetchall("select user_id::text as u, kind from notifications order by user_id")
    assert sorted((k["u"], k["kind"]) for k in kinds) == sorted([(alice, "connected"), (bob, "connected")])
    assert db.fetchone("select status, used_by::text as u from invites where id = %s", (inv["invite_id"],)) == \
        {"status": "accepted", "u": bob}

    # single use
    carl = add_user(db, "Carl C.")
    r = dbclient.post(f"/invites/{token}/respond", headers=auth(carl), json={"response": "accept"})
    assert r.status_code == 410 and r.json() == {"error": "expired"}


def test_invite_decline_and_rate_limit_and_revoke(dbclient, db):
    alice, bob = add_user(db, "Alice A."), add_user(db, "Bob B.")
    inv = dbclient.post("/invites", headers=auth(alice), json={}).json()
    token = inv["url"].rsplit("/", 1)[1]
    assert dbclient.post(f"/invites/{token}/respond", headers=auth(bob), json={"response": "decline"}).json() == \
        {"status": "ok"}
    assert db.fetchone("select status from invites where id = %s", (inv["invite_id"],))["status"] == "active"
    assert db.fetchone("select count(*) as n from notifications")["n"] == 0

    assert dbclient.delete(f"/invites/{inv['invite_id']}", headers=auth(bob)).status_code == 404
    assert dbclient.delete(f"/invites/{inv['invite_id']}", headers=auth(alice)).json() == {"ok": True}
    assert dbclient.get(f"/invites/resolve/{token}", headers=auth(bob)).status_code == 410

    for _ in range(9):
        assert dbclient.post("/invites", headers=auth(alice), json={}).status_code == 201
    r = dbclient.post("/invites", headers=auth(alice), json={})
    assert r.status_code == 429 and r.json() == {"error": "rate_limited"}
    listed = dbclient.get("/invites", headers=auth(alice)).json()["invites"]
    assert len(listed) == 10 and "token_hash" not in str(listed)


def test_invites_require_auth(dbclient):
    assert dbclient.post("/invites", json={}).status_code == 401


# ---------------------------------------------------------------- bluetooth (AK2)
def test_ble_tokens_and_sightings_feed_al8(dbclient, db):
    alice, bob = add_user(db, "Alice A."), add_user(db, "Bob B.")
    toks = dbclient.post("/ble/tokens", headers=auth(alice), json={}).json()["tokens"]
    assert len(toks) == 144
    assert dbclient.post("/ble/tokens", headers=auth(alice), json={}).json()["tokens"] == toks  # idempotent
    assert db.fetchone("select count(*) as n from ephemeral_ids where user_id = %s", (alice,))["n"] == 144

    bob_tok = dbclient.post("/ble/tokens", headers=auth(bob), json={}).json()["tokens"][0]
    import datetime as dt
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    r = dbclient.post("/ble/sightings", headers=auth(alice), json={
        "event_id": None, "device_model": "iPhone 15", "foreground": True,
        "sightings": [{"token": bob_tok["token"], "rssi": -58, "ts": now, "zone_id": None},
                      {"token": toks[0]["token"], "rssi": -40, "ts": now, "zone_id": None},   # own token
                      {"token": "zzzzzzzz", "rssi": -60, "ts": now, "zone_id": None}]})       # unknown
    assert r.json() == {"accepted": 1, "dropped": 2}
    # AL8 resolves exactly this join
    row = db.fetchone("select s.observer_id::text as o, e.user_id::text as seen, s.rssi from sightings s "
                      "join ephemeral_ids e on e.token = s.observed_token")
    assert row == {"o": alice, "seen": bob, "rssi": -58}
