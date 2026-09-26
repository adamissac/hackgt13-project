"""AR3: synthetic attendees from HackGT 12 winners, seeded through the real pipeline."""
import importlib.util
import os

from conftest import auth, seed_person

from ml.hackathon_population import make_population
from ml.hackathon_winners import WINNERS

_spec = importlib.util.spec_from_file_location(
    "seed_hackathon_attendees", os.path.join(os.path.dirname(__file__), "..", "scripts", "seed_hackathon_attendees.py"))
seeder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seeder)


def test_population_is_fictional_and_grounded_in_winners():
    people = make_population(n=80, seed=13)
    assert len(people) == 80
    assert len({p["name"] for p in people}) == 80                       # unique fictional names
    assert sum(p["team"] == "rl-crowd" for p in people) == 5           # demo crowd always present
    assert any(p["role"] == "recruiter" for p in people)
    winner_tech = {t for w in WINNERS for t in w["tech"]}
    assert sum(any(i["name"] in winner_tech for i in p["raw_interests"]) for p in people) > 60
    for p in people:
        assert all(i["facet"] in ("technical", "career", "personal", "academic") for i in p["raw_interests"])


def test_seed_checks_everyone_in_and_is_idempotent(db):
    ids, event_id = seeder.seed(db, n=30, seed_=13, log=lambda *_: None)
    assert len(set(ids)) == 30
    row = db.fetchone("select count(*) as n, count(*) filter (where p.is_synthetic) as synth "
                      "from attendance a join profiles p on p.id = a.user_id where a.event_id = %s", (event_id,))
    assert row["n"] == 30 and row["synth"] == 30
    assert db.fetchone("select count(distinct user_id) as n from user_interests")["n"] == 30
    before = db.fetchone("select count(*) as n from user_interests")["n"]
    seeder.seed(db, n=30, seed_=13, log=lambda *_: None)                 # re-run: no duplicates
    assert db.fetchone("select count(*) as n from profiles where is_synthetic")["n"] == 30
    assert db.fetchone("select count(*) as n from user_interests")["n"] == before


def test_a_real_user_gets_ranked_matches(db, dbclient):
    _, event_id = seeder.seed(db, n=40, seed_=13, log=lambda *_: None)
    me = seed_person(db, "Arjun Test", [("reinforcement learning", "technical", 0.95), ("time series analysis", "technical", 0.8),
                                        ("quantitative research", "career", 0.85), ("rock climbing", "personal", 0.6)],
                     event_id=event_id)
    r = dbclient.get(f"/events/{event_id}/matches?limit=10", headers=auth(me))
    assert r.status_code == 200, r.text
    matches = r.json()["matches"]
    assert len(matches) == 10
    top5_why = [w for m in matches[:5] for w in m["why"]]
    assert "reinforcement learning" in top5_why                          # the RL crowd rises to the top
    delete = seeder.delete_all
    delete(db, log=lambda *_: None)
    assert db.fetchone("select count(*) as n from profiles where is_synthetic")["n"] == 0
