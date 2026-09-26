"""AL1: service shell, JWT verification, error shape, DB pool."""
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from conftest import auth, make_token


def test_health_is_public(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_missing_token_is_401_with_error_shape(client):
    r = client.get("/whoami")
    assert r.status_code == 401
    assert r.json() == {"error": "missing bearer token"}


def test_valid_token_returns_sub(client):
    uid = str(uuid.uuid4())
    r = client.get("/whoami", headers=auth(uid))
    assert r.status_code == 200 and r.json() == {"user_id": uid}


@pytest.mark.parametrize("token,msg", [
    (make_token(exp_in=-10), "token expired"),
    (make_token(aud="anon"), "invalid token"),
    (make_token(secret="wrong-secret-wrong-secret-wrong-secret!!"), "invalid token"),
    (make_token(sub="not-a-uuid"), "invalid token"),
    ("garbage", "invalid token"),
])
def test_bad_tokens_rejected(client, token, msg):
    r = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401 and r.json() == {"error": msg}


def test_jwks_mode_verifies_asymmetric_token(client, monkeypatch):
    """Newer Supabase projects sign with ES256 keys from the JWKS endpoint."""
    from app import auth as appauth, settings
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    settings.reset_settings()
    key = ec.generate_private_key(ec.SECP256R1())

    class FakeJWKS:
        def get_signing_key_from_jwt(self, _token):
            return type("K", (), {"key": key.public_key()})()

    monkeypatch.setattr(appauth, "_jwks", lambda: FakeJWKS())
    uid = str(uuid.uuid4())
    now = int(time.time())
    good = jwt.encode({"sub": uid, "aud": "authenticated", "exp": now + 60,
                       "iss": "https://example.supabase.co/auth/v1"}, key, algorithm="ES256")
    assert appauth.verify_token(good).id == uid
    wrong_iss = jwt.encode({"sub": uid, "aud": "authenticated", "exp": now + 60,
                            "iss": "https://evil.example/auth/v1"}, key, algorithm="ES256")
    with pytest.raises(appauth.ApiError):
        appauth.verify_token(wrong_iss)
    settings.reset_settings()


def test_health_reports_db(dbclient):
    assert dbclient.get("/health").json() == {"ok": True, "db": True}


def test_transaction_pooler_disables_prepared_statements():
    from app.db import _uses_transaction_pooler
    assert _uses_transaction_pooler("postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres")
    assert not _uses_transaction_pooler("postgresql://u:p@db.x.supabase.co:5432/postgres")


def test_dotenv_comment_values_are_treated_as_unset(tmp_path, monkeypatch):
    """`KEY=   # note` in a .env must not become the value "# note" (it broke JWT checks locally)."""
    from app.settings import _drop_comment_values
    env = tmp_path / ".env"
    env.write_text("FC_T_COMMENT=   # just a note\nFC_T_REAL=value   # trailing note\n")
    monkeypatch.setenv("FC_T_COMMENT", "# just a note")
    monkeypatch.setenv("FC_T_REAL", "value")
    _drop_comment_values(str(env))
    import os
    assert "FC_T_COMMENT" not in os.environ and os.environ["FC_T_REAL"] == "value"
