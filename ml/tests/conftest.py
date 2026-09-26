"""Shared test fixtures.

DB tests need a throwaway Postgres with pgvector. Point TEST_DATABASE_URL at an empty database
(it is wiped and rebuilt from docs/schema.sql). Without it, DB tests skip.
  e.g. TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test
"""
import os
import sys
import time
import uuid
from pathlib import Path

import jwt
import pytest

ML_DIR = Path(__file__).resolve().parents[1]
REPO = ML_DIR.parent
sys.path.insert(0, str(ML_DIR))

TEST_SECRET = "test-jwt-secret-at-least-32-bytes-long!!"
os.environ.update({
    "SUPABASE_JWT_SECRET": TEST_SECRET,
    "SUPABASE_URL": "https://example.supabase.co",
    "RUN_WORKERS": "0",
    "LOAD_EMBEDDER": "0",
    "QR_SIGNING_KEY": "test-qr-signing-key",
    "DATABASE_URL": "",
})
TEST_DB = os.getenv("TEST_DATABASE_URL", "")


def make_token(sub: str | None = None, *, exp_in: int = 3600, aud: str = "authenticated",
               secret: str = TEST_SECRET, **extra) -> str:
    now = int(time.time())
    claims = {"sub": sub or str(uuid.uuid4()), "aud": aud, "exp": now + exp_in, "iat": now,
              "role": "authenticated", **extra}
    return jwt.encode(claims, secret, algorithm="HS256")


def auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {make_token(sub)}"}


def _reset_schema(url: str) -> None:
    import psycopg
    sql_files = [ML_DIR / "tests/sql/auth_stub.sql", REPO / "docs/schema.sql"]
    extra = sorted((ML_DIR / "migrations").glob("*.sql")) if (ML_DIR / "migrations").exists() else []
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("drop schema if exists public cascade; create schema public;"
                  "drop schema if exists auth cascade;")
        for f in sql_files + extra:
            c.execute(f.read_text())


@pytest.fixture(scope="session")
def db_url():
    if not TEST_DB:
        pytest.skip("TEST_DATABASE_URL not set")
    _reset_schema(TEST_DB)
    return TEST_DB


@pytest.fixture
def client():
    """App client without a database."""
    from fastapi.testclient import TestClient
    from app import settings
    settings.reset_settings()
    from app.main import create_app
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def db(db_url):
    """Open the pool against the test DB and empty every table between tests."""
    from app import db as appdb
    appdb.close_pool()
    appdb.open_pool(db_url, max_size=4)
    with appdb.conn() as c:
        tables = [r["tablename"] for r in c.execute(
            "select tablename from pg_tables where schemaname='public'").fetchall()]
        c.execute("truncate " + ", ".join(f'public."{t}"' for t in tables) + " restart identity cascade")
        c.execute("truncate auth.users cascade")
    yield appdb
    appdb.close_pool()


@pytest.fixture
def dbclient(db):
    from fastapi.testclient import TestClient
    from app import settings
    settings.reset_settings()
    from app.main import create_app
    with TestClient(create_app()) as c:
        yield c


def add_user(db, name="Test User", role="student", **cols) -> str:
    uid = str(uuid.uuid4())
    db.execute("insert into auth.users (id) values (%s)", (uid,))
    fields = {"id": uid, "name": name, "role": role, **cols}
    keys = ", ".join(fields)
    db.execute(f"insert into profiles ({keys}) values ({', '.join(['%s'] * len(fields))})",
               list(fields.values()))
    return uid


def seed_person(db, name, interests, *, role="student", seeking="", offering="", event_id=None,
                source="manual", summary=None) -> str:
    """A user with extracted interests stored through the real pipeline (no LLM).
    interests: [(name, facet, strength)]"""
    from app import profile_store
    from ml.extraction import ExtractResult, ExtractedInterest
    uid = add_user(db, name=name, role=role, seeking=seeking, offering=offering)
    result = ExtractResult(
        interests=[ExtractedInterest(name=n, facet=f, strength=s, evidence=f"{name}: {n}") for n, f, s in interests],
        seeking=seeking, offering=offering, summary=summary or {})
    with db.conn() as c:
        doc_id = profile_store.save_document(c, uid, source, "seeded", {"synthetic": True})
    profile_store.store_extraction(uid, doc_id, source, result)
    if event_id is not None:
        db.execute("insert into attendance (event_id, user_id) values (%s, %s)", (event_id, uid))
        from app import population
        population.invalidate()
    return uid


def add_event(db, name="HackGT 13") -> int:
    return db.fetchone("insert into events (name) values (%s) returning id", (name,))["id"]
