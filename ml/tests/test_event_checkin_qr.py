"""Company events: registering is not checking in. Only a registered person who scans the organizer's
join QR is checked in, and only checked-in people appear to each other (docs/api.md 45).

Run: cd ml && TEST_DATABASE_URL=... .venv/bin/python -m pytest tests/test_event_checkin_qr.py -q
"""
from app import qr
from tests.conftest import add_event, add_user, auth, seed_person


def _company_event(db, owner: str) -> int:
    org = db.fetchone("insert into organizations (name, owner_id) values ('Acme', %s) returning id", (owner,))["id"]
    db.execute("insert into org_members (org_id, user_id, role) values (%s, %s, 'admin')", (org, owner))
    return db.fetchone("insert into events (name, org_id) values ('Acme fair', %s) returning id", (org,))["id"]


def _card(client, uid, event_id):
    r = client.get("/events", headers=auth(uid))
    assert r.status_code == 200, r.text
    return next(e for e in r.json()["events"] if e["id"] == event_id)


def _scan(client, uid, event_id):
    t = qr.sign_event(event_id)
    return client.post("/events/join", json={"payload": t["payload"], "signature": t["signature"]}, headers=auth(uid))


def test_register_alone_does_not_check_in(dbclient, db):
    owner = add_user(db, name="Org Owner")
    eid = _company_event(db, owner)
    ana = seed_person(db, "Ana", [("robotics", "technical", 0.9)])
    assert dbclient.post(f"/events/{eid}/register", headers=auth(ana)).status_code == 200
    card = _card(dbclient, ana, eid)
    assert card["registered"] is True and card["checked_in"] is False
    r = dbclient.get(f"/events/{eid}/matches", headers=auth(ana))
    assert r.status_code == 403


def test_qr_needs_registration_first(dbclient, db):
    owner = add_user(db, name="Org Owner")
    eid = _company_event(db, owner)
    ana = seed_person(db, "Ana", [("robotics", "technical", 0.9)])
    r = _scan(dbclient, ana, eid)
    assert r.status_code == 403 and r.json()["error"] == "register for this event first"
    assert _card(dbclient, ana, eid)["checked_in"] is False


def test_plain_checkin_blocked_for_company_events(dbclient, db):
    owner = add_user(db, name="Org Owner")
    eid = _company_event(db, owner)
    ana = seed_person(db, "Ana", [("robotics", "technical", 0.9)])
    dbclient.post(f"/events/{eid}/register", headers=auth(ana))
    r = dbclient.post(f"/events/{eid}/checkin", headers=auth(ana))
    assert r.status_code == 403 and r.json()["error"] == "scan the event QR or enter the join code"
    # Events with no company (the HackGT demo event) keep open check-in.
    legacy = add_event(db)
    assert dbclient.post(f"/events/{legacy}/checkin", headers=auth(ana)).status_code == 200


def test_only_scanned_attendees_see_each_other(dbclient, db):
    owner = add_user(db, name="Org Owner")
    eid = _company_event(db, owner)
    ana = seed_person(db, "Ana", [("robotics", "technical", 0.9), ("computer vision", "technical", 0.8)])
    ben = seed_person(db, "Ben", [("robotics", "technical", 0.9), ("computer vision", "technical", 0.7)])
    cal = seed_person(db, "Cal", [("robotics", "technical", 0.9), ("computer vision", "technical", 0.9)])
    for u in (ana, ben, cal):
        assert dbclient.post(f"/events/{eid}/register", headers=auth(u)).status_code == 200
    for u in (ana, ben):  # Cal registered but never scanned the QR at the venue
        r = _scan(dbclient, u, eid)
        assert r.status_code == 200 and r.json()["event_id"] == eid
    assert _card(dbclient, ana, eid)["checked_in"] is True
    r = dbclient.get(f"/events/{eid}/matches", headers=auth(ana))
    assert r.status_code == 200, r.text
    shown = {m["user_id"] for m in r.json()["matches"]}
    assert ben in shown
    assert cal not in shown
    assert dbclient.get(f"/events/{eid}/matches", headers=auth(cal)).status_code == 403


def test_join_code_also_needs_registration(dbclient, db):
    from app import orgs
    owner = add_user(db, name="Org Owner")
    eid = _company_event(db, owner)
    db.execute("update events set join_code_hash = %s where id = %s", (orgs.hash_join_code("ABC-123"), eid))
    ana = seed_person(db, "Ana", [("robotics", "technical", 0.9)])
    r = dbclient.post("/events/enter", json={"code": "abc123"}, headers=auth(ana))
    assert r.status_code == 403 and r.json()["error"] == "register for this event first"
    assert _card(dbclient, ana, eid)["checked_in"] is False
    dbclient.post(f"/events/{eid}/register", headers=auth(ana))
    assert dbclient.post("/events/enter", json={"code": "ABC-123"}, headers=auth(ana)).status_code == 200
    assert _card(dbclient, ana, eid)["checked_in"] is True


def test_conversation_filed_under_event_only_if_both_checked_in(db):
    from app import matching
    owner = add_user(db, name="Org Owner")
    eid = _company_event(db, owner)
    ana = seed_person(db, "Ana", [("robotics", "technical", 0.9)])
    ben = seed_person(db, "Ben", [("robotics", "technical", 0.9)])
    db.execute("insert into attendance (event_id, user_id) values (%s, %s)", (eid, ana))
    assert matching.conversation_event(ana, ben, eid) is None       # Ben never scanned in
    db.execute("insert into attendance (event_id, user_id) values (%s, %s)", (eid, ben))
    assert matching.conversation_event(ana, ben, eid) == eid
