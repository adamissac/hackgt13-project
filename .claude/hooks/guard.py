#!/usr/bin/env python3
"""PreToolUse guard for the Formal Connection repo.

Denies, in every permission mode (including bypass):
  * force pushes, history rewrites, commands that throw away work, --no-verify
  * `git add` of real .env files
  * server secret names in mobile/ or dashboard/ code, and literal keys anywhere outside .env files
  * LinkedIn or Instagram scraping, crawling, or login automation (MASTER_SPEC Section 5)
Asks the human when new code looks like it fetches LinkedIn or Instagram pages.

Fails open on internal errors so a bug here never freezes a session.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys

SCRAPE_MSG = (
    "Blocked by team policy: LinkedIn and Instagram data may never be scraped, crawled, or pulled "
    "through automated logins, browser automation, or third-party scraping APIs (MASTER_SPEC "
    "Section 5). LinkedIn is used only for OIDC sign-in through Supabase. Use user-entered text, "
    "the resume upload, or the GitHub API instead."
)

SOCIAL = re.compile(r"(?:linkedin\.com|licdn\.com|instagram\.com|cdninstagram\.com)", re.I)
SOCIAL_OK = re.compile(
    r"(?:linkedin\.com/(?:oauth|developers|legal|help)|api\.linkedin\.com/v2/userinfo|"
    r"learn\.microsoft\.com|developers\.facebook\.com)",
    re.I,
)
NET_TOOLS = re.compile(
    r"\b(?:curl|wget|httpie|xh|lynx|w3m|aria2c|playwright|puppeteer|selenium|chromium|"
    r"google-chrome|scrapy|open)\b|https?://",
    re.I,
)
SCRAPE_PKGS = re.compile(
    r"\b(?:linkedin[-_]api|linkedin[-_]scraper|linkedin[-_]jobs[-_]scraper|staffspy|"
    r"instaloader|instagrapi|instagram[-_]scraper|instagram[-_]private[-_]api|proxycurl)\b",
    re.I,
)
PKG_TOOLS = re.compile(r"\b(?:pip3?|pipx|uv|poetry|npm|pnpm|yarn|bun|npx)\b")
PROFILE_URL = re.compile(
    r"https?://(?:[\w-]+\.)?(?:linkedin\.com/(?:in|company|feed|posts|pub|school|mynetwork|voyager)"
    r"|instagram\.com/[\w.]+)",
    re.I,
)
FETCH_CODE = re.compile(
    r"(?:requests\.(?:get|post|Session)|httpx\.|aiohttp|urllib\.request|BeautifulSoup|\bbs4\b|"
    r"lxml\.html|selenium|webdriver|playwright|puppeteer|cheerio|scrapy|axios\.(?:get|post)|"
    r"\bfetch\s*\(|\bgot\s*\(|undici)",
    re.I,
)

SERVER_SECRET_NAMES = re.compile(
    r"\b(?:SUPABASE_SERVICE(?:_ROLE)?_KEY|SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|ANTHROPIC_API_KEY|"
    r"TOKEN_ENCRYPTION_KEY|GITHUB_CLIENT_SECRET|QR_SIGNING_KEY|"
    r"(?:EXPO|NEXT)_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE|PRIVATE|SIGNING)[A-Z0-9_]*)\b"
)
LITERAL_KEYS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"), "an Anthropic API key"),
    (re.compile(r"\bsb_secret_[A-Za-z0-9_\-]{16,}"), "a Supabase secret key"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"), "a GitHub token"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}"), "a GitHub token"),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "a private key"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "an AWS access key"),
]
JWT = re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.(eyJ[A-Za-z0-9_\-]{8,})\.[A-Za-z0-9_\-]{8,}")
CLIENT_CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".plist", ".xml", ".gradle", ".kt", ".swift", ".example")
ENV_FILE = re.compile(r"(?:^|/)\.env(?:\.[\w.-]+)?$")


def decide(decision: str, reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def deny(reason: str) -> None:
    decide("deny", reason)


def jwt_role(payload_b64: str):
    try:
        pad = "=" * (-len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64 + pad)).get("role")
    except Exception:
        return None


def check_bash(cmd: str) -> None:
    c = " ".join(cmd.split())
    seg = r"[^;&|\n]*"
    if re.search(r"\bgit\b" + seg + r"\bpush\b" + seg + r"(?:\s--force(?:-with-lease)?\b|\s-f\b|\s\+[\w./-]+)", c):
        deny(
            "Force pushes are banned (MASTER_SPEC 0.2). Run `git pull --rebase`, resolve, and push normally. "
            "If you can't resolve safely: `git rebase --abort`, push to a new branch `<owner>/<task>`, and note it in PROGRESS.md."
        )
    if re.search(r"\bgit\b" + seg + r"\b(?:commit|push|merge|rebase|am)\b" + seg + r"--no-verify\b", c):
        deny("Don't skip git hooks. The pre-commit hook blocks secrets and .env files: fix what it reports instead.")
    destructive = [
        r"\bgit\s+(?:filter-branch|filter-repo)\b",
        r"\bgit\s+reset\s+--hard\b",
        r"\bgit\s+clean\s+-[a-zA-Z]*f",
        r"\bgit\s+push\b" + seg + r"(?:--delete\b|\s:[\w./-]+)",
        r"\bgit\s+branch\s+-D\s+(?:main|master)\b",
        r"\bgit\s+stash\s+(?:drop|clear)\b",
        r"\bgit\s+checkout\s+--\s+\.(?:\s|$)",
        r"\bgit\s+restore\s+\.(?:\s|$)",
    ]
    if any(re.search(p, c) for p in destructive):
        deny(
            "Blocked: history rewrites and commands that discard work are off limits in this repo. "
            "Commit what you have (a WIP: prefix is fine) and move forward. If you truly need this, ask the human to run it."
        )
    if re.search(r"\bgit\s+add\b" + seg + r"(?:\s|/)\.env(?:\.(?!example\b)[\w.-]+)?(?=\s|$)", c):
        deny("Never commit .env files. Only .env.example (variable names, no values) belongs in git.")
    if SOCIAL.search(c) and not SOCIAL_OK.search(c) and NET_TOOLS.search(c):
        deny(SCRAPE_MSG)
    if SCRAPE_PKGS.search(c) and PKG_TOOLS.search(c):
        deny(SCRAPE_MSG)


def check_url(url: str) -> None:
    if url and SOCIAL.search(url) and not SOCIAL_OK.search(url):
        deny(SCRAPE_MSG + " Reading LinkedIn or Instagram pages is blocked too; use their developer docs sites instead.")


def edit_texts(tool: str, ti: dict) -> list[str]:
    if tool == "Write":
        return [str(ti.get("content") or "")]
    if tool == "Edit":
        return [str(ti.get("new_string") or "")]
    if tool == "MultiEdit":
        return [str((e or {}).get("new_string") or "") for e in (ti.get("edits") or [])]
    return []


def rel_path(path: str, root: str) -> str:
    if not path:
        return ""
    try:
        p = os.path.relpath(os.path.abspath(path), os.path.abspath(root)) if os.path.isabs(path) else os.path.normpath(path)
    except ValueError:
        p = path
    return p.replace(os.sep, "/")


def check_edit(tool: str, ti: dict, root: str) -> None:
    rel = rel_path(str(ti.get("file_path") or ti.get("path") or ""), root)
    text = "\n".join(edit_texts(tool, ti))
    if not text:
        return
    real_env = bool(ENV_FILE.search(rel)) and not rel.endswith(".env.example")

    if SCRAPE_PKGS.search(text) and not rel.endswith(".md"):
        deny(SCRAPE_MSG)

    if not real_env:
        for pattern, label in LITERAL_KEYS:
            if pattern.search(text):
                deny(
                    f"Blocked: this edit to {rel or 'a file'} contains what looks like {label}. Keys live only in "
                    "untracked .env files and are read from environment variables listed in .env.example."
                )
        for m in JWT.finditer(text):
            if jwt_role(m.group(1)) == "service_role":
                deny(
                    f"Blocked: this edit to {rel or 'a file'} contains a Supabase service_role JWT. It must stay in a "
                    "server-side .env file and never be committed or shipped to a client."
                )

    client = rel.startswith(("mobile/", "dashboard/"))
    if client and rel.lower().endswith(CLIENT_CODE_EXT):
        if SERVER_SECRET_NAMES.search(text) or "service_role" in text:
            deny(
                f"Blocked: {rel} is client code, and this edit references a server-only secret "
                "(service key, API key, encryption or signing key, OAuth client secret). Move the logic behind a "
                "FastAPI endpoint and keep the secret in the server environment (MASTER_SPEC 0.4 and 11)."
            )

    if PROFILE_URL.search(text) and FETCH_CODE.search(text) and not rel.endswith(".md"):
        decide(
            "ask",
            f"{rel} both references LinkedIn or Instagram profile URLs and contains HTTP or browser-automation code. "
            "Approve only if this code never fetches those pages (for example, it just opens a URL the user typed). "
            "Scraping is banned (MASTER_SPEC Section 5).",
        )


def check_mcp(tool: str, ti: dict) -> None:
    name = tool.lower()
    if not any(k in name for k in ("playwright", "browser", "chrome", "puppeteer", "fetch", "firecrawl", "scrape", "crawl")):
        return
    blob = json.dumps(ti)
    if SOCIAL.search(blob) and not SOCIAL_OK.search(blob):
        deny(SCRAPE_MSG)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    tool = str(data.get("tool_name") or "")
    ti = data.get("tool_input") or {}
    if not isinstance(ti, dict):
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    if tool == "Bash":
        check_bash(str(ti.get("command") or ""))
    elif tool == "WebFetch":
        check_url(str(ti.get("url") or ""))
    elif tool in ("Write", "Edit", "MultiEdit"):
        check_edit(tool, ti, root)
    elif tool.startswith("mcp__"):
        check_mcp(tool, ti)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        pass
    sys.exit(0)
