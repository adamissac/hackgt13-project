#!/usr/bin/env python3
"""Status line: owner | branch | uncommitted | minutes since your last commit | unpushed | context | 5h usage.

The "since commit" timer turns yellow at 15 minutes and red at 25 while you have uncommitted
work, so the 30-minute push rule is always visible.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

GREEN, YELLOW, RED, DIM, RESET = "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m"


def git(root: str, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", root, *args], text=True, stderr=subprocess.DEVNULL, timeout=3
        ).strip()
    except Exception:
        return ""


def color_pct(value, warn: float, bad: float) -> str:
    if value is None:
        return "?"
    v = int(round(float(value)))
    c = RED if v >= bad else YELLOW if v >= warn else GREEN
    return f"{c}{v}%{RESET}"


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    ws = data.get("workspace") or {}
    root = os.environ.get("CLAUDE_PROJECT_DIR") or ws.get("project_dir") or ws.get("current_dir") or data.get("cwd") or os.getcwd()

    owner = "no-owner"
    try:
        with open(os.path.join(root, ".claude", "owner.local"), encoding="utf-8") as fh:
            owner = fh.read().strip() or owner
    except Exception:
        pass

    parts = [f"{owner}"]
    branch = git(root, "branch", "--show-current")
    if branch:
        parts.append(branch)
        dirty = len([l for l in git(root, "status", "--porcelain").splitlines() if l.strip()])
        email = git(root, "config", "user.email")
        last = (git(root, "log", "-1", f"--author={email}", "--format=%ct") if email else "") or git(root, "log", "-1", "--format=%ct")
        if dirty:
            parts.append(f"{YELLOW}{dirty} uncommitted{RESET}")
            if last.isdigit():
                mins = int((time.time() - int(last)) / 60)
                c = RED if mins >= 25 else YELLOW if mins >= 15 else GREEN
                label = f"{mins}m" if mins < 600 else "10h+"
                parts.append(f"{c}{label} since your commit{RESET}")
        else:
            parts.append(f"{GREEN}clean{RESET}")
        ahead = git(root, "rev-list", "--count", "@{u}..HEAD")
        if ahead.isdigit() and int(ahead) > 0:
            parts.append(f"{RED}{ahead} unpushed{RESET}")

    ctx = (data.get("context_window") or {}).get("used_percentage")
    if ctx is not None:
        parts.append(f"ctx {color_pct(ctx, 60, 80)}")
    five = ((data.get("rate_limits") or {}).get("five_hour") or {}).get("used_percentage")
    if five is not None:
        parts.append(f"5h {color_pct(five, 70, 85)}")
    model = (data.get("model") or {}).get("display_name")
    if model:
        parts.append(f"{DIM}{model}{RESET}")
    print(" | ".join(parts))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("formal-connection")
    sys.exit(0)
