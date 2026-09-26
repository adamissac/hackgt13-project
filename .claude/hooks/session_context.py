#!/usr/bin/env python3
"""SessionStart hook (and `--brief` helper for /next-task).

Prints a short brief that Claude Code adds to context: who the owner is, git state,
the newest handoff, and the owner's next unfinished tasks from MASTER_SPEC Section 13.
Keep the output short: every line costs context in every session.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

OWNERS = {
    "adam": ("AD", "lead full-stack and architect"),
    "alan": ("AL", "ML and algorithms"),
    "arjun": ("AR", "research, data, and visualization"),
    "akshar": ("AK", "Bluetooth, automation, integrations, and pitch"),
}


def repo_root() -> str:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return env
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], text=True, stderr=subprocess.DEVNULL, timeout=5
        ).strip()
    except Exception:
        return os.getcwd()


def git(root: str, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", root, *args], text=True, stderr=subprocess.DEVNULL, timeout=5
        ).strip()
    except Exception:
        return ""


def read(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except Exception:
        return ""


def get_owner(root: str) -> str:
    owner = os.environ.get("FC_OWNER", "").strip().lower()
    if not owner:
        owner = read(os.path.join(root, ".claude", "owner.local")).strip().lower()
    return owner if owner in OWNERS else ""


def progress_entries(root: str) -> list[str]:
    text = read(os.path.join(root, "PROGRESS.md"))
    parts = re.split(r"(?m)^## ", text)
    return ["## " + p.strip() for p in parts[1:] if p.strip()]


def field(entry: str, name: str) -> str:
    m = re.search(r"\*\*" + re.escape(name) + r":\*\*\s*([^\n]*)", entry)
    return m.group(1).strip() if m else ""


def task_status(entries: list[str]) -> dict[str, str]:
    """Latest status per task id. Entries are newest first."""
    status: dict[str, str] = {}
    for entry in entries:
        st = field(entry, "Status").lower()
        st = "done" if st.startswith("done") else "blocked" if st.startswith("blocked") else "in progress"
        for tid in re.findall(r"\b(A[DLRK]\d+)\b", field(entry, "Task")):
            status.setdefault(tid, st)
    return status


def spec_tasks(root: str, prefix: str) -> list[tuple[str, str]]:
    text = read(os.path.join(root, "MASTER_SPEC.md"))
    if not text:
        return []
    start = re.search(r"(?m)^[#\s]*13\.?\s+Team split", text) or re.search(r"(?m)^[#\s]*13\.?\s", text)
    section = text[start.start():] if start else text
    end = re.search(r"(?m)^[#\s]*14\.?\s", section)
    if end:
        section = section[: end.start()]
    lines = section.splitlines()
    owner_words = tuple(OWNERS.keys())
    tasks: list[tuple[str, str]] = []
    seen: set[str] = set()
    for i, line in enumerate(lines):
        stripped = line.strip().lstrip("|").strip()
        m = re.match(r"(%s\d+)\b" % prefix, stripped)
        if not m or m.group(1) in seen:
            continue
        tid = m.group(1)
        title = ""
        if "|" in line:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            cells = [c for c in cells[1:] if c and not c.lower().startswith(owner_words)]
            title = cells[0] if cells else ""
        else:
            rest = stripped[len(tid):].strip(" :-")
            if rest.lower().startswith("needs"):
                continue  # a "Dependencies to watch" line, not a task row
            if rest and not rest.lower().startswith(owner_words):
                title = rest
            else:
                following = [l.strip() for l in lines[i + 1 : i + 4] if l.strip()]
                following = [l for l in following if not l.lower().startswith(owner_words)]
                title = following[0] if following else ""
        if title.lower().startswith("needs"):
            continue
        seen.add(tid)
        tasks.append((tid, title[:100]))
    return tasks


def minutes_since(epoch: str) -> int | None:
    try:
        return int((time.time() - int(epoch)) / 60)
    except Exception:
        return None


def build(root: str, source: str, brief_only: bool) -> str:
    out: list[str] = []
    owner = get_owner(root)
    if owner:
        prefix, role = OWNERS[owner]
        out.append(f"[Formal Connection] Owner: {owner} ({role}). Brief: prompts/{owner}.md")
    else:
        prefix = ""
        out.append(
            "[Formal Connection] Owner not set. Ask the human which owner this machine is "
            "(adam, alan, arjun, akshar) and tell them to run ./scripts/claude-setup.sh <owner>."
        )

    branch = git(root, "branch", "--show-current") or "?"
    dirty = [l for l in git(root, "status", "--porcelain").splitlines() if l.strip()]
    last = minutes_since(git(root, "log", "-1", "--format=%ct"))
    ahead = git(root, "rev-list", "--count", "@{u}..HEAD")
    git_line = f"Git: branch {branch}, {len(dirty)} uncommitted"
    if last is not None:
        git_line += f", last commit {last} min ago"
    if ahead.isdigit() and int(ahead) > 0:
        git_line += f", {ahead} unpushed"
    out.append(git_line)

    entries = progress_entries(root)
    status = task_status(entries)
    if entries:
        newest = entries[0].splitlines()[0][3:]
        out.append(f"Newest handoff: {newest} | {field(entries[0], 'Task')} | {field(entries[0], 'Status')}")
        mine = next((e for e in entries if owner and owner in e.splitlines()[0].lower()), None)
        if mine:
            nxt = field(mine, "Next step for whoever continues")
            if nxt:
                out.append(f"Your last handoff says next: {nxt[:300]}")
            issues = field(mine, "Known issues / blockers")
            if issues and issues.lower() not in ("none", "n/a", "-"):
                out.append(f"Known issues: {issues[:200]}")
    else:
        out.append("PROGRESS.md has no entries yet. Create it with the first /handoff.")

    if prefix:
        todo = [(t, title) for t, title in spec_tasks(root, prefix) if status.get(t) != "done"]
        if todo:
            shown = []
            for t, title in todo[:3]:
                tag = f" ({status[t]})" if t in status else ""
                shown.append(f"{t}{tag}: {title}" if title else f"{t}{tag}")
            out.append("Your next tasks (Section 13 order): " + " | ".join(shown))
        elif spec_tasks(root, prefix):
            out.append("All your Section 13 tasks are marked done. Help unblock teammates or polish the demo path.")

    if brief_only:
        return "\n".join(out)

    if source == "compact":
        out.append("Context was just compacted: re-read the MASTER_SPEC sections for your current task before editing, and /handoff soon.")
    else:
        out.append(
            "Before coding: if you haven't read MASTER_SPEC.md in this session, read it fully (Section 0 is mandatory), "
            "then PROGRESS.md, docs/schema.sql, docs/api.md, and your brief. Then /next-task."
        )
    out.append("Protocol: commit and push every working increment and at least every 30 minutes via /handoff. Never force push.")
    return "\n".join(out)


def main() -> None:
    brief_only = "--brief" in sys.argv[1:]
    source = "startup"
    if not brief_only:
        try:
            data = json.load(sys.stdin)
            source = str(data.get("source") or "startup")
        except Exception:
            pass
    print(build(repo_root(), source, brief_only))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # never break session start
        print(f"[Formal Connection] session brief unavailable ({exc.__class__.__name__}). Run /next-task.")
    sys.exit(0)
