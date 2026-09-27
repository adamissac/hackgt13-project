"""The caller's own connections (docs/api.md 11; MASTER_SPEC 9, 6.10). Never anyone else's list or count."""
from fastapi import APIRouter, Depends

from .. import db, matching, population
from ..auth import User, current_user
from ..errors import ApiError

router = APIRouter(prefix="/connections")


def _rows(viewer: str, other: str | None = None) -> list[dict]:
    """One row per connection with how they met and what the VIEWER checked as discussed."""
    return db.fetchall(
        "select case when c.user_a = %(v)s then c.user_b else c.user_a end::text as user_id, "
        "p.name, p.photo_url, p.headline, c.created_at, c.how_met, e.name as met_at, cv.minutes, "
        "coalesce((select array_agg(i.canonical_name order by i.canonical_name) from interests i "
        "  where i.id = any(f.talked_about)), '{}') as talked_about, f.other_topic "
        "from connections c "
        "join profiles p on p.id = case when c.user_a = %(v)s then c.user_b else c.user_a end "
        "left join conversations cv on cv.id = c.conversation_id "
        "left join events e on e.id = cv.event_id "
        "left join feedback f on f.conversation_id = c.conversation_id and f.rater_id = %(v)s "
        "where (c.user_a = %(v)s or c.user_b = %(v)s) "
        + ("and (c.user_a = %(o)s or c.user_b = %(o)s) " if other else "")
        + "order by c.created_at desc", {"v": viewer, "o": other})


def _shape(r: dict) -> dict:
    return {"user_id": r["user_id"], "name": r["name"], "photo_url": r["photo_url"],
            "headline": r["headline"] or "", "how_met": r["how_met"], "met_at": r["met_at"],
            "created_at": r["created_at"].isoformat(), "talked_about": list(r["talked_about"] or []),
            "minutes_talked": r["minutes"]}


@router.get("")
def list_connections(user: User = Depends(current_user)):
    return {"connections": [_shape(r) for r in _rows(user.id)]}


def _one(user: User, user_id: str) -> dict:
    if not matching.is_valid_uuid(user_id) or not matching.is_connected(user.id, user_id):
        raise ApiError(404, "connection not found")
    return _rows(user.id, user_id)[0]


@router.get("/{user_id}")
def get_connection(user_id: str, user: User = Depends(current_user)):
    from ml import scoring
    r = _one(user, user_id)
    me, them, index, _ = population.pair_model(user.id, user_id, matching.shared_event(user.id, user_id))
    shared = scoring.shared_interests(me, them, index, 8)
    return {**_shape(r), "shared_topics": [s["name"] for s in shared]}


@router.delete("/{user_id}")
def remove_connection(user_id: str, user: User = Depends(current_user)):
    """Remove a connection (it disappears for both of you). No notification or other signal goes to the other person
    (MASTER_SPEC 11: a "no" is never revealed). You can connect again later after another verified conversation."""
    if not matching.is_valid_uuid(user_id):
        raise ApiError(404, "not a connection")
    lo, hi = sorted([user.id, user_id])
    with db.conn() as c:
        gone = c.execute("delete from connections where user_a = %s and user_b = %s returning 1 as ok", (lo, hi)).fetchone()
    if not gone:
        raise ApiError(404, "not a connection")
    population.invalidate()
    return {"ok": True}


@router.post("/{user_id}/followup-draft")
def followup_draft(user_id: str, user: User = Depends(current_user)):
    from ml import generation, scoring
    r = _one(user, user_id)
    me, them, index, _ = population.pair_model(user.id, user_id, matching.shared_event(user.id, user_id))
    shared = [s["name"] for s in scoring.shared_interests(me, them, index, 5)]
    first = lambda n: (n or "").split(" ")[0] or "there"
    talked = list(r["talked_about"] or [])
    try:
        draft = generation.followup_draft(first(me.get("name")), first(them.get("name")), talked,
                                          r["other_topic"] or "", shared)
    except Exception:
        draft = generation.template_followup(first(them.get("name")), talked or shared)
    return {"draft": draft}
