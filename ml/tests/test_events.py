

def test_leave_event_goes_back_to_roaming(dbclient, db):
    from conftest import add_event, auth, seed_person
    ev = add_event(db)
    me = seed_person(db, "Ana", [("robotics", "technical", 0.9)], event_id=ev)
    other = seed_person(db, "Ben", [("robotics", "technical", 0.9)], event_id=ev)
    assert dbclient.get(f"/events/{ev}/matches", headers=auth(me)).status_code == 200
    assert dbclient.post(f"/events/{ev}/leave", headers=auth(me)).json() == {"ok": True}
    assert dbclient.get(f"/events/{ev}/matches", headers=auth(me)).status_code == 403
    ids = [m["user_id"] for m in dbclient.get(f"/events/{ev}/matches", headers=auth(other)).json()["matches"]]
    assert me not in ids
    assert dbclient.post("/events/999999/leave", headers=auth(me)).status_code == 404
