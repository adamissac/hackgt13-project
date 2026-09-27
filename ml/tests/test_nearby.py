from types import SimpleNamespace
from app.routers import events
from app import matching


def test_nearby_filters_before_limit_and_keeps_connections(monkeypatch):
    monkeypatch.setattr(events.db, "fetchone", lambda *_: {"ok": True})
    people = {str(i): {"name": str(i), "open_to_meet": True} for i in range(30)}
    people["hidden"] = {"open_to_meet": False}
    people["blocked"] = {"open_to_meet": True}
    monkeypatch.setattr(events, "_event_or_404", lambda _: None)
    monkeypatch.setattr(matching, "is_checked_in", lambda *_: True)
    monkeypatch.setattr(events.db, "fetchall", lambda *_: [dict(p, id=uid) for uid, p in people.items() if p["open_to_meet"] and uid != "0"])
    def exclusions(viewer, include_connections=True):
        assert include_connections is False
        return {"blocked"}
    monkeypatch.setattr(matching, "excluded_ids", exclusions)
    def bands(viewer, candidates):
        assert "hidden" not in candidates and "blocked" not in candidates and "0" not in candidates
        assert "29" in candidates
        return {"29": "near", "28": "far"}
    monkeypatch.setattr(matching, "proximity_bands", bands)
    response = events.nearby(1, 1, SimpleNamespace(id="0"))
    assert [r["user_id"] for r in response["matches"]] == ["29"]


def test_nearby_requires_live_viewer_opt_in(monkeypatch):
    import pytest
    from app.errors import ApiError
    monkeypatch.setattr(events, "_event_or_404", lambda _: None)
    monkeypatch.setattr(matching, "is_checked_in", lambda *_: True)
    monkeypatch.setattr(events.db, "fetchone", lambda *_: None)
    with pytest.raises(ApiError) as error:
        events.nearby(1, 100, SimpleNamespace(id="viewer"))
    assert error.value.status == 403


def test_live_nearby_connected_unconnected_and_withdrawal(dbclient, db):
    from conftest import add_event, auth, seed_person
    event = add_event(db)
    me = seed_person(db, 'Me', [], event_id=event)
    friend = seed_person(db, 'Friend', [], event_id=event)
    new = seed_person(db, 'New attendee', [], event_id=event)
    db.execute('update profiles set open_to_meet = true where id = any(%s::uuid[])', ([me, friend, new],))
    a, b = sorted([me, friend])
    db.execute('insert into connections(user_a,user_b) values (%s,%s)', (a,b))
    for uid, token in [(friend, 'GPSNEAR1'), (new, 'GPSNEAR2')]:
        db.execute("insert into ephemeral_ids(token,user_id,valid_from,valid_to) values (%s,%s,now()-interval '1 minute',now()+interval '1 minute')", (token,uid))
        db.execute('insert into sightings(observer_id,observed_token,rssi,ts) values (%s,%s,-55,now())', (me,token))
    def visible():
        response = dbclient.get(f'/events/{event}/nearby', headers=auth(me))
        assert response.status_code == 200
        return {p['user_id'] for p in response.json()['matches']}
    assert visible() == {friend,new}
    dbclient.patch('/me/open-to-meet', headers=auth(friend), json={'open':False})
    assert visible() == {new}
    db.execute('insert into blocks(blocker_id,blocked_id) values (%s,%s)', (new,me))
    assert visible() == set()
    dbclient.patch('/me/open-to-meet', headers=auth(me), json={'open':False})
    assert dbclient.get(f'/events/{event}/nearby', headers=auth(me)).status_code == 403
