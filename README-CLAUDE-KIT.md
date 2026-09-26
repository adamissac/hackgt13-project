# Claude Code team kit: Formal Connection (HackGT 13)

Everything each teammate's Claude Code needs to build this app on autopilot while staying in sync: four owner briefs, shared rules, skills, subagents, MCP servers, plugins, hooks, and a git guard.

## Install (once per person, about 5 minutes)
1. Copy everything in this kit into the repo root and commit it. Keep your existing `MASTER_SPEC.md`, `PROGRESS.md`, and `docs/`. If the repo already has `CLAUDE.md` or `AGENTS.md`, these versions replace them (they're derived from the spec).
2. Adam: replace `YOUR_PROJECT_REF` in `.mcp.json` with the Supabase project ref, commit, push.
3. Everyone, after pulling: `./scripts/claude-setup.sh <adam|alan|arjun|akshar>`
4. Start: `claude "$(cat prompts/<your-name>.md)"`. Accept the folder trust prompt and the two project MCP servers, then run `/mcp` once to sign in to Supabase.

What setup does: writes your owner name to `.claude/owner.local`, updates `.gitignore`, turns on the git pre-commit guard, installs your plugins for this repo only, installs the TypeScript and Pyright language servers, and edits `~/.claude/settings.json` (backup saved next to it) to start in auto mode and teach the auto-mode classifier which services this project trusts. That last part is the only change outside the repo, and it's required: Claude Code reads auto mode and its rules only from your user settings.

## Every session after that
- Run `claude` and type `continue`. A session-start hook tells the agent who you are, what the last handoff said, and your next tasks.
- Or `claude "$(cat prompts/resume.md)"` after a break or when someone else's agent stopped mid-task.
- Hands off: type one of the `/goal` lines at the bottom of your brief. Claude keeps going until the task is verifiably done or the turn cap hits. `/goal clear` stops it.

## What's inside
| Piece | Where | What it does |
| --- | --- | --- |
| Owner briefs | `prompts/adam.md`, `alan.md`, `arjun.md`, `akshar.md` | Role, task order, expert notes per task, dependencies, autopilot lines |
| Shared rules | `AGENTS.md`, `CLAUDE.md`, `.claude/rules/` | Spec protocol plus folder rules that load only when working in that folder |
| Skills | `.claude/skills/` | `/next-task`, `/handoff`, `/contract-change`, `/privacy-check`, `/gate-check`, `/demo-day`, plus reference skills for BLE, matching math, and graph viz |
| Subagents | `.claude/agents/` | docs-researcher, test-runner, privacy-auditor, contract-keeper, browser-tester (Playwright), ml-evaluator |
| MCP | `.mcp.json` | Context7 (current docs) and Supabase (read-only, project-scoped) |
| Hooks | `.claude/hooks/` | Session brief; guard against force pushes, `--no-verify`, secrets in client code, LinkedIn or Instagram scraping; 30-minute commit nudge |
| Status line | `.claude/statusline.py` | Owner, branch, uncommitted files, minutes since your commit, context, 5-hour usage |
| Git guard | `.githooks/pre-commit` | Blocks `.env` files, files over 10 MB, and secrets for humans and agents alike |

Plugins (official marketplace), the same for everyone and declared once in the committed `.claude/settings.json` (`enabledPlugins`): typescript-lsp, pyright-lsp, expo, supabase, frontend-design, feature-dev, security-guidance, vercel, superpowers. Claude Code offers them when you trust the folder; `./scripts/claude-setup.sh` installs them up front; the session brief flags any that are missing after a `git pull`. The team pre-approved every declared plugin and skill for every agent (see AGENTS.md "Skills and plugins").

## Models and credits
- Sonnet 5 (the default) for most building. `/model opus` for schema and RLS design, ML design, native Bluetooth work, and nasty bugs, then switch back.
- Subagents already use cheaper models where it's safe. Watch the 5h meter in the status line and `/handoff` before it runs out so nothing is lost.
- `/usage` shows what's burning credits.

## Power moves
- Remote Control lets you steer a running session from your phone while you walk around testing Bluetooth.
- `claude --worktree` runs a second session on its own branch copy when you want two agents in parallel.
- Claude Code Desktop's iOS Simulator pane is handy for pure UI screens (not Bluetooth).

## Troubleshooting
- Hooks and the status line need `python3` on your PATH. On Windows, run everything inside WSL.
- `/hooks`, `/mcp`, `/context`, and `/doctor` show what actually loaded.
- Auto mode missing: check `/model` is Sonnet 5, Opus, or Fable and rerun the setup script.
- A hook blocked something you truly need: it tells you why. Do it yourself in a terminal after checking it's safe, or set `FC_NO_COMMIT_NUDGE=1` to silence only the commit nudge for a session.
