"""AL2: ingestion, extraction validation, canonicalization, weights, review-screen edits."""
import pytest
import pydantic

from conftest import add_user, auth
from ml import extraction
from ml.extraction import ExtractResult, ExtractedInterest, ExtractionError


def fake_result(*items, seeking="", offering="", summary=None):
    return ExtractResult(
        interests=[ExtractedInterest(name=n, facet=f, strength=s, evidence=f"evidence for {n}")
                   for n, f, s in items],
        seeking=seeking, offering=offering, summary=summary or {})


@pytest.fixture
def llm(monkeypatch):
    """Replace the single Claude call; returns a list you append results (or exceptions) to."""
    queue = []

    def fake_call(text, source):
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item
    monkeypatch.setattr(extraction, "_call_once", fake_call)
    return queue


def ingest_manual(client, uid, text="I build RL agents", **kw):
    r = client.post("/profile/ingest", headers=auth(uid), json={"source": "manual", "text": text, **kw})
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["status"] == "queued"
    return client.get(f"/profile/status?job_id={job['job_id']}", headers=auth(uid)).json()


def interests(client, uid):
    r = client.get("/profile/interests", headers=auth(uid))
    assert r.status_code == 200
    return r.json()


def test_manual_ingest_extracts_and_stores(dbclient, db, llm):
    uid = add_user(db)
    llm.append(fake_result(("reinforcement learning", "technical", 0.9), ("rock climbing", "personal", 0.6),
                           seeking="ML internships", offering="RL tutoring"))
    st = ingest_manual(dbclient, uid, seeking="quant research internship")
    assert st["status"] == "done" and st["error"] is None
    body = interests(dbclient, uid)
    names = [i["name"] for i in body["interests"]]
    assert names == ["reinforcement learning", "rock climbing"]          # sorted by weight
    top = body["interests"][0]
    assert set(top) == {"interest_id", "name", "facet", "weight", "source", "evidence", "confirmed", "hidden"}
    assert top["source"] == "manual" and top["evidence"] == "evidence for reinforcement learning"
    assert 0 < top["weight"] < 1
    assert body["seeking"] == "quant research internship"                 # typed goal wins
    assert body["offering"] == "RL tutoring"                              # extracted fills empty


def test_sensitive_interests_never_stored(dbclient, db, llm):
    uid = add_user(db)
    llm.append(fake_result(("church choir", "personal", 0.9), ("political science", "academic", 0.7),
                           ("democratic party organizing", "personal", 0.8), ("robotics", "technical", 0.8)))
    ingest_manual(dbclient, uid)
    names = {i["name"] for i in interests(dbclient, uid)["interests"]}
    assert names == {"political science", "robotics"}


def test_reingest_replaces_instead_of_double_counting(dbclient, db, llm):
    uid = add_user(db)
    llm.append(fake_result(("robotics", "technical", 0.8)))
    ingest_manual(dbclient, uid)
    w1 = interests(dbclient, uid)["interests"][0]["weight"]
    llm.append(fake_result(("robotics", "technical", 0.8)))
    ingest_manual(dbclient, uid)
    assert interests(dbclient, uid)["interests"][0]["weight"] == w1


def test_sources_combine_and_canonicalize(dbclient, db, llm):
    uid = add_user(db)
    llm.append(fake_result(("Robotics", "technical", 0.8)))
    ingest_manual(dbclient, uid)
    w_manual = interests(dbclient, uid)["interests"][0]["weight"]
    # a GitHub digest stored by the connect flow, then extracted on request
    db.execute("insert into raw_documents (user_id, source, text) values (%s, 'github', 'REPO ros-bot')", (uid,))
    llm.append(fake_result(("robotics", "technical", 0.8)))
    r = dbclient.post("/profile/ingest", headers=auth(uid), json={"source": "github"})
    assert r.status_code == 202
    rows = interests(dbclient, uid)["interests"]
    assert len(rows) == 1 and rows[0]["name"] == "robotics"               # same canonical interest
    assert rows[0]["weight"] > w_manual
    assert db.fetchone("select count(*) as n from interests")["n"] == 1


def test_github_requires_connection(dbclient, db, llm):
    uid = add_user(db)
    r = dbclient.post("/profile/ingest", headers=auth(uid), json={"source": "github"})
    assert r.status_code == 400 and r.json() == {"error": "connect github first"}


def test_review_confirm_hide_add(dbclient, db, llm):
    uid = add_user(db)
    llm.append(fake_result(("robotics", "technical", 0.5), ("chess", "personal", 0.5)))
    ingest_manual(dbclient, uid)
    before = {i["name"]: i for i in interests(dbclient, uid)["interests"]}
    r = dbclient.patch("/profile/interests", headers=auth(uid), json={
        "confirm": [before["robotics"]["interest_id"]], "hide": [before["chess"]["interest_id"]],
        "add": [{"name": "Film Photography", "facet": "personal"}]})
    assert r.status_code == 200, r.text
    after = {i["name"]: i for i in r.json()["interests"]}
    assert after["robotics"]["confirmed"] and after["robotics"]["weight"] > before["robotics"]["weight"]
    assert after["chess"]["hidden"]
    assert after["film photography"]["confirmed"] and after["film photography"]["evidence"] == "Added by you"
    # a later re-extraction keeps the user's edits
    llm.append(fake_result(("robotics", "technical", 0.5), ("chess", "personal", 0.5)))
    ingest_manual(dbclient, uid)
    again = {i["name"]: i for i in interests(dbclient, uid)["interests"]}
    assert again["chess"]["hidden"] and again["robotics"]["confirmed"] and "film photography" in again


def test_cannot_add_sensitive_interest(dbclient, db):
    uid = add_user(db)
    r = dbclient.patch("/profile/interests", headers=auth(uid),
                       json={"add": [{"name": "bible study", "facet": "personal"}]})
    assert r.status_code == 400 and "sensitive" in r.json()["error"]


def test_extraction_retries_once_then_fails_loudly(dbclient, db, llm):
    uid = add_user(db)
    bad = pydantic.ValidationError.from_exception_data("ExtractResult", [])
    llm.extend([bad, fake_result(("robotics", "technical", 0.8))])
    assert ingest_manual(dbclient, uid)["status"] == "done"
    llm.extend([ExtractionError("no structured output returned"), bad])
    st = ingest_manual(dbclient, uid)
    assert st["status"] == "error" and st["error"].startswith("extraction failed after retry")


def test_job_status_is_private(dbclient, db, llm):
    a, b = add_user(db), add_user(db)
    llm.append(fake_result(("robotics", "technical", 0.8)))
    r = dbclient.post("/profile/ingest", headers=auth(a), json={"source": "manual", "text": "robots"})
    job_id = r.json()["job_id"]
    r = dbclient.get(f"/profile/status?job_id={job_id}", headers=auth(b))
    assert r.status_code == 404 and r.json() == {"error": "job not found"}


def _tiny_pdf(text: str) -> bytes:
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def test_resume_upload(dbclient, db, llm, monkeypatch):
    uid = add_user(db)
    seen = {}

    def fake_call(text, source):
        seen["text"], seen["source"] = text, source
        return fake_result(("computer vision", "technical", 0.9))
    monkeypatch.setattr(extraction, "_call_once", fake_call)
    r = dbclient.post("/profile/ingest", headers=auth(uid), data={"source": "resume"},
                      files={"file": ("resume.pdf", _tiny_pdf("Built computer vision pipelines"), "application/pdf")})
    assert r.status_code == 202, r.text
    assert "computer vision pipelines" in seen["text"] and seen["source"] == "resume"
    assert interests(dbclient, uid)["interests"][0]["source"] == "resume"
    r = dbclient.post("/profile/ingest", headers=auth(uid), data={"source": "resume"},
                      files={"file": ("x.pdf", b"not a pdf", "application/pdf")})
    assert r.status_code == 400 and r.json() == {"error": "file must be a PDF"}


def test_resume_uses_sonnet_and_bulk_uses_haiku():
    from ml.config import LLM_FAST, LLM_SMART
    assert extraction.model_for("resume") == LLM_SMART
    assert extraction.model_for("github") == LLM_FAST
