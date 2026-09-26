# Resume prompt (any owner, any agent)
Start with `claude "$(cat prompts/resume.md)"` when picking up after a break, a credit reset, or another agent.

You are continuing work in the Formal Connection repo. You may be a different agent than the one that stopped, so trust the repo, not memory.
1. `git pull --rebase`.
2. The owner is in the session brief (or `.claude/owner.local`). Read `prompts/<owner>.md`.
3. If you haven't read MASTER_SPEC.md in this session, read it fully before editing code.
4. Open the newest PROGRESS.md entry for this owner and do its "Next step for whoever continues" first. If it says blocked, check whether the blocker has landed (newer entries, `git log`), and if not, take the next unblocked task.
5. Keep the protocol: commit and push every working increment and at least every 30 minutes with `/handoff`.
