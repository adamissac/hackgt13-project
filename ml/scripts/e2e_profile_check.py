"""Live end-to-end check: resume (DOCX + PDF) and GitHub -> interests -> skill profile -> assistant.

Creates a throwaway account, exercises the deployed API and the real ingestion code, prints what a
user would see, then deletes the account (every row cascades). Needs the Railway env:

    cd ml && npx @railway/cli run .venv/bin/python scripts/e2e_profile_check.py [github_username]
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
import signal

# Being stopped (Ctrl+C, a killed background task, a CI timeout) must still run each script's `finally:` cleanup,
# or a throwaway test account stays in production and shows up as a match for real people.
for _sig in (signal.SIGTERM, signal.SIGHUP):
    signal.signal(_sig, lambda *_: sys.exit(1))

API = os.environ.get("E2E_API", "https://ml-production-04c0.up.railway.app")
SUPA = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE = os.environ["SUPABASE_SERVICE_KEY"]
ANON = os.environ["SUPABASE_ANON_KEY"]
GH_USER = sys.argv[1] if len(sys.argv) > 1 else "adamissac"


def http(method, url, body=None, headers=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Content-Type": ctype, **(headers or {})}
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            return e.code, json.loads(t)
        except ValueError:
            return e.code, {"raw": t[:300]}


def admin(method, path, body=None):
    return http(method, f"{SUPA}/auth/v1{path}", body, {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"})


def sample_docx() -> bytes:
    import docx
    d = docx.Document()
    for line in [
        "Jordan Test", "Experience",
        "ML Engineering Intern at Acme AI, Jun 2024 - Aug 2024",
        "Built a retrieval-augmented generation pipeline over support docs with LangChain and pgvector; cut escalations 18%.",
        "Undergraduate Researcher, Georgia Tech NLP Lab, Jan 2023 - present",
        "Fine-tuned transformer models in PyTorch for low-resource summarization.",
        "Education", "Georgia Tech, B.S. Computer Science, 2026",
        "Skills", "Languages: Python, TypeScript, SQL", "Tools: PyTorch, FastAPI, React Native, Docker",
        "Certifications", "AWS Certified Cloud Practitioner",
    ]:
        d.add_paragraph(line)
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def sample_pdf() -> bytes:
    """A minimal valid one-page PDF with a text layer (pdfplumber reads it)."""
    lines = ["Jordan Test - Resume", "Projects", "Quant backtester in Python with pandas and NumPy (2024)",
             "Skills: statistics, reinforcement learning, Go"]
    text = "BT /F1 12 Tf 72 720 Td 16 TL " + " ".join(f"({l}) '" for l in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(text)} >>\nstream\n{text}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def multipart(filename, data, mime):
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"source\"\r\n\r\nresume\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def wait_job(auth, job_id):
    for _ in range(90):
        _, s = http("GET", f"{API}/profile/status?job_id={job_id}", headers=auth)
        if s.get("status") in ("done", "error"):
            return s
        time.sleep(2)
    return {"status": "timeout"}


def main():
    email = f"e2e-{uuid.uuid4().hex[:8]}@example.com"
    pw = uuid.uuid4().hex
    code, u = admin("POST", "/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                              "user_metadata": {"name": "Jordan Test"}})
    uid = u["id"]
    print(f"test user {uid} ({code})")
    try:
        _, tok = http("POST", f"{SUPA}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": ANON})
        auth = {"Authorization": f"Bearer {tok['access_token']}"}

        print("\n== onboarding status via profile trigger")
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from app import db
        db.open_pool(os.environ["DATABASE_URL"], max_size=2)
        print(db.fetchone("select onboarding_status from profiles where id = %s", (uid,)))

        print("\n== checkin", http("POST", f"{API}/events/1/checkin", {}, auth))

        for name, data, mime in [("resume.docx", sample_docx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                                 ("resume.pdf", sample_pdf(), "application/pdf")]:
            body, ctype = multipart(name, data, mime)
            code, r = http("POST", f"{API}/profile/ingest", raw=body, headers=auth, ctype=ctype)
            print(f"\n== upload {name}: {code} {r}")
            if code == 202:
                print("   job:", wait_job(auth, r["job_id"]))
        print("   resumes rows:", db.fetchall("select filename, mime_type, status, error, size_bytes from resumes where user_id = %s", (uid,)))

        print(f"\n== GitHub import for public user '{GH_USER}' (same code path as the OAuth callback, no token)")
        from ml import github_ingest
        from ml.llm import github_to_text
        from app import profile_store
        repos, _ = github_ingest.fetch_repos(username=GH_USER, max_repos=12)
        github_ingest.enrich(repos)
        print(f"   {len(repos)} repos; frameworks found:",
              sorted({f for r in repos for f in r.get('frameworks', [])})[:15])
        text = github_to_text(repos)
        if text.strip():
            profile_store.ingest_text(uid, "github", text, github_ingest.digest_meta(repos))
            print("   extracted + stored")
        else:
            print("   no public non-fork repos with content")

        _, interests = http("GET", f"{API}/profile/interests", headers=auth)
        print(f"\n== interests ({len(interests.get('interests', []))}):")
        for i in interests.get("interests", [])[:15]:
            print(f"   {i['weight']:.2f} {i['facet']:<9} {i['name']:<32} [{i['source']}] {i['evidence'][:70]}")
        _, sp = http("GET", f"{API}/profile/skills", headers=auth)
        print(f"\n== skill profile v{sp.get('profile_version')}: domains={sp.get('domains')} years={sp.get('experience_years_estimate')}")
        for s in sp.get("skills", [])[:15]:
            print(f"   {s['confidence']:.2f} {s['name']:<28} {'+'.join(s['sources'])}")
        for h in sp.get("project_highlights", [])[:3]:
            print(f"   project: {h['name']} stars={h['stars']} {h['languages']} {h['frameworks']}")
        print("   versions:", db.fetchall("select version, is_active, trigger_source from user_skill_profiles where user_id = %s order by version", (uid,)))
        print("   onboarding:", db.fetchone("select onboarding_status from profiles where id = %s", (uid,)))

        print("\n== assistant (live)")
        for q in ["Who should I meet first, and why?", "What should I ask them?"]:
            t0 = time.time()
            code, r = http("POST", f"{API}/assistant/chat", {"messages": [{"role": "user", "content": q}], "event_id": 1}, auth)
            print(f"\n> {q}  ({code}, {time.time() - t0:.1f}s)\n{r.get('reply') or r}")
    finally:
        print("\n== cleanup", admin("DELETE", f"/admin/users/{uid}")[0])


if __name__ == "__main__":
    main()
