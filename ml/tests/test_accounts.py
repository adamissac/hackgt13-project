"""Login + account connections: /me/accounts, PATCH /profile/manual, removing a source."""
import time
import uuid

import jwt
import pytest

from conftest import TEST_SECRET, add_user, auth, seed_person
from ml import extraction
from ml.extraction import ExtractResult, ExtractedInterest


@pytest.fixture
def llm(monkeypatch):
    seen = []

    def fake(text, source):
        seen.append(text)
        return ExtractResult(interests=[ExtractedInterest(name="robotics", facet="technical", strength=0.8,
                                                          evidence="typed: robotics")])
    monkeypatch.setattr(extraction, "_call_once", fake)
    return seen


def token_with_provider(uid, provider, email=None):
    now = int(time.time())
    claims = {"sub": uid, "aud": "authenticated", "exp": now + 600, "role": "authenticated",
              "app_metadata": {"provider": provider}, **({"email": email} if email else {})}
    return {"Authorization": f"Bearer {jwt.encode(claims, TEST_SECRET, algorithm='HS256')}"}


def test_accounts_overview_new_user(dbclient, db):
    uid = add_user(db, name="Maya Rao")
    body = dbclient.get("/me/accounts", headers=token_with_provider(uid, "linkedin_oidc", "maya@x.edu")).json()
    assert body["sign_in"] == {"provider": "linkedin", "email": "maya@x.edu"}
    assert body["profile"]["name"] == "Maya Rao" and body["profile"]["headline"] == ""
    src = body["sources"]
    assert src["github"]["connected"] is False and src["github"]["login"] is None
    assert src["resume"]["added"] is False and src["manual"]["added"] is False
    assert src["facebook"] == {"available": False, "connected": False}
    assert "token" not in str(body).lower()


def test_manual_entry_saves_fields_and_extracts(dbclient, db, llm):
    uid = add_user(db)
    r = dbclient.patch("/profile/manual", headers=auth(uid), json={
        "headline": "CS @ Georgia Tech", "experience": "Robotics lab, 2 years", "interests_text": "I build robots",
        "seeking": "robotics internship", "offering": "ROS help"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "queued" and out["job_id"]
    assert out["profile"] == {"headline": "CS @ Georgia Tech", "experience": "Robotics lab, 2 years",
                              "seeking": "robotics internship", "offering": "ROS help", "interests_text": "I build robots"}
    assert "Headline: CS @ Georgia Tech" in llm[0] and "I build robots" in llm[0] and "Looking for: robotics internship" in llm[0]
    # editing just the headline keeps the typed interests in the next extraction
    dbclient.patch("/profile/manual", headers=auth(uid), json={"headline": "MS student"})
    assert "I build robots" in llm[1] and "Headline: MS student" in llm[1]
    acc = dbclient.get("/me/accounts", headers=auth(uid)).json()
    assert acc["profile"]["headline"] == "MS student"
    assert acc["sources"]["manual"]["added"] and acc["sources"]["manual"]["interests"] == 1


def test_manual_entry_with_nothing_to_extract(dbclient, db, llm):
    uid = add_user(db)
    out = dbclient.patch("/profile/manual", headers=auth(uid), json={}).json()
    assert out["job_id"] is None and out["status"] == "nothing_to_extract" and llm == []


def test_github_status_and_disconnect_removes_derived_data(dbclient, db):
    uid = seed_person(db, "Gus", [("rust", "technical", 0.9)], source="github")
    seed_doc = db.fetchone("select id from raw_documents where user_id = %s and source = 'github'", (uid,))
    assert seed_doc
    db.execute("insert into linked_accounts (user_id, provider, provider_uid, access_token_enc, fetched_at) "
               "values (%s, 'github', 'gus-codes', 'enc', now())", (uid,))
    db.execute("insert into feed_items (author_id, kind, body) values (%s, 'github', 'pushed'), (%s, 'post', 'hi')",
               (uid, uid))
    gh = dbclient.get("/me/accounts", headers=auth(uid)).json()["sources"]["github"]
    assert gh["connected"] and gh["login"] == "gus-codes" and gh["added"] and gh["interests"] == 1
    assert gh["last_synced_at"]
    r = dbclient.delete("/profile/sources/github", headers=auth(uid))
    assert r.status_code == 200 and r.json()["removed"] == "github" and r.json()["interests"] == []
    assert db.fetchone("select count(*) n from linked_accounts where user_id = %s", (uid,))["n"] == 0
    assert db.fetchone("select count(*) n from raw_documents where user_id = %s and source = 'github'", (uid,))["n"] == 0
    kinds = [r["kind"] for r in db.fetchall("select kind from feed_items where author_id = %s", (uid,))]
    assert kinds == ["post"]                                   # only GitHub-derived items go


def test_removing_one_source_keeps_the_others(dbclient, db):
    uid = seed_person(db, "Ivy", [("genomics", "academic", 0.9)], source="resume")
    from app import profile_store
    with db.conn() as c:
        doc = profile_store.save_document(c, uid, "manual", "typed", {})
    profile_store.store_extraction(uid, doc, "manual", ExtractResult(
        interests=[ExtractedInterest(name="pottery", facet="personal", strength=0.7, evidence="typed")]))
    dbclient.patch("/profile/interests", headers=auth(uid), json={"add": [{"name": "chess", "facet": "personal"}]})
    left = dbclient.delete("/profile/sources/resume", headers=auth(uid)).json()
    assert sorted(i["name"] for i in left["interests"]) == ["chess", "pottery"]   # review-screen adds survive
    assert dbclient.delete("/profile/sources/linkedin", headers=auth(uid)).status_code == 422


def test_accounts_needs_auth(dbclient):
    assert dbclient.get("/me/accounts").status_code == 401
