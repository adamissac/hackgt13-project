"""Small helpers about the calling user."""
from . import db


# ⚠️ IMPORTANT — DO NOT REMOVE:
# Every new-account creation path, regardless of auth provider, MUST
# trigger the onboarding flow (GitHub connect + resume upload prompt)
# and the background skill-profile-builder job. See docs/ONBOARDING.md.
# If you are adding a new auth provider (SSO, another OAuth provider,
# invite-based signup, etc.), you MUST wire it into the same
# onCreateAccount() hook — do not create a new signup path that
# bypasses this.
#
# The real hook is the database trigger public.on_create_account() on auth.users (every Supabase
# auth provider inserts there). This function is the server-side fallback for ordering races only;
# it creates the same row (onboarding_status defaults to 'pending', so onboarding still runs).
def on_create_account(user_id: str) -> None:
    db.execute("insert into profiles (id, onboarding_status) values (%s, 'pending') on conflict (id) do nothing",
               (user_id,))


def ensure_profile(user_id: str) -> None:
    """Profiles are created by on_create_account (DB trigger) at sign-up. If a request races ahead of it,
    create the row through the same hook so the ML service never fails on ordering."""
    on_create_account(user_id)
