"""AK2 Bluetooth tokens and sightings.

Run: cd ml && .venv/bin/python -m pytest tests/test_ble.py -q
"""
import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, Header
from fastapi.testclient import TestClient

from app import deps
from app.routers import ble

ALICE, BOB = "00000000-0000-0000-0000-00000000000a", "00000000-0000-0000-0000-00000000000b"
T0 = datetime(2026, 9, 26, 12, 3, 30, tzinfo=timezone.utc)  # mid-window on purpose


@pytest.fixture
def env(monkeypatch):
    store = ble.MemoryBleStore()
    clock = {"now": T0}
    monkeypatch.setattr(ble, "_now", lambda: clock["now"])
    app = FastAPI()
    app.include_router(ble.router)

    def user_from_header(x_user: str = Header(...)):
        return x_user

    app.dependency_overrides[deps.get_user_id] = user_from_header
    app.dependency_overrides[ble.get_ble_store] = lambda: store
    client = TestClient(app)

    def call(method, path, user, **kw):
        return client.request(method, path, headers={"x-user": user}, **kw)

    return {"store": store, "clock": clock, "call": call}


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def tokens(env, user):
    r = env["call"]("POST", "/ble/tokens", user)
    assert r.status_code == 200, r.text
    return r.json()["tokens"]


def test_batch_covers_24h_in_10_minute_windows(env):
    toks = tokens(env, ALICE)
    assert len(toks) == 144
    assert toks[0]["valid_from"] == "2026-09-26T12:00:00Z"  # current window, floored
    assert toks[0]["valid_to"] == toks[1]["valid_from"] == "2026-09-26T12:10:00Z"
    assert toks[-1]["valid_to"] == "2026-09-27T12:00:00Z"
    assert all(re.fullmatch(r"[a-z2-7]{8}", t["token"]) for t in toks)
    assert len({t["token"] for t in toks}) == 144


def test_tokens_map_to_user_only_on_server(env):
    toks = tokens(env, ALICE)
    assert ALICE not in str(toks)
    assert env["store"].tokens[toks[0]["token"]]["user_id"] == ALICE


def test_refetch_is_idempotent_and_extends(env):
    first = tokens(env, ALICE)
    assert tokens(env, ALICE) == first
    env["clock"]["now"] = T0 + timedelta(hours=1)
    later = tokens(env, ALICE)
    assert len(later) == 144
    assert later[0] == first[6]  # same token for the same window
    assert later[-1]["valid_to"] == "2026-09-27T13:00:00Z"


def test_different_users_get_different_tokens(env):
    a = {t["token"] for t in tokens(env, ALICE)}
    b = {t["token"] for t in tokens(env, BOB)}
    assert not a & b


def post(env, user, sightings, **extra):
    return env["call"]("POST", "/ble/sightings", user, json={"event_id": 1, "sightings": sightings, **extra})


def test_sightings_accepted_for_live_tokens(env):
    bob_tok = tokens(env, BOB)[0]["token"]
    r = post(env, ALICE, [{"token": bob_tok, "rssi": -58, "ts": iso(T0)}], device_model="iPhone 15", foreground=True)
    assert r.json() == {"accepted": 1, "dropped": 0}
    row = env["store"].sightings[0]
    assert row["observer_id"] == ALICE and row["observed_token"] == bob_tok and row["rssi"] == -58
    assert row["device_model"] == "iPhone 15" and row["foreground"] is True


def test_own_unknown_and_out_of_window_tokens_dropped(env):
    alice_tok = tokens(env, ALICE)[0]["token"]
    bob = tokens(env, BOB)
    r = post(env, ALICE, [
        {"token": alice_tok, "rssi": -40, "ts": iso(T0)},                  # own token
        {"token": "abcdefgh", "rssi": -60, "ts": iso(T0)},                 # never issued
        {"token": bob[5]["token"], "rssi": -60, "ts": iso(T0)},            # Bob's token for a later window
        {"token": bob[0]["token"], "rssi": -60, "ts": iso(T0 + timedelta(minutes=10))},  # not live then
    ])
    assert r.json() == {"accepted": 0, "dropped": 4}
    assert env["store"].sightings == []


def test_stale_and_future_timestamps_dropped(env):
    bob_tok = tokens(env, BOB)[0]["token"]
    env["clock"]["now"] = T0 + timedelta(hours=25)
    r = post(env, ALICE, [{"token": bob_tok, "rssi": -60, "ts": iso(T0)}])
    assert r.json()["dropped"] == 1
    env["clock"]["now"] = T0 - timedelta(minutes=5)
    r = post(env, ALICE, [{"token": bob_tok, "rssi": -60, "ts": iso(T0)}])
    assert r.json()["dropped"] == 1


def test_bad_payloads_rejected(env):
    assert post(env, ALICE, [{"token": "AA:BB:CC:DD", "rssi": -60, "ts": iso(T0)}]).status_code == 422  # MAC-like
    assert post(env, ALICE, [{"token": "abcdefgh", "rssi": 50, "ts": iso(T0)}]).status_code == 422
    too_many = [{"token": "abcdefgh", "rssi": -60, "ts": iso(T0)}] * (ble.MAX_SIGHTINGS_PER_BATCH + 1)
    assert post(env, ALICE, too_many).status_code == 422


def test_purge_deletes_after_24h(env):
    bob_tok = tokens(env, BOB)[0]["token"]
    post(env, ALICE, [{"token": bob_tok, "rssi": -60, "ts": iso(T0)}])
    assert ble.purge_old_sightings(env["store"], T0 + timedelta(hours=23))["sightings"] == 0
    out = ble.purge_old_sightings(env["store"], T0 + timedelta(hours=24, minutes=11))
    assert out["sightings"] == 1 and out["tokens"] >= 1
    assert env["store"].sightings == []
    assert bob_tok not in env["store"].tokens


def test_token_collision_retries(env, monkeypatch):
    seq = iter(["aaaaaaaa"] * 3 + [f"b{i:07d}".replace("0", "a").replace("1", "b").replace("8", "c").replace("9", "d")
                                   for i in range(400)])
    env["store"].insert_tokens([{"token": "aaaaaaaa", "user_id": BOB, "valid_from": T0, "valid_to": T0}])
    monkeypatch.setattr(ble, "new_token", lambda: next(seq))
    toks = tokens(env, ALICE)
    assert "aaaaaaaa" not in {t["token"] for t in toks}
    assert len({t["token"] for t in toks}) == 144
