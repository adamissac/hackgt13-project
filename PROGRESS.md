# PROGRESS

## 2026-09-26 04:03 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL6 Verification and connecting
**Status:** done (follow-up drafts use a template until ANTHROPIC_API_KEY is set)
**What I did:**
- `ml/app/qr.py`: HMAC-SHA256 signed payload `user|nonce|exp` (60 s) with QR_SIGNING_KEY; constant-time compare. Nonce single use via the unique `handshakes.nonce` column (no schema change needed).
- `ml/app/conversations.py`: create_conversation (dedupes mutual scans within 10 min, links a matched suggestion, ends live location sharing, `connect_prompt` notifications) — AL8 will call it with method='ble'; checklist by min(w_a,w_b)*idf; silent submit_feedback (yes -> waiting until mutual; only a no-sayer gets no_connection); mutual yes -> connections(how_met='in_person', conversation_id) + chat + `connected` notifications.
- `ml/app/routers/verification.py`: GET /qr/verify-token, POST /qr/verify, GET /conversations/pending, GET /conversations/{id}/checklist, POST /conversations/{id}/feedback, plus aliases GET /qr/token, POST /handshake, POST /feedback (conversation_id or handshake_id) so the mobile client typed from the old api.md keeps working.
- `ml/app/routers/connections.py`: GET /connections (mine only), GET /connections/{user_id}, POST /connections/{user_id}/followup-draft (Haiku via `ml/ml/generation.py::followup_draft`, template fallback).
- 61 tests pass (`ml/tests/test_verification.py`: tamper, expiry, nonce reuse, self-scan, one conversation for mutual scans, checklist order, participants only, silent no in both orders, mutual connect, privacy of connection lists, follow-up grounding, legacy aliases).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests`
**Next step for whoever continues:** Start AL7: `ml/app/routers/graph.py` with GET /graph?mode=matches|network&event_id=&depth=&max_people=&min_score=&facet= in the exact MASTER_SPEC 9 JSON (nodes self/person/topic, edges match/connection/has_topic), people only from `matching.rank_for_viewer` (matches mode) or my connections (network mode), NEVER an edge between two of my connections; GET /graph/expand?node_id=; put a sample at docs/mocks/graph.json for Arjun (AR4).
**Known issues / blockers:** Mobile (Adam AD8, Akshar AK3) should move to the spec names (/qr/verify-token, /qr/verify, /conversations/*); the old names keep working as aliases. QR_SIGNING_KEY must be set on the server (500 'QR signing is not configured' otherwise). Feedback does not yet nudge interest weights from the checklist (README idea; not in the Section 13 done-when).
**Contract changes:** docs/api.md: notes on 8-11 (aliases, silent-no rule, extra fields headline/how_met on 11) and new 19-25 (qr verify-token/verify, conversations pending/checklist/feedback, connections/{id}, followup-draft) from MASTER_SPEC 9. docs/mocks: qr_verify, conversations_pending, conversation_feedback, followup_draft. Affects Adam (AD8) and Akshar (AK3).

## 2026-09-26 03:59 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL5 Suggestions
**Status:** done
**What I did:**
- `ml/app/suggestions.py`: generator (worker every 30 s) over rooms = checked-in attendees of active events + same-building presence; only open_to_meet users; excludes blocks, connections, any prior 'no', pairs suggested in 7 days; pair must clear BOTH people's 80th percentile (computed over every pair in the room); max 3/day/person, 1 new per tick; optional QUIET_HOURS; 30-min expiry; notifications kind 'suggestion'.
- `ml/app/routers/suggestions.py`: GET /suggestions (only mine, pending on my side), POST /suggestions/{id}/respond: `{status: waiting}` for every outcome except mutual yes -> `{status: matched, chat_id}` + `chats` row (user_a<user_b, origin suggestion) + notifications to both; 404 for non-participants.
- `ml/app/routers/me.py`: PATCH /me/open-to-meet (OFF also deletes live location_shares for the user's suggestions). `ml/app/social.py`: ensure_chat + notify helpers (reused by AL6).
- Privacy fix: the matches candidate pool now drops only people the VIEWER declined; someone else's 'no' never hides them (it would have leaked the no).
- 50 tests pass (`ml/tests/test_suggestions.py`: generation, repeat ban, toggle/block, daily cap, percentile rule, silent no with identical responses, mutual yes, outsider/expired, building context, quiet hours).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_suggestions.py`
**Next step for whoever continues:** Start AL6: `ml/app/routers/verification.py` with GET /qr/verify-token (HMAC-SHA256 over user|nonce|expiry(60s) with QR_SIGNING_KEY) and POST /qr/verify (check signature, expiry, self-scan, nonce single-use by inserting into `handshakes` (nonce unique)); on success create a `conversations` row (method qr, user_a<user_b, event_id) + `connect_prompt` notifications. Then GET /conversations/pending, GET /conversations/{id}/checklist (shared topics by min(w_a,w_b)*idf), POST /conversations/{id}/feedback (silent: waiting|connected|no_connection), connections row how_met='in_person' + chat, POST /connections/{user_id}/followup-draft (Haiku).
**Known issues / blockers:** Push delivery for notifications is AD10 (Adam) — rows are written, nothing sends them yet. Adam's Home toggle writes profiles.open_to_meet directly through Supabase; that works with the generator too, but only PATCH /me/open-to-meet also ends location sharing when turned off.
**Contract changes:** docs/api.md: added 16 PATCH /me/open-to-meet, 17 GET /suggestions, 18 POST /suggestions/{id}/respond (from MASTER_SPEC 9). docs/mocks: me_open_to_meet.json, suggestions.json, suggestion_respond.json. Affects Adam (AD6 Yes/No UI, AD7 chat) and Akshar (AK7 location sharing keys off suggestions.id).

## 2026-09-26 03:55 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL4 Quick profile and starters
**Status:** done (starters use the template fallback until ANTHROPIC_API_KEY is set)
**What I did:**
- `ml/app/matching.py::relationship()`: the single access rule (connection, current event match, or open suggestion; never self, blocked, declined). Reuse it for graph/chatbot scope.
- `ml/app/routers/matches.py`: GET /matches/{id}/quick-profile (name, photo, role, headline, seeking/offering, SHARED topics only with strength=min weight and the other's evidence, facet_overlap cosines, complementarity) and GET /matches/{id}/starters ({why, openers[2]}, cached per viewer/other/input). Same 403 message for every denial.
- `ml/ml/generation.py`: Sonnet starters via messages.parse + pydantic, one retry, prompt holds only first names, shared interests with evidence, and seeking/offering; deterministic grounded template fallback.
- `ml/app/population.py::pair_model()`: event IDF when both attend, global `interests.idf` otherwise.
- 39 tests pass (`ml/tests/test_quick_profile.py`: stranger/unknown/malformed/self/blocked -> 403, connection without event OK, no non-shared interests leak, prompt grounding, caching, fallback).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests`. Mocks for the app: `docs/mocks/get-matches-id-quick-profile.json`, `get-matches-id-starters.json`, `get-events-id-matches.json`.
**Next step for whoever continues:** Start AL5: create `ml/app/routers/suggestions.py` with PATCH /me/open-to-meet (sets profiles.open_to_meet), GET /suggestions, POST /suggestions/{id}/respond ({response: yes|no} -> always {status: waiting} until both yes, then {status: matched, chat_id}; create chats row user_a<user_b origin 'suggestion' + notifications rows), and a `@every(30)` generator in `ml/app/tasks.py` for checked-in Open to Meet users (Section 7.5 limits: 80th percentile, max 3/day, 7-day repeat ban, exclusions via matching.excluded_ids).
**Known issues / blockers:** Starters return the template until ANTHROPIC_API_KEY is set on the server. Adam (AD6) can build the matches list and quick profile against docs/mocks now; the live endpoints are on branch `claude/quirky-euler-dnbsgt` until it is merged into main.
**Contract changes:** docs/api.md: added section 15 GET /matches/{id}/quick-profile (new endpoint from MASTER_SPEC 9) and an access note on 7 (starters). New docs/mocks/match_quick_profile.json (listed in docs/mocks/README.md). Affects Adam (AD6) and Akshar (AK5 radar tap).

## 2026-09-26 03:51 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL3 Vectors and matches
**Status:** in progress (endpoint + tests done; needs Section 8 columns on the real Supabase DB and AR3 synthetic attendees to demo)
**What I did:**
- `ml/app/population.py`: loads attendees' non-hidden interests + facet summaries from Postgres into the `ml/ml/profiles.py` format, per-event IDF, facet/combined/seek/offer vectors via `build_vectors`; cached per event, invalidated on check-in and profile edits (`population.invalidate()`).
- `ml/app/matching.py`: candidate pool (attendees minus self, blocks both ways, connections, declined suggestions, 'no' feedback), `rank_for_viewer` via `ml.scoring.rank_candidates` (V1 + 10% bridge exploration + per-viewer 80th-percentile highlight), impression logging (1-based rank).
- `ml/app/routers/events.py`: POST /events/{id}/checkin and GET /events/{id}/matches?limit= in the docs/api.md shape (403 unless the viewer is checked in; `proximity` null until BLE).
- `ml/app/tasks.py` workers: HDBSCAN clusters per active event (5 min), global IDF into `interests.idf` + all `profile_vectors` rows (5 min), retention (hourly: sightings > 24h, expired presence, expired location_shares). `ml/ml/embed.py` now caches embeddings per text.
- 32 tests pass, incl. score symmetry, rare-beats-common IDF, per-viewer highlight, pool exclusions, hidden interests ignored, impressions, complementarity/role_pair.
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests`. Seed people for manual testing with `seed_person()` in `ml/tests/conftest.py` (stores interests through the real pipeline without the LLM).
**Next step for whoever continues:** Start AL4: add `ml/app/routers/matches.py` with GET /matches/{user_id}/quick-profile (403 unless the other user is a current candidate from `matching.rank_for_viewer` at an event both are checked in to, or a connection; return name, photo, role, headline, shared topics with strengths from `ml.scoring.shared_interests`, facet overlap numbers = the sim_* features) and GET /matches/{user_id}/starters (`ml.llm.conversation_starters`, cached per pair). Add both to docs/api.md via /contract-change (quick-profile is new).
**Known issues / blockers:** Section 8 is now in docs/schema.sql and on Supabase (Adam, AD1 done), so tests build from docs/schema.sql alone (the temporary `ml/tests/sql/section8.sql` copy is deleted). AR3 (Arjun) can seed synthetic attendees by calling `app.profile_store.store_extraction` per source, as `seed_person` in conftest does. Clusters (bridge feature) are empty until the worker has run once and the event has 10+ people.
**Contract changes:** none

## 2026-09-26 03:47 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL2 Extraction endpoints
**Status:** in progress (endpoints + tests done; real-profile tuning needs ANTHROPIC_API_KEY and the team's consent)
**What I did:**
- `ml/ml/extraction.py`: Claude call via `messages.parse` + pydantic `ExtractResult` (MASTER_SPEC 6.2 schema), Sonnet for resume/linkedin, Haiku otherwise, one retry then `ExtractionError`, sensitive-attribute post-filter, max 20, token-use logging, cache breakpoint on the static system prompt.
- `ml/app/profile_store.py`: raw_documents is the ledger (extraction saved in `meta.extraction` with canonical ids); `user_interests` is rebuilt from the newest extraction per source + review-screen adds, with 6.5 weights and the 1-exp(-sum) squash. Canonicalization in pgvector: exact name, cos>=0.88 merge, 0.80-0.88 Haiku tie-break, else new; merges are logged (`canon merge ...`).
- `ml/app/routers/profile.py`: POST /profile/ingest (resume multipart via pdfplumber; JSON manual/github/facebook; web -> 400 not available), GET /profile/status (owner only), GET/PATCH /profile/interests exactly as docs/api.md 1-4. `ml/app/jobs.py` in-memory job registry.
- Interface for Arjun (AR1/AR2): store the GitHub digest as a `raw_documents` row with source='github' then the app calls POST /profile/ingest {source: github}; or call `app.profile_store.ingest_text(user_id, source, text, meta)` directly.
- 22 tests pass (`ml/tests/test_profile.py`: storage shape, sensitive filter, no double counting, source combination, review edits survive re-extraction, retry-then-fail, job privacy, resume PDF upload).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests`. Live: with ANTHROPIC_API_KEY + DATABASE_URL set, `uvicorn app.main:app`, then `curl -X POST localhost:8000/profile/ingest -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"source":"manual","text":"..."}'` and poll /profile/status.
**Next step for whoever continues:** Start AL3 (Must): new `ml/app/vectors.py` that builds facet/combined/seeking/offering vectors from `user_interests` + facet summaries in `raw_documents.meta.extraction.summary` into `profile_vectors`, per-event IDF over `attendance`, then `ml/app/routers/matching.py` GET /events/{id}/matches using `ml/ml/scoring.py` (V1, shared topics, 80th-percentile highlight) + impressions logging. AL2 remainder when keys arrive: run all four teammates' real profiles through /profile/ingest and tune EXTRACT_SYSTEM / MERGE_THRESHOLD from the `canon merge` log lines.
**Known issues / blockers:** This cloud container cannot reach Hugging Face or the PyTorch index, so it runs the hashed fallback embedder; on a laptop `pip install sentence-transformers` gives real bge-small. The extraction system prompt is below the minimum cacheable prompt length, so the cache breakpoint is currently a no-op. Jobs are in memory (a restart forgets job ids, not data). `raw_documents.source` has no 'web' value yet, so web ingest returns 400 until AR10 adds it via /contract-change.
**Contract changes:** none

## 2026-09-26 03:43 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL1 FastAPI service
**Status:** in progress (code done and tested locally; phone-reachable URL still needs real Supabase env + tunnel)
**What I did:**
- Added `ml/app/`: `main.py` (app factory, lifespan, CORS, router list), `auth.py` (Supabase JWT: HS256 secret or JWKS ES256/RS256, aud=authenticated, exp, sub=user id), `db.py` (psycopg 3 pool + pgvector adapter; prepared statements off on port 6543), `errors.py` (every error is {"error": msg}), `workers.py` (@every(seconds) background loops), `routers/health.py` (`/health` public, `/whoami` authed echo).
- Added `ml/tests/` (11 passing): token valid/expired/wrong aud/wrong secret/bad sub, JWKS mode, error shape, DB ping. Test DB = `docs/schema.sql` + `ml/tests/sql/section8.sql` (MASTER_SPEC 8.1/8.2 verbatim) + an `auth` schema stub.
- New env var names in `.env.example`: SUPABASE_JWT_SECRET, DATABASE_URL, QR_SIGNING_KEY, CORS_ORIGINS. Run/test commands added to AGENTS.md and CLAUDE.md.
**How to run/test it:** `cd ml && . .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --port 8000` then `curl localhost:8000/health`. Tests: `TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests` (needs an empty Postgres 16 + pgvector; it gets wiped).
**Next step for whoever continues:** Start AL2: add `ml/app/routers/profile.py` with POST /profile/ingest (manual JSON + resume multipart), GET /profile/status, GET/PATCH /profile/interests, backed by `ml/ml/llm.extract_interests` (add pydantic validation + 1 retry) and a new `ml/app/profiles_store.py` that canonicalizes into `interests` via pgvector and writes `user_interests`. Register "profile" in ROUTERS in `ml/app/main.py`.
**Known issues / blockers:** Needs from Alan: DATABASE_URL, SUPABASE_URL, and (if the project is legacy HS256) SUPABASE_JWT_SECRET, plus ANTHROPIC_API_KEY for AL2. Then run `cloudflared tunnel --url http://localhost:8000` and share the URL. `/whoami` is a debug helper, not in docs/api.md. docs/schema.sql does not yet contain MASTER_SPEC Section 8 (AD1, Adam); tests use `ml/tests/sql/section8.sql` meanwhile.
**Contract changes:** none (only new env var names in .env.example)

## 2026-09-26 03:38 UTC | alan | Claude Code (cloud session)
**Task:** Kit unblock: add MASTER_SPEC.md (pre-AL1)
**Status:** done
**What I did:**
- Added `MASTER_SPEC.md` at the repo root, converted from the team's spec PDF (text extraction; some tables lost alignment, the PDF is the original).
- Agent work for Alan lives on branch `claude/quirky-euler-dnbsgt` (merge into main when ready).
**How to run/test it:** `less MASTER_SPEC.md` (Section 13 = build order, Section 6 = ML spec).
**Next step for whoever continues:** Start AL1: create `ml/app/main.py` (FastAPI + `/health`), `ml/app/auth.py` (Supabase JWT via PyJWT), `ml/app/db.py` (psycopg pool).
**Known issues / blockers:** Supabase project ref still unset in `.mcp.json` (Adam).
**Contract changes:** none
## 2026-09-26 02:45 | adam | Claude Code
**Task:** AD2 Auth
**Status:** in progress (code done; needs Supabase redirect config pushed, LinkedIn app, and a phone test)
**What I did:**
- `mobile/lib/auth.tsx`: LinkedIn OIDC via signInWithOAuth (linkedin_oidc, skipBrowserRedirect) + openAuthSessionAsync + exchangeCodeForSession; email magic link via signInWithOtp; AuthProvider; guest skip only in mock mode.
- `mobile/app/sign-in.tsx` (includes Section 3.5 proximity disclosure), `mobile/app/auth/callback.tsx`, Stack.Protected auth gate in `app/_layout.tsx`, sign out in Profile.
- `supabase/config.toml`: site_url and additional_redirect_urls = formalconnect://auth/callback, exp://**, http://localhost:8081/**; every other auth setting set to match the live project.
- Verified: tsc clean, iOS and web bundles build.
**How to run/test it:** `npx supabase config push` (answer y for auth, n for storage), then on a dev build: enter email, tap the link on the phone.
**Next step for whoever continues:** Push the auth redirect URLs to the live project: `npx supabase config push` (y for auth, n for storage). Then build the dev client (`npx eas-cli login`, then `cd mobile && npx eas-cli build --profile development --platform ios`) and test the magic link on a phone. Then LinkedIn app setup (prompts/adam.md AD2).
**Known issues / blockers:** Redirect URLs not yet on the live project (agent was not permitted to push shared auth config). LinkedIn developer app not created. No Xcode/EAS login on Adam's Mac.
**Contract changes:** none

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
