"""AL3: per-event IDF, V1 scores, shared topics, highlight, candidate pool, impressions."""
import numpy as np
import pytest

from conftest import add_event, add_user, auth, seed_person


@pytest.fixture
def event(db):
    return add_event(db)


def matches(client, uid, event_id, **params):
    r = client.get(f"/events/{event_id}/matches", headers=auth(uid), params=params)
    return r


def test_must_be_checked_in(dbclient, db, event):
    uid = seed_person(db, "Viewer", [("robotics", "technical", 0.9)])
    r = matches(dbclient, uid, event)
    assert r.status_code == 403 and r.json() == {"error": "check in to this event first"}
    assert dbclient.post(f"/events/{event}/checkin", headers=auth(uid)).json() == {"ok": True}
    assert matches(dbclient, uid, event).status_code == 200
    assert dbclient.get("/events/999/matches", headers=auth(uid)).status_code == 404


def test_shape_order_and_self_exclusion(dbclient, db, event):
    me = seed_person(db, "Me", [("robotics", "technical", 0.9), ("rock climbing", "personal", 0.7)], event_id=event)
    a = seed_person(db, "Close", [("robotics", "technical", 0.9), ("rock climbing", "personal", 0.8)], event_id=event)
    b = seed_person(db, "Far", [("pottery", "personal", 0.9)], event_id=event)
    body = matches(dbclient, me, event).json()
    assert body["event_id"] == event and body["model"] == "v1"
    ids = [m["user_id"] for m in body["matches"]]
    assert me not in ids and ids == [a, b]
    top = body["matches"][0]
    assert set(top) == {"user_id", "name", "photo_url", "role", "score", "rank", "highlight", "why", "proximity"}
    assert top["rank"] == 1 and top["name"] == "Close" and top["proximity"] is None
    assert set(top["why"]) == {"robotics", "rock climbing"}
    assert body["matches"][0]["score"] > body["matches"][1]["score"]


def test_score_symmetry(db, event):
    from app import matching, population
    a = seed_person(db, "A", [("robotics", "technical", 0.9), ("chess", "personal", 0.5)],
                    seeking="ML internship", offering="ROS projects", event_id=event)
    b = seed_person(db, "B", [("robotics", "technical", 0.6), ("genomics", "academic", 0.8)],
                    seeking="robotics interns", offering="hiring ML interns", role="recruiter", event_id=event)
    m = population.event_model(event)
    sab, fab = matching.pair_score(m.people[a], m.people[b], m.index)
    sba, fba = matching.pair_score(m.people[b], m.people[a], m.index)
    assert sab == pytest.approx(sba) and fab == pytest.approx(fba)


def test_rare_shared_interest_beats_common_one(dbclient, db, event):
    """IDF: sharing 'python' with everyone means little; a rare shared topic means a lot."""
    me = seed_person(db, "Me", [("python", "technical", 0.8), ("computational neuroscience", "academic", 0.8)],
                     event_id=event)
    common = seed_person(db, "Common", [("python", "technical", 0.8)], event_id=event)
    rare = seed_person(db, "Rare", [("computational neuroscience", "academic", 0.8)], event_id=event)
    for i in range(8):
        seed_person(db, f"Filler{i}", [("python", "technical", 0.8)], event_id=event)
    ids = [m["user_id"] for m in matches(dbclient, me, event).json()["matches"]]
    assert ids.index(rare) < ids.index(common)


def test_highlight_is_per_viewer_80th_percentile(dbclient, db, event):
    me = seed_person(db, "Me", [("robotics", "technical", 0.9), ("chess", "personal", 0.8)], event_id=event)
    for i in range(9):
        seed_person(db, f"P{i}", [("robotics", "technical", 0.1 * (i + 1))] + ([("chess", "personal", 0.8)] if i > 5 else []),
                    event_id=event)
    ms = matches(dbclient, me, event).json()["matches"]
    scores = np.array([m["score"] for m in ms])
    cutoff = np.percentile(scores, 80)
    assert [m["highlight"] for m in ms] == [bool(s >= cutoff - 1e-6) for s in scores]
    assert 1 <= sum(m["highlight"] for m in ms) <= 3


def test_candidate_pool_exclusions(dbclient, db, event):
    me = seed_person(db, "Me", [("robotics", "technical", 0.9)], event_id=event)
    ok = seed_person(db, "Ok", [("robotics", "technical", 0.9)], event_id=event)
    i_blocked = seed_person(db, "IBlocked", [("robotics", "technical", 0.9)], event_id=event)
    blocked_me = seed_person(db, "BlockedMe", [("robotics", "technical", 0.9)], event_id=event)
    connected = seed_person(db, "Connected", [("robotics", "technical", 0.9)], event_id=event)
    declined = seed_person(db, "Declined", [("robotics", "technical", 0.9)], event_id=event)
    not_here = seed_person(db, "NotCheckedIn", [("robotics", "technical", 0.9)])
    db.execute("insert into blocks values (%s, %s), (%s, %s)", (me, i_blocked, blocked_me, me))
    a, b = sorted([me, connected])
    db.execute("insert into connections (user_a, user_b) values (%s, %s)", (a, b))
    declined_me = seed_person(db, "DeclinedMe", [("robotics", "technical", 0.9)], event_id=event)
    for other, who_said_no in ((declined, me), (declined_me, declined_me)):
        a, b = sorted([me, other])
        col = "a_response" if who_said_no == a else "b_response"
        db.execute(f"insert into suggestions (user_a, user_b, context, event_id, {col}) values (%s, %s, 'event', %s, 'no')",
                   (a, b, event))
    ids = {m["user_id"] for m in matches(dbclient, me, event).json()["matches"]}
    assert ids == {ok, declined_me}      # my "no" hides them; their "no" must stay invisible to me
    assert not_here not in ids


def test_hidden_interests_do_not_match(dbclient, db, event):
    me = seed_person(db, "Me", [("chess", "personal", 0.9), ("robotics", "technical", 0.5)], event_id=event)
    other = seed_person(db, "Other", [("chess", "personal", 0.9)], event_id=event)
    assert matches(dbclient, me, event).json()["matches"][0]["why"] == ["chess"]
    chess_id = next(i["interest_id"] for i in dbclient.get("/profile/interests", headers=auth(me)).json()["interests"]
                    if i["name"] == "chess")
    dbclient.patch("/profile/interests", headers=auth(me), json={"hide": [chess_id]})
    assert matches(dbclient, me, event).json()["matches"][0]["why"] == []


def test_impressions_logged(dbclient, db, event):
    me = seed_person(db, "Me", [("robotics", "technical", 0.9)], event_id=event)
    others = [seed_person(db, f"P{i}", [("robotics", "technical", 0.5)], event_id=event) for i in range(3)]
    shown = matches(dbclient, me, event, limit=2).json()["matches"]
    rows = db.fetchall("select shown_id::text as id, rank, model from impressions where viewer_id = %s order by rank", (me,))
    assert [(r["id"], r["rank"], r["model"]) for r in rows] == [(m["user_id"], m["rank"], "v1") for m in shown]
    assert len(rows) == 2 and set(r["id"] for r in rows) <= set(others)


def test_complementarity_matches_recruiter_to_student(db, event):
    from app import matching, population
    student = seed_person(db, "S", [("pottery", "personal", 0.5)], seeking="machine learning internship",
                          event_id=event)
    recruiter = seed_person(db, "R", [("sailing", "personal", 0.5)], role="recruiter",
                            offering="hiring machine learning interns", event_id=event)
    unrelated = seed_person(db, "U", [("knitting", "personal", 0.5)], offering="knitting lessons", event_id=event)
    m = population.event_model(event)
    _, f_good = matching.pair_score(m.people[student], m.people[recruiter], m.index)
    _, f_bad = matching.pair_score(m.people[student], m.people[unrelated], m.index)
    assert f_good["complementarity"] > f_bad["complementarity"]
    assert f_good["role_pair"] == f_good["complementarity"] and f_bad["role_pair"] == 0


def test_global_vectors_and_retention_jobs(db, event):
    from app import tasks
    seed_person(db, "A", [("robotics", "technical", 0.9)], seeking="internship", summary={"technical": "Builds robots."})
    seed_person(db, "B", [("robotics", "technical", 0.9), ("chess", "personal", 0.5)])
    assert tasks.write_global_vectors() == 2
    facets = {r["facet"] for r in db.fetchall("select facet from profile_vectors")}
    assert {"technical", "combined", "seeking"} <= facets
    idf = {r["canonical_name"]: r["idf"] for r in db.fetchall("select canonical_name, idf from interests")}
    assert idf["chess"] > idf["robotics"]
    u = add_user(db)
    db.execute("insert into sightings (observer_id, observed_token, rssi, ts) values "
               "(%s, 'old', -60, now() - interval '25 hours'), (%s, 'new', -60, now())", (u, u))
    assert tasks.run_retention()["sightings"] == 1


def test_proximity_bands_from_recent_sightings(dbclient, db, event):
    me = seed_person(db, "Me", [("robotics", "technical", 0.9)], event_id=event)
    close = seed_person(db, "Close", [("robotics", "technical", 0.9)], event_id=event)
    mid = seed_person(db, "Mid", [("robotics", "technical", 0.8)], event_id=event)
    far = seed_person(db, "Far", [("robotics", "technical", 0.7)], event_id=event)
    old = seed_person(db, "Old", [("robotics", "technical", 0.6)], event_id=event)
    for uid, tok in ((me, "tme"), (close, "tc"), (mid, "tm"), (far, "tf"), (old, "to")):
        db.execute("insert into ephemeral_ids (token, user_id, valid_from, valid_to) values "
                   "(%s, %s, now() - interval '1 hour', now() + interval '1 hour')", (tok, uid))
    rows = [(me, "tc", -52, 5), (me, "tc", -55, 10), (mid, "tme", -68, 5),      # mid heard ME: either direction counts
            (me, "tf", -84, 5), (me, "to", -50, 600)]                           # 'old' only 10 minutes ago
    for obs, tok, rssi, ago in rows:
        db.execute("insert into sightings (observer_id, observed_token, rssi, ts) "
                   "values (%s, %s, %s, now() - make_interval(secs => %s))", (obs, tok, rssi, ago))
    got = {m["user_id"]: m["proximity"] for m in matches(dbclient, me, event).json()["matches"]}
    assert got == {close: "immediate", mid: "near", far: "far", old: None}
