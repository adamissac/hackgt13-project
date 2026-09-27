"""AK7 meetup location sharing (MASTER_SPEC 7.6) on Postgres through the mounted app."""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import add_user, auth

HERE = {"lat": 33.7756, "lng": -84.3963}
THERE = {"lat": 33.7760, "lng": -84.3970}


@pytest.fixture
def meetup(db):
    a = add_user(db, "Ana Diaz", open_to_meet=True)
    b = add_user(db, "Ben Ong", open_to_meet=True)
    lo, hi = sorted((a, b))
    sid = db.fetchone("insert into suggestions (user_a, user_b, context, a_response, b_response, status) "
                      "values (%s, %s, 'public', 'yes', 'yes', 'matched') returning id", (lo, hi))["id"]
    return sid, a, b


def rows(db, sid):
    return db.fetchone("select count(*) as n from location_shares where suggestion_id = %s", (sid,))["n"]


def test_location_is_reciprocal_after_both_people_share(dbclient, db, meetup):
    sid, a, b = meetup
    r = dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    assert r.status_code == 200 and r.json()["sharing"] is True
    seen = dbclient.get(f"/location-shares/{sid}", headers=auth(b)).json()
    assert seen["other"] == {"user_id": a, "name": "Ana Diaz"}
    assert seen["their_location"] is None and seen["sharing"] is False
    dbclient.post(f"/location-shares/{sid}", headers=auth(b), json=HERE)
    seen = dbclient.get(f"/location-shares/{sid}", headers=auth(b)).json()
    assert seen["their_location"]["lat"] == HERE["lat"] and seen["sharing"] is True
    # Both shared, so it is reciprocal: A now sees B's point too
    assert dbclient.get(f"/location-shares/{sid}", headers=auth(a)).json()["their_location"]["lat"] == HERE["lat"]


def test_one_shared_30_minute_window(dbclient, db, meetup):
    sid, a, b = meetup
    exp_a = dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE).json()["expires_at"]
    exp_b = dbclient.post(f"/location-shares/{sid}", headers=auth(b), json=THERE).json()["expires_at"]
    assert exp_b == exp_a
    got = datetime.fromisoformat(exp_a.replace("Z", "+00:00")) - datetime.now(timezone.utc)
    assert timedelta(minutes=29) < got <= timedelta(minutes=30)
    # updates never extend the window
    assert dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=THERE).json()["expires_at"] == exp_a


def test_expired_window_ends_sharing_on_write(dbclient, db, meetup):
    sid, a, b = meetup
    dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    dbclient.post(f"/location-shares/{sid}", headers=auth(b), json=HERE)
    db.execute("update location_shares set expires_at = now() - interval '1 second' where suggestion_id = %s", (sid,))
    r = dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    assert r.status_code == 410 and r.json() == {"error": "sharing ended"}
    assert rows(db, sid) == 0


def test_only_matched_participants(dbclient, db, meetup):
    sid, a, b = meetup
    stranger = add_user(db, "Cy", open_to_meet=True)
    assert dbclient.post(f"/location-shares/{sid}", headers=auth(stranger), json=HERE).status_code == 404
    assert dbclient.get(f"/location-shares/{sid}", headers=auth(stranger)).status_code == 404
    db.execute("update suggestions set status = 'pending', b_response = 'pending' where id = %s", (sid,))
    assert dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE).status_code == 410
    assert rows(db, sid) == 0


def test_toggle_off_ends_and_blocks_sharing(dbclient, db, meetup):
    sid, a, b = meetup
    dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    assert dbclient.patch("/me/open-to-meet", headers=auth(b), json={"open": False}).status_code == 200
    assert rows(db, sid) == 0  # Alan's handler deletes
    # and A can't restart it, with no hint that it was B's toggle
    r = dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    assert r.status_code == 410 and r.json() == {"error": "sharing ended"}


def test_meeting_in_person_ends_sharing(dbclient, db, meetup):
    sid, a, b = meetup
    dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    tok = dbclient.get("/qr/verify-token", headers=auth(b)).json()
    assert dbclient.post("/qr/verify", headers=auth(a), json={"payload": tok["payload"],
                                                               "signature": tok["signature"]}).status_code == 200
    assert rows(db, sid) == 0
    assert dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE).status_code == 410
    assert dbclient.get("/location-shares", headers=auth(a)).json() == {"meetups": []}


def test_stop_ends_for_both(dbclient, db, meetup):
    sid, a, b = meetup
    dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE)
    dbclient.post(f"/location-shares/{sid}", headers=auth(b), json=THERE)
    assert dbclient.delete(f"/location-shares/{sid}", headers=auth(b)).json() == {"sharing": False}
    assert rows(db, sid) == 0


def test_old_match_cannot_start_sharing(dbclient, db, meetup):
    sid, a, _ = meetup
    db.execute("update suggestions set created_at = now() - interval '3 hours' where id = %s", (sid,))
    assert dbclient.post(f"/location-shares/{sid}", headers=auth(a), json=HERE).status_code == 410


def test_my_meetups_lists_live_matches(dbclient, db, meetup):
    sid, a, b = meetup
    got = dbclient.get("/location-shares", headers=auth(a)).json()["meetups"]
    assert got == [{"suggestion_id": sid, "other": {"user_id": b, "name": "Ben Ong", "photo_url": None}}]


def test_bad_coordinates(dbclient, db, meetup):
    sid, a, _ = meetup
    assert dbclient.post(f"/location-shares/{sid}", headers=auth(a), json={"lat": 91, "lng": 0}).status_code == 422
