# HackGT 13 project

Event networking app: AI-extracted interests, ranked matches, verified conversations, live community map.

- What we're building and priorities: `SCOPE.md`
- Rules for AI coding assistants: `CLAUDE.md` / `AGENTS.md`
- Database: `docs/schema.sql`   API: `docs/api.md`
- Git basics: `docs/git-cheatsheet.md`

## Folders
- `mobile/`     Expo app (Adam, Akshar)
- `ml/`         Python ML service (Alan, Arjun). Quick test: `cd ml && pip install -r requirements.txt && python run_demo.py`
- `dashboard/`  Next.js organizer dashboard (Arjun)
- `supabase/`   migrations and config (Adam)

## First-time setup

Local previews serve the files on your machine, not the latest files on GitHub. Pull `main` before starting. Agents supervising a preview must follow **Keep local previews current** in `AGENTS.md`: check for team updates every 60 seconds, fast-forward a clean checkout, and refresh/restart as needed. Uncommitted work must be preserved. This policy is not a standalone automatic updater; a supervising agent or configured monitor must be running.

1. `git clone https://github.com/adamissac/hackgt13-project.git`
2. `cp .env.example .env` and fill values from the team chat
