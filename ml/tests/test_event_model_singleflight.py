"""Concurrent requests for the same event share one model build (phones poll matches every 15 s while a
cold build can take many seconds on the server). No database needed."""
import threading
import time

from app import population


def test_concurrent_callers_share_one_build(monkeypatch):
    calls = []

    def slow_build(ids):
        calls.append(ids)
        time.sleep(0.3)
        return [], population.Index({}, {}, {}, {})

    monkeypatch.setattr(population, "attendee_ids", lambda event_id: ["u1", "u2"])
    monkeypatch.setattr(population, "build", slow_build)
    monkeypatch.setattr(population, "_events", {})
    results = []
    threads = [threading.Thread(target=lambda: results.append(population.event_model(99))) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1
    assert len({id(m) for m in results}) == 1


def test_changed_attendance_still_rebuilds(monkeypatch):
    calls = []
    ids = [["u1"]]
    monkeypatch.setattr(population, "attendee_ids", lambda event_id: ids[0])
    monkeypatch.setattr(population, "build", lambda i: (calls.append(i), ([], population.Index({}, {}, {}, {})))[1])
    monkeypatch.setattr(population, "_events", {})
    population.event_model(98)
    population.event_model(98)
    ids[0] = ["u1", "u2"]
    population.event_model(98)
    assert len(calls) == 2


def test_stale_model_is_served_while_another_thread_rebuilds(monkeypatch):
    """A slow rebuild must never stall requests when a model is already cached (the 15-minute stall)."""
    calls = []
    monkeypatch.setattr(population, "attendee_ids", lambda event_id: ["u1"])
    monkeypatch.setattr(population, "build", lambda i: (calls.append(i), ([], population.Index({}, {}, {}, {})))[1])
    monkeypatch.setattr(population, "_events", {})
    monkeypatch.setattr(population, "_build_locks", {})
    first = population.event_model(97)
    population.invalidate()                              # cached model is now out of date
    lock = population._build_locks[97]
    assert lock.acquire(blocking=False)                  # another thread is mid-rebuild
    try:
        t0 = time.time()
        got = population.event_model(97)
        assert got is first and time.time() - t0 < 0.5   # answered from cache, did not wait
        assert len(calls) == 1
    finally:
        lock.release()
    population.event_model(97)                           # lock free again: rebuilds normally
    assert len(calls) == 2


def test_request_thread_skips_clustering_while_heavy_job_runs(monkeypatch):
    assert population.HEAVY_LOCK.acquire(blocking=False)
    try:
        assert population.recompute_clusters(96, wait=False) is None   # no queueing behind UMAP
    finally:
        population.HEAVY_LOCK.release()
