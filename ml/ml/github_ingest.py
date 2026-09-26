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
            "fork": False,
            "pushed_at": r.get("pushed_at"),
            "html_url": r.get("html_url"),
        })
        if len(repos) >= max_repos:
            break
    return repos, cache


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
            "repos": [{"name": r["name"], "stars": r["stars"], "pushed_at": r["pushed_at"],
                       "url": r["html_url"]} for r in repos],
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
