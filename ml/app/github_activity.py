"""AR8: GitHub activity -> feed_items (MASTER_SPEC 3.8, 5.3). Owner: Arjun.

Every 10 minutes, for each connected GitHub account:
- GET /users/{login}/events/public (ETag: 304s don't count against the 5,000/h limit) -> milestones only:
  started a new repo, shipped a release, open-sourced a repo. Commits/pushes are never feed items.
- GET /user/repos?sort=pushed for what events miss: new repos, a project that went live (homepage URL or
  GitHub Pages, linked to the live site), and star milestones (10, 25, 50, 100, ...).
Items are deduplicated by a stable key in payload.key, embedded with bge-small, and only ever public data.
Visibility is enforced by feed.visible_items (the author's connections, feed_prefs.show_github).
"""
import logging
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from ml import github_ingest, github_oauth

from . import db
from .workers import every

log = logging.getLogger("github_activity")

POLL_SECONDS = 600
LOOKBACK = timedelta(days=14)
MAX_ITEMS_PER_POLL = 20
_etags: dict[str, dict] = {}      # url -> {"etag", "body"}, per process (fine for the hackathon)


def _ts(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def _repo_short(full: str) -> str:
    return full.split("/", 1)[-1]


# Only meaningful milestones reach the feed: something started, launched, shipped, open-sourced, or a
# star milestone. Individual commits/pushes are noise and are never shown.
STAR_MILESTONES = (10, 25, 50, 100, 250, 500, 1000)


def normalize_event(e: dict) -> dict | None:
    """One public event -> feed item fields, or None if it isn't a milestone."""
    kind, repo = e.get("type"), (e.get("repo") or {}).get("name", "")
    p = e.get("payload") or {}
    url = f"https://github.com/{repo}"
    if kind == "CreateEvent" and p.get("ref_type") == "repository":
        desc = p.get("description") or ""
        return {"title": f"started working on {_repo_short(repo)}", "body": desc, "url": url, "type": "new_repo"}
    if kind == "ReleaseEvent" and p.get("action") in ("published", "released", "created"):
        rel = p.get("release") or {}
        name = rel.get("name") or rel.get("tag_name") or "a new version"
        return {"title": f"shipped {name} of {_repo_short(repo)}", "body": (rel.get("body") or "")[:280],
                "url": rel.get("html_url") or url, "type": "release"}
    if kind == "PublicEvent":
        return {"title": f"open-sourced {_repo_short(repo)}", "body": "", "url": url, "type": "open_sourced"}
    return None


def items_from_events(events: list[dict], since: datetime) -> list[dict]:
    out = []
    for e in events:
        created = _ts(e.get("created_at"))
        if not created or created < since or not e.get("public", True):
            continue
        item = normalize_event(e)
        if item:
            out.append({**item, "created_at": created, "key": f"event:{e.get('id')}",
                        "repo": (e.get("repo") or {}).get("name")})
    return out


def live_url(r: dict) -> str | None:
    """The project's live website: its homepage field, else its GitHub Pages site."""
    home = (r.get("homepage") or "").strip()
    if home.startswith(("http://", "https://")):
        return home
    if r.get("has_pages"):
        owner = (r.get("owner") or {}).get("login") or r["full_name"].split("/")[0]
        return f"https://{owner}.github.io/{r['name']}"
    return None


def items_from_repos(repos: list[dict], since: datetime, seen_pushes: dict[str, str] | None = None) -> list[dict]:
    """Milestones from the repo list (catches what the events API misses or lags on):
    new repo -> "started working on", live website -> "launched", stars crossing a milestone.
    Keys are stable, so each milestone is posted once."""
    out = []
    for r in repos:
        if r.get("fork") or r.get("private"):
            continue
        full, pushed, created = r["full_name"], _ts(r.get("pushed_at")), _ts(r.get("created_at"))
        recent = bool(pushed and pushed >= since)
        if created and created >= since:
            out.append({"title": f"started working on {r['name']}", "body": r.get("description") or "",
                        "url": r.get("html_url"), "type": "new_repo", "created_at": created,
                        "key": f"repo-created:{full}", "repo": full})
        site = live_url(r)
        if site and recent:
            out.append({"title": f"launched {r['name']}", "body": (r.get("description") or "") + f"\nLive at {site}",
                        "url": site, "type": "launched", "created_at": pushed,
                        "key": f"repo-live:{full}:{site}", "repo": full})
        stars = int(r.get("stargazers_count") or 0)
        reached = [m for m in STAR_MILESTONES if stars >= m]
        if reached and recent:
            m = reached[-1]
            out.append({"title": f"{r['name']} passed {m} stars", "body": r.get("description") or "",
                        "url": r.get("html_url"), "type": "stars", "created_at": pushed,
                        "key": f"repo-stars:{full}:{m}", "repo": full})
    return out


def _dedupe_against_events(items: list[dict]) -> list[dict]:
    """A new repo seen both as a CreateEvent and in the repo list is one milestone: keep the event."""
    event_new = {i["repo"] for i in items if i["key"].startswith("event:") and i["type"] == "new_repo"}
    return [i for i in items if not (i["key"].startswith("repo-created:") and i["repo"] in event_new)]


def poll_user(user_id: str, token: str, login: str) -> int:
    since = datetime.now(timezone.utc) - LOOKBACK
    events = github_ingest._get(f"/users/{login}/events/public?per_page=100", token, _etags) or []
    repos = github_ingest._get("/user/repos?sort=pushed&per_page=30&affiliation=owner", token, _etags) or []
    existing = db.fetchall("select payload->>'key' as key, payload->>'repo' as repo, payload->>'pushed_at' as pushed_at "
                           "from feed_items where author_id = %s and kind = 'github' and created_at > %s",
                           (user_id, since))
    have = {r["key"] for r in existing if r["key"]}
    seen_pushes = {r["repo"]: r["pushed_at"] for r in existing if r["repo"] and r["pushed_at"]}
    items = _dedupe_against_events(items_from_events(events, since) + items_from_repos(repos, since, seen_pushes))
    new = [i for i in items if i["key"] not in have]
    new.sort(key=lambda i: i["created_at"], reverse=True)
    new = new[:MAX_ITEMS_PER_POLL]
    if not new:
        return 0
    from ml.embed import embed
    vecs = embed([f"{i['title']}. {i['body']}".strip() for i in new])
    pushed_at = {r["full_name"]: r.get("pushed_at") for r in repos}
    with db.conn() as c:
        for i, v in zip(new, vecs):
            c.execute(
                "insert into feed_items (author_id, kind, title, body, url, payload, embedding, created_at) "
                "values (%s, 'github', %s, %s, %s, %s, %s, %s)",
                (user_id, i["title"], i["body"], i["url"],
                 Jsonb({"key": i["key"], "type": i["type"], "repo": i["repo"], "pushed_at": pushed_at.get(i["repo"])}),
                 v, i["created_at"]))
    log.info("github activity: %d new items for %s", len(new), user_id)
    return len(new)


@every(POLL_SECONDS, "github_activity")
def poll_all() -> None:
    rows = db.fetchall("select user_id::text as user_id, provider_uid, access_token_enc from linked_accounts "
                       "where provider = 'github' and access_token_enc is not null")
    for r in rows:
        try:
            poll_user(r["user_id"], github_oauth.decrypt_token(r["access_token_enc"]), r["provider_uid"])
        except github_ingest.GitHubError as e:
            log.warning("github poll failed for %s: %s", r["user_id"], e)
