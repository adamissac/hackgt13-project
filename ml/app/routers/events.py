"""AL3: event check-in and ranked matches (docs/api.md 5-6, MASTER_SPEC 6.6).

Also company events: list, create (org owner), register, join-by-QR (docs/api.md 45).

Company events check people in only by QR: register first (signs you up, you are not "at" the event yet),
then scan the organizer's join QR at the venue. Only checked-in people (attendance) see or are shown to
each other, so a registration alone never puts someone in front of other attendees.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from .. import db, matching, population, qr
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter()


def _event_or_404(event_id: int) -> dict:
    e = db.fetchone("select id, name from events where id = %s", (event_id,))
    if not e:
        raise ApiError(404, "event not found")
    return e


def _event_card(row: dict, user_id: str) -> dict:
    eid = row["id"]
    registered = bool(db.fetchone(
        "select 1 as ok from event_registrations where event_id = %s and user_id = %s", (eid, user_id)))
    checked_in = bool(db.fetchone(
        "select 1 as ok from attendance where event_id = %s and user_id = %s", (eid, user_id)))
    mine = bool(row.get("org_id") and db.fetchone(
        "select 1 as ok from org_members where org_id = %s and user_id = %s", (row["org_id"], user_id)))
    return {
        "id": eid,
        "name": row["name"],
        "host": row.get("host") or "",
        "location": row.get("location_text") or row.get("venue") or "",
        "starts_at": row.get("starts_at"),
        "ends_at": row.get("ends_at"),
        "description": row.get("description") or "",
        "promo": row.get("promo") or "",
        "registered": registered,
        "checked_in": checked_in,
        "mine": mine,
    }


def _register(event_id: int, user_id: str) -> None:
    db.execute(
        "insert into event_registrations (event_id, user_id) values (%s, %s) on conflict do nothing",
        (event_id, user_id))


def _is_registered(event_id: int, user_id: str) -> bool:
    return db.fetchone(
        "select 1 as ok from event_registrations where event_id = %s and user_id = %s", (event_id, user_id)) is not None


def _check_in(event_id: int, user_id: str) -> None:
    db.execute("insert into attendance (event_id, user_id) values (%s, %s) on conflict do nothing",
               (event_id, user_id))
    population.invalidate()


class CreateEventBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str = Field(default="", max_length=200)
    starts_at: str | None = None
    ends_at: str | None = None


class JoinBody(BaseModel):
    payload: str = Field(max_length=500)
    signature: str = Field(max_length=200)


@router.get("/events")
def list_events(user: User = Depends(current_user)):
    ensure_profile(user.id)
    rows = db.fetchall(
        "select e.id, e.name, e.venue, e.location_text, e.starts_at, e.ends_at, e.description, e.promo, "
        "e.org_id, o.name as host "
        "from events e left join organizations o on o.id = e.org_id "
        "order by e.starts_at desc nulls last, e.id")
    return {"events": [_event_card(r, user.id) for r in rows]}


@router.post("/events")
def create_event(body: CreateEventBody, user: User = Depends(current_user)):
    ensure_profile(user.id)
    org = db.fetchone(
        "select o.id from organizations o join org_members m on m.org_id = o.id "
        "where m.user_id = %s order by o.id limit 1", (user.id,))
    if not org:
        raise ApiError(403, "create a company first")
    row = db.fetchone(
        "insert into events (name, venue, location_text, starts_at, ends_at, org_id) "
        "values (%s, %s, %s, %s, %s, %s) returning id, name, venue, location_text, starts_at, ends_at, org_id",
        (body.name.strip(), body.location.strip(), body.location.strip(), body.starts_at, body.ends_at, org["id"]))
    card = _event_card({**row, "host": None}, user.id)
    card["host"] = ""
    return {"event": card}


@router.post("/events/join")
def join_event(body: JoinBody, user: User = Depends(current_user)):
    ensure_profile(user.id)
    event_id = qr.verify_event(body.payload, body.signature)
    e = _event_or_404(event_id)
    if not _is_registered(event_id, user.id):
        raise ApiError(403, "register for this event first")
    _check_in(event_id, user.id)
    return {"event_id": event_id, "name": e["name"]}


@router.get("/events/{event_id}/updates")
def event_updates(event_id: int, user: User = Depends(current_user)):
    """Organizer posts for people already registered. Not a group chat and no attendee names."""
    ensure_profile(user.id)
    _event_or_404(event_id)
    allowed = db.fetchone(
        "select 1 as ok from event_registrations where event_id = %s and user_id = %s",
        (event_id, user.id),
    ) or db.fetchone(
        "select 1 as ok from events e join org_members m on m.org_id = e.org_id "
        "where e.id = %s and m.user_id = %s",
        (event_id, user.id),
    )
    if not allowed:
        raise ApiError(403, "register for this event first")
    ev = db.fetchone("select promo, description from events where id = %s", (event_id,))
    posts = db.fetchall(
        "select id, body, created_at from event_posts where event_id = %s order by id desc limit 20",
        (event_id,),
    )
    return {
        "event_id": event_id,
        "promo": (ev or {}).get("promo") or "",
        "description": (ev or {}).get("description") or "",
        "posts": posts,
    }


@router.post("/events/{event_id}/register")
def register(event_id: int, user: User = Depends(current_user)):
    ensure_profile(user.id)
    _event_or_404(event_id)
    _register(event_id, user.id)
    return {"ok": True}


@router.post("/events/{event_id}/unregister")
def unregister(event_id: int, user: User = Depends(current_user)):
    """Changed your mind (Interested / Not attending): drop the registration and any check-in, so you leave the
    session and nobody at the event sees you. Idempotent."""
    ensure_profile(user.id)
    _event_or_404(event_id)
    with db.conn() as c:
        c.execute("delete from event_registrations where event_id = %s and user_id = %s", (event_id, user.id))
        c.execute("delete from attendance where event_id = %s and user_id = %s", (event_id, user.id))
    population.invalidate()
    return {"ok": True}


@router.get("/events/{event_id}/join-token")
def join_token(event_id: int, user: User = Depends(current_user)):
    e = db.fetchone(
        "select e.id, e.org_id from events e where e.id = %s", (event_id,))
    if not e:
        raise ApiError(404, "event not found")
    if not e.get("org_id") or not db.fetchone(
            "select 1 as ok from org_members where org_id = %s and user_id = %s", (e["org_id"], user.id)):
        raise ApiError(403, "organizers only")
    token = qr.sign_event(event_id)
    return {**token, "event_id": event_id, "qr_payload": f"{token['payload']}.{token['signature']}"}


@router.post("/events/{event_id}/checkin")
def checkin(event_id: int, user: User = Depends(current_user)):
    ensure_profile(user.id)
    e = db.fetchone("select id, org_id from events where id = %s", (event_id,))
    if not e:
        raise ApiError(404, "event not found")
    if e.get("org_id"):
        # Company events: only the organizer's join QR or printed join code check people in.
        raise ApiError(403, "scan the event QR or enter the join code")
    _check_in(event_id, user.id)
    return {"ok": True}


@router.post("/events/{event_id}/leave")
def leave(event_id: int, user: User = Depends(current_user)):
    """Leave an event: back to roaming. I disappear from its attendee list and matches, and its open suggestions
    for me end. My registration stays, so I can scan back in later."""
    _event_or_404(event_id)
    with db.conn() as c:
        c.execute("delete from attendance where event_id = %s and user_id = %s", (event_id, user.id))
        c.execute("update suggestions set status = 'expired' where event_id = %s and status = 'pending' "
                  "and (user_a = %s or user_b = %s)", (event_id, user.id, user.id))
    population.invalidate()
    return {"ok": True}


@router.get("/events/{event_id}/matches")
def matches(event_id: int, limit: int = Query(20, ge=1, le=100), user: User = Depends(current_user)):
    _event_or_404(event_id)
    if not matching.is_checked_in(user.id, event_id):
        raise ApiError(403, "check in to this event first")
    ranked, m = matching.rank_for_viewer(user.id, event_id)
    top = ranked[:limit]
    model = matching.model_name()
    matching.log_impressions(user.id, event_id, top, model)
    bands = matching.proximity_bands(user.id, [r["id"] for r in top])
    out = []
    for r in top:
        p = m.people[r["id"]]
        out.append({"user_id": r["id"], "name": p.get("name"), "photo_url": p.get("photo_url"),
                    "role": p.get("role"), "score": round(r["score"], 4), "rank": r["rank"] + 1,
                    "highlight": r["highlight"], "why": r["why"], "proximity": bands.get(r["id"])})
    return {"event_id": event_id, "model": model, "matches": out}


@router.get("/events/{event_id}/nearby")
def nearby(event_id: int, limit: int = Query(100, ge=1, le=100), user: User = Depends(current_user)):
    """Recent radio evidence, including connections; never truncate recommendations first."""
    _event_or_404(event_id)
    if not matching.is_checked_in(user.id, event_id):
        raise ApiError(403, "check in to this event first")
    if not db.fetchone("select 1 as ok from profiles where id = %s and open_to_meet", (user.id,)):
        raise ApiError(403, "Turn on Open to Meet to see people nearby")
    banned = matching.excluded_ids(user.id, include_connections=False)
    # Read opt-in/check-in live: model caches must never delay withdrawing visibility.
    rows = db.fetchall("select p.id::text as id, p.name, p.photo_url, p.role from profiles p "
                       "join attendance a on a.user_id = p.id where a.event_id = %s "
                       "and p.open_to_meet and p.id != %s", (event_id, user.id))
    candidates = {p["id"]: p for p in rows if p["id"] not in banned}
    bands = matching.proximity_bands(user.id, list(candidates))
    order = {"immediate": 0, "near": 1, "far": 2}
    ids = sorted(bands, key=lambda uid: (order[bands[uid]], uid))[:limit]
    return {"event_id": event_id, "model": "proximity", "matches": [
        {"user_id": uid, "name": candidates[uid].get("name"),
         "photo_url": candidates[uid].get("photo_url"), "role": candidates[uid].get("role"),
         "score": 0, "rank": i + 1, "highlight": False, "why": [], "proximity": bands[uid]}
        for i, uid in enumerate(ids)]}
