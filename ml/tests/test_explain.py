"""AL3 'why you matched' (MASTER_SPEC 6.9): the score decomposed into the features that made it.

Pure in-memory population, no database. The point of these tests is that the explanation is
*derived from the ranker*, not written alongside it: if the weights change, the bars change.
"""
import numpy as np
import pytest

from ml import profiles, scoring
from ml.config import V1_WEIGHTS


def person(pid, name, interests, role="student", seeking="", offering=""):
    """interests: [(name, facet, strength)]"""
    return {"id": pid, "name": name, "role": role, "seeking": seeking, "offering": offering,
            "raw_interests": [{"name": n, "facet": f, "strength": s, "source": "manual",
                               "evidence": f"manual: {n}"} for n, f, s in interests]}


@pytest.fixture
def pop():
    people = [
        person("me", "Me", [("robotics", "technical", 0.9), ("rock climbing", "personal", 0.8)]),
        person("twin", "Twin", [("robotics", "technical", 0.9), ("rock climbing", "personal", 0.8)]),
        person("far", "Far", [("pottery", "personal", 0.9)]),
        # only overlap is one niche personal interest
        person("niche", "Niche", [("kendo", "personal", 0.9), ("accounting", "career", 0.8)]),
        person("kendo_too", "Kendoka", [("kendo", "personal", 0.9), ("marine biology", "academic", 0.8)]),
    ]
    index = profiles.build_population(people)
    return {p["id"]: p for p in people}, index


def test_contributions_sum_to_the_score(pop):
    """The decomposition must be exact, or the bars are lying about the ranking."""
    by_id, index = pop
    f = scoring.pair_features(by_id["me"], by_id["twin"], index)
    contributions, basis = scoring.score_contributions(f)
    assert basis == "v1"
    assert sum(contributions.values()) == pytest.approx(scoring.v1_score(f), abs=1e-12)


def test_every_feature_has_a_label():
    assert set(scoring.FEATURE_LABELS) == set(scoring.FEATURES)


def test_factors_are_ranked_by_contribution(pop):
    by_id, index = pop
    e = scoring.explain_match(by_id["me"], by_id["twin"], index)
    contributions = [r["contribution"] for r in e["factors"]]
    assert contributions == sorted(contributions, reverse=True)
    assert all(r["contribution"] > 0 for r in e["factors"])   # never show a factor that hurt
    assert len(e["factors"]) <= 3


def test_explanation_is_grounded_in_shared_topics(pop):
    """Every topic named must actually be shared, with both evidence lines."""
    by_id, index = pop
    e = scoring.explain_match(by_id["me"], by_id["twin"], index)
    names = {t["name"] for t in e["shared_topics"]}
    assert {"robotics", "rock climbing"} <= names
    for t in e["shared_topics"]:
        assert t["evidence_a"] and t["evidence_b"]
    assert "robotics" in e["summary"] or "rock climbing" in e["summary"]


def test_weights_drive_the_explanation(pop, monkeypatch):
    """Not a restatement of the weights: zero one out and it leaves the breakdown."""
    by_id, index = pop
    before = scoring.explain_match(by_id["me"], by_id["twin"], index)
    assert any(r["name"] == "sim_technical" for r in before["all_factors"] if r["contribution"] > 0)
    monkeypatch.setitem(V1_WEIGHTS, "sim_technical", 0.0)
    after = scoring.explain_match(by_id["me"], by_id["twin"], index)
    tech = next(r for r in after["all_factors"] if r["name"] == "sim_technical")
    assert tech["contribution"] == 0.0


def test_verb_matches_the_facet(pop):
    """A personal interest should not read as work."""
    by_id, index = pop
    e = scoring.explain_match(by_id["niche"], by_id["kendo_too"], index)
    assert "kendo" in e["summary"]
    assert "are both into kendo" in e["summary"], e["summary"]


def test_non_obvious_match_says_why_it_is_non_obvious(pop):
    """Cross-community pairs are the interesting ones; `bridge` carries a small weight so it never
    tops the bars, but the sentence must still surface it."""
    by_id, index = pop
    cluster = {"niche": 0, "kendo_too": 1}          # deliberately different communities
    e = scoring.explain_match(by_id["niche"], by_id["kendo_too"], index, cluster=cluster)
    assert "different circles" in e["summary"], e["summary"]
    assert "kendo" in e["summary"]
    # same pair, same community -> no longer framed as a bridge
    same = scoring.explain_match(by_id["niche"], by_id["kendo_too"], index, cluster={"niche": 0, "kendo_too": 0})
    assert "different circles" not in same["summary"]


def test_recruiter_pairing_is_called_out(pop):
    by_id, index = pop
    me = dict(by_id["me"], seeking="a robotics internship")
    rec = dict(by_id["twin"], role="recruiter", offering="robotics internships")
    profiles.build_vectors(me, index)
    profiles.build_vectors(rec, index)
    e = scoring.explain_match(me, rec, index)
    assert "hiring" in e["summary"], e["summary"]


def test_no_overlap_does_not_invent_a_reason(pop):
    by_id, index = pop
    e = scoring.explain_match(by_id["me"], by_id["far"], index)
    assert e["shared_topics"] == []
    assert "pottery" not in e["summary"]           # never name an interest they do not share


def test_learned_ranker_contributions_are_labelled_lr(pop):
    """A logistic ranker is linear in the logit, so it gets a real decomposition, not the v1 proxy."""
    by_id, index = pop
    from ml.ranker import LRModel
    X = np.array([[f, 0.2, 0.3, 0.1, 0.4, 0.5, 0.0, 0.0] for f in (0.1, 0.9)] * 4)
    y = np.array([0, 1] * 4)
    model = LRModel().fit(X, y)
    f = scoring.pair_features(by_id["me"], by_id["twin"], index)
    contributions, basis = scoring.score_contributions(f, model)
    assert basis == "lr"
    assert set(contributions) == set(scoring.FEATURES)


def test_tree_model_is_honest_about_not_decomposing(pop):
    """LGBMRanker is not linearly decomposable. We fall back to v1 weights and say so rather than
    inventing per-feature numbers a tree never produced."""
    by_id, index = pop

    class FakeTreeModel:                     # no .pipe, like LGBMRankModel
        def predict_score(self, X):
            return np.zeros(len(X))

    f = scoring.pair_features(by_id["me"], by_id["twin"], index)
    _, basis = scoring.score_contributions(f, FakeTreeModel())
    assert basis == "v1_proxy"


def test_rank_candidates_explains_every_row(pop):
    by_id, index = pop
    ranked = scoring.rank_candidates(by_id["me"], list(by_id.values()), index)
    assert ranked and all("explanation" in r for r in ranked)
    for r in ranked:
        assert r["explanation"]["summary"]
        # `why` must agree with the explanation it was derived from
        assert r["why"] == [t["name"] for t in r["explanation"]["shared_topics"][:3]]
