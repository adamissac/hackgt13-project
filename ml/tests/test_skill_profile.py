"""Skill-profile builder (docs/ONBOARDING.md): taxonomy, manifests, resume structure, composition,
versioning + idempotency (DB), and matching reading the active profile (DB)."""
import io
import json
from datetime import date

import pytest

from ml import skill_taxonomy as tx
from ml.resume_structure import Job, ResumeStructure, docx_to_text, heuristic_structure, is_docx, years_of_experience
from app.skill_profile import compose_profile, input_hash


# ---------------------------------------------------------------- taxonomy
@pytest.mark.parametrize("raw", ["JS", "Javascript", "ECMAScript", " javascript "])
def test_aliases_normalize_to_one_skill(raw):
    assert tx.normalize_skill(raw) == "javascript"


def test_manifest_frameworks():
    pkg = json.dumps({"dependencies": {"react": "^19", "express": "4"}, "devDependencies": {"jest": "29"}})
    assert tx.frameworks_from_manifest("package.json", pkg) == ["react", "express", "jest"]
    req = "fastapi==0.115\ntorch>=2 # ml\n-e .\nscikit-learn\n"
    assert tx.frameworks_from_manifest("requirements.txt", req) == ["fastapi", "pytorch", "scikit-learn"]
    cargo = '[package]\nname="x"\n[dependencies]\ntokio = { version = "1" }\nserde = "1"\n'
    assert tx.frameworks_from_manifest("Cargo.toml", cargo) == ["tokio", "serde"]
    gomod = "module x\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n"
    assert tx.frameworks_from_manifest("go.mod", gomod) == ["gin"]
    py = '[project]\ndependencies = ["django>=5", "pandas"]\n'
    assert tx.frameworks_from_manifest("pyproject.toml", py) == ["django", "pandas"]
    assert tx.frameworks_from_manifest("package.json", "{not json") == []


def test_domains():
    assert tx.domains_for(["PyTorch", "fastapi", "react"])[:1] in (["ml"], ["backend"], ["frontend"])
    assert set(tx.domains_for(["pytorch", "tensorflow", "fastapi"])) == {"ml", "backend"}
    assert tx.domains_for([]) == []


# ---------------------------------------------------------------- resume structure
def test_years_merge_overlapping_jobs():
    jobs = [Job(start="2021-01", end="2022-01"), Job(start="2021-06", end="2023-01"), Job(start="2024-01", end="2024-07")]
    assert years_of_experience(jobs, today=date(2025, 1, 1)) == 2.5
    assert years_of_experience([Job(title="no dates")]) is None


def test_heuristic_resume_sections():
    text = ("Jane Doe\nExperience\nML Intern at Acme, Jun 2023 - Aug 2023\nTA, Georgia Tech 2022 - present\n"
            "Skills\nLanguages: Python, JS, SQL\nCertifications\nAWS Cloud Practitioner\n")
    s = heuristic_structure(text)
    assert [j.start for j in s.experience] == ["Jun 2023", "2022"]
    assert "Python" in s.skills and "JS" in s.skills
    assert s.certifications == ["AWS Cloud Practitioner"]


def test_docx_resume_text():
    docx = pytest.importorskip("docx")
    d = docx.Document()
    d.add_paragraph("Skills")
    d.add_paragraph("Python, React")
    buf = io.BytesIO()
    d.save(buf)
    data = buf.getvalue()
    assert is_docx(data, "cv.docx")
    assert "Python, React" in docx_to_text(data)


# ---------------------------------------------------------------- composition (pure)
GITHUB = {
    "language_shares": {"Python": 0.7, "TypeScript": 0.29, "Makefile": 0.01},
    "repos": [
        {"name": "rag-eval", "stars": 12, "forks": 2, "frameworks": ["fastapi", "pytorch"], "pinned": True,
         "languages": ["Python"], "commits_52w": 80, "description": "RAG evaluation"},
        {"name": "site", "stars": 0, "frameworks": ["react"], "pinned": False, "languages": ["TypeScript"]},
    ],
}
RESUME = ResumeStructure(skills=["Python", "Docker"], experience=[Job(start="2022-01", end="2024-01")])


def test_compose_merges_sources_and_tags_both():
    p = compose_profile("u1", extractions={"github": [{"name": "python", "facet": "technical", "strength": 0.9, "interest_id": 7}]},
                        active_weights={7: 0.85}, github_meta=GITHUB, resume=RESUME, version=3, now="2026-09-26T00:00:00Z")
    skills = {s["name"]: s for s in p["skills"]}
    assert skills["python"]["sources"] == ["github", "resume"]           # tagged "both"
    assert skills["python"]["confidence"] > 0.9                            # noisy-or across sources
    assert skills["docker"]["sources"] == ["resume"]
    assert "makefile" not in skills                                        # under 2% of bytes
    assert {"fastapi", "pytorch", "react", "typescript"} <= set(skills)
    assert p["experience_years_estimate"] == 2.0
    assert "ml" in p["domains"] and "backend" in p["domains"]
    assert p["project_highlights"][0]["name"] == "rag-eval"                # pinned first
    assert p["profile_version"] == 3 and p["user_id"] == "u1"
    assert set(p) >= {"skills", "experience_years_estimate", "domains", "project_highlights", "generated_at", "profile_version"}


def test_hidden_interests_never_resurface():
    p = compose_profile("u1", extractions={"resume": [{"name": "cobol", "facet": "technical", "strength": 0.9, "interest_id": 9}]},
                        active_weights={}, github_meta=None, resume=None, version=1)
    assert p["skills"] == []


def test_no_sources_is_an_empty_profile_not_an_error():
    p = compose_profile("u1", extractions={}, active_weights={}, github_meta=None, resume=None, version=1)
    assert p["skills"] == [] and p["domains"] == [] and p["experience_years_estimate"] is None


def test_input_hash_is_stable_and_sensitive():
    a = input_hash({"github": 1}, {1: 0.5})
    assert a == input_hash({"github": 1}, {1: 0.5000001})
    assert a != input_hash({"github": 2}, {1: 0.5})


# ---------------------------------------------------------------- DB: versioning, idempotency, matching
def test_versions_are_kept_and_reruns_are_idempotent(db):
    from conftest import seed_person
    from app import skill_profile
    uid = seed_person(db, "Ada", [("python", "technical", 0.9), ("climbing", "personal", 0.5)], source="github")
    v1 = db.fetchall("select version, is_active from user_skill_profiles where user_id = %s order by version", (uid,))
    assert v1 == [{"version": 1, "is_active": True}]
    skill_profile.build(uid, "rebuild")                       # same inputs: no new version
    assert db.fetchone("select count(*) n from user_skill_profiles where user_id = %s", (uid,))["n"] == 1
    seed = db.fetchone("select id from raw_documents where user_id = %s", (uid,))["id"]
    from app import profile_store
    from ml.extraction import ExtractResult, ExtractedInterest
    with db.conn() as c:
        doc = profile_store.save_document(c, uid, "resume", "cv", {})
    profile_store.store_extraction(uid, doc, "resume", ExtractResult(interests=[
        ExtractedInterest(name="rust", facet="technical", strength=0.8, evidence="cv")]))
    rows = db.fetchall("select version, is_active from user_skill_profiles where user_id = %s order by version", (uid,))
    assert rows == [{"version": 1, "is_active": False}, {"version": 2, "is_active": True}]   # history kept
    active = skill_profile.active_profile(uid)
    assert {"python", "rust"} <= {s["name"] for s in active["skills"]}
    assert db.fetchone("select onboarding_status from profiles where id = %s", (uid,))["onboarding_status"] == "complete"
    assert seed


def test_matching_reads_active_profile_and_tolerates_none(db):
    from conftest import add_user, seed_person
    from app import population
    uid = seed_person(db, "Grace", [("python", "technical", 0.9)], source="github")
    bare = add_user(db, "No Profile Yet")
    people, *_ = population.load_people([uid, bare])
    assert len(people) == 2 and people[1]["interests"] == {}              # no profile: empty, no error
