# PROGRESS

## 2026-09-26 02:10 | adam | Claude Code
**Task:** AD3 Expo app shell
**Status:** in progress (code done; needs a dev build on a physical phone)
**What I did:**
- `mobile/`: Expo SDK 57 + Expo Router, five tabs (Home with Open to Meet toggle writing profiles.open_to_meet, Nearby, Graph, Feed, Profile), each with loading/empty/error states.
- `mobile/lib/`: env.ts, supabase.ts (PKCE, AsyncStorage, detectSessionInUrl false), api.ts typed from docs/api.md 1-11 with mock mode (EXPO_PUBLIC_USE_MOCKS=1).
- `docs/mocks/*.json` for api.md 1-11. `mobile/features/ble/index.ts` stub (useProximity, setAdvertising) for Akshar.
- app.json: name Formal Connection, scheme `formalconnect`, bundle id com.formalconnection.app.
- Verified: `npx tsc --noEmit` clean, iOS bundle exports, web static render shows all five tabs.
**How to run/test it:** see AGENTS.md "Run and test commands" (mobile).
**Next step for whoever continues:** Build the dev client on a physical phone. This Mac has no Xcode, so either install Xcode and run `cd mobile && npx expo run:ios --device`, or `npx eas-cli login` then `npx eas-cli build --profile development --platform ios`. Then AD2: LinkedIn developer app (Adam's manual steps in prompts/adam.md) and sign-in screen using deep link `formalconnect://auth/callback`.
**Known issues / blockers:** No Xcode/EAS on Adam's Mac yet. mobile/.env is local only (gitignored); teammates copy .env.example and get the anon key via `npx supabase projects api-keys --project-ref mwfzgkikbmnghueolfnw`.
**Contract changes:** none (added docs/mocks matching api.md)

## 2026-09-26 01:15 | adam | Claude Code
**Task:** AD1 Supabase project
**Status:** done
**What I did:**
- Added MASTER_SPEC.md to the repo.
- Migrations 6-8 applied to remote: Section 8.1 alters, 8.2 new tables, 8.3 RLS (security-definer helper for location_shares), realtime publication for messages, location_shares, notifications.
- Verified remotely: 35/35 public tables have RLS on; realtime publication = location_shares, messages, notifications; presence.open_to_meet exists; HackGT 13 event id 1.
- `scripts/rls-isolation-test.mjs`: all checks pass (signup trigger, 7 owner-only tables, resumes bucket). Test users and files cleaned up.
- docs/schema.sql now mirrors Section 8.
**How to run/test it:** see AGENTS.md "Run and test commands" (supabase).
**Next step for whoever continues:** AD2 auth. Adam must create the LinkedIn developer app (with a LinkedIn Page, "Sign In with LinkedIn using OpenID Connect" product, redirect `https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback`) and paste client ID/secret into Supabase Auth > LinkedIn (OIDC). Meanwhile start AD3 (Expo shell in mobile/).
**Known issues / blockers:** Spec lists no event zones, so none seeded. organizations/org_members/org_subscriptions/event_posts have no client policies (FastAPI only) since 8.3 doesn't name them. event_registrations is owner-only.
**Contract changes:** docs/schema.sql extended with Section 8.1/8.2 exactly as in the spec.

## 2026-09-26 00:30 | adam | Claude Code
**Task:** AD1 Supabase project
**Status:** in progress
**What I did:**
- Linked repo to Supabase project `mwfzgkikbmnghueolfnw`; `.mcp.json` scoped to it.
- Migrations in `supabase/migrations/` applied to remote: base schema (= docs/schema.sql), RLS on the 11 tables that lacked it (no client policies, except authenticated read on events/event_zones), `handle_new_user` security-definer trigger (search_path pinned) creating profiles from OIDC name/picture, private `resumes` bucket with owner-only `<user_id>/` policies, HackGT 13 seed event.
- Verified remotely: 20/20 public tables have RLS on, event row id 1 present, bucket private.
**How to run/test it:** see AGENTS.md "Run and test commands" (supabase).
**Next step for whoever continues:** Get MASTER_SPEC.md into the repo, then write migrations for Section 8.1 alters, 8.2 new tables (messages, location_shares, notifications -> add to supabase_realtime publication), 8.3 exact RLS policies, and event_zones seed. Then write the RLS isolation script (user A anon session cannot read user B rows).
**Known issues / blockers:** MASTER_SPEC.md still missing. `profiles` has no email column so the trigger stores name and picture only. RLS isolation test not written yet.
**Contract changes:** none (RLS/trigger/bucket only; no table or column changes)

## 2026-09-25 23:45 | adam | Claude Code
**Task:** Kit install (pre-AD1)
**Status:** blocked
**What I did:**
- Moved the Claude kit to repo root; added the hidden kit files that were missing from the first push (`.claude/`, `.mcp.json`, `.githooks/`).
- Started this PROGRESS.md.
**How to run/test it:** `./scripts/claude-setup.sh <your name>`, then `claude "$(cat prompts/<your name>.md)"`
**Next step for whoever continues:** Add `MASTER_SPEC.md` to the repo root (it's referenced everywhere but isn't in the repo or on Adam's Mac). Put the Supabase project ref in `.mcp.json` in place of `YOUR_PROJECT_REF`. Then start AD1 (`supabase init` in `supabase/`).
**Known issues / blockers:** MASTER_SPEC.md missing; Supabase project ref not set; claude-setup.sh not yet run on Adam's laptop.
**Contract changes:** none
