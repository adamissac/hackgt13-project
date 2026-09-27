"""Company sign-up and organizer studio (docs/api.md 46)."""
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import db, orgs, population, qr, social
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile, on_create_account

router = APIRouter()


class SignupBody(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    contact_name: str = Field(min_length=1, max_length=80)
    contact_email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=72)
    website: str = Field(default="", max_length=200)
    industry: str = Field(default="Other", max_length=40)
    city: str = Field(default="", max_length=80)
    about: str = Field(default="", max_length=800)
    size_band: str = Field(default="", max_length=20)


class PatchOrgBody(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    website: str | None = Field(default=None, max_length=200)
    industry: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    about: str | None = Field(default=None, max_length=800)
    size_band: str | None = Field(default=None, max_length=20)
    contact_name: str | None = Field(default=None, max_length=80)


class CreateEventBody(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    location: str = Field(default="", max_length=200)
    starts_at: str | None = None
    ends_at: str | None = None
    description: str = Field(default="", max_length=2000)
    promo: str = Field(default="", max_length=280)


class PromoteBody(BaseModel):
    body: str = Field(min_length=1, max_length=800)


class EnterCodeBody(BaseModel):
    code: str = Field(min_length=4, max_length=16)


def _public_org(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "website": row.get("website") or "",
        "industry": row.get("industry") or "",
        "about": row.get("about") or "",
        "city": row.get("city") or "",
        "contact_name": row.get("contact_name") or "",
        "contact_email": row.get("contact_email") or "",
        "size_band": row.get("size_band") or "",
    }


@router.post("/orgs/signup")
def signup(body: SignupBody):
    """Demo: work email is not verified. Creates a confirmed auth user + company org."""
    orgs.rate_limit_signup()
    email = str(body.contact_email).strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ApiError(400, "enter a work email")
    uid = orgs.create_confirmed_user(email, body.password, body.contact_name.strip())
    on_create_account(uid)   # profiles are only ever created through the hook
    industry = body.industry if body.industry in orgs.INDUSTRIES else "Other"
    size = body.size_band if body.size_band in orgs.SIZES else ""
    with db.conn() as c:
        c.execute("update profiles set name = %s, onboarding_status = 'complete', account_kind = 'company' where id = %s",
                  (body.contact_name.strip(), uid))
        org = c.execute(
            "insert into organizations (name, owner_id, website, industry, about, city, contact_name, contact_email, size_band) "
            "values (%s, %s, %s, %s, %s, %s, %s, %s, %s) returning id, name, website, industry, about, city, "
            "contact_name, contact_email, size_band",
            (body.company_name.strip(), uid, body.website.strip(), industry, body.about.strip(),
             body.city.strip(), body.contact_name.strip(), email, size),
        ).fetchone()
        c.execute("insert into org_members (org_id, user_id, role) values (%s, %s, 'admin')",
                  (org["id"], uid))
    return {"ok": True, "org": _public_org(org)}


@router.get("/me/org")
def my_org(user: User = Depends(current_user)):
    ensure_profile(user.id)
    profile = db.fetchone("select * from profiles where id = %s", (user.id,))
    account = (profile or {}).get("account_kind") or "person"
    org = orgs.org_for_user(user.id) if account == "company" else None
    events = []
    if org:
        rows = db.fetchall(
            "select e.id, e.name, e.venue, e.location_text, e.starts_at, e.ends_at, e.description, e.promo "
            "from events e where e.org_id = %s order by e.id desc",
            (org["id"],),
        )
        events = [orgs.studio_event(r) for r in rows]
    return {"account": account, "org": _public_org(org) if org else None, "events": events}


@router.patch("/orgs")
def patch_org(body: PatchOrgBody, user: User = Depends(current_user)):
    org = orgs.require_org(user.id)
    fields = body.model_dump(exclude_none=True)
    if "industry" in fields and fields["industry"] not in orgs.INDUSTRIES:
        fields["industry"] = "Other"
    if not fields:
        return {"org": _public_org(org)}
    sets = ", ".join(f"{k} = %s" for k in fields)
    db.execute(f"update organizations set {sets} where id = %s", (*fields.values(), org["id"]))
    return {"org": _public_org(orgs.require_org(user.id))}


@router.post("/orgs/events")
def create_company_event(body: CreateEventBody, user: User = Depends(current_user)):
    org = orgs.require_org(user.id)
    code = orgs.new_join_code()
    row = db.fetchone(
        "insert into events (name, venue, location_text, starts_at, ends_at, description, promo, org_id, join_code_hash) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
        "returning id, name, venue, location_text, starts_at, ends_at, description, promo, org_id",
        (body.name.strip(), body.location.strip(), body.location.strip(), orgs.parse_ts(body.starts_at),
         orgs.parse_ts(body.ends_at), body.description.strip(), body.promo.strip(), org["id"],
         orgs.hash_join_code(code)),
    )
    population.invalidate()
    return {"event": orgs.studio_event(row, join_code=code)}


@router.get("/orgs/events/{event_id}")
def event_studio(event_id: int, user: User = Depends(current_user)):
    row = orgs.require_event_org(event_id, user.id)
    token = qr.sign_event(event_id)
    posts = db.fetchall(
        "select id, body, created_at from event_posts where event_id = %s order by id desc limit 20",
        (event_id,),
    )
    return {
        "event": orgs.studio_event(row),
        "join": {**token, "qr_payload": f"{token['payload']}.{token['signature']}"},
        "posts": posts,
    }


@router.post("/orgs/events/{event_id}/rotate-code")
def rotate_code(event_id: int, user: User = Depends(current_user)):
    orgs.require_event_org(event_id, user.id)
    code = orgs.new_join_code()
    db.execute("update events set join_code_hash = %s where id = %s", (orgs.hash_join_code(code), event_id))
    return {"join_code": code}


@router.post("/orgs/events/{event_id}/promote")
def promote(event_id: int, body: PromoteBody, user: User = Depends(current_user)):
    orgs.require_event_org(event_id, user.id)
    text = body.body.strip()
    with db.conn() as c:
        row = c.execute(
            "insert into event_posts (event_id, author_id, body) values (%s, %s, %s) returning id, body, created_at",
            (event_id, user.id, text),
        ).fetchone()
        c.execute("update events set promo = %s where id = %s", (text[:280], event_id))
        regs = c.execute(
            "select user_id from event_registrations where event_id = %s",
            (event_id,),
        ).fetchall()
        for r in regs:
            if r["user_id"] != user.id:
                social.notify(c, r["user_id"], "event_update", {"event_id": event_id})
    return {"post": row}


@router.post("/events/enter")
def enter_code(body: EnterCodeBody, user: User = Depends(current_user)):
    """Person joins a company event with the printed code. Not a connection."""
    ensure_profile(user.id)
    digest = orgs.hash_join_code(body.code)
    ev = db.fetchone("select id, name from events where join_code_hash = %s", (digest,))
    if not ev:
        raise ApiError(404, "code not found")
    db.execute(
        "insert into event_registrations (event_id, user_id) values (%s, %s) on conflict do nothing",
        (ev["id"], user.id))
    db.execute(
        "insert into attendance (event_id, user_id) values (%s, %s) on conflict do nothing",
        (ev["id"], user.id))
    population.invalidate()
    return {"event_id": ev["id"], "name": ev["name"]}
