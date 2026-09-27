import json
import time
import uuid

import pytest
from pydantic import ValidationError
from app import gps, qr
from app.errors import ApiError
from conftest import auth, seed_person


def fix(**kwargs):
    return gps.Fix(latitude=33.7756, longitude=-84.3963, accuracy=5,
                   timestamp=kwargs.pop("timestamp", time.time()), **kwargs)


def test_encrypted_roundtrip_and_tamper():
    uid = str(uuid.uuid4())
    token = gps.issue(uid, fix())
    assert uid not in token["code"] and "33.7756" not in token["code"]
    signed = gps.check(token["code"], fix())
    assert qr.verify(signed["payload"], signed["signature"])[0] == uid
    with pytest.raises(ApiError):
        gps.check(token["code"][:-5] + "xxxxx", fix())


@pytest.mark.parametrize("kwargs", [{"timestamp": 1}, {"timestamp": time.time()+3600}, {"mocked": True}])
def test_reject_stale_future_mocked(kwargs):
    with pytest.raises(ApiError):
        gps.issue(str(uuid.uuid4()), fix(**kwargs))


def test_accuracy_and_bounds():
    for field, value in [("latitude", 91), ("longitude", 181), ("accuracy", 26), ("accuracy", -1), ("latitude", float("nan"))]:
        data = fix().model_dump(); data[field] = value
        with pytest.raises(ValidationError):
            gps.Fix(**data)


def test_far_and_expired_and_accuracy_cannot_expand_radius():
    token = gps.issue(str(uuid.uuid4()), fix())
    far = fix().model_copy(update={"latitude": 34})
    with pytest.raises(ApiError): gps.check(token["code"], far)
    # Both uncertain by 25m: even ~11m apart cannot pass the conservative 50m cap.
    uncertain = fix().model_copy(update={"accuracy": 25})
    token2 = gps.issue(str(uuid.uuid4()), uncertain)
    with pytest.raises(ApiError): gps.check(token2["code"], uncertain.model_copy(update={"latitude": 33.7757}))
    raw = gps.cipher().decrypt(token["code"].encode())
    expired = gps.cipher().encrypt_at_time(raw, int(time.time()) - 61).decode()
    with pytest.raises(ApiError): gps.check(expired, fix())
    data = json.loads(raw); data["fix"]["timestamp"] = time.time() - 61
    stale = gps.cipher().encrypt(json.dumps(data).encode()).decode()
    with pytest.raises(ApiError): gps.check(stale, fix())


def test_gps_routes_require_auth(client):
    assert client.post("/proximity/token", json=fix().model_dump()).status_code == 401
    assert client.post("/proximity/verify", json={"code": "x", "location": fix().model_dump()}).status_code == 401


def test_gps_one_use_self_block_and_bilateral_consent(dbclient, db):
    a = seed_person(db, "Ana", [])
    b = seed_person(db, "Ben", [])
    location = fix().model_dump()
    code = dbclient.post("/proximity/token", headers=auth(a), json=location).json()["code"]
    body = {"code": code, "location": location}
    assert dbclient.post("/proximity/verify", headers=auth(a), json=body).status_code == 400
    result = dbclient.post("/proximity/verify", headers=auth(b), json=body)
    assert result.status_code == 200
    assert dbclient.post("/proximity/verify", headers=auth(b), json=body).status_code == 409
    conv = result.json()["conversation_id"]
    dbclient.post(f"/conversations/{conv}/feedback", headers=auth(a), json={"wants_connect": True})
    assert db.fetchone("select count(*) as n from connections")["n"] == 0
    dbclient.post(f"/conversations/{conv}/feedback", headers=auth(b), json={"wants_connect": True})
    assert db.fetchone("select count(*) as n from connections")["n"] == 1
    with db.conn() as c:
        c.execute("insert into blocks(blocker_id, blocked_id) values (%s,%s)", (a,b))
    code = dbclient.post("/proximity/token", headers=auth(a), json=location).json()["code"]
    assert dbclient.post("/proximity/verify", headers=auth(b), json={"code":code,"location":location}).status_code == 403
