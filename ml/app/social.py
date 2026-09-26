"""Chats and notifications created by the service (MASTER_SPEC 8.2).

Chat messages themselves go through Supabase directly (RLS + Realtime); FastAPI only creates the
chats row when two people are allowed to talk (mutual yes or a new connection).
Push delivery (AD10) reads notifications rows; this module only writes them.
"""
from psycopg.types.json import Jsonb


def ensure_chat(conn, a: str, b: str, origin: str) -> int:
    lo, hi = sorted([a, b])
    row = conn.execute(
        "insert into chats (user_a, user_b, origin) values (%s, %s, %s) "
        "on conflict (user_a, user_b) do nothing returning id", (lo, hi, origin)).fetchone()
    if row:
        return row["id"]
    return conn.execute("select id from chats where user_a = %s and user_b = %s", (lo, hi)).fetchone()["id"]


def notify(conn, user_id: str, kind: str, payload: dict) -> None:
    """kind: suggestion | connect_prompt | connected | invite | event_update | connection_attending"""
    conn.execute("insert into notifications (user_id, kind, payload) values (%s, %s, %s)",
                 (user_id, kind, Jsonb(payload)))
