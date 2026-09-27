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


# ------------------------------------------------------------------ Haiku variety pass
def test_ungrounded_rewrite_is_rejected():
    """The whole point of the grounding check: a rewrite may not name an interest the pair does
    not share, even though the model was only shown that pair's topics."""
    from ml.generation import _grounded
    vocab = {"rust", "kendo", "marine biology", "pottery"}
    assert _grounded("You both work on rust.", {"rust"}, vocab)
    assert not _grounded("You both work on rust and pottery.", {"rust"}, vocab)
    # short words are skipped so a topic like 'ai' cannot false-positive on ordinary prose
    assert _grounded("Your aims align.", {"rust"}, {"ai"})


def test_vary_why_keeps_templates_when_the_llm_is_unavailable(monkeypatch):
    """No API key, no network, API error: the caller must still get usable summaries."""
    from ml import generation
    monkeypatch.setattr(generation, "client", lambda: (_ for _ in ()).throw(RuntimeError("no key")))
    out = generation.vary_why([{"id": "a", "template": "You both work on rust.", "topics": ["rust"],
                                "factors": ["technical overlap"], "bridge": False, "recruiter": False}])
    assert out == {}          # empty, never an exception; caller keeps its template


def test_vary_why_drops_a_hallucinated_row(monkeypatch):
    from ml import generation

    class Row:
        def __init__(self, i, s):
            self.id, self.summary = i, s

    class Parsed:
        summaries = [Row("good", "Rust is the common thread here."),
                     Row("bad", "You both love pottery and rust.")]

    class Resp:
        parsed_output, stop_reason = Parsed(), "end_turn"
        usage = type("U", (), {"input_tokens": 1, "output_tokens": 1})()

    monkeypatch.setattr(generation, "client",
                        lambda: type("C", (), {"messages": type("M", (), {"parse": staticmethod(lambda **k: Resp())})()})())
    items = [{"id": i, "template": "t", "topics": ["rust"], "factors": [], "bridge": False, "recruiter": False}
             for i in ("good", "bad")]
    out = generation.vary_why(items, vocabulary={"rust", "pottery"})
    assert "good" in out and "bad" not in out       # pottery is not shared -> dropped


def test_graph_variety_can_be_switched_off(pop, monkeypatch):
    """EXPLAIN_VARY=0 must skip the call entirely, not just discard the result."""
    from app import graph as G
    by_id, index = pop
    monkeypatch.setenv("EXPLAIN_VARY", "0")
    called = []
    monkeypatch.setattr(G.generation, "vary_why", lambda *a, **k: called.append(1) or {})
    b = G.Builder(by_id["me"], index)
    f = scoring.pair_features(by_id["me"], by_id["twin"], index)
    b.person(by_id["twin"], score=0.7, features=f, highlight=True, cluster=None,
             connected=False, connected_at=None, facet_filter="all")
    out = b.out()
    edge = next(e for e in out["edges"] if e["kind"] == "match")
    assert called == []
    assert edge["explanation"]["summary"] and "varied" not in edge["explanation"]


def test_graph_keeps_the_template_when_variety_returns_nothing(pop, monkeypatch):
    from app import graph as G
    by_id, index = pop
    monkeypatch.setenv("EXPLAIN_VARY", "1")
    monkeypatch.setattr(G, "_varied_cache", {})
    monkeypatch.setattr(G.generation, "vary_why", lambda *a, **k: {})
    b = G.Builder(by_id["me"], index)
    f = scoring.pair_features(by_id["me"], by_id["twin"], index)
    b.person(by_id["twin"], score=0.7, features=f, highlight=True, cluster=None,
             connected=False, connected_at=None, facet_filter="all")
    edge = next(e for e in b.out()["edges"] if e["kind"] == "match")
    assert "robotics" in edge["explanation"]["summary"] or "rock climbing" in edge["explanation"]["summary"]


def test_variety_never_touches_the_numbers(pop, monkeypatch):
    """Only `summary` may change. The bars a judge sees stay the ranker's."""
    from app import graph as G
    by_id, index = pop
    monkeypatch.setenv("EXPLAIN_VARY", "1")
    monkeypatch.setattr(G, "_varied_cache", {})
    monkeypatch.setattr(G.generation, "vary_why", lambda items, **k: {items[0]["id"]: "Totally different wording."})
    b = G.Builder(by_id["me"], index)
    f = scoring.pair_features(by_id["me"], by_id["twin"], index)
    b.person(by_id["twin"], score=0.7, features=f, highlight=True, cluster=None,
             connected=False, connected_at=None, facet_filter="all")
    edge = next(e for e in b.out()["edges"] if e["kind"] == "match")
    ex = edge["explanation"]
    assert ex["summary"] == "Totally different wording." and ex["varied"] is True
    expected = scoring.explain_match(by_id["me"], by_id["twin"], index, features=f)
    assert [r["contribution"] for r in ex["factors"]] == [r["contribution"] for r in expected["factors"]]


def test_rank_candidates_explains_every_row(pop):
    by_id, index = pop
    ranked = scoring.rank_candidates(by_id["me"], list(by_id.values()), index)
    assert ranked and all("explanation" in r for r in ranked)
    for r in ranked:
        assert r["explanation"]["summary"]
        # `why` must agree with the explanation it was derived from
        assert r["why"] == [t["name"] for t in r["explanation"]["shared_topics"][:3]]


def test_graph_variety_works_with_the_live_index_shape(monkeypatch):
    """Regression: the live app.population.Index keys names by int id; iterating the dict gave ints and
    `.lower()` 500'd /graph?mode=matches (Constellation)."""
    from app import graph as G
    from app.population import Index
    live = Index({1: "Robotics", 2: "Rock Climbing"}, {}, {}, {})
    assert G._vocabulary(live) == {"robotics", "rock climbing"}
