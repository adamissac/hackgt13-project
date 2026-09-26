"""Live smoke test: every endpoint the app uses, as a throwaway signed-in user. Prints one line per call
and a summary; exits 1 on any unexpected status. Deletes the account at the end.

    cd ml/scripts && npx @railway/cli run ../.venv/bin/python smoke_all_endpoints.py
"""
import json
import sys
import time
import uuid

from e2e_profile_check import API, ANON, SUPA, admin, http, multipart, sample_docx  # noqa: E402

results = []


def check(label, method, path, expect=(200,), body=None, auth=None, raw=None, ctype="application/json"):
    t0 = time.time()
    code, r = http(method, f"{API}{path}", body, auth, raw=raw, ctype=ctype)
    ok = code in expect
    results.append(ok)
    print(f"{'OK  ' if ok else 'FAIL'} {code} {method:6} {path:48} {time.time() - t0:5.1f}s  {label}"
          + ("" if ok else f"  -> {json.dumps(r)[:160]}"))
    return r


def main():
    email, pw = f"smoke-{uuid.uuid4().hex[:8]}@example.com", uuid.uuid4().hex
    _, u = admin("POST", "/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                         "user_metadata": {"name": "Sam Smoke"}})
    uid = u["id"]
    try:
        _, tok = http("POST", f"{SUPA}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": ANON})
        A = {"Authorization": f"Bearer {tok['access_token']}"}

        check("public health", "GET", "/health")
        check("auth required", "GET", "/profile/interests", expect=(401,))
        check("whoami", "GET", "/whoami", auth=A)

        # onboarding + profile
        check("accounts", "GET", "/me/accounts", auth=A)
        body, ct = multipart("cv.docx", sample_docx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        job = check("resume upload (docx)", "POST", "/profile/ingest", expect=(202,), auth=A, raw=body, ctype=ct)
        for _ in range(60):
            s = http("GET", f"{API}/profile/status?job_id={job['job_id']}", headers=A)[1]
            if s.get("status") in ("done", "error"):
                break
            time.sleep(2)
        results.append(s.get("status") == "done")
        print(f"{'OK  ' if s.get('status') == 'done' else 'FAIL'} job {s}")
        check("manual profile", "PATCH", "/profile/manual", auth=A, body={"headline": "Smoke tester", "seeking": "ML internship"})
        ints = check("interests", "GET", "/profile/interests", auth=A)
        if ints.get("interests"):
            check("confirm interest", "PATCH", "/profile/interests", auth=A, body={"confirm": [ints["interests"][0]["interest_id"]]})
        check("skill profile", "GET", "/profile/skills", auth=A)
        check("github start", "GET", "/connect/github/start", auth=A)

        # event: matches (auto check-in path is app-side; the retry is covered by the 403 below)
        check("matches before check-in", "GET", "/events/1/matches?limit=5", expect=(403,), auth=A)
        check("check in", "POST", "/events/1/checkin", body={}, auth=A)
        m = check("matches", "GET", "/events/1/matches?limit=5", auth=A)
        other = (m.get("matches") or [{}])[0].get("user_id")
        if other:
            qp = check("quick profile", "GET", f"/matches/{other}/quick-profile", auth=A)
            print("     demo_attendee:", qp.get("demo_attendee"))
            check("starters", "GET", f"/matches/{other}/starters", auth=A)
        check("graph matches", "GET", "/graph?mode=matches&event_id=1&max_people=30", auth=A)
        check("graph network", "GET", "/graph?mode=network", auth=A)
        check("open to meet on", "PATCH", "/me/open-to-meet", body={"open": True}, auth=A)
        check("suggestions", "GET", "/suggestions", auth=A)
        check("location meetups", "GET", "/location-shares", auth=A)
        check("pending conversations", "GET", "/conversations/pending", auth=A)
        check("qr verify token", "GET", "/qr/verify-token", auth=A)
        check("ble tokens", "POST", "/ble/tokens", body={}, auth=A)
        check("connections", "GET", "/connections", auth=A)
        check("feed", "GET", "/feed", auth=A)
        check("feed insights", "GET", "/feed/insights?days=7", auth=A)
        check("post", "POST", "/feed/posts", expect=(201,), body={"kind": "update", "body": "Started a RAG eval project at HackGT"}, auth=A)
        check("me dashboard", "GET", "/me/dashboard?days=30", auth=A)
        check("invites list", "GET", "/invites", auth=A)
        inv = check("create invite", "POST", "/invites", expect=(201,), body={"channel": "link"}, auth=A)
        if inv.get("invite_id"):
            check("revoke invite", "DELETE", f"/invites/{inv['invite_id']}", auth=A)
        check("organizer dashboard", "GET", "/dashboard/1")
        a = check("assistant", "POST", "/assistant/chat", auth=A,
                  body={"messages": [{"role": "user", "content": "Who should I meet first?"}], "event_id": 1})
        print("     assistant:", (a.get("reply") or "")[:160].replace("\n", " "))
        check("open to meet off", "PATCH", "/me/open-to-meet", body={"open": False}, auth=A)
        check("delete me", "DELETE", "/me", auth=A)
    finally:
        admin("DELETE", f"/admin/users/{uid}")
    passed = sum(results)
    print(f"\n{passed}/{len(results)} checks passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
