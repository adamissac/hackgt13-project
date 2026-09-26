"""DELETE /me removes the user from every table (checked generically over every uuid column)."""
import httpx

from conftest import add_event, add_user, auth, seed_person


def uuid_columns(db):
    return db.fetchall("select table_name, column_name from information_schema.columns "
                       "where table_schema = 'public' and data_type = 'uuid'")


def rows_mentioning(db, uid):
    hits = {}
    for c in uuid_columns(db):
        n = db.fetchone(f'select count(*) as n from public."{c["table_name"]}" where "{c["column_name"]}" = %s',
                        (uid,))["n"]
        if n:
            hits[f'{c["table_name"]}.{c["column_name"]}'] = n
    return hits


def test_delete_me_everywhere(dbclient, db, monkeypatch):
    ev = add_event(db)
    me = seed_person(db, "Del Me", [("robotics", "technical", 0.9)], event_id=ev)
    other = seed_person(db, "Keep Me", [("robotics", "technical", 0.9)], event_id=ev)
    lo, hi = sorted([me, other])
    x = db.execute
    x("update profiles set open_to_meet = true where id = %s", (me,))
    x("insert into blocks values (%s, %s)", (me, other))
    x("insert into connections (user_a, user_b) values (%s, %s)", (lo, hi))
    sid = db.fetchone("insert into suggestions (user_a, user_b, context, event_id) values (%s, %s, 'event', %s) "
                      "returning id", (lo, hi, ev))["id"]
    x("insert into location_shares (suggestion_id, user_id, lat, lng, expires_at) values (%s, %s, 1, 1, now())", (sid, me))
    cid = db.fetchone("insert into conversations (user_a, user_b, method, event_id) values (%s, %s, 'qr', %s) "
                      "returning id", (lo, hi, ev))["id"]
    x("insert into feedback (conversation_id, rater_id, wants_connect) values (%s, %s, true)", (cid, me))
    x("insert into handshakes (scanner_id, scanned_id, nonce) values (%s, %s, 'n1')", (other, me))
    chat = db.fetchone("insert into chats (user_a, user_b, origin) values (%s, %s, 'connection') returning id", (lo, hi))["id"]
    x("insert into messages (chat_id, sender_id, body) values (%s, %s, 'hi'), (%s, %s, 'hey')", (chat, me, chat, other))
    x("insert into notifications (user_id, kind) values (%s, 'connected')", (me,))
    x("insert into impressions (viewer_id, shown_id) values (%s, %s), (%s, %s)", (other, me, me, other))
    x("insert into presence (user_id, building_id, expires_at) values (%s, 'klaus', now())", (me,))
    x("insert into ephemeral_ids (token, user_id) values ('tok1', %s)", (me,))
    x("insert into sightings (observer_id, observed_token, rssi, ts) values (%s, 'tok1', -60, now())", (other,))
    x("insert into invites (sender_id, token_hash, channel, expires_at) values (%s, 'h1', 'link', now())", (me,))
    x("insert into invites (sender_id, token_hash, channel, used_by, expires_at) values (%s, 'h2', 'link', %s, now())",
      (other, me))
    org = db.fetchone("insert into organizations (name, owner_id) values ('Org', %s) returning id", (me,))["id"]
    x("insert into org_members (org_id, user_id) values (%s, %s)", (org, me))
    x("insert into feed_items (author_id, kind, body) values (%s, 'post', 'hello')", (me,))
    x("insert into feed_prefs (user_id) values (%s)", (me,))
    x("insert into web_mentions (user_id, url) values (%s, 'https://x')", (me,))
    x("insert into event_registrations (event_id, user_id) values (%s, %s)", (ev, me))
    x("insert into event_posts (event_id, author_id, body) values (%s, %s, 'hi')", (ev, me))
    x("insert into linked_accounts (user_id, provider) values (%s, 'github')", (me,))
    x("insert into device_keys (user_id, public_key) values (%s, 'k')", (me,))

    calls = []

    def fake_request(method, url, **kw):
        calls.append((method, url, kw.get("json")))
        body = [{"name": "resume.pdf"}] if url.endswith("/object/list/resumes") else {}
        return httpx.Response(200, json=body, request=httpx.Request(method, url))
    monkeypatch.setattr(httpx.Client, "request", lambda self, method, url, **kw: fake_request(method, url, **kw))
    monkeypatch.setattr(httpx, "delete", lambda url, **kw: fake_request("DELETE", url, **kw))
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-for-test")
    from app import settings
    settings.reset_settings()

    assert rows_mentioning(db, me)                               # sanity: the user is everywhere
    r = dbclient.delete("/me", headers=auth(me))
    assert r.status_code == 200, r.text
    assert r.json() == {"deleted": True, "storage_objects_deleted": 1, "auth_user_deleted": True, "errors": []}
    assert rows_mentioning(db, me) == {}                         # every uuid column in every public table
    assert db.fetchone("select count(*) n from sightings where observed_token = 'tok1'")["n"] == 0
    assert db.fetchone("select count(*) n from profiles where id = %s", (other,))["n"] == 1   # others untouched
    assert db.fetchone("select count(*) n from invites where token_hash = 'h2'")["n"] == 1
    urls = [(m, u.split(".co")[1]) for m, u, _ in calls]
    assert ("DELETE", "/storage/v1/object/resumes") in urls and ("DELETE", f"/auth/v1/admin/users/{me}") in urls
    assert [j for m, u, j in calls if u.endswith("/object/resumes")][0] == {"prefixes": [f"{me}/resume.pdf"]}
    settings.reset_settings()


def test_delete_me_without_service_key_still_deletes_rows(dbclient, db):
    me = add_user(db)
    r = dbclient.delete("/me", headers=auth(me)).json()
    assert r["deleted"] and r["auth_user_deleted"] is None and r["storage_objects_deleted"] is None
    assert rows_mentioning(db, me) == {}
