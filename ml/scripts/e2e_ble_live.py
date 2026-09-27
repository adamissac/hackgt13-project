"""Live check of the server half of Bluetooth with two simulated phones (throwaway accounts, deleted at the end):
tokens -> each phone uploads sightings of the other's current token -> Nearby shows a distance band ->
both tap (claim each other's token at touching RSSI) -> one verified conversation -> the checklist is pending.

    cd ml/scripts && npx @railway/cli run ../.venv/bin/python -u e2e_ble_live.py
"""
import time
import uuid
from datetime import datetime, timedelta, timezone

from e2e_profile_check import API, ANON, SUPA, admin, http  # noqa: E402  (same folder)

TEXT = "I build Bluetooth proximity apps in React Native and Python, love hackathons and robotics"


def user(name):
    email, pw = f"ble-{uuid.uuid4().hex[:8]}@example.com", uuid.uuid4().hex
    _, u = admin("POST", "/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                         "user_metadata": {"name": name}})
    _, tok = http("POST", f"{SUPA}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": ANON})
    return u["id"], {"Authorization": f"Bearer {tok['access_token']}"}


def current(tokens):
    now = datetime.now(timezone.utc)
    for t in tokens:
        if datetime.fromisoformat(t["valid_from"].replace("Z", "+00:00")) <= now < datetime.fromisoformat(
                t["valid_to"].replace("Z", "+00:00")):
            return t["token"]
    raise AssertionError("no token covers now")


def main():
    ids = []
    try:
        (a, A), (b, B) = user("Avery Radio"), user("Blake Radio")
        ids = [a, b]
        for h in (A, B):
            _, r = http("POST", f"{API}/profile/ingest", {"source": "manual", "text": TEXT}, h)
            for _ in range(60):
                if http("GET", f"{API}/profile/status?job_id={r['job_id']}", headers=h)[1].get("status") in ("done", "error"):
                    break
                time.sleep(2)
            http("POST", f"{API}/events/1/checkin", {}, h)
        ta = current(http("POST", f"{API}/ble/tokens", {}, A)[1]["tokens"])
        tb = current(http("POST", f"{API}/ble/tokens", {}, B)[1]["tokens"])
        print("tokens:", len(ta), len(tb), "chars each")

        now = datetime.now(timezone.utc)
        for h, other in ((A, tb), (B, ta)):
            s = [{"token": other, "rssi": -50, "ts": (now - timedelta(seconds=i)).isoformat()} for i in range(20)]
            code, r = http("POST", f"{API}/ble/sightings", {"event_id": 1, "device_model": "iPhone15,2",
                                                            "foreground": True, "sightings": s}, h)
            print("sightings:", code, r)
            assert r["accepted"] == 20
        m = http("GET", f"{API}/events/1/matches?limit=100", headers=A)[1]["matches"]
        band = next((x["proximity"] for x in m if x["user_id"] == b), "not in matches")
        print("Nearby for Avery -> Blake:", band)
        assert band == "immediate"

        code, r1 = http("POST", f"{API}/tap/claim", {"token": tb, "rssi": -40, "event_id": 1}, A)
        print("Avery taps:", code, r1.get("status"))
        code, r2 = http("POST", f"{API}/tap/claim", {"token": ta, "rssi": -40, "event_id": 1}, B)
        print("Blake taps:", code, r2.get("status"), "conversation", r2.get("conversation_id"))
        assert r2.get("status") == "verified"
        pending = http("GET", f"{API}/conversations/pending", headers=A)[1]["conversations"]
        assert any(c["other"]["user_id"] == b for c in pending), pending
        print("checklist pending for Avery: yes")
        code, r = http("POST", f"{API}/tap/claim", {"token": tb, "rssi": -90}, A)
        print("far tap:", code, r)
        assert code == 400 and r.get("error") == "too_far"
        print("RESULT: PASS")
    finally:
        for uid in ids:
            admin("DELETE", f"/admin/users/{uid}")


if __name__ == "__main__":
    main()
