"""AL4: quick profile access control and shape; grounded, cached starters."""
import uuid

import pytest

from conftest import add_event, auth, seed_person


@pytest.fixture
def pair(db):
    ev = add_event(db)
    me = seed_person(db, "Maya Rao", [("reinforcement learning", "technical", 0.9), ("rock climbing", "personal", 0.6),
                                       ("chess", "personal", 0.5)], seeking="quant internship",
                     offering="RL tutoring", event_id=ev)
    other = seed_person(db, "Sam Lee", [("reinforcement learning", "technical", 0.8), ("rock climbing", "personal", 0.7),
                                         ("secret hobby", "personal", 0.9)], seeking="RL collaborators",
                        offering="hiring quant interns", role="recruiter", event_id=ev)
    return ev, me, other


def test_quick_profile_for_match(dbclient, pair):
    ev, me, other = pair
    r = dbclient.get(f"/matches/{other}/quick-profile", headers=auth(me))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Sam Lee" and body["role"] == "recruiter" and body["connected"] is False
    names = [t["name"] for t in body["shared_topics"]]
    assert set(names) == {"reinforcement learning", "rock climbing"}      # only SHARED topics
    assert "secret hobby" not in str(body)
    t = body["shared_topics"][0]
    assert set(t) == {"interest_id", "name", "facet", "strength", "evidence"} and t["evidence"].startswith("Sam Lee:")
    assert set(body["facet_overlap"]) == {"technical", "career", "personal", "academic"}
    assert body["facet_overlap"]["technical"] > 0.5


def test_quick_profile_forbidden_for_strangers(dbclient, db, pair):
    ev, me, other = pair
    stranger = seed_person(db, "Stranger", [("reinforcement learning", "technical", 0.9)])   # not at the event
    for target in (stranger, str(uuid.uuid4()), "not-a-uuid", me):
        r = dbclient.get(f"/matches/{target}/quick-profile", headers=auth(me))
        assert r.status_code == 403 and r.json() == {"error": "this profile isn't available"}
    r = dbclient.get(f"/matches/{me}/quick-profile", headers=auth(stranger))
    assert r.status_code == 403


def test_blocked_person_is_forbidden(dbclient, db, pair):
    ev, me, other = pair
    db.execute("insert into blocks values (%s, %s)", (other, me))
    assert dbclient.get(f"/matches/{other}/quick-profile", headers=auth(me)).status_code == 403


def test_connection_visible_without_shared_event(dbclient, db):
    a = seed_person(db, "Ann", [("genomics", "academic", 0.9)])
    b = seed_person(db, "Ben", [("genomics", "academic", 0.7)])
    lo, hi = sorted([a, b])
    db.execute("insert into connections (user_a, user_b, how_met) values (%s, %s, 'invite')", (lo, hi))
    body = dbclient.get(f"/matches/{b}/quick-profile", headers=auth(a)).json()
    assert body["connected"] is True and body["shared_topics"][0]["name"] == "genomics"


def test_starters_template_fallback_without_llm(dbclient, pair, monkeypatch):
    from ml import generation
    ev, me, other = pair

    def boom(*a, **k):
        raise generation.GenerationError("no key")
    monkeypatch.setattr(generation, "_starters_once", boom)
    body = dbclient.get(f"/matches/{other}/starters", headers=auth(me)).json()
    assert set(body) == {"why", "openers"} and len(body["openers"]) == 2
    assert "Sam" in body["why"] and "reinforcement learning" in body["why"]


def test_starters_grounded_and_cached(dbclient, pair, monkeypatch):
    from ml import generation
    ev, me, other = pair
    prompts = []

    def fake(prompt):
        prompts.append(prompt)
        return generation.Starters(why="You both do RL.", openers=["Ask about reward design.", "Ask about climbing."])
    monkeypatch.setattr(generation, "_starters_once", fake)
    first = dbclient.get(f"/matches/{other}/starters", headers=auth(me)).json()
    second = dbclient.get(f"/matches/{other}/starters", headers=auth(me)).json()
    assert first == second == {"why": "You both do RL.", "openers": ["Ask about reward design.", "Ask about climbing."]}
    assert len(prompts) == 1                                   # cached per pair
    p = prompts[0]
    assert "reinforcement learning" in p and "hiring quant interns" in p and "VIEWER: Maya" in p
    assert "secret hobby" not in p and "chess" not in p        # nothing outside the shared view
    assert p.startswith("VIEWER: Maya\nOTHER: Sam\n")        # first names only


def test_starters_forbidden_for_strangers(dbclient, db, pair):
    ev, me, other = pair
    stranger = seed_person(db, "Stranger", [("reinforcement learning", "technical", 0.9)])
    assert dbclient.get(f"/matches/{stranger}/starters", headers=auth(me)).status_code == 403
