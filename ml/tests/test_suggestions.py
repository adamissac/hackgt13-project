"""AL5: Open to Meet, suggestion generation limits, silent consent, chat on mutual yes."""
import datetime as dt

import pytest

from conftest import add_event, auth, seed_person


def open_person(db, name, interests, event_id, **kw):
    uid = seed_person(db, name, interests, event_id=event_id, **kw)
    db.execute("update profiles set open_to_meet = true where id = %s", (uid,))
    return uid


@pytest.fixture
def room(db):
    ev = add_event(db)
    a = open_person(db, "Ana", [("reinforcement learning", "technical", 0.9), ("bouldering", "personal", 0.8)], ev)
    b = open_person(db, "Ben", [("reinforcement learning", "technical", 0.9), ("bouldering", "personal", 0.8)], ev)
    c = open_person(db, "Cy", [("pottery", "personal", 0.9)], ev)
    return ev, a, b, c


def gen():
    from app import population, suggestions
    population.invalidate()
    return suggestions.generate()


def suggestion_between(db, x, y):
    lo, hi = sorted([x, y])
    return db.fetchone("select * from suggestions where user_a = %s and user_b = %s", (lo, hi))


def test_toggle(dbclient, db):
    uid = seed_person(db, "T", [("chess", "personal", 0.5)])
    r = dbclient.patch("/me/open-to-meet", headers=auth(uid), json={"open": True})
    assert r.json() == {"open_to_meet": True}
    assert db.fetchone("select open_to_meet from profiles where id = %s", (uid,))["open_to_meet"] is True


def test_generates_best_pair_and_notifies(db, room):
    ev, a, b, c = room
    assert gen() == 1
    s = suggestion_between(db, a, b)
    assert s and s["context"] == "event" and s["event_id"] == ev and s["status"] == "pending"
    assert {t["name"] for t in s["shared_topics"]} == {"reinforcement learning", "bouldering"}
    kinds = db.fetchall("select user_id::text as u, kind from notifications order by user_id")
    assert sorted(k["u"] for k in kinds) == sorted([a, b]) and {k["kind"] for k in kinds} == {"suggestion"}
    assert gen() == 0                         # 7-day repeat ban


def test_toggle_off_or_block_prevents_suggestions(db, room):
    ev, a, b, c = room
    db.execute("update profiles set open_to_meet = false where id = %s", (b,))
    assert suggestion_between(db, a, b) is None and gen() in (0, 1) and suggestion_between(db, a, b) is None
    db.execute("delete from suggestions")
    db.execute("update profiles set open_to_meet = true where id = %s", (b,))
    db.execute("insert into blocks values (%s, %s)", (b, a))
    gen()
    assert suggestion_between(db, a, b) is None


def test_daily_cap_and_one_per_tick(db):
    from app import suggestions
    ev = add_event(db)
    me = open_person(db, "Me", [("robotics", "technical", 0.9)], ev)
    others = [open_person(db, f"P{i}", [("robotics", "technical", 0.9)], ev) for i in range(6)]
    for _ in range(6):
        gen()
    rows = db.fetchall("select * from suggestions where user_a = %s or user_b = %s", (me, me))
    assert len(rows) <= suggestions.MAX_PER_DAY


def test_pair_must_clear_both_percentiles():
    from app import suggestions
    import numpy as np
    from app.population import Index
    # plan_room is pure: craft three people where only (a, b) clears both 80th percentiles
    v = lambda i: np.eye(384, dtype=np.float32)[i]
    def person(pid, vec):
        return {"id": pid, "interests": {}, "vec": {"technical": vec, "career": np.zeros(384, np.float32),
                "personal": np.zeros(384, np.float32), "academic": np.zeros(384, np.float32)},
                "combined": vec, "seek_vec": np.zeros(384, np.float32), "offer_vec": np.zeros(384, np.float32)}
    people = {"a": person("a", v(0)), "b": person("b", v(0)), "c": person("c", v(1))}
    plan = suggestions.plan_room(people, Index({}, {}, {}, {}), None, set(), {})
    assert [(x[0], x[1]) for x in plan] == [("a", "b")]


def test_synthetic_attendees_never_pair_together_or_block_a_real_person():
    from app import suggestions
    import numpy as np
    from app.population import Index
    v = lambda i: np.eye(384, dtype=np.float32)[i]
    def person(pid, vec):
        return {"id": pid, "interests": {}, "vec": {"technical": vec, "career": np.zeros(384, np.float32),
                "personal": np.zeros(384, np.float32), "academic": np.zeros(384, np.float32)},
                "combined": vec, "seek_vec": np.zeros(384, np.float32), "offer_vec": np.zeros(384, np.float32)}
    # s1, s2 are near-identical synthetic twins; "me" (real) is only somewhat like them.
    people = {"me": person("me", (v(0) + v(1)) / np.sqrt(2)), "s1": person("s1", v(0)), "s2": person("s2", v(0))}
    today = {"s1": 3, "s2": 3}                       # synthetic daily caps are ignored for real people
    plan = suggestions.plan_room(people, Index({}, {}, {}, {}), None, set(), today, synthetic={"s1", "s2"})
    pairs = [tuple(sorted((x[0], x[1]))) for x in plan]
    assert ("s1", "s2") not in pairs                 # never synthetic + synthetic
    assert pairs and all("me" in p for p in pairs)   # me gets a suggestion although s1/s2 prefer each other


def test_list_and_silent_no(dbclient, db, room):
    ev, a, b, c = room
    gen()
    sid = suggestion_between(db, a, b)["id"]
    listed = dbclient.get("/suggestions", headers=auth(a)).json()["suggestions"]
    assert [s["suggestion_id"] for s in listed] == [sid] and listed[0]["other"]["user_id"] == b
    assert set(listed[0]) == {"suggestion_id", "context", "event_id", "building_id", "expires_at", "other", "score",
                              "shared_topics"}
    # B says no first. A's yes must look exactly like "B hasn't answered yet".
    no = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(b), json={"response": "no"})
    assert no.json() == {"status": "waiting"}
    r = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(a), json={"response": "yes"})
    assert r.status_code == 200 and r.json() == {"status": "waiting"}
    assert db.fetchone("select count(*) as n from chats")["n"] == 0
    assert db.fetchone("select count(*) as n from notifications where user_id = %s", (a,))["n"] == 1  # only the original
    # and B still appears in A's quick profile + matches (their "no" leaks nowhere)
    assert dbclient.get(f"/matches/{b}/quick-profile", headers=auth(a)).status_code == 200
    assert b in {m["user_id"] for m in dbclient.get(f"/events/{ev}/matches", headers=auth(a)).json()["matches"]}


def test_pending_other_gives_identical_response(dbclient, db, room):
    ev, a, b, c = room
    gen()
    sid = suggestion_between(db, a, b)["id"]
    r = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(a), json={"response": "yes"})
    assert r.json() == {"status": "waiting"}
    assert dbclient.get("/suggestions", headers=auth(a)).json()["suggestions"] == []   # answered: gone for A
    assert len(dbclient.get("/suggestions", headers=auth(b)).json()["suggestions"]) == 1


def test_mutual_yes_opens_chat(dbclient, db, room):
    ev, a, b, c = room
    gen()
    sid = suggestion_between(db, a, b)["id"]
    dbclient.post(f"/suggestions/{sid}/respond", headers=auth(a), json={"response": "yes"})
    r = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(b), json={"response": "yes"}).json()
    assert r["status"] == "matched" and isinstance(r["chat_id"], int)
    chat = db.fetchone("select user_a::text as a, user_b::text as b, origin from chats where id = %s", (r["chat_id"],))
    assert chat["a"] < chat["b"] and {chat["a"], chat["b"]} == {a, b} and chat["origin"] == "suggestion"
    assert db.fetchone("select status from suggestions where id = %s", (sid,))["status"] == "matched"
    matched = db.fetchall("select user_id::text as u from notifications where payload->>'status' = 'matched'")
    assert sorted(m["u"] for m in matched) == sorted([a, b])
    again = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(a), json={"response": "no"}).json()
    assert again == r                          # a match can't be undone by a later tap


def test_outsider_and_expired(dbclient, db, room):
    ev, a, b, c = room
    gen()
    sid = suggestion_between(db, a, b)["id"]
    r = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(c), json={"response": "yes"})
    assert r.status_code == 404 and r.json() == {"error": "suggestion not found"}
    db.execute("update suggestions set expires_at = now() - interval '1 minute' where id = %s", (sid,))
    from app import suggestions
    assert suggestions.expire() == 1
    dbclient.post(f"/suggestions/{sid}/respond", headers=auth(a), json={"response": "yes"})
    r = dbclient.post(f"/suggestions/{sid}/respond", headers=auth(b), json={"response": "yes"})
    assert r.json() == {"status": "waiting"}


def test_public_building_suggestion(db):
    for name in ("Ana", "Ben"):
        uid = open_person(db, name, [("robotics", "technical", 0.9)], None)
        db.execute("insert into presence (user_id, building_id, open_to_meet, expires_at) "
                   "values (%s, 'student_center', true, now() + interval '45 minutes')", (uid,))
    assert gen() == 1
    s = db.fetchone("select context, building_id, event_id from suggestions")
    assert s == {"context": "public", "building_id": "student_center", "event_id": None}


def test_quiet_hours(monkeypatch):
    from app.suggestions import quiet_now
    monkeypatch.setenv("QUIET_HOURS", "23-8")
    assert quiet_now(dt.datetime(2026, 9, 26, 2)) and quiet_now(dt.datetime(2026, 9, 26, 23))
    assert not quiet_now(dt.datetime(2026, 9, 26, 12))
    monkeypatch.setenv("QUIET_HOURS", "")
    assert not quiet_now(dt.datetime(2026, 9, 26, 2))


def test_synthetic_reply_backs_off_after_model_failure(monkeypatch):
    """A failing model call is retried after a pause, not every 5-second tick."""
    from app import synthetic
    calls = {"n": 0}
    monkeypatch.setattr(synthetic.db, "fetchall", lambda sql, params=None: (
        [{"id": 1, "syn": "s"}] if "from chats" in sql else [{"sender": "real", "body": "hi", "created_at": 0}]))
    monkeypatch.setattr(synthetic.db, "fetchone", lambda sql, params=None: {"s": 99})
    monkeypatch.setattr(synthetic, "_persona", lambda uid: {})

    def boom(persona, history):
        calls["n"] += 1
        raise RuntimeError("model down")
    monkeypatch.setattr(synthetic, "_reply_text", boom)
    synthetic._retry_at.clear()
    assert synthetic.reply_to_chats() == 0 and synthetic.reply_to_chats() == 0
    assert calls["n"] == 1


# ---------------------------------------------------------------- demo attendees: meet now, fake location
@pytest.fixture
def demo_pair(db):
    ev = add_event(db)
    me = open_person(db, "Ana", [("reinforcement learning", "technical", 0.9)], ev)
    syn = seed_person(db, "Amara", [("reinforcement learning", "technical", 0.9)], event_id=ev)
    db.execute("update profiles set is_synthetic = true, open_to_meet = false where id = %s", (syn,))
    return ev, me, syn


def test_demo_meet_request_only_with_demo_attendees(dbclient, db, demo_pair, monkeypatch):
    from app import synthetic
    ev, me, syn = demo_pair
    real = open_person(db, "Ben", [("reinforcement learning", "technical", 0.9)], ev)
    assert dbclient.post("/suggestions/demo", headers=auth(me), json={"user_id": real}).status_code == 403
    assert dbclient.post("/suggestions/demo", headers=auth(syn), json={"user_id": me}).status_code == 403

    monkeypatch.setattr(synthetic, "shy", lambda s: False)
    r = dbclient.post("/suggestions/demo", headers=auth(me), json={"user_id": syn}).json()
    assert r["status"] == "waiting"
    s = suggestion_between(db, me, syn)
    assert s["id"] == r["suggestion_id"] and s["building_id"] == synthetic.DEMO_MARK and s["context"] == "event"
    assert "yes" in (s["a_response"], s["b_response"]) and s["shared_topics"][0]["name"] == "reinforcement learning"
    # asking again reuses the same request
    assert dbclient.post("/suggestions/demo", headers=auth(me), json={"user_id": syn}).json()["suggestion_id"] == s["id"]

    monkeypatch.setattr(synthetic, "answer_after_s", lambda sid: 10_000)
    synthetic.accept_pending_suggestions()
    assert suggestion_between(db, me, syn)["status"] == "pending"          # answers after a short pause
    monkeypatch.setattr(synthetic, "answer_after_s", lambda sid: 0)
    synthetic.accept_pending_suggestions()
    assert suggestion_between(db, me, syn)["status"] == "matched"
    assert db.fetchone("select open_to_meet from profiles where id = %s", (syn,))["open_to_meet"] is True

    # location: once I share, they share a made-up point near me
    here = {"lat": 33.7774, "lng": -84.3973}
    assert dbclient.post(f"/location-shares/{s['id']}", headers=auth(me), json=here).status_code == 200
    assert synthetic.share_locations() == 1
    theirs = dbclient.get(f"/location-shares/{s['id']}", headers=auth(me)).json()["their_location"]
    d_m = ((theirs["lat"] - here["lat"]) ** 2 + (theirs["lng"] - here["lng"]) ** 2) ** 0.5 * 111_000
    assert 5 < d_m < 200


def test_shy_demo_attendee_never_answers(dbclient, db, demo_pair, monkeypatch):
    from app import synthetic
    ev, me, syn = demo_pair
    monkeypatch.setattr(synthetic, "shy", lambda s: True)
    monkeypatch.setattr(synthetic, "answer_after_s", lambda sid: 0)
    assert dbclient.post("/suggestions/demo", headers=auth(me), json={"user_id": syn}).json()["status"] == "waiting"
    synthetic.accept_pending_suggestions()
    s = suggestion_between(db, me, syn)
    assert s["status"] == "pending" and "no" not in (s["a_response"], s["b_response"])   # a no is never shown


def test_fake_location_walks_toward_you():
    from app import synthetic
    far = synthetic.approach_point(33.7774, -84.3973, "syn-1", 0)
    near = synthetic.approach_point(33.7774, -84.3973, "syn-1", 600)
    dist = lambda p: ((p[0] - 33.7774) ** 2 + (p[1] + 84.3973) ** 2) ** 0.5 * 111_000  # noqa: E731
    assert 120 < dist(far) < 180 and dist(near) < 20
