"""AL6: QR signature/expiry/nonce, conversations, checklist, silent mutual connect, connections, follow-up."""
import time

import pytest

from conftest import add_event, add_user, auth, seed_person


@pytest.fixture
def pair(db):
    ev = add_event(db)
    a = seed_person(db, "Ana Diaz", [("reinforcement learning", "technical", 0.9), ("bouldering", "personal", 0.7),
                                      ("python", "technical", 0.9)], event_id=ev)
    b = seed_person(db, "Ben Ong", [("reinforcement learning", "technical", 0.8), ("bouldering", "personal", 0.6),
                                     ("python", "technical", 0.9)], event_id=ev)
    for i in range(4):     # make "python" common so it ranks last on the checklist
        seed_person(db, f"F{i}", [("python", "technical", 0.9)], event_id=ev)
    return ev, a, b


def scan(client, scanner, scanned, **extra):
    tok = client.get("/qr/verify-token", headers=auth(scanned)).json()
    return client.post("/qr/verify", headers=auth(scanner),
                       json={"payload": tok["payload"], "signature": tok["signature"], **extra})


# ---------------------------------------------------------------- QR security
def test_qr_roundtrip_and_tamper():
    from app import qr
    from app.errors import ApiError
    t = qr.sign("0b2c6d1e-1111-4222-8333-444455556666")
    assert qr.verify(t["payload"], t["signature"])[0] == "0b2c6d1e-1111-4222-8333-444455556666"
    other = qr.sign("0b2c6d1e-1111-4222-8333-444455556667")
    for payload, sig in ((t["payload"], other["signature"]), (other["payload"], t["signature"]), ("x", "y")):
        with pytest.raises(ApiError) as e:
            qr.verify(payload, sig)
        assert e.value.message == "invalid_signature"


def test_qr_expires_after_60s():
    from app import qr
    from app.errors import ApiError
    t = qr.sign("0b2c6d1e-1111-4222-8333-444455556666", now=time.time() - 61)
    with pytest.raises(ApiError) as e:
        qr.verify(t["payload"], t["signature"])
    assert e.value.message == "expired"


def test_qr_nonce_single_use_and_self_scan(dbclient, pair):
    ev, a, b = pair
    tok = dbclient.get("/qr/verify-token", headers=auth(b)).json()
    body = {"payload": tok["payload"], "signature": tok["signature"]}
    assert dbclient.post("/qr/verify", headers=auth(a), json=body).status_code == 200
    r = dbclient.post("/qr/verify", headers=auth(a), json=body)
    assert r.status_code == 409 and r.json() == {"error": "already_used"}
    mine = dbclient.get("/qr/verify-token", headers=auth(a)).json()
    r = dbclient.post("/qr/verify", headers=auth(a), json={"payload": mine["payload"], "signature": mine["signature"]})
    assert r.status_code == 400 and r.json() == {"error": "self_scan"}


# ---------------------------------------------------------------- conversations + checklist
def test_scan_creates_one_conversation_and_prompts(dbclient, db, pair):
    ev, a, b = pair
    r = scan(dbclient, a, b).json()
    assert set(r) == {"conversation_id", "handshake_id", "other", "checklist"}
    assert r["other"]["user_id"] == b and r["other"]["name"] == "Ben Ong"
    names = [c["name"] for c in r["checklist"]]
    assert names[:2] == ["reinforcement learning", "bouldering"] and names[-1] == "python"   # min(w)*idf order
    r2 = scan(dbclient, b, a).json()                                  # they scan each other
    assert r2["conversation_id"] == r["conversation_id"]
    conv = db.fetchone("select method, event_id, user_a::text a, user_b::text b from conversations")
    assert conv["method"] == "qr" and conv["event_id"] == ev and conv["a"] < conv["b"]
    prompts = db.fetchall("select user_id::text u from notifications where kind = 'connect_prompt'")
    assert sorted(p["u"] for p in prompts) == sorted([a, b])
    for u in (a, b):
        pend = dbclient.get("/conversations/pending", headers=auth(u)).json()["conversations"]
        assert [p["conversation_id"] for p in pend] == [r["conversation_id"]]


def test_checklist_only_for_participants(dbclient, db, pair):
    ev, a, b = pair
    cid = scan(dbclient, a, b).json()["conversation_id"]
    assert dbclient.get(f"/conversations/{cid}/checklist", headers=auth(a)).status_code == 200
    outsider = add_user(db)
    r = dbclient.get(f"/conversations/{cid}/checklist", headers=auth(outsider))
    assert r.status_code == 404 and r.json() == {"error": "conversation not found"}
    r = dbclient.post(f"/conversations/{cid}/feedback", headers=auth(outsider), json={"wants_connect": True})
    assert r.status_code == 404


# ---------------------------------------------------------------- silent mutual connect
def fb(client, cid, uid, yes, topics=()):
    return client.post(f"/conversations/{cid}/feedback", headers=auth(uid),
                       json={"talked_about": list(topics), "other_topic": "", "wants_connect": yes}).json()


@pytest.mark.parametrize("no_first", [True, False])
def test_one_no_leaves_no_trace(dbclient, db, pair, no_first):
    ev, a, b = pair
    cid = scan(dbclient, a, b).json()["conversation_id"]
    if no_first:
        assert fb(dbclient, cid, b, False) == {"status": "no_connection"}
        assert fb(dbclient, cid, a, True) == {"status": "waiting"}           # identical to "not answered yet"
    else:
        assert fb(dbclient, cid, a, True) == {"status": "waiting"}
        assert fb(dbclient, cid, b, False) == {"status": "no_connection"}
    assert db.fetchone("select count(*) n from connections")["n"] == 0
    assert db.fetchone("select count(*) n from notifications where kind = 'connected'")["n"] == 0
    assert db.fetchone("select count(*) n from notifications where user_id = %s", (a,))["n"] == 1   # just the prompt
    assert dbclient.get("/connections", headers=auth(a)).json() == {"connections": []}


def test_mutual_yes_connects(dbclient, db, pair):
    ev, a, b = pair
    r = scan(dbclient, a, b).json()
    cid, rl = r["conversation_id"], r["checklist"][0]["interest_id"]
    assert fb(dbclient, cid, a, True, [rl]) == {"status": "waiting"}
    out = fb(dbclient, cid, b, True)
    assert out["status"] == "connected" and out["connection"] == {"user_id": a, "name": "Ana Diaz"}
    c = db.fetchone("select how_met, conversation_id from connections")
    assert c == {"how_met": "in_person", "conversation_id": cid}
    assert db.fetchone("select origin from chats where id = %s", (out["chat_id"],))["origin"] == "connection"
    assert sorted(n["u"] for n in db.fetchall("select user_id::text u from notifications where kind = 'connected'")) \
        == sorted([a, b])
    conns = dbclient.get("/connections", headers=auth(a)).json()["connections"]
    assert len(conns) == 1 and conns[0]["user_id"] == b and conns[0]["how_met"] == "in_person"
    assert conns[0]["talked_about"] == ["reinforcement learning"] and conns[0]["met_at"] == "HackGT 13"
    assert dbclient.get("/conversations/pending", headers=auth(a)).json() == {"conversations": []}


def test_connections_are_private(dbclient, db, pair):
    ev, a, b = pair
    cid = scan(dbclient, a, b).json()["conversation_id"]
    fb(dbclient, cid, a, True)
    fb(dbclient, cid, b, True)
    c = seed_person(db, "Cara", [("chess", "personal", 0.5)])
    assert dbclient.get("/connections", headers=auth(c)).json() == {"connections": []}
    assert dbclient.get(f"/connections/{a}", headers=auth(c)).status_code == 404
    assert dbclient.get(f"/connections/{b}", headers=auth(a)).json()["shared_topics"][0] == "reinforcement learning"


def test_followup_draft(dbclient, db, pair, monkeypatch):
    from ml import generation
    ev, a, b = pair
    r = scan(dbclient, a, b).json()
    assert dbclient.post(f"/connections/{b}/followup-draft", headers=auth(a)).status_code == 404   # not yet connected
    fb(dbclient, r["conversation_id"], a, True, [r["checklist"][0]["interest_id"]])
    fb(dbclient, r["conversation_id"], b, True)
    monkeypatch.setattr(generation, "client", lambda: (_ for _ in ()).throw(RuntimeError("no key")))
    d = dbclient.post(f"/connections/{b}/followup-draft", headers=auth(a)).json()["draft"]
    assert d.startswith("Hi Ben,") and "reinforcement learning" in d
    seen = {}

    def fake(sender, other, talked, extra, shared):
        seen.update(sender=sender, other=other, talked=talked, shared=shared)
        return "Hi Ben, good talking RL."
    monkeypatch.setattr(generation, "followup_draft", fake)
    assert dbclient.post(f"/connections/{b}/followup-draft", headers=auth(a)).json() == {"draft": "Hi Ben, good talking RL."}
    assert seen["sender"] == "Ana" and seen["talked"] == ["reinforcement learning"]


def test_legacy_aliases(dbclient, db, pair):
    ev, a, b = pair
    tok = dbclient.get("/qr/token", headers=auth(b)).json()
    assert set(tok) == {"payload", "signature", "expires_at"}
    hs = dbclient.post("/handshake", headers=auth(a), json={**{k: tok[k] for k in ("payload", "signature")},
                                                           "event_id": ev}).json()
    assert {"handshake_id", "other", "checklist"} <= set(hs)
    assert dbclient.post("/feedback", headers=auth(a), json={"handshake_id": hs["handshake_id"],
                                                            "wants_connect": True}).json() == {"status": "waiting"}
    out = dbclient.post("/feedback", headers=auth(b), json={"handshake_id": hs["handshake_id"],
                                                           "wants_connect": True}).json()
    assert out["status"] == "connected"
