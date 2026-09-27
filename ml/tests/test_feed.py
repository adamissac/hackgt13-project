"""AL10: feed visibility, ranking, burst summaries, posts, reply suggestions, insights."""
import pytest

from conftest import auth, seed_person


def connect(db, a, b, talked=None):
    lo, hi = sorted([a, b])
    db.execute("insert into connections (user_a, user_b) values (%s, %s)", (lo, hi))
    if talked is not None:
        cid = db.fetchone("insert into conversations (user_a, user_b, method) values (%s, %s, 'qr') returning id",
                          (lo, hi))["id"]
        ids = [r["id"] for r in db.fetchall("select id from interests where canonical_name = any(%s)", (talked,))]
        db.execute("insert into feedback (conversation_id, rater_id, talked_about, wants_connect) values (%s, %s, %s, true)",
                   (cid, a, ids))


def item(db, author, body, kind="post", hours_ago=1, title=None):
    return db.fetchone("insert into feed_items (author_id, kind, title, body, created_at) "
                       "values (%s, %s, %s, %s, now() - make_interval(hours => %s)) returning id",
                       (author, kind, title, body, hours_ago))["id"]


@pytest.fixture
def people(db):
    me = seed_person(db, "Maya Rao", [("robotics", "technical", 0.9), ("control systems", "technical", 0.7)],
                     summary={"technical": "Builds robots with control systems."})
    friend = seed_person(db, "Sam Lee", [("robotics", "technical", 0.8)])
    other = seed_person(db, "Ivy Chen", [("pottery", "personal", 0.9)])
    stranger = seed_person(db, "Zed Park", [("robotics", "technical", 0.9)])
    connect(db, me, friend, talked=["robotics"])
    connect(db, me, other)
    return me, friend, other, stranger


def feed_of(client, uid, **params):
    r = client.get("/feed", headers=auth(uid), params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_visibility(dbclient, db, people):
    me, friend, other, stranger = people
    mine = item(db, me, "my own post")
    ok = item(db, friend, "friend post")
    hidden_kind = item(db, other, "pushed to repo", kind="github")
    never = item(db, stranger, "stranger post about robotics")
    db.execute("insert into feed_prefs (user_id, show_github) values (%s, false)", (other,))
    ids = {i["item_id"] for i in feed_of(dbclient, me)["items"]}
    assert ids == {mine, ok}
    assert never not in ids and hidden_kind not in ids
    assert {i["item_id"] for i in feed_of(dbclient, stranger)["items"]} == {never}


def test_ranking_relevance_recency_and_talked_topic(dbclient, db, people):
    me, friend, other, stranger = people
    relevant = item(db, other, "new robotics control systems demo", hours_ago=5)
    unrelated = item(db, other, "glazing techniques for pottery", hours_ago=5)
    talked = item(db, friend, "wrote up my robotics notes", hours_ago=30)
    old = item(db, other, "new robotics control systems demo", hours_ago=24 * 10)
    items = {i["item_id"]: i for i in feed_of(dbclient, me)["items"]}
    assert items[relevant]["score"] > items[unrelated]["score"]
    assert items[relevant]["score"] > items[old]["score"]
    assert items[talked]["talked_about"] == ["robotics"]
    assert set(items[relevant]) == {"type", "item_id", "author", "kind", "title", "body", "url", "created_at", "score",
                                    "talked_about", "details"}
    assert items[relevant]["details"] is None                  # briefs are for GitHub items only
    assert db.fetchone("select count(*) n from feed_items where embedding is null")["n"] == 0   # embedded on read


def test_burst_becomes_summary(dbclient, db, people, monkeypatch):
    from ml import generation
    me, friend, other, stranger = people
    ids = [item(db, friend, f"update {i}", hours_ago=i + 1) for i in range(3)]
    monkeypatch.setattr(generation, "feed_summary", lambda first, items: f"{first} shipped {len(items)} things.")
    entries = feed_of(dbclient, me)["items"]
    summaries = [e for e in entries if e["type"] == "summary"]
    assert len(summaries) == 1 and summaries[0]["summary"] == "Sam shipped 3 things."
    assert sorted(summaries[0]["item_ids"]) == sorted(ids)
    assert not any(e["type"] == "item" and e["item_id"] in ids for e in entries)
    # the summary carries its items (newest first) so the app can expand it
    assert [i["item_id"] for i in summaries[0]["items"]] == ids
    assert all(i["type"] == "item" and i["author"]["name"] == "Sam Lee" for i in summaries[0]["items"])


def test_pagination(dbclient, db, people):
    me, friend, other, stranger = people
    for i in range(5):
        item(db, other, f"post {i}", hours_ago=30 + i)
    p1 = feed_of(dbclient, me, limit=2)
    p2 = feed_of(dbclient, me, limit=2, cursor=p1["next_cursor"])
    p3 = feed_of(dbclient, me, limit=2, cursor=p2["next_cursor"])
    got = [i["item_id"] for p in (p1, p2, p3) for i in p["items"]]
    assert len(got) == 5 and len(set(got)) == 5 and p3["next_cursor"] is None


def test_post_and_reply_suggestion(dbclient, db, people, monkeypatch):
    from ml import generation
    me, friend, other, stranger = people
    r = dbclient.post("/feed/posts", headers=auth(friend), json={"kind": "update", "body": "Started a robotics internship"})
    assert r.status_code == 201 and r.json()["kind"] == "update"
    iid = r.json()["item_id"]
    assert db.fetchone("select embedding is not null as ok from feed_items where id = %s", (iid,))["ok"]
    monkeypatch.setattr(generation, "client", lambda: (_ for _ in ()).throw(RuntimeError("no key")))
    reply = dbclient.post(f"/feed/{iid}/reply-suggestion", headers=auth(me)).json()["reply"]
    assert "Sam" in reply and "robotics" in reply
    assert dbclient.post(f"/feed/{iid}/reply-suggestion", headers=auth(stranger)).status_code == 404
    bad = dbclient.post("/feed/posts", headers=auth(me), json={"kind": "github", "body": "x"})
    assert bad.status_code == 422


def test_insights(dbclient, db, people):
    me, friend, other, stranger = people
    item(db, friend, "robotics arm v2")
    item(db, friend, "more robotics", hours_ago=30)
    item(db, other, "pottery class", kind="update")
    item(db, me, "my robotics post")                       # my own items are not "my network"
    item(db, stranger, "robotics robotics")
    out = dbclient.get("/feed/insights", headers=auth(me)).json()
    assert out["trending_topics"][0] == {"name": "robotics", "count": 2}
    assert {"name": "pottery", "count": 1} in out["trending_topics"]
    assert len(out["activity"]) == 7 and sum(d["count"] for d in out["activity"]) == 3
    assert out["by_kind"] == {"github": 0, "post": 2, "update": 1}


BRIEF = {"summary": "Ivy started lob-alpha, a model that predicts short-term price moves from order book data.",
         "highlights": ["Walk-forward backtest that charges fees", "LSTM over order book imbalance features"],
         "ask": "How do you keep the backtest from seeing future data?", "stack": ["Python", "PyTorch"],
         "source": "ai", "pushed_at": "2026-09-26T12:00:00Z", "at": "2026-09-26T12:05:00Z", "thin": False}


def github_item(db, author, details, hours_ago=1):
    from psycopg.types.json import Jsonb
    return db.fetchone("insert into feed_items (author_id, kind, title, body, url, payload, created_at) "
                       "values (%s, 'github', 'started working on lob-alpha', '', 'https://github.com/ivy/lob-alpha', "
                       "%s, now() - make_interval(hours => %s)) returning id",
                       (author, Jsonb({"repo": "ivy/lob-alpha", "type": "new_repo", "details": details}), hours_ago))["id"]


def test_github_items_carry_their_brief(dbclient, db, people, monkeypatch):
    from ml import generation
    me, friend, other, stranger = people
    gid = github_item(db, other, BRIEF)
    items = {i["item_id"]: i for i in feed_of(dbclient, me)["items"]}
    assert items[gid]["details"] == {"summary": BRIEF["summary"], "highlights": BRIEF["highlights"],
                                     "ask": BRIEF["ask"], "stack": ["Python", "PyTorch"], "ai": True}
    # internal bookkeeping never leaves the server
    assert "pushed_at" not in str(items[gid]) and "thin" not in str(items[gid])
    # a stranger never sees it; the brief is part of the item and follows its visibility
    assert gid not in {i["item_id"] for i in feed_of(dbclient, stranger)["items"]}
    # no LLM: the suggested reply falls back to the brief's question
    monkeypatch.setattr(generation, "client", lambda: (_ for _ in ()).throw(RuntimeError("no key")))
    reply = dbclient.post(f"/feed/{gid}/reply-suggestion", headers=auth(me)).json()["reply"]
    assert reply == f"Nice one, Ivy. {BRIEF['ask']}"


def test_one_github_card_per_person(dbclient, db, people):
    from psycopg.types.json import Jsonb
    me, friend, other, stranger = people
    old_milestones = [github_item(db, other, None, hours_ago=h) for h in (2, 30, 50)]
    # no 'working on' brief yet: only the newest milestone shows
    ids = {i["item_id"] for i in feed_of(dbclient, me)["items"]}
    assert ids & set(old_milestones) == {old_milestones[0]}
    current = db.fetchone("insert into feed_items (author_id, kind, title, body, payload, created_at) values "
                          "(%s, 'github', 'working on lob-alpha and 1 more project', %s, %s, now() - interval '5 hours') "
                          "returning id", (other, BRIEF["summary"], Jsonb({"type": "current_work", "details": BRIEF})))["id"]
    post = item(db, other, "a plain post")
    ids = {i["item_id"] for i in feed_of(dbclient, me)["items"]}
    assert current in ids and post in ids and not ids & set(old_milestones)


def test_brief_text_counts_for_talked_topics(dbclient, db, people):
    me, friend, other, stranger = people
    gid = github_item(db, friend, {**BRIEF, "summary": "Sam started lob-alpha, a robotics control stack."})
    item_ = next(i for i in feed_of(dbclient, me)["items"] if i["item_id"] == gid)
    assert item_["talked_about"] == ["robotics"]          # the title alone never says "robotics"; the brief does
