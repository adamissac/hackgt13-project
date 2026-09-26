"""AL7: graph JSON shape, scope, and the no connection-to-connection edge rule."""
import json
from pathlib import Path

import pytest

from conftest import add_event, auth, seed_person

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def world(db):
    ev = add_event(db)
    me = seed_person(db, "Maya Rao", [("reinforcement learning", "technical", 0.9), ("rock climbing", "personal", 0.7),
                                       ("genomics", "academic", 0.6)], event_id=ev)
    sam = seed_person(db, "Sam Lee", [("reinforcement learning", "technical", 0.8), ("rock climbing", "personal", 0.6)],
                      event_id=ev)
    ivy = seed_person(db, "Ivy Chen", [("genomics", "academic", 0.9)], event_id=ev)
    zed = seed_person(db, "Zed Park", [("genomics", "academic", 0.8), ("pottery", "personal", 0.9)], event_id=ev)
    outsider = seed_person(db, "Out Sider", [("reinforcement learning", "technical", 0.9)])      # not at the event
    return ev, me, sam, ivy, zed, outsider


def g(client, uid, **params):
    r = client.get("/graph", headers=auth(uid), params=params)
    assert r.status_code == 200, r.text
    return r.json()


def person_ids(graph):
    return {n["id"][2:] for n in graph["nodes"] if n["type"] == "person"}


def test_matches_mode_shape(dbclient, world):
    ev, me, sam, ivy, zed, outsider = world
    out = g(dbclient, me, mode="matches", event_id=ev)
    assert out["nodes"][0] == {"id": "me", "type": "self", "label": "You"}
    assert person_ids(out) == {sam, ivy, zed} and outsider not in person_ids(out)
    sam_node = next(n for n in out["nodes"] if n["id"] == f"u_{sam}")
    assert {"id", "type", "label", "score", "highlight", "open_to_meet", "cluster", "connected", "connected_at",
            "top_topic"} <= set(sam_node)
    assert sam_node["label"] == "Sam" and sam_node["top_topic"] == "reinforcement learning"
    topic = next(n for n in out["nodes"] if n["type"] == "topic")
    assert set(topic) == {"id", "type", "label", "facet"}
    kinds = {e["kind"] for e in out["edges"]}
    assert kinds == {"match", "has_topic"}
    assert all(set(e) <= {"source", "target", "kind", "weight", "facet"} for e in out["edges"])
    assert "pottery" not in json.dumps(out)                         # only SHARED topics appear


def test_no_person_to_person_edges_anywhere(dbclient, db, world):
    ev, me, sam, ivy, zed, outsider = world
    for other in (sam, ivy, zed):                                  # sam, ivy, zed are all my connections...
        lo, hi = sorted([me, other])
        db.execute("insert into connections (user_a, user_b) values (%s, %s)", (lo, hi))
    lo, hi = sorted([ivy, zed])                                    # ...and connected to each other
    db.execute("insert into connections (user_a, user_b) values (%s, %s)", (lo, hi))
    for params in ({"mode": "network"}, {"mode": "matches", "event_id": ev, "depth": 2}):
        out = g(dbclient, me, **params)
        for e in out["edges"]:
            assert not (e["source"].startswith("u_") and e["target"].startswith("u_")), e
    net = g(dbclient, me, mode="network")
    assert person_ids(net) == {sam, ivy, zed}
    assert all(n["connected"] and n["connected_at"] for n in net["nodes"] if n["type"] == "person")
    assert {e["kind"] for e in net["edges"] if e["source"] == "me" and e["target"].startswith("u_")} == {"connection"}
    # a connection's own network view never includes me->their other connections' links as mine
    assert me not in person_ids(g(dbclient, outsider, mode="network"))


def test_filters(dbclient, world):
    ev, me, sam, ivy, zed, outsider = world
    tech = g(dbclient, me, mode="matches", event_id=ev, facet="technical")
    assert person_ids(tech) == {sam}
    assert {n["facet"] for n in tech["nodes"] if n["type"] == "topic"} == {"technical"}
    assert len(person_ids(g(dbclient, me, mode="matches", event_id=ev, max_people=1))) == 1


def test_requires_checkin(dbclient, world):
    ev, me, sam, ivy, zed, outsider = world
    r = dbclient.get("/graph", headers=auth(outsider), params={"mode": "matches", "event_id": ev})
    assert r.status_code == 403
    r = dbclient.get("/graph", headers=auth(outsider), params={"mode": "matches"})
    assert r.status_code == 400


def test_expand_topic_only_allowed_people_ranked(dbclient, world):
    ev, me, sam, ivy, zed, outsider = world
    t = next(n["id"] for n in g(dbclient, me, mode="matches", event_id=ev)["nodes"] if n.get("label") == "genomics")
    out = dbclient.get("/graph/expand", headers=auth(me), params={"node_id": t, "event_id": ev}).json()
    assert person_ids(out) == {ivy, zed}                            # only allowed people (checked in, not blocked)
    scores = [n["score"] for n in out["nodes"] if n["type"] == "person"]
    assert scores == sorted(scores, reverse=True)
    assert all(e["target"] == t or e["source"] == "me" for e in out["edges"])


def test_expand_person_shows_shared_topics_with_evidence(dbclient, world):
    ev, me, sam, ivy, zed, outsider = world
    out = dbclient.get("/graph/expand", headers=auth(me), params={"node_id": f"u_{sam}", "event_id": ev}).json()
    topics = {n["label"]: n["evidence"] for n in out["nodes"] if n["type"] == "topic"}
    assert topics == {"reinforcement learning": "Sam Lee: reinforcement learning",
                      "rock climbing": "Sam Lee: rock climbing"}
    assert all(e["source"] == f"u_{sam}" for e in out["edges"])
    stranger = dbclient.get("/graph/expand", headers=auth(me), params={"node_id": f"u_{outsider}"}).json()
    assert stranger == {"nodes": [], "edges": []}
