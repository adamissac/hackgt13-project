import urllib.parse

import pytest
from fastapi.testclient import TestClient

import main
from ml import github_ingest, github_oauth, github_routes, store, supa


class FakeDB:
    """In-memory stand-in for the PostgREST helpers in ml.supa."""

    def __init__(self):
        self.tables = {"linked_accounts": [], "raw_documents": [], "interests": [], "user_interests": [],
                       "profiles": [{"id": "user-1", "seeking": "", "offering": "already set"}]}

    def _match(self, row, params):
        for k, v in params.items():
            if k in ("select", "order", "limit"):
                continue
            op, _, val = v.partition(".")
            if op == "eq" and str(row.get(k)) != val:
                return False
            if op == "in" and row.get(k) not in [x.strip('"') for x in val.strip("()").split('","')]:
                return False
        return True

    def select(self, table, params):
        return [dict(r) for r in self.tables[table] if self._match(r, params)]

    def insert(self, table, rows):
        self.tables[table].extend(dict(r) for r in rows)
        return rows

    def upsert(self, table, rows, on_conflict):
        keys = on_conflict.split(",")
        out = []
        for r in rows:
            r = dict(r)
            if table == "interests" and "id" not in r:
                r["id"] = len(self.tables["interests"]) + 1
            hit = next((x for x in self.tables[table] if all(x.get(k) == r.get(k) for k in keys)), None)
            if hit:
                hit.update(r)
                out.append(hit)
            else:
                self.tables[table].append(r)
                out.append(r)
        return out

    def update(self, table, match, values):
        for r in self.tables[table]:
            if all(str(r.get(k)) == str(v) for k, v in match.items()):
                r.update(values)
        return []


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()
    for name in ("select", "insert", "upsert", "update"):
        monkeypatch.setattr(supa, name, getattr(fake, name))
    monkeypatch.setattr(supa, "verify_jwt", lambda t: "user-1" if t == "good-token" else (_ for _ in ()).throw(
        supa.SupabaseError(401, "bad")))
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "k" * 40)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("ML_API_URL", "https://ml.example.com")
    monkeypatch.delenv("APP_GITHUB_REDIRECT", raising=False)
    return fake


@pytest.fixture
def client():
    return TestClient(main.app)


EXTRACTION = {
    "interests": [
        {"name": "Reinforcement Learning", "facet": "technical", "strength": 0.9, "evidence": "repo rl-trader"},
        {"name": "rock climbing", "facet": "personal", "strength": 0.4, "evidence": "README mentions climbing"},
        {"name": "politics", "facet": "not-a-facet", "strength": 1, "evidence": "ignored"},
    ],
    "seeking": "quant internship",
    "offering": "RL projects",
}


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_start_requires_auth(client, db):
    r = client.get("/connect/github/start")
    assert r.status_code == 401 and "error" in r.json()


def test_start_returns_authorize_url(client, db):
    r = client.get("/connect/github/start", headers={"Authorization": "Bearer good-token"})
    q = urllib.parse.parse_qs(urllib.parse.urlparse(r.json()["url"]).query)
    assert q["scope"] == ["read:user"] and github_oauth.verify_state(q["state"][0]) == "user-1"


def test_callback_stores_encrypted_token_and_ingests(client, db, monkeypatch):
    monkeypatch.setattr(github_oauth, "exchange_code", lambda code: {"access_token": "gho_secret", "scope": "read:user"})
    monkeypatch.setattr(github_ingest, "get_user", lambda token: {"login": "octo"})
    ran = []
    monkeypatch.setattr(github_routes, "ingest_github", lambda uid: ran.append(uid))
    state = github_oauth.make_state("user-1")
    r = client.get(f"/connect/github/callback?code=abc&state={state}", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "formalconnect://connect/github?status=ok"
    row = db.tables["linked_accounts"][0]
    assert row["provider_uid"] == "octo" and "gho_secret" not in str(row)
    assert github_oauth.decrypt_token(row["access_token_enc"]) == "gho_secret"
    assert ran == ["user-1"]


def test_callback_rejects_forged_state(client, db):
    r = client.get("/connect/github/callback?code=abc&state=forged.sig", follow_redirects=False)
    assert r.status_code == 302 and "status=error" in r.headers["location"]
    assert db.tables["linked_accounts"] == []


def test_callback_user_cancel(client, db):
    r = client.get("/connect/github/callback?error=access_denied", follow_redirects=False)
    assert "reason=denied" in r.headers["location"]


def test_ingest_pipeline_produces_interests(db, monkeypatch):
    db.tables["linked_accounts"].append({"user_id": "user-1", "provider": "github", "provider_uid": "octo",
                                         "access_token_enc": github_oauth.encrypt_token("gho_x")})
    repos = [{"name": "rl-trader", "full_name": "octo/rl-trader", "owner": "octo", "description": "RL agent",
              "languages": {"Python": 100}, "topics": ["reinforcement-learning"], "readme": "An RL trading agent",
              "stars": 3, "fork": False, "pushed_at": "2026-09-01T00:00:00Z", "html_url": "https://github.com/octo/rl-trader"}]
    seen = {}
    monkeypatch.setattr(github_ingest, "fetch_repos", lambda token, cache=None: (seen.setdefault("t", token) and repos, {}))
    import ml.llm as llm
    monkeypatch.setattr(llm, "extract_interests", lambda text, source: (seen.setdefault("text", text), EXTRACTION)[1])

    out = github_routes.ingest_github("user-1")

    assert seen["t"] == "gho_x" and "rl-trader" in seen["text"]
    assert [i["name"] for i in out] == ["reinforcement learning", "rock climbing"]  # bad facet dropped
    ui = db.tables["user_interests"]
    assert len(ui) == 2 and all(r["evidence"] for r in ui)
    assert db.tables["raw_documents"][0]["source"] == "github"
    assert db.tables["profiles"][0]["seeking"] == "quant internship"   # empty box filled
    assert db.tables["profiles"][0]["offering"] == "already set"       # user's own text kept


def test_store_never_lowers_weight_or_touches_user_choices(db):
    store.store_extraction("user-1", "github", EXTRACTION)
    rl = next(r for r in db.tables["user_interests"] if r["interest_id"] == 1)
    rl.update(confirmed=True, hidden=False)
    before = rl["weight"]
    weaker = {"interests": [{"name": "reinforcement learning", "facet": "technical", "strength": 0.1, "evidence": "x"}]}
    store.store_extraction("user-1", "facebook", weaker)
    assert rl["weight"] == before and rl["confirmed"] is True
