"""AR8 GitHub activity poller: normalization, lag catch-up, dedupe (no network, no DB)."""
from datetime import datetime, timedelta, timezone

import numpy as np

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
    monkeypatch.setattr(ga.db, "fetchall", lambda sql, params: [{"key": "event:1", "repo": None, "pushed_at": None}])
    monkeypatch.setattr(ga.db, "conn", lambda: Ctx())
    import ml.embed
    monkeypatch.setattr(ml.embed, "embed", lambda texts: np.zeros((len(texts), 384), np.float32))
    n = ga.poll_user("user-1", "gho_x", "octo")
    assert n == 1                                           # event:1 already stored
    params = calls["inserted"][0]
    assert params[0] == "user-1" and params[1] == "shipped v2 of rl-trader"
    assert "gho_x" not in str(params)
