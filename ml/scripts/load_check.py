"""Live latency check across the 5-minute heavy-job cycle (clustering, global vectors) that used to stall
matches/graph/dashboard. Throwaway account, deleted at the end.

    cd ml/scripts && npx @railway/cli run ../.venv/bin/python -u load_check.py [minutes]
"""
import statistics
import sys
import time
import uuid

from e2e_profile_check import API, ANON, SUPA, admin, http  # noqa: E402

MINUTES = float(sys.argv[1]) if len(sys.argv) > 1 else 6


def timed(method, path, auth=None):
    t0 = time.time()
    try:
        code, _ = http(method, f"{API}{path}", None if method == "GET" else {}, auth)
    except Exception as e:  # timeouts count as failures
        code = f"ERR {type(e).__name__}"
    return code, time.time() - t0


def main():
    email, pw = f"load-{uuid.uuid4().hex[:8]}@example.com", uuid.uuid4().hex
    _, u = admin("POST", "/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                         "user_metadata": {"name": "Lee Load"}})
    uid = u["id"]
    lat = {"matches": [], "graph": [], "dashboard": []}
    bad = []
    try:
        _, tok = http("POST", f"{SUPA}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": ANON})
        A = {"Authorization": f"Bearer {tok['access_token']}"}
        http("POST", f"{API}/profile/ingest", {"source": "manual", "text": "Python, RAG, ML, hackathons"}, A)
        http("POST", f"{API}/events/1/checkin", {}, A)
        end, i = time.time() + MINUTES * 60, 0
        while time.time() < end:
            code, s = timed("GET", "/events/1/matches?limit=20", A)
            lat["matches"].append(s)
            if code != 200:
                bad.append(("matches", code, round(s, 1)))
            if i % 3 == 0:
                for name, path, auth in (("graph", "/graph?mode=matches&event_id=1&max_people=30", A),
                                         ("dashboard", "/dashboard/1", None)):
                    code, s = timed("GET", path, auth)
                    lat[name].append(s)
                    if code != 200:
                        bad.append((name, code, round(s, 1)))
            if i % 12 == 0:
                print(f"t+{int(MINUTES * 60 - (end - time.time()))}s  last matches {lat['matches'][-1]:.2f}s", flush=True)
            i += 1
            time.sleep(5)
    finally:
        admin("DELETE", f"/admin/users/{uid}")
    for name, xs in lat.items():
        if xs:
            print(f"{name:9} n={len(xs):3}  median {statistics.median(xs):5.2f}s  max {max(xs):6.2f}s", flush=True)
    print("non-200 responses:", bad or "none", flush=True)
    worst = max(max(x) for x in lat.values() if x)
    print("RESULT:", "PASS" if not bad and worst < 20 else "FAIL", f"(worst {worst:.1f}s)", flush=True)


if __name__ == "__main__":
    main()
