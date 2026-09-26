# Claude Code brief: Adam · full-stack
HackGT 13 · Formal Connection · Tracks: AI/ML + Data Visualization
Start from the repo root with `claude "$(cat prompts/adam.md)"`, or paste this whole file as the first message.

You are Adam's lead coding agent. Adam owns the foundation everyone else stands on: the Supabase project (schema, RLS, auth, storage, realtime), the Expo app shell and his screens. There is no team lead: each owner lands and integrates their own work on `main`, and nobody needs Adam's approval. Three other agents (Alan's, Arjun's, Akshar's) are building in this repo at the same time. PROGRESS.md and the contracts in `docs/` are how you stay in sync with them.

## Operating mode
- Auto mode is on. Don't ask permission for routine work: editing files in your folders, installing dependencies, running builds and tests, committing and pushing.
- Ask Adam only for: secrets and dashboard access (Supabase, LinkedIn developer app, Apple and Google developer accounts, EAS), physical phone steps, or anything irreversible outside the repo. When you need something, ask for all of it in one message and keep working on what isn't blocked.
- Verify before you code: any Expo SDK 57, Supabase, React Native, or LinkedIn detail you haven't confirmed this session goes to `docs-researcher` first. Supabase changes fast; the `supabase` plugin skill also covers current best practices.
- Keep your context lean: tests through `test-runner`, docs through `docs-researcher`, audits through `privacy-auditor` and `contract-keeper`.
- Use Opus (`/model opus`) for schema and RLS design, auth debugging, and integration problems. Sonnet is fine for screens.

## First session
0. Check the team kit is installed: `.claude/owner.local` says `adam` and `.claude/skills/handoff/` exists. If not, tell Adam to copy the kit into the repo root and run `./scripts/claude-setup.sh adam`. Until then, follow MASTER_SPEC Section 0 by hand (commit, push, and a PROGRESS.md entry after every increment).
1. `git pull --rebase`. Read MASTER_SPEC.md fully, then AGENTS.md, PROGRESS.md, docs/schema.sql, docs/api.md.
2. If `.mcp.json` still contains `YOUR_PROJECT_REF`, ask Adam for the Supabase project ref, put it in, and commit `[infra] scope supabase MCP to our project`. Then have Adam run `/mcp` to sign in.
3. The `supabase` plugin also installs a full-access Supabase MCP server. Use the project's read-only `supabase` server for inspection and make every schema change as a migration file, never through MCP writes.
4. Run `/next-task` and go.

## Your tasks in order (MASTER_SPEC Section 13)

### Phase 0: Friday night
**AD1 Supabase project.** Done when tables exist and the HackGT 13 seed event row is present.
- `supabase init` in `supabase/`, then `supabase link --project-ref <ref>` (Adam may need to run the login step).
- Migrations, in order: base schema from `docs/schema.sql`; the Section 8.1 alters and 8.2 new tables; the 8.3 RLS policies; a seed for the HackGT 13 event and its zones.
- Enable pgvector (`create extension if not exists vector`), add an HNSW index on the profile vectors with `vector_cosine_ops`.
- RLS on every public table. Tables with "no client access" get RLS on and zero client policies (FastAPI uses the service key).
- A `security definer` trigger on `auth.users` insert that creates the `profiles` row from the OIDC metadata (name, picture, email), with `search_path` pinned.
- Add `messages`, `location_shares`, and `notifications` to the `supabase_realtime` publication.
- Private Storage bucket `resumes` with owner-only policies on the `<user_id>/` prefix.
- Verify: list tables through the read-only MCP, and prove with a quick script that user A's anon session can't read user B's rows. Write `supabase` commands into AGENTS.md "Run and test commands".

**AD2 Auth.** Done when sign-in works on a physical phone.
- Adam's manual steps (ask for them together): create the LinkedIn developer app, associate a LinkedIn Page (required), add the "Sign In with LinkedIn using OpenID Connect" product, set the redirect URL to `https://<ref>.supabase.co/auth/v1/callback`, and paste the client ID and secret into Supabase Auth, LinkedIn (OIDC) provider. Add the app's deep link (for example `formalconnect://auth/callback`) to Supabase Auth redirect URLs.
- App side: Supabase client with PKCE flow, persisted session, `detectSessionInUrl: false`. Sign in with `provider: "linkedin_oidc"` and `skipBrowserRedirect: true`, open the returned URL with `WebBrowser.openAuthSessionAsync`, then exchange the returned code for a session. Confirm each call against current docs first.
- Fallback: email magic link (`signInWithOtp`) that returns through the same deep link. Build it right after LinkedIn works, because LinkedIn app approval can stall.

**AD3 Expo app shell.** Done when the app runs on a device and tabs navigate.
- Expo SDK 57 dev build (not Expo Go). Expo Router tabs: Home (Open to Meet toggle), Nearby, Graph, Feed, Profile.
- `mobile/lib/env.ts`, `mobile/lib/supabase.ts`, and a typed `mobile/lib/api.ts` generated by hand from `docs/api.md`. Mock mode: `EXPO_PUBLIC_USE_MOCKS=1` makes the client return `docs/mocks/*.json`. This one hour of work lets every teammate build UI before the backend lands. Create the first mocks yourself for the endpoints your early screens need.
- Once Alan's FastAPI is live, generate types from its `/openapi.json` (for example with `openapi-typescript`) and have `contract-keeper` confirm they match `docs/api.md`. Generate database types with `supabase gen types`.
- Give Akshar a stub: `mobile/features/ble/index.ts` exporting the hooks his screens will fill in (for example a proximity hook returning mock peers), so the Home and Nearby tabs compile from day one.

### Phase 1: Saturday morning (Must items end to end)
**AD4 Onboarding.** Manual entry (headline, experience, interests, looking for, can offer), resume upload to `resumes/<user_id>/` then `POST /profile/ingest`, a GitHub connect button, and the web-search opt-in checkbox hidden until built. For GitHub: the app calls `GET /connect/github/start` with the user's JWT and should receive the authorize URL as JSON, then opens it with an auth session. Agree on that shape with Arjun and record it in `docs/api.md`.
**AD5 Interest review.** Confirm, hide, add. Show evidence lines. Edits persist through `PATCH /profile/interests`.
**AD6 Matches list, quick profile, suggestion Yes/No.** Needs AL3 and AL4 (use mocks until then). Overlap chart: a four-facet radar plus top-5 topic bars with react-native-svg. After Yes, the waiting state must look identical whatever the other person does.
**AD7 Chat.** Needs AL5. Supabase Realtime on `messages` filtered by `chat_id`, RLS-protected. The AI icebreaker shows as a suggested first message the user can edit or dismiss.
**AD8 Post-conversation checklist, connect prompt, connections list.** Needs AL6. Show "How you met" and topics. Never show anyone else's count.
**AD9 Graph tab.** Needs AR4. `react-native-webview` loading Arjun's HTTPS page. After load, and again on every token refresh, post `{type: "auth", token}` to the page. Handle messages back from the page (for example an exported PNG to share).

**Gate, Saturday noon:** run `/gate-check` with the team. Every Must works end to end on real phones, or nobody starts Should items.

### Phase 2 and later
**AD10 Push notifications** for suggestion, connect prompt, connected, and invite. `expo-notifications` with the EAS projectId. The spec has no place to store push tokens: add a small owner-only `push_tokens` table through `/contract-change` (don't put tokens on `profiles`, other users may read profile rows). Server sending lives in FastAPI; coordinate with Alan and note it in PROGRESS.md.
**AD11 Feed screen and composer.** AI-ranked `GET /feed`, post and self-reported update composer, reply suggestion.
**AD12 Events.** List, registration, attendee feed, "your connection is attending" alert.

## Extra chores (unassigned in the spec; yours unless another owner takes them)
- `.env.example` files for root, `mobile/`, `dashboard/`, and `ml/` with every variable name and no values.
- `docs/mocks/` exists and matches `docs/api.md`.
- `DELETE /me` (Section 11) has no owner in Section 13. Propose Alan builds the endpoint and you add a "Delete my data" button in Profile settings. Record who owns it in PROGRESS.md.
- Onboarding copy that discloses private proximity recording (Section 3.5).
- You are not a referee or approver for anyone. Contract changes: whoever needs one makes the smallest additive change, records it in PROGRESS.md, and notes it in the affected owner's `REQUESTS.md` section. Merge conflicts: whoever hits the conflict resolves it (keep both sides). After you integrate your own work, walk the Section 12.1 story on two phones.

## Dependencies
You need Alan's AL3, AL4, AL5, AL6 and Arjun's AR4. Everyone needs your AD1, AD2, and AD3 first, so Phase 0 speed matters more than polish.

## Done means
The Section 13 done-when holds on physical phones, `/privacy-check` is clean for anything touching people data, `/handoff` pushed it with a PROGRESS.md entry, and AGENTS.md has the run and test commands.

## Autopilot lines (Adam types these)
```
/goal AD1 is done: migrations applied, RLS enabled on every public table, the HackGT 13 seed event row present, all shown in the transcript via the read-only Supabase MCP, committed and pushed with a PROGRESS.md entry, or stop after 25 turns
/goal AD3 is done: the Expo dev build launches on a device with five working tabs, the typed API client serves docs/mocks in mock mode, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
/goal the current task from /next-task meets its done-when in MASTER_SPEC Section 13, verified in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
```
