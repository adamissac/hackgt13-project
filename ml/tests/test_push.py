"""AD10 push sender: notifications -> Expo, token cleanup, no re-sends, safe text."""
import httpx
import pytest

from conftest import add_event, seed_person


@pytest.fixture
def expo(monkeypatch):
    from app import push
    calls = []
    replies = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append(json)
        data = [replies.get(m["to"], {"status": "ok", "id": "x"}) for m in json]
        return httpx.Response(200, json={"data": data}, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(push, "_mark", None)
    return calls, replies


def token(db, uid, tok):
    db.execute("insert into push_tokens (user_id, token, platform) values (%s, %s, 'ios')", (uid, tok))


def test_sends_new_notifications_once(db, expo):
    from app import push, social
    calls, replies = expo
    ev = add_event(db)
    a = seed_person(db, "Ana Diaz", [("robotics", "technical", 0.9)], event_id=ev)
    b = seed_person(db, "Ben Ong", [("robotics", "technical", 0.9)], event_id=ev)
    c = seed_person(db, "Cy NoPhone", [("robotics", "technical", 0.9)])
    token(db, a, "ExponentPushToken[a1]")
    token(db, a, "ExponentPushToken[a2]")
    token(db, b, "ExponentPushToken[dead]")
    with db.conn() as conn:
        social.notify(conn, a, "connected", {"other_user_id": b})       # before the worker started: never sent
    assert push.tick() == 0 and calls == []
    lo, hi = sorted([a, b])
    sid = db.fetchone("insert into suggestions (user_a, user_b, context, shared_topics) values "
                      "(%s, %s, 'event', '[{\"name\": \"robotics\"}]') returning id", (lo, hi))["id"]
    with db.conn() as conn:
        for u in (a, b, c):
            social.notify(conn, u, "suggestion", {"suggestion_id": sid})
    replies["ExponentPushToken[dead]"] = {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}
    assert push.tick() == 2                                              # a's two phones; b's token is dead; c has none
    msgs = calls[0]
    assert {m["to"] for m in msgs} == {"ExponentPushToken[a1]", "ExponentPushToken[a2]", "ExponentPushToken[dead]"}
    to_a = next(m for m in msgs if m["to"] == "ExponentPushToken[a1]")
    assert to_a["title"] == "Do you want to meet Ben?" and to_a["body"] == "You both like robotics."
    assert "Ong" not in str(msgs) and to_a["data"]["kind"] == "suggestion"
    assert db.fetchone("select count(*) n from push_tokens where user_id = %s", (b,))["n"] == 0
    assert push.tick() == 0 and len(calls) == 1                          # nothing new: no re-send


def test_message_text_per_kind(db):
    from app.push import message_for
    b = seed_person(db, "Ben Ong", [("robotics", "technical", 0.9)])
    assert message_for("connect_prompt", {"other_user_id": b})[0] == "How was your conversation with Ben?"
    assert message_for("connected", {"other_user_id": b})[0] == "You're connected with Ben"
    assert message_for("suggestion", {"status": "matched", "other_user_id": b})[0] == "You and Ben both said yes"
