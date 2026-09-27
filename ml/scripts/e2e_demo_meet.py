"""Live check of the demo-attendee shortcuts as a real (throwaway) user: check in -> Open to Meet -> "Want to meet"
a demo attendee (POST /suggestions/demo) -> they say yes (or stay silent) -> share my location -> their made-up
point shows up and walks toward me. Also times the assistant. Deletes the account at the end.

    cd ml/scripts && npx @railway/cli run ../.venv/bin/python -u e2e_demo_meet.py
"""
import math
import time
import uuid

from e2e_profile_check import API, ANON, SUPA, admin, http  # noqa: E402  (same folder)

HERE = {"lat": 33.7774, "lng": -84.3973}


def meters(a, b):
    return math.hypot(a["lat"] - b["lat"], (a["lng"] - b["lng"]) * math.cos(math.radians(a["lat"]))) * 111_320


def main():
    email, pw = f"demo-{uuid.uuid4().hex[:8]}@example.com", uuid.uuid4().hex
    _, u = admin("POST", "/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                         "user_metadata": {"name": "Casey Demo"}})
    uid = u["id"]
    try:
        _, tok = http("POST", f"{SUPA}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": ANON})
        auth = {"Authorization": f"Bearer {tok['access_token']}"}
        _, r = http("POST", f"{API}/profile/ingest", {"source": "manual", "text":
                    "I build RAG systems in Python and PyTorch, love hackathons, want an ML internship"}, auth)
        for _ in range(60):
            if http("GET", f"{API}/profile/status?job_id={r['job_id']}", headers=auth)[1].get("status") in ("done", "error"):
                break
            time.sleep(2)
        http("POST", f"{API}/events/1/checkin", {}, auth)
        http("PATCH", f"{API}/me/open-to-meet", {"open": True}, auth)
        matches = http("GET", f"{API}/events/1/matches?limit=10", headers=auth)[1]["matches"]
        t0 = time.time()
        code, a = http("POST", f"{API}/assistant/chat", {"messages": [{"role": "user", "content": "Who should I meet first and why?"}],
                                                         "event_id": 1}, auth)
        print(f"assistant {code} in {time.time() - t0:.1f}s: {a.get('reply', '')[:120]!r}")

        matched = None
        for m in matches:
            qp = http("GET", f"{API}/matches/{m['user_id']}/quick-profile", headers=auth)[1]
            if not qp.get("demo_attendee"):
                continue
            code, r = http("POST", f"{API}/suggestions/demo", {"user_id": m["user_id"]}, auth)
            print(f"want to meet {qp.get('name')}: {code} {r}")
            for _ in range(8):
                r = http("POST", f"{API}/suggestions/demo", {"user_id": m["user_id"]}, auth)[1]
                if r.get("status") == "matched":
                    matched = (qp.get("name"), r["suggestion_id"])
                    break
                time.sleep(2)
            print("  ->", "said yes" if matched else "no answer (silent, like a no)")
            if matched:
                break
        assert matched, "no demo attendee said yes"
        name, sid = matched
        code, r = http("POST", f"{API}/location-shares/{sid}", HERE, auth)
        print("I share my location:", code, r)
        seen = []
        for _ in range(8):
            t = http("GET", f"{API}/location-shares/{sid}", headers=auth)[1].get("their_location")
            if t:
                seen.append(round(meters(HERE, t)))
            if len(seen) >= 3:
                break
            time.sleep(5)
        print(f"{name}'s made-up distance over time (m): {seen}")
        assert seen and seen[-1] <= seen[0], "their point never showed up or didn't approach"
        print("RESULT: PASS")
    finally:
        admin("DELETE", f"/admin/users/{uid}")


if __name__ == "__main__":
    main()
