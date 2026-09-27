"""AL7: Connection Graph data (MASTER_SPEC 3.12, 9). Builders live in app/graph.py."""
from typing import Literal

from fastapi import APIRouter, Depends, Query

from .. import db, graph, matching
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter(prefix="/graph")
Facet = Literal["all", "technical", "career", "personal", "academic"]


def _event_for(user_id: str, event_id: int | None) -> int:
    if event_id is None:
        r = db.fetchone("select event_id from attendance where user_id = %s order by checked_in_at desc limit 1",
                        (user_id,))
        if not r:
            raise ApiError(400, "check in to an event to see matches")
        event_id = r["event_id"]
    if not matching.is_checked_in(user_id, event_id):
        raise ApiError(403, "check in to this event first")
    return event_id


@router.get("")
def get_graph(mode: Literal["matches", "network", "event"] = "matches", event_id: int | None = None,
              depth: int = Query(1, ge=1, le=2), max_people: int = Query(30, ge=1, le=100),
              min_score: float = Query(0.0, ge=-1, le=1), facet: Facet = "all",
              user: User = Depends(current_user)):
    ensure_profile(user.id)
    if mode == "event":
        raise ApiError(400, "the organizer event map is GET /dashboard/{event_id}")
    if mode == "network":
        # event_id in network mode = "I'm inside this event": only connections who are also there.
        scope = _event_for(user.id, event_id) if event_id is not None else None
        return graph.network_graph(user.id, max_people, min_score, facet, scope)
    return graph.matches_graph(user.id, _event_for(user.id, event_id), depth, max_people, min_score, facet)


@router.get("/expand")
def expand(node_id: str = Query(..., max_length=64), mode: Literal["matches", "network"] = "matches",
           event_id: int | None = None, user: User = Depends(current_user)):
    ev = _event_for(user.id, event_id) if mode == "matches" and node_id.startswith("t_") else event_id
    return graph.expand(user.id, node_id, mode, ev)
