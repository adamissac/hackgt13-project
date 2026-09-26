"""AR1 GitHub connect routes on the real app (DB and extraction faked; no network)."""
import urllib.parse

import pytest
from fastapi.testclient import TestClient

from conftest import auth
from ml import github_ingest, github_oauth

USER = "11111111-1111-1111-1111-111111111111"


class FakeDB:
    def __init__(self):
        self.accounts = {}
        self.docs = []

    def execute(self, sql, params=None):
        if sql.startswith("insert into linked_accounts"):
            uid, login, enc, scopes = params
            self.accounts[uid] = {"provider_uid": login, "access_token_enc": enc, "scopes": scopes}

    def fetchone(self, sql, params=None):
        if "from linked_accounts" in sql:
            return self.accounts.get(params[0])
        return None


@pytest.fixture
def env(monkeypatch):
    from app.routers import github as gh
    fake = FakeDB()
    monkeypatch.setattr(gh.db, "execute", fake.execute)
    monkeypatch.setattr(gh.db, "fetchone", fake.fetchone)
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "k" * 40)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("ML_API_URL", "https://ml.example.com")
    monkeypatch.delenv("APP_GITHUB_REDIRECT", raising=False)
    return gh, fake


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_start_requires_auth(client, env):
    r = client.get("/connect/github/start")
    assert r.status_code == 401 and "error" in r.json()


def test_start_returns_authorize_url(client, env):
    r = client.get("/connect/github/start", headers=auth(USER))
    q = urllib.parse.parse_qs(urllib.parse.urlparse(r.json()["url"]).query)
    assert q["scope"] == ["read:user"]
    assert github_oauth.verify_state(q["state"][0]) == USER


def test_callback_stores_encrypted_token_and_ingests(client, env, monkeypatch):
    gh, fake = env
    monkeypatch.setattr(github_oauth, "exchange_code", lambda code: {"access_token": "gho_secret", "scope": "read:user"})
    monkeypatch.setattr(github_ingest, "get_user", lambda token: {"login": "octo"})
    ran = []
    monkeypatch.setattr(gh, "ingest_github", lambda uid: ran.append(uid))
    r = client.get(f"/connect/github/callback?code=abc&state={github_oauth.make_state(USER)}", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "formalconnect://connect/github?status=ok"
    row = fake.accounts[USER]
    assert row["provider_uid"] == "octo" and "gho_secret" not in str(row)
    assert github_oauth.decrypt_token(row["access_token_enc"]) == "gho_secret"
    assert ran == [USER]


def test_callback_rejects_forged_state(client, env):
    gh, fake = env
    r = client.get("/connect/github/callback?code=abc&state=forged.sig", follow_redirects=False)
    assert r.status_code == 302 and "status=error" in r.headers["location"]
    assert fake.accounts == {}


def test_callback_user_cancel(client, env):
    r = client.get("/connect/github/callback?error=access_denied", follow_redirects=False)
    assert "reason=denied" in r.headers["location"]


def test_session_token_requires_auth(client, env):
    r = client.post("/connect/github/session", json={"provider_token": "gho_x"})
    assert r.status_code == 401 and "error" in r.json()


def test_session_token_stores_encrypted_and_ingests(client, env, monkeypatch):
    """Signing in with GitHub should not make the user authorize GitHub a second time."""
    gh, fake = env
    monkeypatch.setattr(github_ingest, "get_user", lambda token: {"login": "octo"})
    ran = []
    monkeypatch.setattr(gh, "ingest_github", lambda uid: ran.append(uid))
    r = client.post("/connect/github/session", json={"provider_token": "gho_from_supabase"},
                    headers=auth(USER))
    assert r.status_code == 200 and r.json() == {"connected": True, "login": "octo"}
    row = fake.accounts[USER]
    assert row["provider_uid"] == "octo"
    assert "gho_from_supabase" not in str(row)          # stored encrypted, never in the clear
    assert github_oauth.decrypt_token(row["access_token_enc"]) == "gho_from_supabase"
    assert ran == [USER]


def test_session_token_validated_against_github(client, env, monkeypatch):
    """A token the client made up must not reach linked_accounts."""
    gh, fake = env

    def reject(token):
        raise github_ingest.GitHubError("401 Unauthorized")

    monkeypatch.setattr(github_ingest, "get_user", reject)
    r = client.post("/connect/github/session", json={"provider_token": "not-a-real-token"},
                    headers=auth(USER))
    assert r.status_code == 400 and r.json()["error"] == "github rejected that token"
    assert fake.accounts == {}


def test_session_token_rejects_empty(client, env):
    r = client.post("/connect/github/session", json={"provider_token": ""}, headers=auth(USER))
    assert r.status_code == 422


def test_ingest_uses_shared_pipeline(env, monkeypatch):
    gh, fake = env
    fake.accounts[USER] = {"access_token_enc": github_oauth.encrypt_token("gho_x")}
    repos = [{"name": "rl-trader", "full_name": "octo/rl-trader", "owner": "octo", "description": "RL agent",
              "languages": {"Python": 100}, "topics": ["reinforcement-learning"], "readme": "An RL trading agent",
              "stars": 3, "fork": False, "pushed_at": "2026-09-01T00:00:00Z", "html_url": "https://github.com/octo/rl-trader"}]
    seen = {}
    monkeypatch.setattr(gh.profile_store, "latest_document", lambda uid, src: None)
    monkeypatch.setattr(github_ingest, "fetch_repos", lambda token, cache=None: (seen.setdefault("token", token), (repos, {}))[1])
    monkeypatch.setattr(gh.profile_store, "ingest_text",
                        lambda uid, src, text, meta: seen.update(uid=uid, src=src, text=text, meta=meta) or {"interests": []})
    gh.ingest_github(USER)
    assert seen["token"] == "gho_x"
    assert seen["uid"] == USER and seen["src"] == "github" and "rl-trader" in seen["text"]
    assert seen["meta"]["repo_count"] == 1 and "gho_x" not in str(seen["meta"])
