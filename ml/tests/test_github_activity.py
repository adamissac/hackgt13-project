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


def test_normalizes_the_three_kinds_and_ignores_others():
    events = [
        ev(1, "CreateEvent", "octo/rl-trader", NOW, {"ref_type": "repository", "description": "RL agent"}),
        ev(2, "CreateEvent", "octo/rl-trader", NOW, {"ref_type": "branch"}),
        ev(3, "PushEvent", "octo/rl-trader", NOW, {"size": 2, "commits": [{"message": "reward shaping\n\nbody"},
                                                                           {"message": "fix"}]}),
        ev(4, "PushEvent", "octo/site", NOW, {}),                      # trimmed payload
        ev(5, "ReleaseEvent", "octo/rl-trader", NOW, {"action": "published",
                                                      "release": {"tag_name": "v1.0", "html_url": "https://x/rel"}}),
        ev(6, "WatchEvent", "someone/else", NOW, {}),
        ev(7, "PushEvent", "octo/old", NOW - timedelta(days=30), {"size": 1}),
        ev(8, "PushEvent", "octo/secret", NOW, {"size": 1}, public=False),
    ]
    items = ga.items_from_events(events, SINCE)
    assert [i["title"] for i in items] == [
        "created a new repo rl-trader", "pushed 2 commits to rl-trader", "pushed to site", "released v1.0 of rl-trader"]
    assert items[1]["body"] == "reward shaping; fix"
    assert items[3]["url"] == "https://x/rel"
    assert {i["key"] for i in items} == {"event:1", "event:3", "event:4", "event:5"}


def test_repo_catch_up_for_events_lag():
    repos = [
        {"name": "new-thing", "full_name": "octo/new-thing", "created_at": iso(NOW - timedelta(hours=1)),
         "pushed_at": iso(NOW - timedelta(hours=1)), "html_url": "u1", "description": "fresh"},
        {"name": "rl-trader", "full_name": "octo/rl-trader", "created_at": iso(NOW - timedelta(days=90)),
         "pushed_at": iso(NOW - timedelta(minutes=3)), "html_url": "u2"},
        {"name": "stale", "full_name": "octo/stale", "created_at": iso(NOW - timedelta(days=90)),
         "pushed_at": iso(NOW - timedelta(days=60)), "html_url": "u3"},
        {"name": "fork", "full_name": "octo/fork", "fork": True, "created_at": iso(NOW), "pushed_at": iso(NOW)},
    ]
    items = ga.items_from_repos(repos, SINCE, seen_pushes={})
    assert [i["title"] for i in items] == ["created a new repo new-thing", "pushed to rl-trader"]
    # already recorded that pushed_at -> nothing new
    seen = {"octo/rl-trader": repos[1]["pushed_at"]}
    assert [i["title"] for i in ga.items_from_repos(repos, SINCE, seen)] == ["created a new repo new-thing"]


def test_same_push_from_event_and_repo_list_is_one_item():
    when = NOW - timedelta(minutes=2)
    events = ga.items_from_events([ev(9, "PushEvent", "octo/rl-trader", when, {"size": 1})], SINCE)
    repos = ga.items_from_repos([{"name": "rl-trader", "full_name": "octo/rl-trader",
                                  "created_at": iso(NOW - timedelta(days=90)), "pushed_at": iso(when), "html_url": "u"}],
                                SINCE, {})
    merged = ga._dedupe_against_events(events + repos)
    assert [i["key"] for i in merged] == ["event:9"]


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
    assert params[0] == "user-1" and params[1] == "released v2 of rl-trader"
    assert "gho_x" not in str(params)
