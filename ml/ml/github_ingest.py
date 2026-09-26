"""GitHub ingestion (AR1): fetch a user's public, non-fork repos through the official REST API
and turn them into the digest that `llm.extract_interests(text, "github")` reads.

Stdlib only (urllib) so it runs anywhere. Conditional requests with ETags: a 304 does not count
against the 5,000/hour rate limit, so re-ingesting an unchanged account is nearly free.

Usage:
    repos, cache = fetch_repos(token=decrypted_token)          # connected user (GET /user/repos)
    repos, cache = fetch_repos(username="octocat")             # public, no token (dev/testing)
    text = llm.github_to_text(repos)
Store `cache` (a plain dict) with the user's raw_documents.meta and pass it back next time.
"""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
API_VERSION = "2022-11-28"
README_CHARS = 1200
MAX_REPOS = 30          # most recently pushed; keeps the digest and API calls bounded
DEEP_REPOS = 8          # manifests + commit activity only for the top N (by stars, then recency)


class GitHubError(Exception):
    pass


def _get(path, token=None, cache=None, accept="application/vnd.github+json"):
    """GET with ETag caching. Returns parsed JSON (or text for raw accept), or None on 404.

    cache: dict url -> {"etag": str, "body": ...}. On 304 the cached body is returned.
    """
    url = path if path.startswith("http") else API + path
    headers = {"Accept": accept, "X-GitHub-Api-Version": API_VERSION, "User-Agent": "formal-connection"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    hit = cache.get(url) if cache is not None else None
    if hit and hit.get("etag"):
        headers["If-None-Match"] = hit["etag"]
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            body = raw if "raw" in accept else json.loads(raw)
            etag = resp.headers.get("ETag")
            if cache is not None and etag:
                cache[url] = {"etag": etag, "body": body}
            return body
    except urllib.error.HTTPError as e:
        if e.code == 304 and hit:
            return hit["body"]
        if e.code == 404:
            return None
        if e.code in (401, 403):
            remaining = e.headers.get("X-RateLimit-Remaining")
            raise GitHubError(f"GitHub {e.code} (rate limit remaining: {remaining})") from e
        raise GitHubError(f"GitHub {e.code} for {url}") from e


def get_user(token):
    """GET /user for the connected account (login is stored as linked_accounts.provider_uid)."""
    me = _get("/user", token)
    if not me or "login" not in me:
        raise GitHubError("could not read GitHub user")
    return me


def fetch_repos(token=None, username=None, cache=None, max_repos=MAX_REPOS):
    """Return (repos, cache). repos match the shape `llm.github_to_text` expects:
    {name, description, languages{lang: bytes}, topics, readme, stars, fork, pushed_at, owner}.
    """
    if not token and not username:
        raise ValueError("need token (connected user) or username (public)")
    cache = {} if cache is None else cache
    if token:
        # affiliation=owner: the user's own repos, not every org repo they can see.
        # With only the read:user scope GitHub returns public repos only, which is all we want.
        listing = _get("/user/repos?sort=pushed&per_page=100&affiliation=owner", token, cache)
    else:
        listing = _get(f"/users/{urllib.parse.quote(username)}/repos?sort=pushed&per_page=100&type=owner",
                       None, cache)
    if listing is None:
        raise GitHubError("user not found")

    repos = []
    for r in listing:
        if r.get("fork") or r.get("private") or r.get("archived"):
            continue
        full = r["full_name"]
        languages = _get(f"/repos/{full}/languages", token, cache) or {}
        readme = _get(f"/repos/{full}/readme", token, cache, accept="application/vnd.github.raw+json") or ""
        repos.append({
            "name": r["name"],
            "full_name": full,
            "owner": r["owner"]["login"],
            "description": r.get("description") or "",
            "languages": languages,
            "topics": r.get("topics") or [],
            "readme": _clean_readme(readme)[:README_CHARS],
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "fork": False,
            "pushed_at": r.get("pushed_at"),
            "html_url": r.get("html_url"),
        })
        if len(repos) >= max_repos:
            break
    enrich(repos, token, cache)
    return repos, cache


def _manifests(full, token, cache):
    """Frameworks from dependency manifests at the repo root or one folder down (monorepos: mobile/, ml/, web/...).
    One tree call per repo, then only the manifests that exist."""
    from .skill_taxonomy import MANIFESTS, frameworks_from_manifest
    tree = _get(f"/repos/{full}/git/trees/HEAD?recursive=1", token, cache) or {}
    paths = [t["path"] for t in tree.get("tree", []) if isinstance(t, dict) and t.get("type") == "blob"]
    wanted = [p for p in paths
              if p.rsplit("/", 1)[-1] in MANIFESTS and p.count("/") <= 1 and "node_modules" not in p][:8]
    found = []
    for path in wanted:
        text = _get(f"/repos/{full}/contents/{path}", token, cache, accept="application/vnd.github.raw+json") or ""
        for fw in frameworks_from_manifest(path, text if isinstance(text, str) else ""):
            if fw not in found:
                found.append(fw)
    return found


def _commits_last_year(full, token, cache):
    """Owner's commits in the last 52 weeks (GitHub may answer 202 while it computes: then None)."""
    try:
        stats = _get(f"/repos/{full}/stats/participation", token, cache)
    except GitHubError:
        return None
    if isinstance(stats, dict) and isinstance(stats.get("owner"), list):
        return int(sum(stats["owner"]))
    return None


def pinned_repo_names(token):
    """Names of the user's pinned repositories (GraphQL; needs a token). Empty on any failure."""
    if not token:
        return []
    query = '{"query":"{ viewer { pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { name } } } } }"}'
    req = urllib.request.Request(API + "/graphql", data=query.encode(), method="POST", headers={
        "Authorization": f"Bearer {token}", "User-Agent": "formal-connection", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        nodes = data["data"]["viewer"]["pinnedItems"]["nodes"]
        return [n["name"] for n in nodes if n and n.get("name")]
    except Exception:
        return []


def enrich(repos, token=None, cache=None):
    """Add frameworks, commits_52w and pinned to the most significant repos. Best effort: a failure on
    one repo never loses the digest."""
    pinned = set(pinned_repo_names(token))
    for r in repos:
        r["pinned"] = r["name"] in pinned
        r.setdefault("frameworks", [])
        r.setdefault("commits_52w", None)
    recent_first = sorted(repos, key=lambda r: r.get("pushed_at") or "", reverse=True)
    top = sorted(recent_first, key=lambda r: (not r["pinned"], -r.get("stars", 0)))  # stable: ties stay recent-first
    for r in top[:DEEP_REPOS]:
        full = r.get("full_name") or f"{r.get('owner')}/{r['name']}"
        try:
            r["frameworks"] = _manifests(full, token, cache)
        except GitHubError:
            pass
        r["commits_52w"] = _commits_last_year(full, token, cache)
    return repos


def _clean_readme(text):
    """Drop badge/image lines and HTML noise so the 1,200 characters carry real content."""
    keep = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(("![", "[![", "<img", "<p align", "</p", "<a href", "<!--")):
            continue
        keep.append(s)
    return "\n".join(keep)


def language_shares(repos):
    """Byte share per language across all repos: feeds profiles.github_depth()."""
    totals = {}
    for r in repos:
        for lang, n in r.get("languages", {}).items():
            totals[lang] = totals.get(lang, 0) + n
    s = sum(totals.values()) or 1
    return {k: v / s for k, v in sorted(totals.items(), key=lambda kv: -kv[1])}


def digest_meta(repos):
    """Small JSON for raw_documents.meta (no tokens, no README bodies)."""
    return {"repo_count": len(repos),
            "repos": [{"name": r["name"], "stars": r["stars"], "forks": r.get("forks", 0),
                       "pushed_at": r["pushed_at"], "url": r.get("html_url"), "description": r.get("description", ""),
                       "languages": sorted(r.get("languages", {}), key=lambda k: -r["languages"][k])[:3],
                       "frameworks": r.get("frameworks", []), "commits_52w": r.get("commits_52w"),
                       "pinned": r.get("pinned", False)} for r in repos],
            "language_shares": language_shares(repos)}


if __name__ == "__main__":
    import sys
    from .llm import github_to_text
    user = sys.argv[1] if len(sys.argv) > 1 else "octocat"
    repos, cache = fetch_repos(username=user, max_repos=int(sys.argv[2]) if len(sys.argv) > 2 else 5)
    print(github_to_text(repos)[:3000])
    print("\nmeta:", json.dumps(digest_meta(repos))[:600])
    # second pass: every call should be a 304 served from cache
    fetch_repos(username=user, cache=cache, max_repos=len(repos))
    print(f"\n{len(repos)} repos, {len(cache)} cached URLs (second pass used ETags)")
