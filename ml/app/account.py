"""DELETE /me: remove everything about a user (MASTER_SPEC 11).

1. Storage: every object under resumes/<user_id>/ (Supabase Storage REST, service key).
2. Postgres, one transaction: null the two non-cascading references (invites.used_by, organizations.owner_id),
   drop other people's raw sightings of this user's Bluetooth tokens, then delete the profile; every other
   table cascades from profiles(id).
3. Auth: the auth.users row via the GoTrue admin API (service key). Deleting it would also cascade to profiles.

Steps 1 and 3 need SUPABASE_URL + SUPABASE_SERVICE_KEY and are skipped (reported) when they aren't set.
Endpoints used (Supabase Storage / GoTrue REST, not verified from the cloud dev container):
  POST   {url}/storage/v1/object/list/resumes   {"prefix": "<uid>", "limit": 1000, "offset": 0}
  DELETE {url}/storage/v1/object/resumes        {"prefixes": ["<uid>/file.pdf", ...]}
  DELETE {url}/auth/v1/admin/users/<uid>
"""
import logging

import httpx

from . import db, matching, population
from .settings import get_settings

log = logging.getLogger("account")
BUCKET = "resumes"


def _headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}", "apikey": key}


def delete_storage(user_id: str) -> int | None:
    s = get_settings()
    if not (s.supabase_url and s.supabase_service_key):
        return None
    h = _headers(s.supabase_service_key)
    with httpx.Client(timeout=15) as c:
        r = c.post(f"{s.supabase_url}/storage/v1/object/list/{BUCKET}", headers=h,
                   json={"prefix": user_id, "limit": 1000, "offset": 0})
        r.raise_for_status()
        paths = [f"{user_id}/{o['name']}" for o in r.json() if o.get("name")]
        if paths:
            r = c.request("DELETE", f"{s.supabase_url}/storage/v1/object/{BUCKET}", headers=h,
                          json={"prefixes": paths})
            r.raise_for_status()
    return len(paths)


def delete_auth_user(user_id: str) -> bool | None:
    s = get_settings()
    if not (s.supabase_url and s.supabase_service_key):
        return None
    r = httpx.delete(f"{s.supabase_url}/auth/v1/admin/users/{user_id}", headers=_headers(s.supabase_service_key),
                     timeout=15)
    if r.status_code == 404:
        return True
    r.raise_for_status()
    return True


def delete_rows(user_id: str) -> None:
    with db.conn() as c:
        if matching.table_exists("invites"):
            c.execute("update invites set used_by = null where used_by = %s", (user_id,))
        if matching.table_exists("organizations"):
            c.execute("update organizations set owner_id = null where owner_id = %s", (user_id,))
        c.execute("delete from sightings where observed_token in (select token from ephemeral_ids where user_id = %s)",
                  (user_id,))
        c.execute("delete from profiles where id = %s", (user_id,))


def delete_account(user_id: str) -> dict:
    storage_error = auth_error = None
    try:
        n_objects = delete_storage(user_id)
    except Exception as e:  # keep going: the database rows matter most
        log.exception("storage delete failed for %s", user_id)
        n_objects, storage_error = None, "storage cleanup failed"
    delete_rows(user_id)
    try:
        auth_deleted = delete_auth_user(user_id)
    except Exception:
        log.exception("auth user delete failed for %s", user_id)
        auth_deleted, auth_error = False, "auth user delete failed"
    population.invalidate()
    from .routers import matches
    with matches._cache_lock:
        for k in [k for k in matches._starter_cache if user_id in k[:2]]:
            del matches._starter_cache[k]
    return {"deleted": True, "storage_objects_deleted": n_objects, "auth_user_deleted": auth_deleted,
            "errors": [e for e in (storage_error, auth_error) if e]}
