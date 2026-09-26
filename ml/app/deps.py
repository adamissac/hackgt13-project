"""Dependencies shared by Akshar's routers (invites, ble). Tests override `get_user_id`."""
from fastapi import Depends

from .auth import User, current_user


def get_user_id(user: User = Depends(current_user)) -> str:
    return user.id
