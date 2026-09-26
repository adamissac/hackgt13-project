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
