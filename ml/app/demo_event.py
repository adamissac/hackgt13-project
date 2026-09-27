"""Shared test event, created by the server itself at startup so every user sees the same one (docs/api.md 46).

"Demo Company" hosts "Demo test event", all day on DEMO_EVENT_DATE (default 2026-09-27, 12:00 AM to 11:59 PM
Atlanta time). Attendees register in the app, then check in with the company QR (shown in the company app) or the
printed join code (DEMO_EVENT_JOIN_CODE, default DEMO-927). Check-in has no time window. Only registered people who
scanned in see each other, like any company event.

A company login to show the QR exists only if the team sets DEMO_COMPANY_EMAIL and DEMO_COMPANY_PASSWORD. Nothing
here invents credentials. Idempotent: safe on every start. DEMO_EVENT=0 turns it off.
"""
import logging
import os

from . import db, orgs
from .errors import ApiError

log = logging.getLogger("demo_event")

ORG_NAME = "Demo Company"
EVENT_NAME = "Demo test event"
ORG_MARKER = "Seeded test company for trying company QR check-in and Bluetooth (app/demo_event.py)."


def _settings() -> dict:
    date = os.getenv("DEMO_EVENT_DATE", "").strip() or "2026-09-27"
    return {
        "starts_at": f"{date}T00:00:00-04:00",
        "ends_at": f"{date}T23:59:00-04:00",
        "code": os.getenv("DEMO_EVENT_JOIN_CODE", "").strip() or "DEMO-927",
        "email": os.getenv("DEMO_COMPANY_EMAIL", "").strip().lower(),
        "password": os.getenv("DEMO_COMPANY_PASSWORD", ""),
    }


def _company_user(email: str, password: str) -> str | None:
    """The demo company's login, created once (confirmed, like POST /orgs/signup). None if it can't be made."""
    row = db.fetchone("select id::text as id from auth.users where lower(email) = %s", (email,))
    if row:
        return row["id"]
    try:
        uid = orgs.create_confirmed_user(email, password, ORG_NAME)
    except ApiError as e:
        log.warning("demo company login not created: %s", e.message)
        return None
    from .users import on_create_account
    on_create_account(uid)
    db.execute("update profiles set name = %s, onboarding_status = 'complete', account_kind = 'company' where id = %s",
               (ORG_NAME, uid))
    return uid


def ensure() -> int | None:
    """Create or refresh the demo org + event. Returns the event id, or None when disabled / no database."""
    if os.getenv("DEMO_EVENT", "1") == "0" or not db.is_open():
        return None
    cfg = _settings()
    org = db.fetchone("select id, owner_id from organizations where name = %s and about = %s order by id limit 1",
                      (ORG_NAME, ORG_MARKER))
    if not org:
        org = db.fetchone(
            "insert into organizations (name, about, city, industry) values (%s, %s, 'Atlanta', 'Other') "
            "returning id, owner_id", (ORG_NAME, ORG_MARKER))
    if cfg["email"] and cfg["password"]:
        uid = _company_user(cfg["email"], cfg["password"])
        if uid:
            db.execute("insert into org_members (org_id, user_id, role) values (%s, %s, 'admin') on conflict do nothing",
                       (org["id"], uid))
            if not org.get("owner_id"):
                db.execute("update organizations set owner_id = %s, contact_email = %s where id = %s",
                           (uid, cfg["email"], org["id"]))
    fields = (cfg["starts_at"], cfg["ends_at"], orgs.hash_join_code(cfg["code"]))
    ev = db.fetchone("select id from events where org_id = %s and name = %s order by id limit 1", (org["id"], EVENT_NAME))
    if ev:
        db.execute("update events set starts_at = %s, ends_at = %s, join_code_hash = %s where id = %s", (*fields, ev["id"]))
    else:
        ev = db.fetchone(
            "insert into events (name, venue, location_text, starts_at, ends_at, org_id, description, promo, join_code_hash) "
            "values (%s, 'Klaus atrium', 'Klaus atrium', %s, %s, %s, %s, %s, %s) returning id",
            (EVENT_NAME, cfg["starts_at"], cfg["ends_at"], org["id"],
             "A shared test event. Mark yourself Attending, then scan the company QR code (or enter the join code) "
             "to enter the session, and try Bluetooth with others who checked in.",
             "All day. Check in any time.", fields[2]))
    log.info("demo event ready: id=%s org=%s", ev["id"], org["id"])
    return ev["id"]
