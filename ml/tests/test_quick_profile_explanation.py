"""Quick-profile attribution must describe the exact score returned, without a DB."""
from types import SimpleNamespace

import pytest

from app.routers import matches
from ml import scoring


def test_quick_profile_explains_same_features(monkeypatch):
    me = {"id": "me", "interests": {}}
    them = {"id": "other", "interests": {}}
    index = SimpleNamespace(facets={})
    features = {key: 0.25 for key in scoring.FEATURES}
    features["sim_personal"] = -0.2
    monkeypatch.setattr(matches, "_context", lambda *_: ({"kind": "connection"}, me, them, index, None))
    monkeypatch.setattr(matches.matching, "pair_score", lambda *_: (scoring.v1_score(features), features))
    monkeypatch.setattr(matches.synthetic, "is_synthetic", lambda _: False)
    result = matches.quick_profile("other", SimpleNamespace(id="me"))
    e = result["explanation"]
    assert e["basis"] == "v1"
    assert sum(f["contribution"] for f in e["all_factors"]) == pytest.approx(result["score"], abs=0.0005)
    assert any(f["contribution"] < 0 for f in e["all_factors"])
    assert e["shared_topics"] == []


def test_relationship_gate_still_runs(monkeypatch):
    def denied(*_):
        raise matches.ApiError(403, matches.NOT_AVAILABLE)
    monkeypatch.setattr(matches, "_context", denied)
    with pytest.raises(matches.ApiError):
        matches.quick_profile("other", SimpleNamespace(id="me"))


def test_graph_keeps_learned_attribution():
    from app.graph import Builder
    ranked = {"summary": "Shared interests", "basis": "v1_proxy",
              "factors": [{"label": "technical overlap", "contribution": 0.1, "share": 1}],
              "shared_topics": []}
    builder = Builder({"id": "me"}, SimpleNamespace())
    result = builder.explanation({}, {}, ranked)
    assert result["basis"] == "v1_proxy"
    assert result["factors"] == ranked["factors"]
