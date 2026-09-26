"""Minimal Supabase access for the ML service (stdlib only).

- `verify_jwt(token)` -> user_id: asks Supabase Auth (`GET /auth/v1/user`) whether the access token is
  valid. Works whatever the project's JWT signing mode is. Cached briefly per token.
- `select / insert / upsert / update`: PostgREST with the service key (bypasses RLS). Server only.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (never in mobile/ or dashboard/).
If Alan's AL1 adds a fuller DB layer, point callers there and delete this.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

_JWT_CACHE: dict[str, tuple[str, float]] = {}
_JWT_TTL_S = 60


class SupabaseError(Exception):
    def __init__(self, status, message):
        super().__init__(f"{status}: {message}")
        self.status = status


def _base():
    return os.environ["SUPABASE_URL"].rstrip("/")


def _key():
    return os.environ["SUPABASE_SERVICE_KEY"]


def _request(method, url, headers, body=None, timeout=20):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:300]
        raise SupabaseError(e.code, msg) from e


# ---------------------------------------------------------------- auth
def verify_jwt(token):
    """Return the Supabase user id for a valid access token, else raise SupabaseError(401)."""
    if not token:
        raise SupabaseError(401, "missing token")
    h = hashlib.sha256(token.encode()).hexdigest()
    hit = _JWT_CACHE.get(h)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        user = _request("GET", f"{_base()}/auth/v1/user",
                        {"Authorization": f"Bearer {token}", "apikey": _key()})
    except SupabaseError as e:
        raise SupabaseError(401, "invalid or expired token") from e
    uid = (user or {}).get("id")
    if not uid:
        raise SupabaseError(401, "invalid token")
    _JWT_CACHE[h] = (uid, time.time() + _JWT_TTL_S)
    return uid


# ---------------------------------------------------------------- PostgREST
def _rest_headers(prefer=None):
    h = {"apikey": _key(), "Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    return h


def select(table, params):
    """params: PostgREST query dict, e.g. {"select": "*", "user_id": "eq.<uuid>"}."""
    q = urllib.parse.urlencode(params)
    return _request("GET", f"{_base()}/rest/v1/{table}?{q}", _rest_headers()) or []


def insert(table, rows):
    return _request("POST", f"{_base()}/rest/v1/{table}", _rest_headers("return=representation"), rows) or []


def upsert(table, rows, on_conflict):
    q = urllib.parse.urlencode({"on_conflict": on_conflict})
    return _request("POST", f"{_base()}/rest/v1/{table}?{q}",
                    _rest_headers("resolution=merge-duplicates,return=representation"), rows) or []


def update(table, match, values):
    q = urllib.parse.urlencode({k: f"eq.{v}" for k, v in match.items()})
    return _request("PATCH", f"{_base()}/rest/v1/{table}?{q}", _rest_headers("return=representation"), values) or []


def storage_download(bucket, path, max_bytes=10 * 1024 * 1024):
    url = f"{_base()}/storage/v1/object/{bucket}/{urllib.parse.quote(path.lstrip('/'))}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {_key()}", "apikey": _key()})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("file larger than limit")
    return data
