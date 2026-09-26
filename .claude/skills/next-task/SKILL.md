---
name: next-task
description: "Pick the owner's next task from MASTER_SPEC Section 13 and PROGRESS.md, check its dependencies, write a short plan, and start working. Use at the start of every session, right after finishing a task, when blocked, and whenever the user says next, continue, keep going, or asks what to work on."
allowed-tools: Bash(python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/session_context.py *) Read Grep Glob
---

# Next task

## Current brief
!`python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/session_context.py --brief`

## Steps
1. Owner: from the brief above, else `.claude/owner.local`, else ask once.
2. Read MASTER_SPEC Section 13 for that owner's rows and "Dependencies to watch", and read PROGRESS.md for what is done, in progress, or blocked.
3. Choose, in this order: the owner's newest PROGRESS.md "Next step" if that task isn't done; otherwise the first unfinished task for the owner in Section 13's phase order. Before the Saturday noon gate, Must items (Section 12.2) come first.
4. If a dependency hasn't landed, don't wait: build against `docs/mocks/` payloads that match `docs/api.md` and note the swap-to-live step for PROGRESS.md.
5. Write a plan of at most 10 lines: the done-when (Section 13 or 14), files to touch, contract touchpoints, external APIs to verify with `docs-researcher`, how you will test it, and where the first commit lands (within 30 minutes).
6. Start immediately. Ask the human only if the plan needs a secret, an account, a physical phone action, or a contract change that affects another owner.
7. Offer the autopilot line the human can type: `/goal <task id> meets its done-when from MASTER_SPEC Section 13, shown in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns`
