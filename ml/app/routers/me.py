"""/me: the caller's own settings (MASTER_SPEC 3.3, 9)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import db, matching
from ..auth import User, current_user
from ..users import ensure_profile

router = APIRouter(prefix="/me")


class OpenToMeet(BaseModel):
    open: bool


@router.patch("/open-to-meet")
def open_to_meet(body: OpenToMeet, user: User = Depends(current_user)):
    """ON: eligible for suggestions. OFF: no suggestions, never suggested, and any live meetup location
    sharing this user is part of ends immediately (chats remain)."""
    ensure_profile(user.id)
    with db.conn() as c:
        c.execute("update profiles set open_to_meet = %s where id = %s", (body.open, user.id))
        c.execute("update presence set open_to_meet = %s where user_id = %s", (body.open, user.id))
        if not body.open and matching.table_exists("location_shares"):
            c.execute("delete from location_shares where suggestion_id in "
                      "(select id from suggestions where user_a = %s or user_b = %s)", (user.id, user.id))
    return {"open_to_meet": body.open}
