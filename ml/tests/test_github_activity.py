"""AR8 GitHub activity poller: normalization, lag catch-up, dedupe (no network, no DB)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import numpy as np
import pytest

from app import github_activity as ga

NOW = datetime.now(timezone.utc)
SINCE = NOW - timedelta(days=14)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731


def ev(id, type, repo, when, payload, public=True):
    return {"id": str(id), "type": type, "repo": {"name": repo}, "created_at": iso(when), "payload": payload,
            "public": public}


def test_only_milestones_become_feed_items():
    events = [
        ev(1, "CreateEvent", "octo/rl-trader", NOW, {"ref_type": "repository", "description": "RL agent"}),
        ev(2, "CreateEvent", "octo/rl-trader", NOW, {"ref_type": "branch"}),
        ev(3, "PushEvent", "octo/rl-trader", NOW, {"size": 2, "commits": [{"message": "reward shaping"}]}),
        ev(4, "PushEvent", "octo/site", NOW, {}),
        ev(5, "ReleaseEvent", "octo/rl-trader", NOW, {"action": "published",
                                                      "release": {"tag_name": "v1.0", "html_url": "https://x/rel"}}),
        ev(6, "WatchEvent", "someone/else", NOW, {}),
        ev(7, "PublicEvent", "octo/tool", NOW, {}),
        ev(8, "CreateEvent", "octo/secret", NOW, {"ref_type": "repository"}, public=False),
        ev(9, "CreateEvent", "octo/old", NOW - timedelta(days=30), {"ref_type": "repository"}),
    ]
    items = ga.items_from_events(events, SINCE)
    assert [i["title"] for i in items] == ["started working on rl-trader", "shipped v1.0 of rl-trader", "open-sourced tool"]
    assert items[1]["url"] == "https://x/rel"
    assert not any("push" in i["title"] or "commit" in i["title"] for i in items)   # commits are never posted


def test_repo_milestones_new_launch_and_stars():
    repos = [
        {"name": "new-thing", "full_name": "octo/new-thing", "created_at": iso(NOW - timedelta(hours=1)),
         "pushed_at": iso(NOW - timedelta(hours=1)), "html_url": "u1", "description": "fresh"},
        {"name": "site", "full_name": "octo/site", "created_at": iso(NOW - timedelta(days=90)),
         "pushed_at": iso(NOW - timedelta(minutes=3)), "html_url": "u2", "homepage": "https://site.dev",
         "stargazers_count": 57},
        {"name": "pages", "full_name": "octo/pages", "owner": {"login": "octo"}, "created_at": iso(NOW - timedelta(days=90)),
         "pushed_at": iso(NOW - timedelta(days=1)), "html_url": "u3", "has_pages": True},
        {"name": "stale", "full_name": "octo/stale", "created_at": iso(NOW - timedelta(days=90)),
         "pushed_at": iso(NOW - timedelta(days=60)), "homepage": "https://old.dev", "stargazers_count": 500},
        {"name": "fork", "full_name": "octo/fork", "fork": True, "created_at": iso(NOW), "pushed_at": iso(NOW)},
    ]
    items = ga.items_from_repos(repos, SINCE)
    assert [i["title"] for i in items] == ["started working on new-thing", "launched site", "site passed 50 stars",
                                           "launched pages"]
    assert items[1]["url"] == "https://site.dev" and "Live at https://site.dev" in items[1]["body"]
    assert items[3]["url"] == "https://octo.github.io/pages"
    assert len({i["key"] for i in items}) == len(items)                  # stable keys: each milestone once


def test_new_repo_from_event_and_repo_list_is_one_item():
    when = NOW - timedelta(minutes=2)
    events = ga.items_from_events([ev(9, "CreateEvent", "octo/rl", when, {"ref_type": "repository"})], SINCE)
    repos = ga.items_from_repos([{"name": "rl", "full_name": "octo/rl", "created_at": iso(when),
                                  "pushed_at": iso(when), "html_url": "u"}], SINCE)
    assert [i["key"] for i in ga._dedupe_against_events(events + repos)] == ["event:9"]


def test_poll_user_inserts_only_new_items(monkeypatch):
    calls = {"inserted": []}
    events = [ev(1, "CreateEvent", "octo/rl-trader", NOW, {"ref_type": "repository"}),
              ev(2, "ReleaseEvent", "octo/rl-trader", NOW, {"action": "published", "release": {"tag_name": "v2"}})]

    def fake_get(path, token, cache, accept=None):
        assert token == "gho_x"
        return events if "/events/public" in path else []

    class Conn:
        def execute(self, sql, params):
            calls["inserted"].append(params)

    class Ctx:
        def __enter__(self):
            return Conn()

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(ga.github_ingest, "_get", fake_get)
    monkeypatch.setattr(ga.db, "fetchall", lambda sql, params: [{"key": "event:1", "repo": None, "pushed_at": None}]
                        if "payload->>'key'" in sql else [])                    # nothing to brief in this test
    monkeypatch.setattr(ga.db, "conn", lambda: Ctx())
    import ml.embed
    monkeypatch.setattr(ml.embed, "embed", lambda texts: np.zeros((len(texts), 384), np.float32))
    n = ga.poll_user("user-1", "gho_x", "octo")
    assert n == 1                                           # event:1 already stored
    params = calls["inserted"][0]
    assert params[0] == "user-1" and params[1] == "shipped v2 of rl-trader"
    assert "gho_x" not in str(params)


# ------------------------------------------------------------------ briefs: what they actually built
REPO = {"name": "lob-alpha", "full_name": "octo/lob-alpha", "size": 120, "stargazers_count": 3, "html_url": "u",
        "description": "Short-term price moves from limit order book data", "topics": ["quant", "lstm"],
        "pushed_at": iso(NOW)}
ITEM = {"id": 1, "title": "started working on lob-alpha", "body": "",                 # shaped like a feed_items row
        "payload": {"repo": "octo/lob-alpha", "type": "new_repo"}}
FACTS = {"first_name": "Ana", "milestone": "started working on lob-alpha", "type": "new_repo", "repo": "lob-alpha",
         "description": REPO["description"], "topics": ["quant"], "languages": [("Python", 84), ("C++", 16)],
         "frameworks": ["PyTorch"], "homepage": "", "stars": 3, "commits": ["add walk-forward backtest"],
         "release_notes": "", "readme": "Predicts mid-price moves from order book snapshots."}


def routed(routes, seen=None):
    def get(path, token=None, cache=None, accept=None):
        if seen is not None:
            seen.append(path)
        return next((v for k, v in routes.items() if k in path), None)
    return get


def test_commit_subjects_prefer_their_own_and_drop_merges():
    commits = [{"author": {"login": "octo"}, "commit": {"message": "add walk-forward backtest\n\nlong body"}},
               {"author": {"login": "someone"}, "commit": {"message": "fix typo"}},
               {"author": {"login": "Octo"}, "commit": {"message": "Merge pull request #3 from x/y"}},
               {"author": {"login": "octo"}, "commit": {"message": "tune lookback window"}},
               {"author": None, "commit": {"message": "bot commit"}}]
    assert ga.commit_subjects(commits, "octo") == ["add walk-forward backtest", "tune lookback window"]
    assert ga.commit_subjects([commits[1]], "octo") == ["fix typo"]         # none of theirs: the repo's commits


def test_repo_facts_are_public_repo_data_only(monkeypatch):
    monkeypatch.setattr(ga.github_ingest, "_get", routed({
        "/languages": {"Python": 840, "C++": 160},
        "/readme": "[![ci](x)](y)\n# lob-alpha\nPredicts mid-price moves from order book snapshots.",
        "/commits": [{"author": {"login": "octo"}, "commit": {"message": "add walk-forward backtest"}}]}))
    monkeypatch.setattr(ga.github_ingest, "_manifests", lambda full, token, cache: ["PyTorch", "pandas"])
    f = ga.repo_facts(ITEM, REPO, "gho_x", "octo", "Ana")
    assert f["languages"] == [("Python", 84), ("C++", 16)] and f["frameworks"] == ["PyTorch", "pandas"]
    assert f["commits"] == ["add walk-forward backtest"] and "ci" not in f["readme"] and f["release_notes"] == ""
    assert ga.stack_of(f) == ["Python", "C++", "PyTorch", "pandas"]
    # chips: display names, no categories, no noise languages, no case duplicates
    assert ga.stack_of({"languages": [("TypeScript", 70), ("Shell", 20), ("Python", 10)],
                        "frameworks": ["typescript", "next.js", "data visualization", "pytorch", "llm apis"]}) \
        == ["TypeScript", "Python", "Next.js", "PyTorch"]
    assert "gho_x" not in str(f)
    assert ga.repo_facts(ITEM, {**REPO, "private": True}, "gho_x", "octo", "Ana") is None
    assert ga.repo_facts(ITEM, {**REPO, "fork": True}, "gho_x", "octo", "Ana") is None


def test_brand_new_empty_repo_gets_a_thin_template_brief(monkeypatch):
    seen = []
    monkeypatch.setattr(ga.github_ingest, "_get", routed({"/languages": {}}, seen))
    monkeypatch.setattr(ga.github_ingest, "_manifests", lambda *a: pytest.fail("no tree call for an empty repo"))
    f = ga.repo_facts(ITEM, {**REPO, "size": 0}, "gho_x", "octo", "Ana")
    assert seen == ["/repos/octo/lob-alpha/languages"]
    monkeypatch.setattr(ga.generation, "project_brief", lambda f: (_ for _ in ()).throw(RuntimeError("no key")))
    d = ga.make_brief(f, REPO["pushed_at"], NOW)
    assert d["source"] == "template" and d["thin"] is True and d["pushed_at"] == REPO["pushed_at"]
    assert d["summary"] == "Ana started working on lob-alpha: Short-term price moves from limit order book data."
    assert d["ask"] == "What got you started on lob-alpha?"


def test_briefs_are_rewritten_only_when_the_repo_changes():
    d = {"summary": "s", "pushed_at": "p1", "at": NOW.isoformat(), "thin": False}
    assert ga.needs_brief(None, "p1", NOW)
    assert not ga.needs_brief(d, "p1", NOW + timedelta(days=3))                      # nothing new pushed
    assert not ga.needs_brief(d, "p2", NOW + timedelta(hours=1))                     # new push, brief still fresh
    assert ga.needs_brief(d, "p2", NOW + timedelta(hours=7))                         # new push, brief over 6 h old
    assert ga.needs_brief({**d, "thin": True}, "p2", NOW + timedelta(minutes=5))     # thin brief: rewrite right away
    assert not ga.needs_brief({"skipped": True, "at": NOW.isoformat()}, None, NOW)   # gone/private: leave it


def test_refresh_briefs_is_capped_and_stores_details(monkeypatch):
    rows = [{"id": n, "title": f"started working on r{n}", "body": "",
             "payload": {"repo": f"octo/r{n}", "type": "new_repo"}} for n in range(6)]
    repos = [{**REPO, "name": f"r{n}", "full_name": f"octo/r{n}"} for n in range(6)]
    rows.append({"id": 99, "title": "started working on gone", "body": "", "payload": {"repo": "octo/gone"}})
    updates = []

    class Conn:
        def execute(self, sql, params):
            updates.append(params)

    class Ctx:
        def __enter__(self):
            return Conn()

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(ga.db, "fetchall", lambda sql, params: rows)
    monkeypatch.setattr(ga.db, "fetchone", lambda sql, params: {"name": "Ana Diaz"})
    monkeypatch.setattr(ga.db, "conn", lambda: Ctx())
    monkeypatch.setattr(ga, "repo_facts", lambda row, repo, token, login, first:
                        {**FACTS, "first_name": first, "repo": row["payload"]["repo"].split("/")[1]})
    monkeypatch.setattr(ga.generation, "project_brief",
                        lambda f: {"summary": f"{f['first_name']} built {f['repo']}.", "highlights": ["h1"], "ask": "Why?"})
    import ml.embed
    monkeypatch.setattr(ml.embed, "embed", lambda texts: np.zeros((len(texts), 384), np.float32))
    assert ga.refresh_briefs("user-1", "gho_x", "octo", repos, now=NOW) == ga.MAX_BRIEFS_PER_POLL == len(updates)
    details = updates[0][0].obj["details"]
    assert details["summary"] == "Ana built r0." and details["source"] == "ai" and details["stack"] == ["Python", "C++",
                                                                                                          "PyTorch"]
    assert details["pushed_at"] == REPO["pushed_at"] and details["thin"] is False
    assert "gho_x" not in str(updates)


def fake_llm(monkeypatch, brief):
    from ml import generation as g
    resp = SimpleNamespace(stop_reason="end_turn", usage=SimpleNamespace(input_tokens=1, output_tokens=1),
                           parsed_output=brief)
    calls = []
    monkeypatch.setattr(g, "client", lambda: SimpleNamespace(messages=SimpleNamespace(
        parse=lambda **kw: calls.append(kw) or resp)))
    return calls


def test_project_brief_drops_invented_numbers(monkeypatch):
    from ml import generation as g
    calls = fake_llm(monkeypatch, g.ProjectBrief(
        summary="Ana started lob-alpha, an order book model in Python.",
        highlights=["Hits 92% accuracy on test data", "- Walk-forward backtest with fees", "Mostly Python (84%)"],
        ask="How do you avoid lookahead bias?"))
    out = g.project_brief(FACTS)
    assert out == {"summary": "Ana started lob-alpha, an order book model in Python.",
                   "highlights": ["Walk-forward backtest with fees", "Mostly Python (84%)"],
                   "ask": "How do you avoid lookahead bias?"}
    sent = calls[0]["messages"][0]["content"]
    assert "Ana" in sent and "add walk-forward backtest" in sent and "Python 84%" in sent


def test_project_brief_with_an_invented_number_in_the_summary_fails_to_template(monkeypatch):
    from ml import generation as g
    fake_llm(monkeypatch, g.ProjectBrief(summary="Ana's model made $10,000 in paper trading.", highlights=[],
                                         ask="How?"))
    with pytest.raises(g.GenerationError):
        g.project_brief(FACTS)


def test_unavailable_repo_is_marked_skipped_not_retried(monkeypatch):
    updates = []

    class Ctx:
        def __enter__(self):
            return SimpleNamespace(execute=lambda sql, params: updates.append((sql, params)))

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(ga.db, "fetchall", lambda sql, params: [
        {"id": 7, "title": "started working on gone", "body": "", "payload": {"repo": "octo/gone"}}])
    monkeypatch.setattr(ga.db, "fetchone", lambda sql, params: {"name": "Ana Diaz"})
    monkeypatch.setattr(ga.db, "conn", lambda: Ctx())
    monkeypatch.setattr(ga.github_ingest, "_get", routed({}))                  # /repos/octo/gone -> 404 -> None
    assert ga.refresh_briefs("user-1", "gho_x", "octo", [], now=NOW) == 0
    (sql, params), = updates
    assert "embedding" not in sql and params[0].obj == {"details": {"skipped": True, "at": NOW.isoformat()}}
