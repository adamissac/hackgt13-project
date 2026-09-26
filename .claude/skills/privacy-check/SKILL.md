---
name: privacy-check
description: "Audit uncommitted and recent changes against the app's privacy and trust rules (MASTER_SPEC 1.3 and 11) using the privacy-auditor subagent. Use before pushing anything that touches connections, suggestions, invites, verification, Bluetooth, location, chat, feed, graph, analytics, onboarding copy, or LLM prompts, and before every gate."
context: fork
agent: privacy-auditor
background: false
---

Audit the working tree of this repository.

1. Run `git diff HEAD` for uncommitted changes and `git log -5 --stat` for recent ones. If there are no uncommitted changes, audit `git show HEAD`.
2. Check every changed file against your checklist. Open the surrounding code when a change calls into other modules or tables.
3. Report BLOCKER, SHOULD FIX, and OK with file:line and a one-line fix for each finding. Under 40 lines.
