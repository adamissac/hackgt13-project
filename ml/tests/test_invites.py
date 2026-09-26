"""AK4 invites: create, resolve, accept, decline, revoke, expiry, rate limit, privacy.

Run: cd ml && .venv/bin/python -m pytest tests/test_invites.py -q
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, Header
from fastapi.testclient import TestClient

from app.routers import invites

ALICE, BOB, CARL = "00000000-0000-0000-0000-00000000000a", "00000000-0000-0000-0000-00000000000b", "00000000-0000-0000-0000-00000000000c"
T0 = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def env(monkeypatch):
    store = invites.MemoryInviteStore()
    store.profiles = {
        ALICE: {"name": "Alice A.", "photo_url": "https://x/a.png", "headline": "ML @ GT"},
        BOB: {"name": "Bob B.", "photo_url": None, "headline": ""},
        CARL: {"name": "Carl C.", "photo_url": None, "headline": ""},
    }
    clock = {"now": T0}
    monkeypatch.setattr(invites, "_now", lambda: clock["now"])

    app = FastAPI()
    app.include_router(invites.router)
    # Tests authenticate by header; the real app verifies the Supabase JWT instead.
    def user_from_header(x_user: str = Header(...)):
        return x_user
    app.dependency_overrides[invites.get_user_id] = user_from_header
    app.dependency_overrides[invites.get_invite_store] = lambda: store
    client = TestClient(app)

    def call(method, path, user, **kw):
        return client.request(method, path, headers={"x-user": user}, **kw)

    return {"store": store, "clock": clock, "call": call}


def create(env, user=ALICE, **body):
    r = env["call"]("POST", "/invites", user, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def token_of(invite):
    return invite["url"].rsplit("/", 1)[1]


def test_create_returns_link_and_stores_only_hash(env):
    inv = create(env, note="From the ML meetup")
    tok = token_of(inv)
    assert inv["qr_payload"] == inv["url"]
    assert len(tok) >= 22  # token_urlsafe(16) = 128 bits
    assert inv["expires_at"] == "2026-10-03T12:00:00Z"
    row = env["store"].invites[inv["invite_id"]]
    assert row["token_hash"] == invites.hash_token(tok)
    assert tok not in str(row)  # the raw token is never persisted


def test_tokens_are_unique(env):
    assert len({token_of(create(env)) for _ in range(10)}) == 10


def test_resolve_shows_sender(env):
    inv = create(env, note="hi")
    r = env["call"]("GET", f"/invites/resolve/{token_of(inv)}", BOB)
    assert r.status_code == 200
    body = r.json()
    assert body["sender"] == {"user_id": ALICE, "name": "Alice A.", "photo_url": "https://x/a.png", "headline": "ML @ GT"}
    assert body["note"] == "hi" and body["is_own"] is False and body["already_connected"] is False


def test_resolve_unknown_token(env):
    r = env["call"]("GET", "/invites/resolve/nope", BOB)
    assert r.status_code == 404 and r.json() == {"error": "not_found"}


def test_accept_connects_with_how_met_invite(env):
    inv = create(env)
    r = env["call"]("POST", f"/invites/{token_of(inv)}/respond", BOB, json={"response": "accept"})
    assert r.status_code == 200
    assert r.json() == {"status": "connected", "connection": {"user_id": ALICE, "name": "Alice A."}}
    key = tuple(sorted((ALICE, BOB)))
    assert env["store"].connections[key] == {"how_met": "invite", "invite_id": inv["invite_id"]}
    row = env["store"].invites[inv["invite_id"]]
    assert row["status"] == "accepted" and row["used_by"] == BOB


def test_invite_is_single_use(env):
    tok = token_of(create(env))
    env["call"]("POST", f"/invites/{tok}/respond", BOB, json={"response": "accept"})
    r = env["call"]("POST", f"/invites/{tok}/respond", CARL, json={"response": "accept"})
    assert r.status_code == 410
    assert env["store"].connection_exists(ALICE, CARL) is False


def test_decline_leaves_no_trace(env):
    inv = create(env)
    before = dict(env["store"].invites[inv["invite_id"]])
    r = env["call"]("POST", f"/invites/{token_of(inv)}/respond", BOB, json={"response": "decline"})
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert env["store"].invites[inv["invite_id"]] == before
    assert env["store"].connections == {}
    # The sender's list looks exactly like an ignored invite.
    listed = env["call"]("GET", "/invites", ALICE).json()["invites"][0]
    assert listed["status"] == "active"


def test_self_invite_rejected(env):
    tok = token_of(create(env))
    assert env["call"]("GET", f"/invites/resolve/{tok}", ALICE).json()["is_own"] is True
    r = env["call"]("POST", f"/invites/{tok}/respond", ALICE, json={"response": "accept"})
    assert r.status_code == 400 and r.json() == {"error": "self_invite"}


def test_expires_after_seven_days(env):
    tok = token_of(create(env))
    env["clock"]["now"] = T0 + timedelta(days=7, seconds=1)
    assert env["call"]("GET", f"/invites/resolve/{tok}", BOB).status_code == 410
    r = env["call"]("POST", f"/invites/{tok}/respond", BOB, json={"response": "accept"})
    assert r.status_code == 410 and r.json() == {"error": "expired"}
    assert env["call"]("GET", "/invites", ALICE).json()["invites"][0]["status"] == "expired"


def test_still_valid_just_before_expiry(env):
    tok = token_of(create(env))
    env["clock"]["now"] = T0 + timedelta(days=6, hours=23)
    assert env["call"]("GET", f"/invites/resolve/{tok}", BOB).status_code == 200


def test_revoke(env):
    inv = create(env)
    assert env["call"]("DELETE", f"/invites/{inv['invite_id']}", ALICE).json() == {"ok": True}
    r = env["call"]("POST", f"/invites/{token_of(inv)}/respond", BOB, json={"response": "accept"})
    assert r.status_code == 410
    assert env["store"].connections == {}


def test_cannot_revoke_someone_elses_invite(env):
    inv = create(env)
    r = env["call"]("DELETE", f"/invites/{inv['invite_id']}", BOB)
    assert r.status_code == 404
    assert env["store"].invites[inv["invite_id"]]["status"] == "active"


def test_rate_limit_ten_per_day(env):
    for _ in range(10):
        create(env)
    r = env["call"]("POST", "/invites", ALICE, json={})
    assert r.status_code == 429 and r.json() == {"error": "rate_limited"}
    # Other users are unaffected.
    create(env, user=BOB)
    # Rolling window: a day later Alice can invite again.
    env["clock"]["now"] = T0 + timedelta(days=1, seconds=1)
    create(env)


def test_revoked_invites_still_count_toward_limit(env):
    for _ in range(10):
        inv = create(env)
        env["call"]("DELETE", f"/invites/{inv['invite_id']}", ALICE)
    assert env["call"]("POST", "/invites", ALICE, json={}).status_code == 429


def test_blocked_pair_sees_not_found(env):
    tok = token_of(create(env))
    env["store"].blocks.add((ALICE, BOB))
    assert env["call"]("GET", f"/invites/resolve/{tok}", BOB).status_code == 404
    r = env["call"]("POST", f"/invites/{tok}/respond", BOB, json={"response": "accept"})
    assert r.status_code == 404
    assert env["store"].connections == {}


def test_accept_when_already_connected_is_idempotent(env):
    env["store"].insert_connection(*sorted((ALICE, BOB)), "in_person", None)
    tok = token_of(create(env))
    assert env["call"]("GET", f"/invites/resolve/{tok}", BOB).json()["already_connected"] is True
    r = env["call"]("POST", f"/invites/{tok}/respond", BOB, json={"response": "accept"})
    assert r.json()["status"] == "connected"
    assert env["store"].connections[tuple(sorted((ALICE, BOB)))]["how_met"] == "in_person"


def test_list_never_exposes_token_or_hash(env):
    tok = token_of(create(env, recipient_hint="Sam from lab"))
    body = env["call"]("GET", "/invites", ALICE).json()
    assert tok not in str(body) and "token_hash" not in str(body)
    assert body["invites"][0]["recipient_hint"] == "Sam from lab"
    # Another user's list is empty.
    assert env["call"]("GET", "/invites", BOB).json() == {"invites": []}


def test_bad_bodies_rejected(env):
    assert env["call"]("POST", "/invites", ALICE, json={"channel": "sms"}).status_code == 422
    tok = token_of(create(env))
    assert env["call"]("POST", f"/invites/{tok}/respond", BOB, json={"response": "maybe"}).status_code == 422
