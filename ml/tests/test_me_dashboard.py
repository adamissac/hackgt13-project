"""AR7: GET /me/dashboard is private and counts only the caller's own connections."""
from conftest import auth, seed_person


def connect(db, a, b, how="in_person", days_ago=0, talked=None):
    lo, hi = sorted([a, b])
    db.execute("insert into connections (user_a, user_b, how_met, created_at) "
               "values (%s, %s, %s, now() - make_interval(days => %s))", (lo, hi, how, days_ago))
    if talked:
        cid = db.fetchone("insert into conversations (user_a, user_b, method) values (%s, %s, 'qr') returning id",
                          (lo, hi))["id"]
        ids = [r["id"] for r in db.fetchall("select id from interests where canonical_name = any(%s)", (talked,))]
        db.execute("insert into feedback (conversation_id, rater_id, talked_about, wants_connect) "
                   "values (%s, %s, %s, true)", (cid, a, ids))


def test_requires_auth(client):
    assert client.get("/me/dashboard").status_code == 401


def test_dashboard_counts_only_my_connections(db, dbclient):
    me = seed_person(db, "Maya Rao", [("reinforcement learning", "technical", 0.9), ("rock climbing", "personal", 0.7)])
    a = seed_person(db, "Sam Lee", [("reinforcement learning", "technical", 0.8)])
    b = seed_person(db, "Ivy Chen", [("rock climbing", "personal", 0.9), ("reinforcement learning", "technical", 0.5)])
    c = seed_person(db, "Zed Park", [("pottery", "personal", 0.9)])
    x = seed_person(db, "Other One", [("reinforcement learning", "technical", 0.9)])
    y = seed_person(db, "Other Two", [("reinforcement learning", "technical", 0.9)])
    connect(db, me, a, days_ago=5, talked=["reinforcement learning"])
    connect(db, me, b, days_ago=1)
    connect(db, me, c, how="invite", days_ago=0)
    connect(db, x, y)             # someone else's connection: must not appear anywhere
    connect(db, a, x)

    r = dbclient.get("/me/dashboard", headers=auth(me), params={"days": 7})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total"] == 3
    assert d["how_met"] == {"in_person": 2, "invite": 1}
    assert len(d["growth"]) == 7 and d["growth"][-1]["total"] == 3
    assert [g["total"] for g in d["growth"]] == sorted(g["total"] for g in d["growth"])   # cumulative
    top = {t["name"]: t for t in d["top_topics"]}
    assert top["reinforcement learning"]["connections"] == 2 and top["reinforcement learning"]["talked"] == 1
    assert top["rock climbing"]["connections"] == 1
    assert "pottery" not in top            # a connection's interest I don't share

    # Sam sees only Sam's own: me + x (2), not my 3
    assert dbclient.get("/me/dashboard", headers=auth(a)).json()["total"] == 2


def test_empty_dashboard(db, dbclient):
    me = seed_person(db, "New Person", [("chess", "personal", 0.5)])
    d = dbclient.get("/me/dashboard", headers=auth(me)).json()
    assert d["total"] == 0 and d["top_topics"] == [] and d["growth"][-1]["total"] == 0
