"""Login and account connections: what the caller has connected, and removing a source.

- GET /me/accounts: sign-in method, profile fields, and each profile source (GitHub, resume, typed entry)
  with its status. Never returns tokens.
- DELETE /profile/sources/{source}: remove one source and everything derived from it. GitHub also drops the
  stored OAuth token (linked_accounts) and the user's GitHub feed items. Interests are rebuilt from what's left.

Sign-in itself (LinkedIn OIDC, email magic link) is Supabase Auth in the app (AD2); GitHub connect is
routers/github.py (AR1). LinkedIn is identity only: nothing is ever fetched from it (MASTER_SPEC 5.1).
"""
import os
from typing import Literal

from fastapi import APIRouter, Depends

from .. import db, population, profile_store
from ..auth import User, current_user
from ..users import ensure_profile

router = APIRouter()

SIGN_IN = {"linkedin_oidc": "linkedin", "linkedin": "linkedin", "email": "email"}


def _source_status(user_id: str, source: str) -> dict:
    doc = profile_store.latest_document(user_id, source)
    if not doc:
        return {"added": False, "updated_at": None, "interests": 0}
    row = db.fetchone("select fetched_at from raw_documents where id = %s", (doc["id"],))
    n = len(((doc.get("meta") or {}).get("extraction") or {}).get("interests", []))
    return {"added": True, "updated_at": row["fetched_at"].isoformat(), "interests": n}


def _github_repo_count(user_id: str) -> int | None:
    doc = profile_store.latest_document(user_id, "github")
    if not doc:
        return None
    try:
        return int((doc.get("meta") or {}).get("repo_count", 0))
    except (TypeError, ValueError):
        return None


@router.get("/me/accounts")
def accounts(user: User = Depends(current_user)):
    ensure_profile(user.id)
    prof = db.fetchone("select name, photo_url, headline, experience, seeking, offering, web_search_opt_in "
                       "from profiles where id = %s", (user.id,)) or {}
    gh = db.fetchone("select provider_uid, fetched_at from linked_accounts where user_id = %s and provider = 'github'",
                     (user.id,))
    github = {**_source_status(user.id, "github"), "connected": gh is not None,
              "login": gh["provider_uid"] if gh else None,
              "last_synced_at": gh["fetched_at"].isoformat() if gh and gh["fetched_at"] else None,
              "available": bool(os.getenv("GITHUB_CLIENT_ID")),
              # How many public repos the last import read (0 = connected but nothing public to learn from).
              "repo_count": _github_repo_count(user.id)}
    manual = _source_status(user.id, "manual")
    mdoc = profile_store.latest_document(user.id, "manual")
    return {
        "sign_in": {"provider": SIGN_IN.get(user.provider or "", user.provider), "email": user.email},
        "profile": {"name": prof.get("name"), "photo_url": prof.get("photo_url"),
                    "headline": prof.get("headline") or "", "experience": prof.get("experience") or "",
                    "seeking": prof.get("seeking") or "", "offering": prof.get("offering") or "",
                    "interests_text": ((mdoc or {}).get("meta") or {}).get("interests_text", ""),
                    "web_search_opt_in": bool(prof.get("web_search_opt_in"))},
        "sources": {"github": github, "resume": _source_status(user.id, "resume"), "manual": manual,
                    "facebook": {"available": False, "connected": False}},
    }


@router.delete("/profile/sources/{source}")
def remove_source(source: Literal["github", "resume", "manual"], user: User = Depends(current_user)):
    with db.conn() as c:
        if source == "github":
            c.execute("delete from linked_accounts where user_id = %s and provider = 'github'", (user.id,))
            c.execute("delete from feed_items where author_id = %s and kind = 'github'", (user.id,))
        c.execute("delete from raw_documents where user_id = %s and source = %s "
                  "and coalesce(meta->>'kind', '') <> %s", (user.id, source, profile_store.REVIEW_ADDS))
        profile_store.rebuild_user_interests(c, user.id)
    population.invalidate()
    return {"removed": source, **profile_store.get_interests(user.id)}
