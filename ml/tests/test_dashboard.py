"""Organizer community map: anonymized, min group size, gaps, live edges."""
import json

import numpy as np
import pytest

from conftest import add_event, seed_person


@pytest.fixture
def fast_viz(monkeypatch):
    """UMAP is slow to JIT; the math under test here is ours, not UMAP's."""
    from ml import viz
    from app import population
    monkeypatch.setattr(viz, "layout", lambda people, seed=42: np.arange(2 * len(people), dtype=float).reshape(-1, 2))

    def fake_clusters(people, min_cluster_size=5):
        return {p["id"]: {"R": 0, "B": 1, "T": 2}[p["name"][0]] for p in people}   # T = a 2-person cluster
    monkeypatch.setattr(viz, "communities", fake_clusters)
    population._clusters.clear()


def test_dashboard_anonymized_with_gaps(dbclient, db, fast_viz):
    ev = add_event(db)
    robo = [seed_person(db, f"R{i} Robo", [("robotics", "technical", 0.9), ("control systems", "technical", 0.7)],
                        event_id=ev) for i in range(6)]
    bio = [seed_person(db, f"B{i} Bio", [("genomics", "academic", 0.9), ("control systems", "technical", 0.6)],
                       event_id=ev) for i in range(6)]
    tiny = [seed_person(db, f"T{i} Tiny", [("pottery", "personal", 0.9)], event_id=ev) for i in range(2)]
    lo, hi = sorted([robo[0], robo[1]])
    db.execute("insert into connections (user_a, user_b, created_at) values (%s, %s, now())", (lo, hi))
    db.execute("update events set starts_at = now() - interval '1 hour' where id = %s", (ev,))
    r = dbclient.get(f"/dashboard/{ev}")
    assert r.status_code == 200, r.text
    out = r.json()
    raw = json.dumps(out)
    for uid in robo + bio + tiny:
        assert uid not in raw                                   # no user ids
    assert "Robo" not in raw and "Bio" not in raw               # no names
    assert out["people"] == 14 and len(out["nodes"]) == 14
    assert all(set(n) == {"id", "x", "y", "cluster", "role"} for n in out["nodes"])
    sizes = {c["id"]: c["size"] for c in out["clusters"]}
    assert all(size >= 5 for cid, size in sizes.items() if cid != -1)
    assert 2 not in sizes and sizes.get(-1) == 2               # the 2-person group is folded into -1
    assert len(out["edges"]) == 1 and set(out["edges"][0]) == {"source", "target"}
    assert all(set(g["clusters"]) != {-1} and -1 not in g["clusters"] for g in out["gaps"])


def test_dashboard_unknown_event(dbclient, db):
    assert dbclient.get("/dashboard/999").status_code == 404
