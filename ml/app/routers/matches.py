"""AL4: quick profile and conversation starters (MASTER_SPEC 3.3, 6.9, 9; docs/api.md 7 and 15).

Both are visible only for a current match, an open suggestion, or a connection (matching.relationship).
Anyone else gets 403 with the same message, so the response never reveals why.
"""
import hashlib
import json
import logging
import threading
import uuid

from fastapi import APIRouter, Depends

from ml import scoring
from ml.config import FACETS

from .. import synthetic, matching, population
from ..auth import User, current_user
from ..errors import ApiError

log = logging.getLogger("matches")
router = APIRouter(prefix="/matches")

NOT_AVAILABLE = "this profile isn't available"
_starter_cache: dict[tuple, dict] = {}
_cache_lock = threading.Lock()


def _first_name(name: str | None) -> str:
    return (name or "").split(" ")[0] or "them"


def _context(viewer: str, other: str):
    try:
        other = str(uuid.UUID(other))
    except ValueError:
        raise ApiError(403, NOT_AVAILABLE)
    rel = matching.relationship(viewer, other)
    if rel is None:
        raise ApiError(403, NOT_AVAILABLE)
    me, them, index, cluster = population.pair_model(viewer, other, rel["event_id"])
    return rel, me, them, index, cluster


@router.get("/{user_id}/quick-profile")
def quick_profile(user_id: str, user: User = Depends(current_user)):
    rel, me, them, index, cluster = _context(user.id, user_id)
    score, f = matching.pair_score(me, them, index, cluster)
    shared = scoring.shared_interests(me, them, index, k=8)
    return {
        "user_id": them["id"], "name": them.get("name"), "photo_url": them.get("photo_url"),
        "role": them.get("role"), "headline": them.get("headline") or "",
        "seeking": them.get("seeking") or "", "offering": them.get("offering") or "",
        "connected": rel["kind"] == "connection",
        # Seeded demo attendee (Arjun's population): the app offers "simulate meeting" instead of Bluetooth/QR.
        "demo_attendee": bool(them.get("is_synthetic")) or synthetic.is_synthetic(them["id"]),
        "score": round(score, 4),
        "shared_topics": [{"interest_id": s["id"], "name": s["name"], "facet": index.facets[s["id"]],
                           "strength": round(min(me["interests"][s["id"]]["weight"],
                                                 them["interests"][s["id"]]["weight"]), 4),
                           "evidence": s["evidence_b"]} for s in shared],
        "facet_overlap": {fc: round(max(0.0, f[f"sim_{fc}"]), 4) for fc in FACETS},
        "complementarity": round(max(0.0, f["complementarity"]), 4),
    }


@router.get("/{user_id}/starters")
def starters(user_id: str, user: User = Depends(current_user)):
    from ml import generation
    rel, me, them, index, cluster = _context(user.id, user_id)
    shared = scoring.shared_interests(me, them, index, k=3)
    viewer = {"first_name": _first_name(me.get("name")), "seeking": me.get("seeking"), "offering": me.get("offering")}
    other = {"first_name": _first_name(them.get("name")), "seeking": them.get("seeking"),
             "offering": them.get("offering")}
    grounded = [{"name": s["name"], "evidence_a": s["evidence_a"], "evidence_b": s["evidence_b"]} for s in shared]
    key = (user.id, them["id"], hashlib.sha1(json.dumps([viewer, other, grounded], sort_keys=True).encode()).hexdigest())
    with _cache_lock:
        if key in _starter_cache:
            return _starter_cache[key]
    try:
        out = generation.starters(viewer, other, grounded)
    except Exception as e:  # no key, API down, or two bad outputs: fall back to a grounded template
        log.warning("starters fell back to template: %s", e)
        return generation.template_starters(other["first_name"], grounded)
    with _cache_lock:
        _starter_cache[key] = out
    return out
