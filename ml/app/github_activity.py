"""AR8: GitHub activity -> feed_items (MASTER_SPEC 3.8, 5.3). Owner: Arjun.

Every 10 minutes, for each connected GitHub account:
- GET /users/{login}/events/public (ETag: 304s don't count against the 5,000/h limit) -> new repo,
  push to a public repo, published release.
- Because the events API can lag from 30 s to hours, also GET /user/repos?sort=pushed and turn a newer
  `pushed_at` (or a brand-new repo) into an item, so a push made during the demo shows up next tick.
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


def normalize_event(e: dict) -> dict | None:
    """One public event -> feed item fields, or None if it isn't one we show."""
    kind, repo = e.get("type"), (e.get("repo") or {}).get("name", "")
    p = e.get("payload") or {}
    url = f"https://github.com/{repo}"
    if kind == "CreateEvent" and p.get("ref_type") == "repository":
        desc = p.get("description") or ""
        return {"title": f"created a new repo {_repo_short(repo)}", "body": desc, "url": url, "type": "new_repo"}
    if kind == "PushEvent":
        # GitHub trimmed PushEvent payloads in 2025; commits/size may be absent
        commits = [c.get("message", "").splitlines()[0] for c in (p.get("commits") or []) if c.get("message")]
        n = p.get("size") or len(commits)
        title = f"pushed {n} commit{'s' if n != 1 else ''} to {_repo_short(repo)}" if n else f"pushed to {_repo_short(repo)}"
        return {"title": title, "body": "; ".join(commits[:3]), "url": url, "type": "push"}
    if kind == "ReleaseEvent" and p.get("action") in ("published", "released", "created"):
        rel = p.get("release") or {}
        name = rel.get("name") or rel.get("tag_name") or "a release"
        return {"title": f"released {name} of {_repo_short(repo)}", "body": (rel.get("body") or "")[:280],
                "url": rel.get("html_url") or url, "type": "release"}
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


def items_from_repos(repos: list[dict], since: datetime, seen_pushes: dict[str, str]) -> list[dict]:
    """Catch-up for events-API lag: new repos, and repos whose pushed_at moved since we last looked."""
    out = []
    for r in repos:
        if r.get("fork") or r.get("private"):
            continue
        full, pushed, created = r["full_name"], _ts(r.get("pushed_at")), _ts(r.get("created_at"))
        if created and created >= since and (not pushed or pushed - created < timedelta(minutes=5)):
            out.append({"title": f"created a new repo {r['name']}", "body": r.get("description") or "",
                        "url": r.get("html_url"), "type": "new_repo", "created_at": created,
                        "key": f"repo-created:{full}", "repo": full})
        elif pushed and pushed >= since and seen_pushes.get(full) != r.get("pushed_at"):
            out.append({"title": f"pushed to {r['name']}", "body": r.get("description") or "",
                        "url": r.get("html_url"), "type": "push", "created_at": pushed,
                        "key": f"repo-pushed:{full}:{r.get('pushed_at')}", "repo": full})
    return out


def _dedupe_against_events(items: list[dict]) -> list[dict]:
    """A repo push seen via /user/repos and via an event within 10 minutes is the same thing: keep the event."""
    events = [i for i in items if i["key"].startswith("event:")]
    keep = []
    for i in items:
        if i["key"].startswith("repo-pushed:") and any(
                e["repo"] == i["repo"] and e["type"] == "push" and abs(e["created_at"] - i["created_at"]) < timedelta(minutes=10)
                for e in events):
            continue
        keep.append(i)
    return keep


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
