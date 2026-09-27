"""AK7: meetup location sharing (MASTER_SPEC 7.6). Owner: Akshar.

Only between the two people in a MATCHED suggestion (both said yes), only while both are Open to Meet,
only until they meet, and for at most 30 minutes. Rows live in `location_shares` (Realtime, RLS: the other
participant reads, the owner writes) and are deleted when sharing ends. Alan's code already deletes them on a
verified conversation (conversations.create_conversation), on Open to Meet OFF (PATCH /me/open-to-meet) and
after expires_at (tasks.py retention); this router enforces the same rules on every write.

POST   /location-shares/{suggestion_id}  {lat, lng}  -> my share (starts or updates it)
GET    /location-shares/{suggestion_id}              -> the other person's latest point, if they are sharing
DELETE /location-shares/{suggestion_id}              -> stop sharing for BOTH people
GET    /location-shares                              -> my matched meetups that can still share
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import db
from ..auth import User, current_user
from ..errors import ApiError

router = APIRouter(prefix="/location-shares", tags=["location"])

SHARE_TTL = timedelta(minutes=30)
MATCH_WINDOW = timedelta(hours=2)  # a matched suggestion can start sharing only this long after it was made


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


class Point(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


def _end(suggestion_id: int) -> ApiError:
    """Delete both rows in their own committed statement (raising inside db.conn() rolls back)."""
    db.execute("delete from location_shares where suggestion_id = %s", (suggestion_id,))
    return ApiError(410, "sharing ended")


def _meetup(c, suggestion_id: int, user_id: str) -> tuple[dict, str]:
    """The suggestion if the caller may share on it now, plus the other person's id. Any reason it isn't
    allowed looks the same to the caller (no hint about the other person's settings)."""
    s = c.execute("select id, user_a::text as a, user_b::text as b, status, created_at from suggestions "
                  "where id = %s and (user_a = %s or user_b = %s)", (suggestion_id, user_id, user_id)).fetchone()
    if s is None:
        raise ApiError(404, "meetup not found")
    other = s["b"] if s["a"] == user_id else s["a"]
    lo, hi = sorted((s["a"], s["b"]))
    both_open = c.execute("select count(*) as n from profiles where id in (%s, %s) and open_to_meet",
                          (s["a"], s["b"])).fetchone()["n"] == 2
    met = c.execute("select 1 as ok from conversations where user_a = %s and user_b = %s and created_at >= %s",
                    (lo, hi, s["created_at"])).fetchone()
    blocked = c.execute("select 1 as ok from blocks where (blocker_id = %s and blocked_id = %s) "
                        "or (blocker_id = %s and blocked_id = %s)", (s["a"], s["b"], s["b"], s["a"])).fetchone()
    if (s["status"] != "matched" or not both_open or met or blocked
            or _now() > s["created_at"] + MATCH_WINDOW):
        raise _end(suggestion_id)
    return s, other


@router.post("/{suggestion_id}")
def share(suggestion_id: int, body: Point, user: User = Depends(current_user)):
    now = _now()
    with db.conn() as c:
        _meetup(c, suggestion_id, user.id)
        rows = {r["user_id"]: r for r in c.execute(
            "select user_id::text as user_id, expires_at from location_shares where suggestion_id = %s",
            (suggestion_id,)).fetchall()}
        mine = rows.get(user.id)
        if mine and mine["expires_at"] <= now:
            raise _end(suggestion_id)
        # One 30-minute window per meetup: join the other person's window if it is already running.
        others = [r["expires_at"] for u, r in rows.items() if u != user.id and r["expires_at"] > now]
        expires_at = mine["expires_at"] if mine else min([now + SHARE_TTL, *others])
        c.execute("insert into location_shares (suggestion_id, user_id, lat, lng, updated_at, expires_at) "
                  "values (%s, %s, %s, %s, %s, %s) on conflict (suggestion_id, user_id) do update "
                  "set lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at",
                  (suggestion_id, user.id, body.lat, body.lng, now, expires_at))
    return {"sharing": True, "expires_at": _iso(expires_at)}


@router.get("/{suggestion_id}")
def read(suggestion_id: int, user: User = Depends(current_user)):
    now = _now()
    with db.conn() as c:
        _, other_id = _meetup(c, suggestion_id, user.id)
        rows = {r["user_id"]: r for r in c.execute(
            "select user_id::text as user_id, lat, lng, updated_at, expires_at from location_shares "
            "where suggestion_id = %s and expires_at > %s", (suggestion_id, now)).fetchall()}
        name = c.execute("select name from profiles where id = %s", (other_id,)).fetchone()
    mine, theirs = rows.get(user.id), rows.get(other_id)
    return {
        "suggestion_id": suggestion_id,
        "other": {"user_id": other_id, "name": (name or {}).get("name")},
        "sharing": mine is not None,
        "expires_at": _iso(mine["expires_at"] if mine else theirs["expires_at"] if theirs else None),
        # Exact coordinates are reciprocal: a matched person must actively share
        # their own location before this response ever includes the other's point.
        "their_location": ({"lat": theirs["lat"], "lng": theirs["lng"], "updated_at": _iso(theirs["updated_at"])}
                           if mine and theirs else None),
    }


@router.delete("/{suggestion_id}")
def stop(suggestion_id: int, user: User = Depends(current_user)):
    with db.conn() as c:
        if not c.execute("select 1 as ok from suggestions where id = %s and (user_a = %s or user_b = %s)",
                         (suggestion_id, user.id, user.id)).fetchone():
            raise ApiError(404, "meetup not found")
        c.execute("delete from location_shares where suggestion_id = %s", (suggestion_id,))
    return {"sharing": False}


@router.get("")
def my_meetups(user: User = Depends(current_user)):
    """Matched suggestions from the last 2 hours where the two haven't met yet (entry points to Find them)."""
    rows = db.fetchall(
        "select s.id, case when s.user_a = %(me)s then s.user_b else s.user_a end::text as other_id, "
        "p.name, p.photo_url, s.created_at "
        "from suggestions s join profiles p on p.id = case when s.user_a = %(me)s then s.user_b else s.user_a end "
        "where (s.user_a = %(me)s or s.user_b = %(me)s) and s.status = 'matched' and s.created_at > %(since)s "
        "and not exists (select 1 from conversations v where v.user_a = least(s.user_a, s.user_b) "
        "  and v.user_b = greatest(s.user_a, s.user_b) and v.created_at >= s.created_at) "
        "order by s.created_at desc", {"me": user.id, "since": _now() - MATCH_WINDOW})
    return {"meetups": [{"suggestion_id": r["id"], "other": {"user_id": r["other_id"], "name": r["name"],
                                                             "photo_url": r["photo_url"]}} for r in rows]}
