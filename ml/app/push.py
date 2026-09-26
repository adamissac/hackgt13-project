"""AD10 push sender: notifications rows -> Expo push (MASTER_SPEC 4.2; REQUESTS.md ask from Adam).

A worker (every 5 s) sends notifications created since the last tick to every token the user has in
push_tokens, and deletes a token when Expo reports DeviceNotRegistered. The high-water mark lives in memory
and starts at the newest existing notification, so a restart never re-sends old pushes (it can skip the few
created while the service was down; the in-app list still shows them).

Push text never carries anything the in-app screens wouldn't: first names only, no "no"s (there is no
notification kind for a decline).

Expo API used (NOT verified from the cloud container, whose network blocks docs.expo.dev; check on the
first live send):
  POST https://exp.host/--/api/v2/push/send   body: [{to, title, body, data, sound}] (<= 100 per request)
  response: {"data": [{"status": "ok", "id": ...} | {"status": "error", "message": ..., "details": {"error": "DeviceNotRegistered"}}]}
  EXPO_ACCESS_TOKEN (optional) -> "Authorization: Bearer ..." if the Expo project enforces push security.
"""
import logging
import os
import threading

import httpx

from . import db, matching

log = logging.getLogger("push")
EXPO_URL = "https://exp.host/--/api/v2/push/send"
BATCH = 100
_mark: int | None = None
_lock = threading.Lock()


def _first(user_id: str | None) -> str:
    if not user_id:
        return "someone"
    r = db.fetchone("select name from profiles where id = %s", (user_id,))
    return ((r or {}).get("name") or "someone").split(" ")[0]


def message_for(kind: str, payload: dict) -> tuple[str, str]:
    p = payload or {}
    if kind == "suggestion" and p.get("status") == "matched":
        return f"You and {_first(p.get('other_user_id'))} both said yes", "Say hi in chat and find each other."
    if kind == "suggestion":
        other, topics = None, []
        if p.get("suggestion_id") and matching.table_exists("suggestions"):
            s = db.fetchone("select user_a::text a, user_b::text b, shared_topics from suggestions where id = %s",
                            (p["suggestion_id"],))
            if s:
                other = s["b"] if s["a"] == p.get("_recipient") else s["a"]
                topics = [t["name"] for t in (s["shared_topics"] or [])][:2]
        body = f"You both like {' and '.join(topics)}." if topics else "Open the app to see why you matched."
        return f"Do you want to meet {_first(other)}?", body
    if kind == "connect_prompt":
        return f"How was your conversation with {_first(p.get('other_user_id'))}?", "Check what you talked about."
    if kind == "connected":
        return f"You're connected with {_first(p.get('other_user_id'))}", "A follow-up note is ready to edit."
    if kind == "invite":
        return "You have a new invite", "Open the app to respond."
    if kind == "connection_attending":
        return "A connection is attending an event", "Open the app to see who."
    if kind == "event_update":
        return "Event update", p.get("text", "Open the app for details.")[:120]
    return "Formal Connection", "You have a new notification."


def _send(messages: list[dict]) -> list[dict]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if os.getenv("EXPO_ACCESS_TOKEN"):
        headers["Authorization"] = f"Bearer {os.getenv('EXPO_ACCESS_TOKEN')}"
    r = httpx.post(EXPO_URL, json=messages, headers=headers, timeout=15)
    r.raise_for_status()
    return r.json().get("data", [])


def tick() -> int:
    """Send pushes for notifications created since the last tick. Returns messages sent."""
    global _mark
    if not matching.table_exists("push_tokens"):
        return 0
    with _lock:
        if _mark is None:
            _mark = (db.fetchone("select coalesce(max(id), 0) as m from notifications") or {"m": 0})["m"]
            return 0
        rows = db.fetchall(
            "select n.id, n.user_id::text as user_id, n.kind, n.payload, t.token from notifications n "
            "join push_tokens t on t.user_id = n.user_id where n.id > %s order by n.id limit 500", (_mark,))
        top = (db.fetchone("select coalesce(max(id), %s) as m from notifications where id > %s", (_mark, _mark)) or {})["m"]
        if not rows:
            _mark = top
            return 0
        msgs = []
        for r in rows:
            title, body = message_for(r["kind"], {**(r["payload"] or {}), "_recipient": r["user_id"]})
            msgs.append({"to": r["token"], "title": title, "body": body, "sound": "default",
                         "data": {"kind": r["kind"], "notification_id": r["id"], **(r["payload"] or {})}})
        sent = 0
        for i in range(0, len(msgs), BATCH):
            chunk = msgs[i:i + BATCH]
            try:
                tickets = _send(chunk)
            except Exception as e:  # Expo down: skip this batch rather than block every later push
                log.warning("expo push failed: %s", e)
                continue
            for m, t in zip(chunk, tickets):
                if t.get("status") == "ok":
                    sent += 1
                elif (t.get("details") or {}).get("error") == "DeviceNotRegistered":
                    db.execute("delete from push_tokens where token = %s", (m["to"],))
                else:
                    log.warning("expo ticket error: %s", t.get("message"))
        _mark = max(r["id"] for r in rows) if len(rows) == 500 else top
        return sent
