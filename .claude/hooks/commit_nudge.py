#!/usr/bin/env python3
"""Stop hook: enforce MASTER_SPEC 0.2 ("never more than 30 minutes without a commit and push").

When Claude tries to end a turn and there is uncommitted work older than THRESHOLD minutes,
or unpushed commits older than THRESHOLD minutes, the hook blocks the stop once and tells
Claude to run /handoff. It never blocks twice in a row (stop_hook_active), and it can be
silenced for a session with FC_NO_COMMIT_NUDGE=1.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

THRESHOLD = int(os.environ.get("FC_COMMIT_NUDGE_MINUTES", "30"))


def git(root: str, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", root, *args], text=True, stderr=subprocess.DEVNULL, timeout=8
        ).strip()
    except Exception:
        return ""


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    if data.get("stop_hook_active") or os.environ.get("FC_NO_COMMIT_NUDGE") == "1":
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    if not git(root, "rev-parse", "--git-dir"):
        return
    now = time.time()

    # Uncommitted work: dirty since max(your last commit, oldest modification among dirty files).
    dirty = []
    for line in git(root, "status", "--porcelain").splitlines():
        path = line[3:].split(" -> ")[-1].strip().strip('"')
        if path:
            dirty.append(path)
    if dirty:
        email = git(root, "config", "user.email")
        last_own = git(root, "log", "-1", f"--author={email}", "--format=%ct") if email else ""
        last_own = last_own or git(root, "log", "-1", "--format=%ct")
        mtimes = []
        for p in dirty:
            try:
                mtimes.append(os.path.getmtime(os.path.join(root, p)))
            except OSError:
                pass
        candidates = [float(last_own)] if last_own.isdigit() else []
        if mtimes:
            candidates.append(min(mtimes))
        if candidates:
            dirty_since = max(candidates)
            age = int((now - dirty_since) / 60)
            if age >= THRESHOLD:
                print(json.dumps({
                    "decision": "block",
                    "reason": (
                        f"Team protocol (MASTER_SPEC 0.2): {len(dirty)} uncommitted file(s), oldest change about "
                        f"{age} minutes old. Run /handoff now: commit (use a WIP: prefix if it doesn't run yet), "
                        "pull --rebase, push, and add the PROGRESS.md entry. Then finish your reply."
                    ),
                }))
                return

    # Unpushed commits older than the threshold.
    stamps = [s for s in git(root, "log", "@{u}..HEAD", "--format=%ct").splitlines() if s.isdigit()]
    if stamps:
        age = int((now - min(int(s) for s in stamps)) / 60)
        if age >= THRESHOLD:
            print(json.dumps({
                "decision": "block",
                "reason": (
                    f"Team protocol: {len(stamps)} commit(s) not pushed, the oldest from about {age} minutes ago. "
                    "Run `git pull --rebase` then `git push` (never force), make sure PROGRESS.md is current, then finish."
                ),
            }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
