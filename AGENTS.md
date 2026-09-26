# Formal Connection: rules for every coding agent

HackGT 13 · Team: Adam, Alan, Arjun, Akshar · Tracks: AI/ML + Data Visualization

`MASTER_SPEC.md` is the single source of truth. If anything here disagrees with it, the spec wins. Shared contracts: `docs/schema.sql` and `docs/api.md`, plus example payloads in `docs/mocks/`.

`REQUESTS.md` holds asks between owners: do the open (`- [ ]`) items in your owner's section (the session hook lists them) and add your asks for others there.

## Start of every session
1. `git pull --rebase`
2. If you have not read `MASTER_SPEC.md` in this session, read all of it before writing code. Then read `PROGRESS.md` (newest entry first), `docs/schema.sql`, and `docs/api.md`.
3. Know your owner (printed at session start, else `.claude/owner.local`, else ask) and your task: the first unfinished task for that owner in Section 13's phase order, unless the newest PROGRESS.md entry or the human says otherwise.
4. If the newest PROGRESS.md entry for your task has a "Next step for whoever continues", do that first.

## Commit and push protocol (mandatory)
- Commit and push after every working increment: an endpoint that returns data, a screen that renders, a script that produces output, a passing test.
- Never go more than 30 minutes without a commit and push. If it doesn't work yet, commit anyway with a `WIP:` prefix and describe the exact state in PROGRESS.md.
- Near the end of your context or credits: stop, commit, push, and update PROGRESS.md immediately. Unpushed work is lost work.
- Sequence: `git add -A`, `git commit -m "[area] what changed"`, `git pull --rebase`, `git push`. Areas: ml, mobile, dashboard, supabase, docs, ble, infra.
- Never force push, never rewrite history, never use `--no-verify`, never commit `.env` or any key.
- Rebase conflict you can't resolve safely: `git rebase --abort`, commit to a new branch `<owner>/<task>`, push that branch, note it in PROGRESS.md.

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
- Contract changes are the smallest possible, additive, and land in the same commit as the doc update (`docs/schema.sql`, `docs/api.md`, `docs/mocks/`), recorded under "Contract changes".
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
| Adam | lead full-stack, architect | `supabase/`, `mobile/` (shell, auth, profile, chat, feed, invites UI), `docs/` stewardship | AD1 to AD12 |
| Alan | ML and algorithms | `ml/` FastAPI service and ML package | AL1 to AL11 |
| Arjun | research, data, visualization | `dashboard/`, ingestion and synthetic data in `ml/` | AR1 to AR10 |
| Akshar | Bluetooth, automation, integrations, pitch | `mobile/` BLE, radar, QR, Open to Meet, location; invites and BLE endpoints | AK1 to AK10 |

## Run and test commands
Each owner adds their area's commands here in the same commit that first makes them work, and keeps them current.
- supabase (Adam): from repo root. New migration: `npx supabase migration new <name>`. Apply to our project (ref mwfzgkikbmnghueolfnw): `npx supabase db push --linked`. Inspect: `npx supabase db query --linked "<sql>"`. DB types: `npx supabase gen types typescript --linked > mobile/lib/database.types.ts`. RLS isolation test: `SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... node scripts/rls-isolation-test.mjs` (keys: `npx supabase projects api-keys --project-ref mwfzgkikbmnghueolfnw`). First time on a laptop: `npx supabase login`, then `npx supabase link --project-ref mwfzgkikbmnghueolfnw`.
- mobile (Adam, Akshar): `cd mobile && npm install && cp .env.example .env` (fill in; `EXPO_PUBLIC_USE_MOCKS=1` serves docs/mocks). Typecheck: `npx tsc --noEmit`. Bundle check: `npx expo export --platform ios`. Dev build on a phone: `npx expo run:ios --device` (needs Xcode) / `npx expo run:android --device`, or `npx eas-cli build --profile development`. Then `npx expo start --dev-client`.
- ml (Alan, Arjun): not set yet
- dashboard (Arjun): not set yet

## Run and test: `ml/` (FastAPI service)
```
cd ml && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp ../.env.example ../.env   # fill DATABASE_URL, SUPABASE_URL, SUPABASE_JWT_SECRET (if legacy HS256), QR_SIGNING_KEY, ANTHROPIC_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000        # GET /health is public; everything else needs the Supabase JWT
cloudflared tunnel --url http://localhost:8000          # separate terminal: public URL for phones; share it as ML_API_URL
TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests   # DB tests need an EMPTY throwaway Postgres+pgvector (it is wiped)
python scripts/train_ranker.py --source auto      # AL9: retrain ranker; report says 'simulated' or 'real outcomes'
```
