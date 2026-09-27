"""Company accounts and organizer tools (MASTER_SPEC 3.9)."""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
import time

import httpx

from . import db
from .errors import ApiError
from .settings import get_settings

log = logging.getLogger("orgs")

INDUSTRIES = (
    "Technology", "Finance", "Consulting", "Healthcare", "Hardware",
    "Consumer", "Climate", "Education", "Government", "Other",
)
SIZES = ("1-10", "11-50", "51-200", "201-1000", "1000+")


def hash_join_code(code: str) -> str:
    return hashlib.sha256(re.sub(r"[^A-Za-z0-9]", "", code).upper().encode()).hexdigest()


def new_join_code() -> str:
    raw = secrets.token_hex(3).upper()
    return f"{raw[:3]}-{raw[3:]}"


def parse_ts(value: str | None) -> str | None:
    if not value or not str(value).strip():
        return None
    raw = str(value).strip()
    from datetime import datetime
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).isoformat()
        except ValueError:
            continue
    return raw


def _headers(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"}


def create_confirmed_user(email: str, password: str, name: str) -> str:
    s = get_settings()
    if not (s.supabase_url and s.supabase_service_key):
        raise ApiError(503, "company sign-up is not configured")
    r = httpx.post(
        f"{s.supabase_url}/auth/v1/admin/users",
        headers=_headers(s.supabase_service_key),
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name, "account_kind": "company"},
        },
        timeout=20,
    )
    if r.status_code in (400, 422) and "already" in r.text.lower():
        raise ApiError(409, "that work email already has an account. Sign in.")
    if r.status_code >= 400:
        log.warning("admin create user failed %s %s", r.status_code, r.text[:200])
        raise ApiError(400, "could not create the company account")
    uid = (r.json() or {}).get("id")
    if not uid:
        raise ApiError(500, "could not create the company account")
    return str(uid)


_signups: list[float] = []


def rate_limit_signup() -> None:
    now = time.time()
    while _signups and now - _signups[0] > 3600:
        _signups.pop(0)
    if len(_signups) >= 30:
        raise ApiError(429, "too many company sign-ups. Try again later.")
    _signups.append(now)


def org_for_user(user_id: str) -> dict | None:
    return db.fetchone(
        "select o.id, o.name, o.website, o.industry, o.about, o.city, o.contact_name, "
        "o.contact_email, o.size_band, o.owner_id "
        "from organizations o join org_members m on m.org_id = o.id "
        "where m.user_id = %s order by o.id limit 1",
        (user_id,),
    )


def require_org(user_id: str) -> dict:
    org = org_for_user(user_id)
    if not org:
        raise ApiError(403, "company account required")
    return org


def require_event_org(event_id: int, user_id: str) -> dict:
    row = db.fetchone(
        "select e.id, e.name, e.venue, e.location_text, e.starts_at, e.ends_at, e.description, "
        "e.promo, e.org_id, e.join_code_hash "
        "from events e join org_members m on m.org_id = e.org_id "
        "where e.id = %s and m.user_id = %s",
        (event_id, user_id),
    )
    if not row:
        raise ApiError(403, "organizers only")
    return row


def event_counts(event_id: int) -> dict[str, int]:
    reg = db.fetchone("select count(*) as n from event_registrations where event_id = %s", (event_id,))
    here = db.fetchone("select count(*) as n from attendance where event_id = %s", (event_id,))
    return {"registered": int((reg or {}).get("n") or 0), "checked_in": int((here or {}).get("n") or 0)}


def studio_event(row: dict, join_code: str | None = None) -> dict:
    counts = event_counts(row["id"])
    return {
        "id": row["id"],
        "name": row["name"],
        "location": row.get("location_text") or row.get("venue") or "",
        "starts_at": row.get("starts_at"),
        "ends_at": row.get("ends_at"),
        "description": row.get("description") or "",
        "promo": row.get("promo") or "",
        "join_code": join_code,
        "registered": counts["registered"],
        "checked_in": counts["checked_in"],
    }
