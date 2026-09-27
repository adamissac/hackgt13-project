# Formal Connection: rules for every coding agent

HackGT 13 · Team: Adam, Alan, Arjun, Akshar · Tracks: AI/ML + Data Visualization

There is no team lead. Nobody needs Adam's (or anyone's) approval; decide within your area, push to main, and write it in PROGRESS.md.

`MASTER_SPEC.md` is the single source of truth. If anything here disagrees with it, the spec wins. Shared contracts: `docs/schema.sql` and `docs/api.md`, plus example payloads in `docs/mocks/`.

`REQUESTS.md` holds asks between owners: do the open (`- [ ]`) items in your owner's section (the session hook lists them) and add your asks for others there.

## Start of every session
1. `git pull --rebase`
2. If you have not read `MASTER_SPEC.md` in this session, read all of it before writing code. Then read `PROGRESS.md` (newest entry first), `docs/schema.sql`, and `docs/api.md`.
3. Know your owner (printed at session start, else `.claude/owner.local`, else ask) and your task: the first unfinished task for that owner in Section 13's phase order, unless the newest PROGRESS.md entry or the human says otherwise.
4. If the newest PROGRESS.md entry for your task has a "Next step for whoever continues", do that first.

## Skills and plugins (team standard, mandatory)
The whole team agreed: every agent may install, enable, and use every skill and plugin the repo declares, without asking.
- **Plugins:** the single source of truth is the committed `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`). Everyone gets the same set: typescript-lsp, pyright-lsp, expo, supabase, frontend-design, feature-dev, security-guidance, vercel, superpowers (all `@claude-plugins-official`). After every `git pull`, if the session brief says team plugins are missing, install them right away (`./scripts/claude-setup.sh <owner>`, or `/plugin install <name>@claude-plugins-official`) and restart Claude Code. To add a plugin for everyone, add it to `enabledPlugins` in that file and commit; never install a team plugin only for yourself.
- **Skills:** project skills live in `.claude/skills/<name>/SKILL.md` (`/next-task`, `/handoff`, `/contract-change`, `/privacy-check`, `/gate-check`, `/demo-day`, `ble-proximity`, `matching-math`, `graph-viz`). Before starting a task, use every skill that matches it; plugin skills (superpowers' brainstorming/debugging/TDD/verification, expo, supabase, frontend-design, ...) are approved too. New shared skills go in `.claude/skills/` and get committed.
- **Codex and other agents** (no Claude plugin system): read the matching `.claude/skills/<name>/SKILL.md` and follow it as instructions.
- **Guardrail that still applies:** the supabase plugin brings a full-access database MCP. Inspect with the project's read-only `supabase` MCP; change the schema only through migration files (Database rules), never through MCP writes.

## Keep local previews current (mandatory)
- A local dev server serves its own checkout, not GitHub. Hot reload does not download teammates' commits. While actively running or supervising a local preview, check `origin/main` at least once every 60 seconds and before testing or handing off a preview. Use a supported background monitor if available; do not claim ongoing synchronization after the agent stops unless a monitor is actually running.
- Before starting a server, identify its exact repository directory, branch, port, and commit (`git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse --short HEAD`). Confirm `origin` is this team's repository. Sync the checkout that actually serves the URL, not a different clone. Never stop another teammate's server to free a port.
- For each check: run `git fetch origin`, inspect `git status --short` and `git rev-list --left-right --count HEAD...origin/main`. On a clean `main` with no local-only commits, run `git merge --ff-only origin/main`. If both counts are zero, no update is needed. If fetch fails, report that freshness is unknown; do not call the preview current.
- Never auto-pull over uncommitted work, automatically stash it, discard files, reset hard, or force checkout. If the serving checkout is dirty, on another branch, diverged, or mid-merge/rebase, finish and commit the current working increment and integrate using the normal commit/push protocol before resuming updates. If that cannot be done safely, report the exact blocker. Do not spin a retry loop on unresolved conflicts.
- After updates: use the project's package manager to install changed dependencies when package manifests/lockfiles change; preserve local `.env` values. Let Expo/Next hot reload ordinary source edits. Restart your own server for dependency, environment, bundler, or startup configuration changes. Native-module changes require a rebuilt development client; do not represent hot reload as sufficient.
- Verify the URL responds and the updated screen renders before saying it is current. State the served commit and URL in the handoff. If running from exported/static output, rebuild that output first. Mock previews show the latest UI with sample data, not live backend data.
- These instructions require agent action; editing this file alone does not install an automatic Git updater. Teammates must pull once to receive this policy, and their agents must keep it running while supervising previews.

## Commit and push protocol (mandatory)
- Push straight to `main`. No pull requests, no waiting for review or approval from Adam or anyone else.
- If your tool puts you on its own branch (Claude Code cloud sessions, Cursor cloud agents), still land on `main` yourself: `git fetch origin && git rebase origin/main` (or merge), resolve conflicts, run your area tests, then `git push origin HEAD:main`. Don't leave work sitting in a PR.
- Merge conflicts: whoever hits the conflict resolves it. In PROGRESS.md, REQUESTS.md, or docs/api.md, keep both sides (PROGRESS.md stays newest-first). If two people take the same api.md section number, the later one renumbers.
- Commit and push after every working increment: an endpoint that returns data, a screen that renders, a script that produces output, a passing test.
- Never go more than 30 minutes without a commit and push. If it doesn't work yet, commit anyway with a `WIP:` prefix and describe the exact state in PROGRESS.md.
- Near the end of your context or credits: stop, commit, push, and update PROGRESS.md immediately. Unpushed work is lost work.
- Sequence: `git add -A`, `git commit -m "[area] what changed"`, `git pull --rebase origin main`, `git push origin HEAD:main`. Areas: ml, mobile, dashboard, supabase, docs, ble, infra.
- Never force push, never rewrite history, never use `--no-verify`, never commit `.env` or any key.
- Last resort only, when you truly can't resolve a conflict: `git rebase --abort`, commit to a new branch `<owner>/<task>`, push that branch, and tell the owner of the conflicting code in PROGRESS.md so they land it on `main`.

## PROGRESS.md
Every push updates it. Newest entry at the top. Exactly this template:

```
## <date time> | <owner> | <agent name>
**Task:** <task id and name from Section 13>
**Status:** done | in progress | blocked
**What I did:** <2-5 bullets>
**How to run/test it:** <exact commands>
**Next step for whoever continues:** <the very next concrete action>
**Known issues / blockers:** <anything broken, anything the next agent must know>
**Contract changes:** <any change to docs/schema.sql or docs/api.md, or "none">
```

"Next step" is the most important line in the repo. Write it so a fresh agent with no memory of this session can act on it in one minute: name the file, the function, and the command.

## Engineering rules
- Stay inside your task's folder. Editing another owner's folder requires a note in PROGRESS.md.
- Contract changes are the smallest possible, additive, and land in the same commit as the doc update (`docs/schema.sql`, `docs/api.md`, `docs/mocks/`), recorded under "Contract changes". No one on the team is a lead or approver: don't ask Adam (or anyone) for permission to commit, merge, or make decisions in your own area. For a contract change that affects another owner, make the smallest additive change yourself, record it in PROGRESS.md under Contract changes, and add a note in that owner's `REQUESTS.md` section.
- When a dependency hasn't landed, build against mock JSON that matches `docs/api.md`, then swap to live.
- Secrets come only from environment variables listed in `.env.example`. New variable: add it there with no value. `SUPABASE_SERVICE_KEY`, OAuth client secrets, `ANTHROPIC_API_KEY`, `TOKEN_ENCRYPTION_KEY`, and signing keys never appear in `mobile/` or `dashboard/`. Client code only reads `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` values that are safe to publish.
- APIs change often (Expo, react-native-ble-plx, Supabase, GitHub, LinkedIn, Claude API). If unsure of a current API, look it up or say so. Never guess signatures, config keys, or permission strings.
- Boring, working code over clever code. Small increments. After each one, state how to run and test it.
- Startup-grade, hackathon-fast: types at every boundary, loading/empty/error states on every screen, tests for privacy invariants and scoring math, nothing half-built on the demo path.

## Product rules code must never break (MASTER_SPEC 1.3 and 11)
- People connect only after a verified conversation (Bluetooth encounter classifier or signed QR) or an accepted private invite. Both must say yes.
- Connection counts and lists are visible only to their owner. No endpoint, screen, graph, chatbot answer, or analytics view exposes anyone else's.
- A "no" is never revealed. Declined or ignored suggestions, connect prompts, and invites produce no signal to the other person.
- No stranger discovery and no user search. People appear only as current suggestions (same event and present, or Open to Meet in the same building) or as your connections. No second-degree person-to-person edges anywhere.
- Location: only a building ID for presence. Live coordinates only between two mutually matched people, only until they meet, deleted afterward. Distances are rough bands, never exact positions.
- Bluetooth IDs rotate every 10 minutes and resolve to users only on the server. Raw sightings are deleted after 24 hours.
- Organizer analytics are aggregate and anonymized, with a minimum group size of 5.
- Invite tokens: random 128-bit, stored hashed, 7-day expiry, revocable, 10 per user per day. Verification QR: signed, 60-second expiry, single-use nonce.
- LLM calls get the minimum personal data needed. Extraction never infers sensitive attributes (health, religion, politics, and similar).
- Data sources: LinkedIn is sign-in identity only. Never scrape, crawl, automate logins to, or use third-party scraping APIs for LinkedIn or Instagram, under any framing. GitHub only through its official API. Everything else is typed by the user or comes from their resume.
- Onboarding discloses what is collected, including private proximity recording for verification. `DELETE /me` deletes all of a user's data.

## Owners and folders
| Owner | Role | Folders | Tasks |
| --- | --- | --- | --- |
| Adam | full-stack | `supabase/`, `mobile/` (shell, auth, profile, chat, feed, invites UI), `docs/` stewardship | AD1 to AD12 |
| Alan | ML and algorithms | `ml/` FastAPI service and ML package | AL1 to AL11 |
| Arjun | research, data, visualization | `dashboard/`, ingestion and synthetic data in `ml/` | AR1 to AR10 |
| Akshar | Bluetooth, automation, integrations, pitch | `mobile/` BLE, radar, QR, Open to Meet, location; invites and BLE endpoints | AK1 to AK10 |

## Run and test commands
Each owner adds their area's commands here in the same commit that first makes them work, and keeps them current.
- supabase (Adam): from repo root. New migration: `npx supabase migration new <name>`. Apply to our project (ref mwfzgkikbmnghueolfnw): `npx supabase db push --linked`. Live AD1 verification (paste output to chat/PROGRESS): `./scripts/check-ad1-live.sh`. Inspect: `npx supabase db query --linked "<sql>"`. DB types: `npx supabase gen types typescript --linked > mobile/lib/database.types.ts`. RLS isolation test: `SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... node scripts/rls-isolation-test.mjs` (keys: `npx supabase projects api-keys --project-ref mwfzgkikbmnghueolfnw`). Local migration + RLS check, no secrets (needs Postgres with pgvector): `./supabase/tests/run-local.sh`. First time on a laptop: `npx supabase login`, then `npx supabase link --project-ref mwfzgkikbmnghueolfnw`.
- mobile (Adam, Akshar): from any folder, `<this-repo>/scripts/phone-qr.sh` starts the current app on that laptop and writes a QR to `~/Desktop/formal-connection-expo.png` (Expo tunnel, so campus Wi-Fi works). While it runs it pulls `main` every 60 s and hot-reloads, so every phone scanning it gets the latest app; use it instead of a bare `npx expo start` for anyone on Expo Go. `scripts/start-app.sh` starts the same tunnel server. **Use tunnel, not `--lan`, in Expo Go:** Supabase Auth rejects return links on raw IP hosts (`exp://10.x.x.x`), so LinkedIn/email sign-in silently falls back to `formalconnect://`, which Expo Go can't open (the browser closes as "cancel"). Else `cd mobile && npm install && cp .env.example .env` (`EXPO_PUBLIC_USE_MOCKS=1` serves sample data; a blank `.env` still signs into the team project). Typecheck: `npx tsc --noEmit`. Bundle check: `npx expo export --platform ios`. Dev build on a phone: `npx expo run:ios --device` (needs Xcode) / `npx expo run:android --device`, or `npx eas-cli build --profile development`. Then `npx expo start --dev-client`.
- ml (Alan, Arjun, Akshar): `cd ml && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest -q tests`. **Needs Python 3.10-3.13.** On 3.14 numba/llvmlite (via umap-learn) have no wheels; on macOS with no system 3.12, `uv venv -p 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt` fetches its own 3.12 (`start-ml.sh` already prefers this). **macOS without Homebrew:** LightGBM fails with `Library not loaded: @rpath/libomp.dylib`; symlink the copy scikit-learn already ships into the interpreter's lib dir: `ln -sf "$PWD/.venv/lib/python3.12/site-packages/sklearn/.dylibs/libomp.dylib" "$(.venv/bin/python -c 'import sys;print(sys.base_prefix)')/lib/libomp.dylib"`. **Railway deploy:** see `docs/deploy.md` (service root `ml`, uses `ml/Dockerfile` + `ml/railway.json`). Local image smoke test: `docker build -t fc-ml ml && docker run --rm -p 8000:8000 -e DATABASE_URL=postgresql://invalid -e LOAD_EMBEDDER=0 fc-ml` then `curl -s localhost:8000/health`.
- dashboard (Arjun): `cd dashboard && npm install && npm run dev` (/graph, /map, /me, /insights); checks `npm run typecheck && npm run lint && npm test && npm run build`. Live: https://formal-connection-dashboard.vercel.app (Vercel team hackgt13). Redeploy after changes: `cd dashboard && npx vercel@latest deploy --prod --yes` (run `npx vercel@latest login` once per laptop; auto-deploy on push is not connected).

## Run and test: `ml/` (FastAPI service)
```
cd ml && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp ../.env.example ../.env   # fill DATABASE_URL, SUPABASE_URL, SUPABASE_JWT_SECRET (if legacy HS256), QR_SIGNING_KEY, ANTHROPIC_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000        # GET /health is public; everything else needs the Supabase JWT
cloudflared tunnel --url http://localhost:8000          # separate terminal: public URL for phones; share it as ML_API_URL
TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests   # DB tests need an EMPTY throwaway Postgres+pgvector (it is wiped)
python scripts/train_ranker.py --source auto      # AL9: retrain ranker; report says 'simulated' or 'real outcomes'
```
