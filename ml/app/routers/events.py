"""AL3: event check-in and ranked matches (docs/api.md 5-6, MASTER_SPEC 6.6)."""
from fastapi import APIRouter, Depends, Query

from .. import db, matching, population
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter(prefix="/events")


def _event_or_404(event_id: int) -> dict:
    e = db.fetchone("select id, name from events where id = %s", (event_id,))
    if not e:
        raise ApiError(404, "event not found")
    return e


@router.post("/{event_id}/checkin")
def checkin(event_id: int, user: User = Depends(current_user)):
    ensure_profile(user.id)
    _event_or_404(event_id)
    db.execute("insert into attendance (event_id, user_id) values (%s, %s) on conflict do nothing",
               (event_id, user.id))
    population.invalidate()
    return {"ok": True}


@router.get("/{event_id}/matches")
def matches(event_id: int, limit: int = Query(20, ge=1, le=100), user: User = Depends(current_user)):
    _event_or_404(event_id)
    if not matching.is_checked_in(user.id, event_id):
        raise ApiError(403, "check in to this event first")
    ranked, m = matching.rank_for_viewer(user.id, event_id)
    top = ranked[:limit]
    model = matching.model_name()
    matching.log_impressions(user.id, event_id, top, model)
    out = []
    for r in top:
        p = m.people[r["id"]]
        out.append({"user_id": r["id"], "name": p.get("name"), "photo_url": p.get("photo_url"),
                    "role": p.get("role"), "score": round(r["score"], 4), "rank": r["rank"] + 1,
                    "highlight": r["highlight"], "why": r["why"], "proximity": None})
    return {"event_id": event_id, "model": model, "matches": out}
