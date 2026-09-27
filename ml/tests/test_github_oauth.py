import urllib.parse

import pytest

from ml import github_oauth as go


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "test-key-not-secret-" + "x" * 20)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("ML_API_URL", "https://ml.example.com/")


def test_state_round_trip():
    assert go.verify_state(go.make_state("user-1")) == "user-1"


def test_state_expires():
    s = go.make_state("user-1", now=1000)
    with pytest.raises(go.OAuthError, match="expired"):
        go.verify_state(s, now=1000 + go.STATE_TTL_S + 1)


def test_state_tamper_rejected():
    body, sig = go.make_state("user-1").split(".")
    forged_body = go._b64(b'{"u":"attacker","exp":9999999999,"n":"x"}')
    for bad in (f"{forged_body}.{sig}", f"{body}.{sig[:-2]}AA", "garbage", None):
        with pytest.raises(go.OAuthError):
            go.verify_state(bad)


def test_state_bound_to_key(monkeypatch):
    s = go.make_state("user-1")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "a-different-key-" + "y" * 20)
    with pytest.raises(go.OAuthError):
        go.verify_state(s)


def test_token_encryption_round_trip_and_no_plaintext():
    row = go.linked_account_row("user-1", {"access_token": "gho_plaintext123", "scope": "read:user"}, "octocat")
    assert "gho_plaintext123" not in str(row)
    assert go.decrypt_token(row["access_token_enc"]) == "gho_plaintext123"
    assert row["provider"] == "github" and row["scopes"] == "read:user"


def test_authorize_url_minimal_scope():
    q = urllib.parse.parse_qs(urllib.parse.urlparse(go.authorize_url("user-1")).query)
    assert q["scope"] == ["read:user"]
    assert q["redirect_uri"] == ["https://ml.example.com/connect/github/callback"]
    assert go.verify_state(q["state"][0]) == "user-1"


def test_return_address_is_signed_into_state_and_only_app_links_allowed():
    from ml import github_oauth as g
    expo = "exp://abc-anonymous-8082.exp.direct/--/connect/github"
    assert g.state_data(g.make_state("u1", return_to=expo))["r"] == expo
    assert g.app_redirect("ok", return_to=expo) == expo + "?status=ok"
    for bad in ("https://evil.example/connect/github", "exp://x/--/other", "javascript:alert(1)",
                "exp://x/--/connect/github?next=https://evil.example"):
        assert "r" not in g.state_data(g.make_state("u1", return_to=bad))
        assert g.app_redirect("ok", return_to=bad).startswith(g.DEFAULT_APP_REDIRECT)
    assert g.app_redirect("error", reason="denied").startswith("formalconnect://connect/github?")
