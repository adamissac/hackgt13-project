from fastapi import APIRouter, Depends

from .. import db
from ..auth import User, current_user

router = APIRouter()


@router.get("/health")
def health():
    """Public liveness check. The only endpoint without auth."""
    return {"ok": True, "db": db.ping() if db.is_open() else False}


@router.get("/whoami")
def whoami(user: User = Depends(current_user)):
    """Authenticated echo, for checking a phone's token end to end."""
    return {"user_id": user.id}
