from fastapi import APIRouter, Depends

from .. import db
from ..auth import User, current_user

router = APIRouter()


@router.get("/health")
def health():
    """Public liveness check. The only endpoint without auth.

    `embedder` and `umap` are here because both degrade *silently*: a server with a failed
    sentence-transformers or umap import still answers 200 and still serves a dashboard, just
    with different vectors or an empty community map. Comparing two deployments took an hour
    without this; it should take one curl.
    """
    from ml import embed, viz
    return {"ok": True,
            "db": db.ping() if db.is_open() else False,
            "embedder": embed.status(),
            "umap": viz.umap_available()}


@router.get("/whoami")
def whoami(user: User = Depends(current_user)):
    """Authenticated echo, for checking a phone's token end to end."""
    return {"user_id": user.id}
