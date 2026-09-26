"""Live end-to-end check of the core loop against seeded demo attendees, as a real (throwaway) user:
check in -> Open to Meet -> suggestion -> yes -> demo attendee says yes -> chat + in-character reply
-> simulated meeting -> checklist -> connect -> connection. Deletes the account at the end.

    cd ml && npx @railway/cli run .venv/bin/python scripts/e2e_live_loop.py
"""
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from e2e_profile_check import API, ANON, SUPA, admin, http  # noqa: E402  (same folder)


def main():
    email, pw = f"e2e-{uuid.uuid4().hex[:8]}@example.com", uuid.uuid4().hex
    _, u = admin("POST", "/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                         "user_metadata": {"name": "Casey Loop"}})
    uid = u["id"]
    try:
        _, tok = http("POST", f"{SUPA}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": ANON})
        auth = {"Authorization": f"Bearer {tok['access_token']}"}
        code, r = http("POST", f"{API}/profile/ingest", {"source": "manual", "text":
                       "I build RAG systems in Python and PyTorch, love hackathons, want an ML internship",
                       "seeking": "ML internship", "offering": "RAG pipelines"}, auth)
        for _ in range(60):
            if http("GET", f"{API}/profile/status?job_id={r['job_id']}", headers=auth)[1].get("status") in ("done", "error"):
                break
            time.sleep(2)
        print("profile built; matches:", len(http("GET", f"{API}/events/1/matches?limit=5", headers=auth)[1].get("matches", [])),
              "(auto check-in via retry is app-side; checking in here)")
        http("POST", f"{API}/events/1/checkin", {}, auth)
        print("open to meet:", http("PATCH", f"{API}/me/open-to-meet", {"open": True}, auth))

        sug = None
        for i in range(24):  # suggestion worker runs every 30 s
            s = http("GET", f"{API}/suggestions", headers=auth)[1].get("suggestions", [])
            if s:
                sug = s[0]
                break
            time.sleep(5)
        assert sug, "no suggestion within 2 minutes"
        other = sug["other"]
        print(f"suggestion: meet {other['name']}? shared {sug['shared_topics']}")
        print("I say yes:", http("POST", f"{API}/suggestions/{sug['suggestion_id']}/respond", {"response": "yes"}, auth)[1])

        chat_id = None
        for _ in range(12):  # demo attendee answers within a synthetic tick (5 s)
            r = http("POST", f"{API}/suggestions/{sug['suggestion_id']}/respond", {"response": "yes"}, auth)[1]
            if r.get("status") == "matched":
                chat_id = r["chat_id"]
                break
            time.sleep(3)
        assert chat_id, "demo attendee never said yes"
        print("mutual match, chat", chat_id)

        from app import db
        db.open_pool(os.environ["DATABASE_URL"], max_size=2)
        db.execute("insert into messages (chat_id, sender_id, body) values (%s, %s, %s)",
                   (chat_id, uid, "Hey! Want to meet by the sponsor tables in 5?"))
        reply = None
        for _ in range(15):
            row = db.fetchone("select body from messages where chat_id = %s and sender_id <> %s order by created_at desc limit 1",
                              (chat_id, uid))
            if row:
                reply = row["body"]
                break
            time.sleep(3)
        print("their reply:", reply)
        assert reply

        code, conv = http("POST", f"{API}/conversations/simulate", {"user_id": other["user_id"]}, auth)
        print("simulate meeting:", code, {k: conv.get(k) for k in ("conversation_id", "checklist")})
        time.sleep(7)  # demo attendee answers "connect" on its tick
        ids = [c["interest_id"] for c in conv.get("checklist", [])[:2]]
        code, fb = http("POST", f"{API}/conversations/{conv['conversation_id']}/feedback",
                        {"talked_about": ids, "other_topic": "", "wants_connect": True}, auth)
        print("connect:", code, fb)
        print("connections:", [c["name"] for c in http("GET", f"{API}/connections", headers=auth)[1].get("connections", [])])
    finally:
        print("cleanup", admin("DELETE", f"/admin/users/{uid}")[0])


if __name__ == "__main__":
    main()
