"""AR8: GitHub activity -> feed_items (MASTER_SPEC 3.8, 5.3). Owner: Arjun.

Every 10 minutes, for each connected GitHub account:
- GET /users/{login}/events/public (ETag: 304s don't count against the 5,000/h limit) -> milestones only:
  started a new repo, shipped a release, open-sourced a repo. Commits/pushes are never feed items.
- GET /user/repos?sort=pushed for what events miss: new repos, a project that went live (homepage URL or
  GitHub Pages, linked to the live site), and star milestones (10, 25, 50, 100, ...).
Items are deduplicated by a stable key in payload.key, embedded with bge-small, and only ever public data.
Visibility is enforced by feed.visible_items (the author's connections, feed_prefs.show_github).

Each person also gets ONE "working on" item (payload.type = 'current_work', key current:<user>): a brief across
their most recently active public repos (pushed in the last 7 days, up to 3) saying what they are building and
what they did lately, plus one question to ask them. Written from public facts only (description, topics,
languages, manifest frameworks, their recent commit subjects, milestones, README). It is rewritten in place when
the set of active projects changes, or at most every BRIEF_REFRESH when they keep pushing (right away if the last
one was thin). The feed shows that card instead of one card per repo or push.
"""
import logging
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from ml import generation, github_ingest, github_oauth

from . import db
from .workers import every

log = logging.getLogger("github_activity")

POLL_SECONDS = 600
LOOKBACK = timedelta(days=14)
MAX_ITEMS_PER_POLL = 20
BRIEF_REFRESH = timedelta(hours=6)
ACTIVE_WINDOW = timedelta(days=7)
MAX_PROJECTS = 3
BRIEF_README_CHARS = 3000
BRIEF_COMMITS = 12
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
    if new:
        from ml.embed import embed
        vecs = embed([f"{i['title']}. {i['body']}".strip() for i in new])
        pushed_at = {r["full_name"]: r.get("pushed_at") for r in repos}
        with db.conn() as c:
            for i, v in zip(new, vecs):
                c.execute(
                    "insert into feed_items (author_id, kind, title, body, url, payload, embedding, created_at) "
                    "values (%s, 'github', %s, %s, %s, %s, %s, %s)",
                    (user_id, i["title"], i["body"], i["url"],
                     Jsonb({"key": i["key"], "type": i["type"], "repo": i["repo"],
                            "pushed_at": pushed_at.get(i["repo"])}),
                     v, i["created_at"]))
        log.info("github activity: %d new items for %s", len(new), user_id)
    try:
        refresh_current_work(user_id, token, login, repos)
    except github_ingest.GitHubError as e:
        log.warning("github 'working on' brief skipped for %s this cycle: %s", user_id, e)
    return len(new)


# ------------------------------------------------------------------ briefs: what they actually built
def _optional(path: str, token: str, accept: str = "application/vnd.github+json"):
    """A piece of the brief that may legitimately be missing (empty repo: 409; no README: 404)."""
    try:
        return github_ingest._get(path, token, _etags, accept=accept)
    except github_ingest.GitHubError as e:
        log.info("brief: skipping %s (%s)", path, e)
        return None


def commit_subjects(commits: list[dict], login: str) -> list[str]:
    """First lines of the author's own recent commits (all commits if none are theirs), merges dropped."""
    own = [c for c in commits if ((c.get("author") or {}).get("login") or "").lower() == login.lower()]
    out: list[str] = []
    for c in own or commits:
        lines = ((c.get("commit") or {}).get("message") or "").strip().splitlines()
        first = lines[0].strip()[:120] if lines else ""
        if first and not first.lower().startswith(("merge pull request", "merge branch", "merge remote-tracking")) \
                and first not in out:
            out.append(first)
    return out[:BRIEF_COMMITS]


def repo_facts(item: dict, repo: dict | None, token: str, login: str, first_name: str) -> dict | None:
    """Public facts for one feed item's repo, or None for a private/forked/missing repo. The first call failing
    (rate limit, revoked token) raises GitHubError so the whole cycle is retried later instead of storing a thin brief."""
    full = (item.get("payload") or {})["repo"]
    repo = repo or github_ingest._get(f"/repos/{full}", token, _etags)
    if not repo or repo.get("private") or repo.get("fork"):
        return None
    langs = github_ingest._get(f"/repos/{full}/languages", token, _etags) or {}
    total = sum(langs.values()) or 1
    languages = [(k, round(100 * v / total)) for k, v in sorted(langs.items(), key=lambda kv: -kv[1])[:4]]
    empty = not repo.get("size")
    readme = "" if empty else _optional(f"/repos/{full}/readme", token, "application/vnd.github.raw+json") or ""
    commits = [] if empty else _optional(f"/repos/{full}/commits?per_page=30", token) or []
    try:
        frameworks = [] if empty else github_ingest._manifests(full, token, _etags)
    except github_ingest.GitHubError:
        frameworks = []
    return {"first_name": first_name, "milestone": item["title"], "type": (item.get("payload") or {}).get("type"),
            "repo": repo.get("name") or _repo_short(full),
            "description": (repo.get("description") or "").strip(),
            "topics": list(repo.get("topics") or [])[:6], "languages": languages,
            "frameworks": [FRAMEWORK_NAMES.get(fw, fw) for fw in frameworks][:8],
            "homepage": live_url(repo) or "", "stars": int(repo.get("stargazers_count") or 0),
            "commits": commit_subjects(commits if isinstance(commits, list) else [], login),
            "release_notes": (item.get("body") or "")[:1200] if (item.get("payload") or {}).get("type") == "release" else "",
            "readme": github_ingest._clean_readme(readme if isinstance(readme, str) else "")[:BRIEF_README_CHARS]}


# Display names for the frameworks skill_taxonomy detects. Categories it also emits ("data visualization",
# "llm apis", "vector search", ...) are useful to the model but are not tools, so they never become stack chips.
FRAMEWORK_NAMES = {
    "react": "React", "react native": "React Native", "expo": "Expo", "next.js": "Next.js", "vue": "Vue",
    "nuxt": "Nuxt", "svelte": "Svelte", "angular": "Angular", "express": "Express", "fastify": "Fastify",
    "nestjs": "NestJS", "tailwind css": "Tailwind CSS", "three.js": "Three.js", "d3": "D3", "graphql": "GraphQL",
    "prisma": "Prisma", "supabase": "Supabase", "firebase": "Firebase", "electron": "Electron", "jest": "Jest",
    "typescript": "TypeScript", "langchain": "LangChain", "django": "Django", "flask": "Flask", "fastapi": "FastAPI",
    "pytorch": "PyTorch", "tensorflow": "TensorFlow", "keras": "Keras", "scikit-learn": "scikit-learn",
    "pandas": "pandas", "numpy": "NumPy", "hugging face transformers": "Transformers", "llamaindex": "LlamaIndex",
    "opencv": "OpenCV", "streamlit": "Streamlit", "sqlalchemy": "SQLAlchemy", "pydantic": "Pydantic",
    "celery": "Celery", "pytest": "pytest", "jax": "JAX", "lightgbm": "LightGBM", "xgboost": "XGBoost",
    "tokio": "Tokio", "actix": "Actix", "axum": "Axum", "serde": "Serde", "bevy": "Bevy", "gin": "Gin",
    "gorilla": "Gorilla", "grpc": "gRPC", "ruby on rails": "Rails", "spring boot": "Spring Boot"}
NOISE_LANGUAGES = {"Shell", "Dockerfile", "Makefile", "Batchfile", "PowerShell", "Procfile"}


def stack_of(f: dict) -> list[str]:
    """Chips for the card: top languages, then real frameworks by display name, case-insensitively de-duplicated."""
    langs = [n for n, _ in f.get("languages") or [] if n not in NOISE_LANGUAGES][:3]
    known = set(FRAMEWORK_NAMES.values())
    names = langs + [FRAMEWORK_NAMES.get(fw) or fw for fw in f.get("frameworks") or []
                     if fw in FRAMEWORK_NAMES or fw in known]
    out: list[str] = []
    for name in names:
        if name and name.lower() not in {o.lower() for o in out}:
            out.append(name)
    return out[:6]


def active_repos(repos: list[dict], now: datetime) -> list[dict]:
    """Public, non-fork repos pushed in the last week, most recent first."""
    live = [r for r in repos if not r.get("fork") and not r.get("private")
            and (_ts(r.get("pushed_at")) or now - 2 * ACTIVE_WINDOW) >= now - ACTIVE_WINDOW]
    return sorted(live, key=lambda r: r["pushed_at"], reverse=True)[:MAX_PROJECTS]


def needs_refresh(payload: dict | None, sig: str, names: list[str], now: datetime) -> bool:
    if not payload:
        return True
    if payload.get("sig") == sig:
        return False                              # nothing pushed since the last brief
    if sorted(payload.get("repos") or []) != sorted(names):
        return True                               # a different set of projects: rewrite now
    d = payload.get("details") or {}
    at = _ts(d.get("at"))
    return bool(d.get("thin")) or at is None or now - at >= BRIEF_REFRESH


def refresh_current_work(user_id: str, token: str, login: str, repos: list[dict], now: datetime | None = None) -> bool:
    """Write or update this person's one 'working on' feed item. Returns True if it was (re)written."""
    now = now or datetime.now(timezone.utc)
    active = active_repos(repos, now)
    if not active:
        return False
    names = [r["full_name"] for r in active]
    sig = ",".join(f"{r['full_name']}@{r.get('pushed_at')}" for r in active)
    existing = db.fetchone("select id, payload from feed_items where author_id = %s and kind = 'github' "
                           "and payload->>'type' = 'current_work' and created_at > %s order by created_at desc limit 1",
                           (user_id, now - LOOKBACK))
    if not needs_refresh(existing and existing["payload"], sig, names, now):
        return False
    prof = db.fetchone("select name from profiles where id = %s", (user_id,)) or {}
    first = (prof.get("name") or "").split(" ")[0] or login
    projects = [f for f in (repo_facts({"title": f"working on {r['name']}", "body": "",
                                        "payload": {"repo": r["full_name"], "type": "active"}}, r, token, login, first)
                            for r in active) if f]
    if not projects:
        return False
    milestones = [r["title"] for r in db.fetchall(
        "select title from feed_items where author_id = %s and kind = 'github' and coalesce(payload->>'type', '') "
        "<> 'current_work' and created_at > %s order by created_at desc limit 6", (user_id, now - ACTIVE_WINDOW))]
    try:
        brief, source = generation.current_work_brief(first, projects, milestones), "ai"
    except Exception as e:                      # no key, API down, ungrounded: facts-only template
        log.warning("'working on' brief fell back to template for %s: %s", user_id, e)
        brief, source = generation.template_current_work(first, projects), "template"
    stack: list[str] = []
    for p in projects:
        stack += [x for x in stack_of(p) if x.lower() not in {y.lower() for y in stack}]
    details = {**brief, "stack": stack[:6], "source": source, "at": now.isoformat(),
               "thin": not any(p.get("readme") or p.get("commits") for p in projects)}
    short = [p["repo"] for p in projects]
    title = "working on " + short[0] + (f" and {len(short) - 1} more project{'s' if len(short) > 2 else ''}"
                                        if len(short) > 1 else "")
    payload = {"key": f"current:{user_id}", "type": "current_work", "repos": names, "sig": sig, "details": details}
    from ml.embed import embed
    vec = embed([" ".join([title, brief["summary"], *brief["highlights"]])])[0]
    with db.conn() as c:
        if existing:
            c.execute("update feed_items set title = %s, body = %s, url = %s, payload = %s, embedding = %s, "
                      "created_at = %s where id = %s",
                      (title, brief["summary"], active[0].get("html_url"), Jsonb(payload), vec, now, existing["id"]))
        else:
            c.execute("insert into feed_items (author_id, kind, title, body, url, payload, embedding, created_at) "
                      "values (%s, 'github', %s, %s, %s, %s, %s, %s)",
                      (user_id, title, brief["summary"], active[0].get("html_url"), Jsonb(payload), vec, now))
    log.info("github 'working on' brief written for %s (%s, %d projects)", user_id, source, len(projects))
    return True
