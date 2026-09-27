"""The shared demo event the server creates at startup (app/demo_event.py): one org + one all-day event,
idempotent, join code works for registered people only. DB tests (TEST_DATABASE_URL); CI runs them."""
from tests.conftest import add_user, auth


def test_demo_event_is_created_once_and_all_day(db, monkeypatch):
    from app import demo_event
    monkeypatch.setenv("DEMO_EVENT", "1")
    eid = demo_event.ensure()
    assert demo_event.ensure() == eid                      # idempotent across restarts
    assert db.fetchone("select count(*) as n from events where name = 'Demo test event'")["n"] == 1
    ev = db.fetchone("select to_char(starts_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') as s, "
                     "to_char(ends_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') as e, org_id "
                     "from events where id = %s", (eid,))
    assert (ev["s"], ev["e"]) == ("2026-09-27 00:00", "2026-09-27 23:59")
    assert ev["org_id"] is not None


def test_demo_event_checkin_follows_the_rules(dbclient, db, monkeypatch):
    from app import demo_event
    monkeypatch.setenv("DEMO_EVENT", "1")
    eid = demo_event.ensure()
    ana = add_user(db, name="Ana")
    events = dbclient.get("/events", headers=auth(ana)).json()["events"]
    assert any(e["id"] == eid for e in events)             # every user sees the same event
    r = dbclient.post("/events/enter", json={"code": "demo927"}, headers=auth(ana))
    assert r.status_code == 403                            # must register in the app first
    assert dbclient.post(f"/events/{eid}/register", headers=auth(ana)).status_code == 200
    assert dbclient.post("/events/enter", json={"code": "DEMO-927"}, headers=auth(ana)).status_code == 200
