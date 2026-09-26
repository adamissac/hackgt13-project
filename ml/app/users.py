"""Small helpers about the calling user."""
from . import db


def ensure_profile(user_id: str) -> None:
    """Profiles are created on first sign-in (AD2). Create a bare row if the app hasn't yet,
    so the ML service never fails on ordering. Requires the auth.users row, which exists for any
    verified token."""
    db.execute("insert into profiles (id) values (%s) on conflict (id) do nothing", (user_id,))
