"""FastAPI routes for GitHub connect + ingestion (AR1). Contract: docs/api.md sections 1 and 15.

    from ml.github_routes import router, ingest_github
    app.include_router(router)

`ingest_github(user_id)` is also what `POST /profile/ingest {"source": "github"}` should call.
"""
import datetime as dt
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse

from . import github_ingest, github_oauth, supa
from .store import store_extraction

log = logging.getLogger(__name__)
router = APIRouter()


def current_user(authorization: str = Header(default="")) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    try:
        return supa.verify_jwt(token)
    except supa.SupabaseError:
        raise HTTPException(status_code=401, detail="invalid or expired token")


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


@router.get("/connect/github/start")
def github_start(user_id: str = Depends(current_user)):
    try:
        return {"url": github_oauth.authorize_url(user_id)}
    except github_oauth.OAuthError as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/connect/github/callback")
def github_callback(background: BackgroundTasks, code: str = "", state: str = "", error: str = ""):
    if error:  # user pressed Cancel on GitHub
        return RedirectResponse(github_oauth.app_redirect("error", reason="denied"), status_code=302)
    try:
        user_id = github_oauth.verify_state(state)
        token = github_oauth.exchange_code(code)
        me = github_ingest.get_user(token["access_token"])
    except (github_oauth.OAuthError, github_ingest.GitHubError) as e:
        log.warning("github callback failed: %s", e)
        return RedirectResponse(github_oauth.app_redirect("error", reason="oauth"), status_code=302)
    row = github_oauth.linked_account_row(user_id, token, me["login"])
    row["fetched_at"] = None
    supa.upsert("linked_accounts", [row], on_conflict="user_id,provider")
    background.add_task(ingest_github, user_id)
    return RedirectResponse(github_oauth.app_redirect("ok"), status_code=302)


def ingest_github(user_id):
    """Stored token -> repo digest -> raw_documents -> extraction -> user_interests. Returns stored interests."""
    rows = supa.select("linked_accounts", {"select": "access_token_enc,provider_uid",
                                           "user_id": f"eq.{user_id}", "provider": "eq.github"})
    if not rows:
        raise ValueError("GitHub not connected")
    token = github_oauth.decrypt_token(rows[0]["access_token_enc"])
    prev = supa.select("raw_documents", {"select": "meta", "user_id": f"eq.{user_id}", "source": "eq.github",
                                         "order": "fetched_at.desc", "limit": "1"})
    cache = (prev[0]["meta"] or {}).get("etag_cache") if prev else None
    repos, cache = github_ingest.fetch_repos(token=token, cache=cache)

    from .llm import extract_interests, github_to_text
    text = github_to_text(repos)
    meta = github_ingest.digest_meta(repos)
    meta["etag_cache"] = {u: {"etag": v["etag"], "body": v["body"]} for u, v in cache.items()
                          if "/readme" not in u}  # READMEs are big; they re-fetch cheaply with 304s anyway
    supa.insert("raw_documents", [{"user_id": user_id, "source": "github", "text": text, "meta": meta}])
    supa.update("linked_accounts", {"user_id": user_id, "provider": "github"}, {"fetched_at": _now()})
    if not text.strip():
        return []
    return store_extraction(user_id, "github", extract_interests(text, "github"))
