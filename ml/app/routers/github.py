"""GitHub connect + ingestion (AR1, Arjun). Contract: docs/api.md 33; MASTER_SPEC 5.2, 5.3.

- GET /connect/github/start     (JWT) -> {"url": authorize URL with a signed 10-minute state}
- GET /connect/github/callback  (no JWT: GitHub calls it; the signed state is the auth) -> 302 to the app
After connecting, the repo digest lands in raw_documents(source='github') and is extracted with the same
pipeline as every other source (profile_store.ingest_text). POST /profile/ingest {"source": "github"}
re-extracts the newest digest.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ml import github_ingest, github_oauth

from .. import db, profile_store
from ..auth import User, current_user
from ..errors import ApiError

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/connect/github/start")
def github_start(user: User = Depends(current_user)):
    try:
        return {"url": github_oauth.authorize_url(user.id)}
    except github_oauth.OAuthError as e:
        raise ApiError(500, f"GitHub connect is not configured: {e}")


@router.get("/connect/github/callback")
def github_callback(background: BackgroundTasks, code: str = "", state: str = "", error: str = ""):
    if error:  # user pressed Cancel on GitHub
        return RedirectResponse(github_oauth.app_redirect("error", reason="denied"), status_code=302)
    try:
        user_id = github_oauth.verify_state(state)
        token = github_oauth.exchange_code(code)
        login = github_ingest.get_user(token["access_token"])["login"]
    except (github_oauth.OAuthError, github_ingest.GitHubError, KeyError) as e:
        log.warning("github callback failed: %s", e)
        return RedirectResponse(github_oauth.app_redirect("error", reason="oauth"), status_code=302)
    _store_token(user_id, token, login)
    background.add_task(ingest_github, user_id)
    return RedirectResponse(github_oauth.app_redirect("ok"), status_code=302)


def _store_token(user_id: str, token: dict, login: str) -> None:
    """Encrypt and upsert the GitHub token. Shared by the OAuth callback and the sign-in path."""
    row = github_oauth.linked_account_row(user_id, token, login)
    db.execute(
        "insert into linked_accounts (user_id, provider, provider_uid, access_token_enc, scopes) "
        "values (%s, 'github', %s, %s, %s) on conflict (user_id, provider) do update set "
        "provider_uid = excluded.provider_uid, access_token_enc = excluded.access_token_enc, scopes = excluded.scopes",
        (user_id, row["provider_uid"], row["access_token_enc"], row["scopes"]))


class SessionTokenBody(BaseModel):
    provider_token: str = Field(min_length=1)
    scopes: str | None = None


@router.post("/connect/github/session")
def github_from_session(body: SessionTokenBody, background: BackgroundTasks,
                        user: User = Depends(current_user)):
    """Reuse the consent the user already gave when signing in with GitHub.

    Supabase hands the app a `provider_token` once, in the session right after an OAuth sign-in
    (it is not persisted, so the app posts it here immediately). Storing it means a user who signed
    in with GitHub is never asked to authorize GitHub a second time for repo ingestion.

    The token is never trusted on the client's word: it is validated against GitHub first, and the
    login that comes back is what gets stored. At rest it is Fernet-encrypted exactly like the
    OAuth callback path, and it never goes back to the client.
    """
    token = body.provider_token.strip()
    try:
        login = github_ingest.get_user(token)["login"]
    except (github_ingest.GitHubError, KeyError) as e:
        log.warning("github session-token connect rejected for %s: %s", user.id, e)
        raise ApiError(400, "github rejected that token")
    _store_token(user.id, {"access_token": token, "scope": body.scopes or github_oauth.SCOPE}, login)
    background.add_task(ingest_github, user.id)
    return {"connected": True, "login": login}


def ingest_github(user_id: str) -> dict | None:
    """Stored token -> repo digest -> raw_documents -> extraction -> user_interests (with evidence)."""
    acct = db.fetchone("select access_token_enc from linked_accounts where user_id = %s and provider = 'github'",
                       (user_id,))
    if not acct:
        raise ApiError(400, "connect github first")
    token = github_oauth.decrypt_token(acct["access_token_enc"])
    prev = profile_store.latest_document(user_id, "github")
    cache = ((prev or {}).get("meta") or {}).get("etag_cache")
    repos, cache = github_ingest.fetch_repos(token=token, cache=cache)

    from ml.llm import github_to_text
    text = github_to_text(repos)
    meta = github_ingest.digest_meta(repos)
    # keep ETags for the listing + languages (small); READMEs re-fetch cheaply as 304s
    meta["etag_cache"] = {u: v for u, v in cache.items() if "/readme" not in u}
    db.execute("update linked_accounts set fetched_at = now() where user_id = %s and provider = 'github'", (user_id,))
    if not text.strip():
        with db.conn() as c:
            profile_store.save_document(c, user_id, "github", "", meta)
        return None
    try:
        return profile_store.ingest_text(user_id, "github", text, meta)
    except Exception:
        log.exception("github extraction failed for %s", user_id)
        from ..skill_profile import mark_partial
        mark_partial(user_id)
        raise

