"""CI guard: every account-creation path must go through on_create_account() (docs/ONBOARDING.md).

Static checks run everywhere (no DB). The DB check (TEST_DATABASE_URL) signs up one user per auth
provider through the real trigger and asserts each lands in onboarding. Adding a provider? Add it to
AUTH_PROVIDERS below; adding a signup path that bypasses the hook makes these tests fail.
"""
import re
import uuid
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((REPO / "supabase/migrations").glob("*.sql"))
WARNING = "Every new-account creation path, regardless of auth provider, MUST"

# Every provider the app can create accounts with (Supabase Auth `provider` values). All of them insert
# into auth.users, so all of them hit the same trigger. Keep in sync with supabase/config.toml + mobile/lib/auth.tsx.
AUTH_PROVIDERS = ["email", "linkedin_oidc", "magic_link", "github", "google", "x", "sso"]


def _sql() -> str:
    return "\n".join(p.read_text() for p in MIGRATIONS)


def _latest_auth_users_trigger() -> tuple[str, str]:
    """(migration name, function) of the last `create trigger ... on auth.users` in migration order."""
    found = None
    for p in MIGRATIONS:
        for m in re.finditer(r"create\s+trigger\s+(\w+)\s+after\s+insert\s+on\s+auth\.users\s+for\s+each\s+row\s+"
                             r"execute\s+function\s+public\.(\w+)\(\)", p.read_text(), flags=re.I):
            found = (p.name, m.group(2))
    assert found, "no account-creation trigger on auth.users"
    return found


def test_account_creation_trigger_is_on_create_account():
    _, fn = _latest_auth_users_trigger()
    assert fn == "on_create_account", f"auth.users insert must call on_create_account(), not {fn}()"


def test_exactly_one_trigger_name_on_auth_users():
    names = set(re.findall(r"create\s+trigger\s+(\w+)\s+after\s+insert\s+on\s+auth\.users", _sql(), flags=re.I))
    assert names == {"on_auth_user_created"}, f"one signup hook only, found {names}"


def test_on_create_account_starts_onboarding_and_carries_the_warning():
    body = _sql().split("create or replace function public.on_create_account()")[-1].split("$$;")[0]
    assert "onboarding_status" in body and "'pending'" in body
    assert WARNING in _sql()
    assert "drop function if exists public.handle_new_user()" in _sql()


def test_server_creates_profiles_only_through_the_hook():
    offenders = []
    for p in (REPO / "ml/app").rglob("*.py"):
        text = p.read_text()
        if re.search(r"insert\s+into\s+profiles", text, flags=re.I) and p.name != "users.py":
            offenders.append(str(p.relative_to(REPO)))
    assert not offenders, f"create profiles via app.users.on_create_account only: {offenders}"
    assert WARNING in (REPO / "ml/app/users.py").read_text()


def test_mobile_never_creates_accounts_itself_and_gates_on_onboarding():
    mobile = REPO / "mobile"
    for p in list((mobile / "app").rglob("*.tsx")) + list((mobile / "lib").rglob("*.ts*")):
        text = p.read_text()
        assert not re.search(r"from\(['\"]profiles['\"]\)\s*\.\s*(insert|upsert)", text), f"{p}: profiles are created by the DB hook"
    layout = (mobile / "app/_layout.tsx").read_text()
    assert "useOnboarding" in layout and 'name="onboarding"' in layout and WARNING in layout


@pytest.mark.parametrize("provider", AUTH_PROVIDERS)
def test_every_provider_signup_lands_in_onboarding(db, provider):
    """Real trigger from the migration, one signup per provider -> profile with onboarding pending."""
    body = _sql()
    fn = "create or replace function public.on_create_account()" + \
         body.split("create or replace function public.on_create_account()")[-1].split("$$;")[0] + "$$;"
    uid = str(uuid.uuid4())
    try:
        with db.conn() as c:
            c.execute("alter table auth.users add column if not exists raw_user_meta_data jsonb, "
                      "add column if not exists raw_app_meta_data jsonb")
            c.execute(fn)
            c.execute("drop trigger if exists on_auth_user_created on auth.users")
            c.execute("create trigger on_auth_user_created after insert on auth.users "
                      "for each row execute function public.on_create_account()")
            c.execute("insert into auth.users (id, raw_user_meta_data, raw_app_meta_data) values (%s, %s, %s)",
                      (uid, '{"name": "New Person"}', f'{{"provider": "{provider}"}}'))
        row = db.fetchone("select name, onboarding_status from profiles where id = %s", (uid,))
    finally:
        # The test DB is shared by the whole session: other tests create profiles themselves, so the
        # trigger must not outlive this test.
        with db.conn() as c:
            c.execute("drop trigger if exists on_auth_user_created on auth.users")
    assert row == {"name": "New Person", "onboarding_status": "pending"}
