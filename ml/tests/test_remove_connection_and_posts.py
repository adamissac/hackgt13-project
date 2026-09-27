"""Remove a connection (both sides, no signal), and edit / delete only your own posts. DB tests (CI)."""
from tests.conftest import add_user, auth


def _connect(db, a, b):
    lo, hi = sorted([a, b])
    db.execute("insert into connections (user_a, user_b) values (%s, %s)", (lo, hi))


def test_remove_connection_for_both_and_404_after(dbclient, db):
    ana, ben = add_user(db, name="Ana"), add_user(db, name="Ben")
    _connect(db, ana, ben)
    assert dbclient.delete(f"/connections/{ben}", headers=auth(ana)).status_code == 200
    assert db.fetchone("select count(*) as n from connections")["n"] == 0
    assert dbclient.delete(f"/connections/{ben}", headers=auth(ana)).status_code == 404
    assert dbclient.delete("/connections/not-a-uuid", headers=auth(ana)).status_code == 404
    # No signal to Ben: nothing was written to his notifications.
    assert db.fetchone("select count(*) as n from notifications where user_id = %s", (ben,))["n"] == 0


def test_edit_and_delete_only_your_own_posts(dbclient, db):
    ana, ben = add_user(db, name="Ana"), add_user(db, name="Ben")
    r = dbclient.post("/feed/posts", json={"kind": "post", "body": "first draft"}, headers=auth(ana))
    assert r.status_code == 201
    pid = r.json()["item_id"]
    mine = dbclient.get("/feed/posts/mine", headers=auth(ana)).json()["items"]
    assert [p["item_id"] for p in mine] == [pid]
    assert dbclient.patch(f"/feed/posts/{pid}", json={"body": "hacked"}, headers=auth(ben)).status_code == 404
    assert dbclient.delete(f"/feed/posts/{pid}", headers=auth(ben)).status_code == 404
    e = dbclient.patch(f"/feed/posts/{pid}", json={"body": "edited"}, headers=auth(ana))
    assert e.status_code == 200 and e.json()["body"] == "edited"
    assert dbclient.delete(f"/feed/posts/{pid}", headers=auth(ana)).status_code == 200
    assert dbclient.get("/feed/posts/mine", headers=auth(ana)).json()["items"] == []
