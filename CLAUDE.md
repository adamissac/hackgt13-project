@AGENTS.md

# Claude Code specifics

## How you operate here
- Permission mode is auto. Do routine work without asking: edit files in your owner's folders, install dependencies the repo declares, run builds and tests, commit and push.
- Push directly to `main` (`git push origin HEAD:main`). Never open a PR or ask Adam to merge.
- Ask the human only for: secrets or accounts you can't access, physical actions on a phone, a contract change that affects another owner beyond the smallest change, or anything irreversible outside the repo.
- Hooks in `.claude/hooks/` are guardrails, not suggestions. They brief you at session start, block force pushes, history rewrites, `--no-verify`, secrets in client code, and LinkedIn or Instagram scraping, and stop you from ending a turn with 30+ minutes of uncommitted work. If a hook blocks you, fix the cause. Never route around it.
- The status line shows owner, branch, uncommitted files, minutes since your last commit, context use, and 5-hour usage. When usage climbs past 80 percent, run `/handoff` before starting anything big.

## Skills
- `/next-task`: pick the owner's next task from Section 13 and PROGRESS.md, plan it, start.
- `/handoff`: commit, push, and write the PROGRESS.md entry. Use after every working increment.
- `/contract-change`: the only way to change `docs/schema.sql`, `docs/api.md`, `docs/mocks/`, migrations, or env vars.
- `/privacy-check`: audit your diff against the product rules before pushing anything that touches people data.
- `/gate-check`: status against the current checkpoint (Section 12.3) and the Section 14 checklist.
- `/demo-day`: demo script, rehearsal checklist, backup video, judge Q&A.
- Reference skills load when relevant: `ble-proximity`, `matching-math`, `graph-viz`.
- Bundled skills: `/claude-api` before writing any Anthropic SDK code, `/verify` to confirm a change against the running app, `/run-skill-generator` once per area so every agent knows how to launch it, `/code-review` before gate pushes.

## Subagents
Delegate to keep your context clean. Run at most 3 at once to save credits.
- `docs-researcher`: verify an external API, config key, CLI flag, or permission string before coding against it.
- `test-runner`: tests, type checks, builds. Returns only failures.
- `privacy-auditor`: reviews a diff against the product rules.
- `contract-keeper`: checks code against `docs/api.md`, `docs/schema.sql`, `docs/mocks/`, `.env.example`.
- `browser-tester`: drives dashboard pages in a real browser and reports what renders.
- `ml-evaluator`: runs ML evaluations and writes honest reports.

## MCP servers
- `context7`: current library docs. Prefer it over memory for Expo, BLE, Supabase, Next.js, FastAPI, LightGBM.
- `supabase`: read-only and scoped to our project. Use it for schema, advisors, and logs. From Saturday on the database holds real attendees: never pull user rows into the conversation beyond what a bug needs.

## Your brief
The owner's full brief is `prompts/<owner>.md`. Read it at the start of your first session in this repo.

## Run and test: `ml/` (FastAPI service)
```
cd ml && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp ../.env.example ../.env   # fill DATABASE_URL, SUPABASE_URL, SUPABASE_JWT_SECRET (if legacy HS256), QR_SIGNING_KEY, ANTHROPIC_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000        # GET /health is public; everything else needs the Supabase JWT
cloudflared tunnel --url http://localhost:8000          # separate terminal: public URL for phones; share it as ML_API_URL
TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests   # DB tests need an EMPTY throwaway Postgres+pgvector (it is wiped)
```
