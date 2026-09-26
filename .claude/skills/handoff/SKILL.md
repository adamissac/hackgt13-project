---
name: handoff
description: "Commit, push, and write the PROGRESS.md handoff entry exactly as the team protocol requires. Use this after EVERY working increment (an endpoint returns data, a screen renders, a script runs, a test passes), before stopping, before a risky refactor, whenever 30 minutes have passed since the last push, when context or credits run low, when a hook says to, or when the user says handoff, save, commit, push, or checkpoint."
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *) Bash(git pull --rebase*) Bash(git push*) Bash(git switch *) Bash(git rebase --abort) Bash(date *) Read Edit Write
---

# Handoff

## Working tree right now
!`git status --short`

## Last commit
!`git log -1 --format=%h%x20%cr%x20%s`

## Steps
1. Decide the status: `done`, `in progress`, or `blocked`. If the code does not run yet, the commit message starts with `WIP: `.
2. Run the relevant check first (tests, type check, or launching the thing) so "How to run/test it" is true. Delegate noisy runs to `test-runner`.
3. Insert a new entry at the TOP of `PROGRESS.md`, directly under the title (create the file with a `# PROGRESS` title if missing). Use exactly this template:

```
## <YYYY-MM-DD HH:MM> | <owner> | <agent name and model>
**Task:** <task id and name from Section 13>
**Status:** done | in progress | blocked
**What I did:** <2-5 bullets>
**How to run/test it:** <exact commands>
**Next step for whoever continues:** <the very next concrete action>
**Known issues / blockers:** <anything broken, anything the next agent must know>
**Contract changes:** <changes to docs/schema.sql or docs/api.md, or "none">
```

   Write "Next step" so a fresh agent with zero memory can start in one minute: name the file, the function, and the command.
4. Commit and push in this order: `git add -A`, `git commit -m "[area] what changed"` (area: ml, mobile, dashboard, supabase, docs, ble, infra), `git pull --rebase`, `git push`.
5. If the rebase conflicts and the fix isn't obviously safe: `git rebase --abort`, `git switch -c <owner>/<task-id>`, commit, `git push -u origin <owner>/<task-id>`, and say so in the PROGRESS.md entry.
6. Never force push, never `--no-verify`, never commit `.env` files. If the pre-commit hook blocks a secret, move the value into an env var listed in `.env.example` and commit again.
7. Reply with one line: commit hash, status, and the next step.
