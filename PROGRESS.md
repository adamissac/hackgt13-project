# Progress log

Newest entries at the top. Template and rules: MASTER_SPEC.md Section 0.3.

## 2026-09-26 06:50 | alan | Claude Code (Opus 5)
**Task:** AL1 finish — GitHub OAuth wired on a second laptop; ML service running from Alan's Mac
**Status:** in progress (OAuth verified; `/health` still `db:false` until DATABASE_URL lands)
**What I did:**
- Stood the ML service up on Alan's Mac from scratch: `uv` + a fetched Python 3.12 (`ml/.venv`), `cloudflared` and Node 22.23.3 into `~/.local/bin` (no Homebrew, no sudo). `mobile/` deps installed, `npx tsc --noEmit` clean.
- GitHub OAuth app credentials into the root `.env`; tunnel run **standalone** so uvicorn can restart without changing the public URL. Verified callback URL / client_id / `read:user` scope / state signing / Fernet token round-trip all pass against the live config.
- Fixed a landmine in `.env.example`: python-dotenv returns a trailing `# comment` as the VALUE when a key is left empty. `SUPABASE_JWT_SECRET=` (blank = "use JWKS") arrived as comment text, so the service would have tried HS256 with garbage and rejected every login; `CORS_ORIGINS` and `MATCH_MODEL` broke the same way. Comments now sit on their own line. Same 23 keys, none added or renamed.
- LightGBM on macOS without Homebrew fails on `@rpath/libomp.dylib`; symlinked the copy scikit-learn already ships. `ml` suite now 68 passed, 105 skipped (skips are the DB tests).
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests` (note: `.venv` is uv's 3.12, not `python3 -m venv` — the Mac's system python is 3.14 and numba has no wheels for it). Service: `ml/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`, tunnel separately: `cloudflared tunnel --url http://localhost:8000`. `curl -s localhost:8000/health`.
**Next step for whoever continues:** Put `DATABASE_URL` (Supabase session pooler, 5432), `SUPABASE_SERVICE_KEY`, and `ANTHROPIC_API_KEY` in the root `.env`, restart uvicorn only, confirm `/health` shows `"db":true`, then test Profile -> Manage sources -> Connect GitHub on a phone. Without the DB the callback finishes consent and *then* fails writing `linked_accounts`, which looks like an OAuth error but is not.
**Known issues / blockers:** The trycloudflare hostname dies with its process, and the GitHub Redirect URI is pinned to it — `docs/deploy.md` (Railway) is the stable option for demo day. An older server on `offset-suffered-prospect-issues.trycloudflare.com` is still live on an unidentified machine; its Redirect URI is still registered and should be deleted once that host is confirmed dead, since trycloudflare names get recycled. `mobile/.env` still needs the Expo Supabase keys before a phone can sign in.
**Contract changes:** none (`.env.example` reformatted only — no variable added, removed, or renamed)

## 2026-09-26 02:37 | adam | Cursor (Grok 4.7)
**Task:** AD11 Feed screen and post composer, plus the assistant screen
**Status:** done in mock mode
**What I did:**
- `mobile/app/(tabs)/feed.tsx`: ranked feed, update/post composer, AI summary cards, editable reply draft from `POST /feed/{item_id}/reply-suggestion`.
- `mobile/app/assistant.tsx`: Profile → Ask. Sends the full thread to `POST /assistant/chat` with event id 1. The model stays on the ML server.
- `mobile/lib/api.ts`: `feed`, `createPost`, `replySuggestion`, `assistantChat`. Demo mode uses `docs/mocks/feed.json`, `feed_reply_suggestion.json`, and `assistant_chat.json`.
**How to run/test it:** `cd mobile && EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web` → Explore the demo → Feed (share an update, Suggest a reply) and Profile → Ask.
**Next step for whoever continues:** Put `ANTHROPIC_API_KEY` in the gitignored root `.env` (never in `mobile/` or `dashboard/`) and run `./scripts/start-ml.sh`, then set `EXPO_PUBLIC_USE_MOCKS=0` and `EXPO_PUBLIC_ML_API_URL` so `api.assistantChat` in `mobile/lib/api.ts` and `api.replySuggestion` hit the live endpoints.
**Known issues / blockers:** Demo replies are the canned mocks. There is no comments endpoint, so a reply draft stays in the text field for the user to edit. Live Claude returns 503 until `ANTHROPIC_API_KEY` is set on the ML server.
**Contract changes:** none

## 2026-09-26 14:00 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR3 synthetic attendees, modeled on HackGT 12 (MLH) winners
**Status:** done in code + tested on a local Postgres; NOT yet run against the live Supabase (needs DATABASE_URL)
**What I did:**
- `ml/ml/hackathon_winners.py`: all 27 HackGT 12 winning projects (name, tagline, Built-with tech, prize, hand-tagged topics/career) from the Devpost gallery. No team members' names.
- `ml/ml/hackathon_population.py`: ~80 fictional attendees: 2-3 per winning project (interests = that project's tech + topics + career), 25% cross-disciplinary, 5-person RL/quant demo crowd (always kept), 11 sponsor-style recruiters. Fictional names, initials avatars.
- `ml/scripts/seed_hackathon_attendees.py`: seeds through Alan's pipeline (auth user via admin API when SUPABASE_SERVICE_KEY is set, profiles is_synthetic, profile_store.store_extraction, attendance + registrations for HackGT 13, ~half open_to_meet). Idempotent; `--dry-run`, `--delete`. Tests: `ml/tests/test_hackathon_seed.py` (a real user checking in gets 10 ranked matches with RL on top).
- App sample data (docs/mocks/graph_*.json) regenerated from this population, so mock mode shows the same crowd.
- REQUESTS.md: marked AR1, AR3, AR4/5, AR6, AR8 asks done.
**How to run/test it:** `cd ml && .venv/bin/python scripts/seed_hackathon_attendees.py --dry-run`; live: `DATABASE_URL=<session pooler> SUPABASE_URL=https://mwfzgkikbmnghueolfnw.supabase.co SUPABASE_SERVICE_KEY=... .venv/bin/python scripts/seed_hackathon_attendees.py`.
**Next step for whoever continues:** Get DATABASE_URL + SUPABASE_SERVICE_KEY from Adam/Alan (put in ml/.env, never commit) and run the live seed command above; then check `GET /events/1/matches` returns people.
**Known issues / blockers:** Live DB credentials not on Arjun's Mac. Old `ml/scripts/seed_synthetic.py` (PostgREST version) is superseded by this one.
**Contract changes:** none

## 2026-09-26 | adam | Codex
**Task:** AD9 / AR5 Graph phone readability (user-requested cross-owner graph presentation update)
**Status:** done
**What I did:**
- Replaced the moving twelve-electron renderer with six stable, labeled, 48px nodes around a central nucleus, faint orbital curves, and curved self-to-person edges. Removed the continuous animation loop and dragging so tapping and vertical scrolling are predictable.
- Preserved topic grouping/filtering and the remaining-people list. Moved the legend into a disclosure; line thickness represents match strength, while position is explicitly decorative.
- Node and list taps open a safe-area-aware, scrollable modal profile sheet; full-profile navigation closes the modal first. Stacked interest evidence for narrow screens.
**How to run/test it:** `cd mobile && node --experimental-strip-types --test features/graph/atomLayout.test.mjs && npx tsc --noEmit`; `npx eslint 'app/(tabs)/graph.tsx' features/graph/Atom.tsx features/graph/atomLayout.ts features/graph/PersonSheet.tsx`; `EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform web --platform ios`. Layout tests cover graph widths 286–440px and zero/sparse/excess populations.
**Next step for whoever continues:** Open Graph from the mock preview (`EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web --port 8084`) and test node selection, topic filters, and the profile sheet on a physical phone.
**Known issues / blockers:** Physical-phone verification still required. No new native dependency or backend changes.
**Contract changes:** none

## 2026-09-26 13:00 | arjun | Claude Code (Claude Opus 5.5)
**Task:** Graph = "atom" data viz (Arjun's direction)
**Status:** done in code (mock data); motion to confirm on a phone
**What I did:**
- `mobile/features/graph/Atom.tsx`: you = nucleus, 12 best matches = electrons on tilted orbits (one plane per interest group), color = shared interest (3 color-blind-safe hues + gray "other"), opacity = strength (solid = strong, see-through = weaker), stronger = inner/faster orbit. All motion on the UI thread (Reanimated useFrameCallback + useAnimatedProps on SVG); drag writes shared values (no React re-render) -> smooth. Tap pauses spin + opens the profile sheet.
- `mobile/features/graph/PersonSheet.tsx`: tap -> headline, shared interests with evidence, looking for / can offer; for connections: how/when met, minutes, last talked about (GET /connections/{id}, added `api.connection`).
**How to run/test it:** `scripts/start-app.sh` -> Expo Go -> Explore the demo -> Graph.
**Next step for whoever continues:** Real data once the ML server is live (EXPO_PUBLIC_USE_MOCKS=0).
**Known issues / blockers:** Expo web preview doesn't animate in a hidden tab (expected); verify spin on a device.
**Contract changes:** none

## 2026-09-26 | adam | Codex
**Task:** AD3 Expo app shell — shared local-preview synchronization instructions
**Status:** done
**What I did:**
- Added mandatory 60-second GitHub freshness checks for agents actively supervising local previews, with clean-main fast-forward updates and dirty/diverged checkout safeguards.
- Documented server/checkout identification, dependency updates, reload/restart/rebuild requirements, and URL/commit verification in AGENTS.md; linked the policy from CLAUDE.md and README.md.
**How to run/test it:** `git diff --check`; read `AGENTS.md` → “Keep local previews current”. Teammates receive the policy with `git pull --rebase origin main` after safely committing their work.
**Next step for whoever continues:** Follow the AGENTS.md local-preview policy in the checkout serving your app; record the URL and `git rev-parse --short HEAD` at handoff.
**Known issues / blockers:** Documentation only; no persistent updater installed. Agents must remain active or configure a supported monitor to keep checking after startup.
**Contract changes:** none

## 2026-09-26 02:28 | adam | Cursor (Grok 4.7)
**Task:** AD8 Post-conversation checklist, connect prompt, connections list
**Status:** in progress (mock path verified in Expo web; live yes/no still needs two signed-in phones)
**What I did:**
- Home shows pending conversations from `GET /conversations/pending`. `mobile/app/checklist/[id].tsx` and `mobile/features/checklist/ChecklistForm.tsx` are the shared checklist: topics, optional extra, silent yes/no. A no says nothing was sent. A mutual yes opens chat and can load `POST /connections/{id}/followup-draft` into the composer.
- `mobile/app/connections.tsx` lists only your connections: how you met, topics, minutes. No one else’s count. Profile links here. Verify uses the same checklist form.
- Fixed the chat screen `set-state-in-effect` lint. Mock feedback `chat_id` is 7 so the demo opens the existing Maya thread.
**How to run/test it:** `cd mobile && node --experimental-strip-types --test features/checklist/met.test.mjs features/chat/model.test.mjs && npx tsc --noEmit`. Web: `EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web`, Explore the demo, Finish checklist, Yes connect, Draft a follow-up, Chat with Maya. Profile → Your connections.
**Next step for whoever continues:** On two signed-in phones, scan QR (`mobile/app/verify.tsx`), both finish the checklist, and confirm one “no” leaves no trace on the other phone. Then send the follow-up from `mobile/app/chat/[id].tsx`.
**Known issues / blockers:** Live Supabase chat Realtime (AD7) and this checklist are still untested on phones.
**Contract changes:** none (mock `connections.json` now includes `how_met` and `headline`, already in api.md 11)
## 2026-09-26 02:11 | adam | Cursor (Grok 4.7)
**Task:** AD7 Chat screen (Supabase Realtime), icebreaker as a suggested first message
**Status:** in progress (mock path verified in Expo web; live Realtime still needs two signed-in phones)
**What I did:**
- `mobile/app/chat/[id].tsx` and `mobile/app/chats.tsx`: a chat opens after mutual yes. Messages go through Supabase (`messages` insert + Realtime `postgres_changes` filter `chat_id=eq.{id}`). The list only keeps chats the viewer is in (`visibleChats` in `mobile/features/chat/model.ts`).
- Icebreaker: `GET /matches/{id}/starters` first opener can be sent, edited, or dismissed. Sending it unchanged sets `is_ai_draft`.
- Home: “Chat with {name}” after a match, a “Your chats” link, and a Check in button that calls `POST /events/1/checkin` (Akshar’s open request). Profile links to chats. Mock “yes” now returns `docs/mocks/suggestion_respond.json` (`chat_id` 7) so the demo can open the thread.
**How to run/test it:** `cd mobile && node --experimental-strip-types --test features/chat/model.test.mjs && npx tsc --noEmit`. Web: `EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web`, Skip sign-in, Check in, Yes let’s meet, Chat with Maya, Send the opener. Live: sign in, mutual yes, the other phone should see the insert without a refresh.
**Next step for whoever continues:** On two signed-in phones, both say yes, open `mobile/app/chat/[id].tsx`, send from one, and confirm the other updates via `subscribeToMessages`. If Realtime is silent, confirm `messages` is in the `supabase_realtime` publication (migration `20260926000008`).
**Known issues / blockers:** AD2/AD3 still need a physical phone (magic link + dev build). Live chat was not exercised against Supabase from this session.
**Contract changes:** none

## 2026-09-26 | adam | Codex
**Task:** AD3 / AD5 / AD6 mobile UI and UX polish (user-requested)
**Status:** done
**What I did:**
- Replaced the purple-heavy shared palette with warm neutrals and forest green, restrained avatars and badges, lighter typography, and consistent cards and controls in light/dark themes.
- Home previews three matches with plain-language shared interests and an expandable full list; detailed match statistics are under “Why you matched.” Added a direct conversation verification entry point.
- Profile defaults to an interest overview, with evidence and confirm/hide controls behind Review; grouped navigation and expandable account settings reduce scrolling. Nearby puts Event Mode and development tools in disclosures (cross-owner presentation change only; BLE logic unchanged).
- Restyled sign-in with clearer hierarchy and a scrollable keyboard-friendly layout; kept proximity disclosure visible. Fixed existing tab icon, not-found copy, and web hydration lint issues. Rebased onto concurrent chat/check-in and globe changes, preserving chat navigation in Home and the Profile menu.
**How to run/test it:** `cd mobile && npm ci --legacy-peer-deps && npx tsc --noEmit && npm run lint`; `EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform web --platform ios`; preview: `EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web --port 8084`. Browser checked sign-in, Home, expand matches, Profile, and Review using mocks.
**Next step for whoever continues:** Open the port 8084 preview and choose “Explore the demo”; check the revised screens on a physical phone with live credentials before the demo.
**Known issues / blockers:** No physical-device or live backend verification performed. Feed remains its existing placeholder. Lint passed before rebase; the concurrent chat implementation adds one existing `react-hooks/set-state-in-effect` lint error at `mobile/app/chat/[id].tsx:38` (outside the redesign). Another local checkout at `/Users/adamissac/hackgt-project/mobile` runs port 8081; this redesign is in `/Users/adamissac/Documents/ChatGPT/HACKGT13/mobile`.
**Contract changes:** none

## 2026-09-26 12:10 | arjun | Claude Code (Claude Opus 5.5)
**Task:** Nearby map + Graph clarity (Arjun's request; Nearby tab is Akshar's, BLE logic untouched)
**Status:** done (graph verified in Expo web; iOS bundle builds; map needs a phone to see)
**What I did:**
- Nearby tab (`mobile/app/(tabs)/nearby.tsx`, `mobile/features/nearby/`): real map via react-native-maps (in Expo Go: Google Maps on Android, Apple Maps on iOS; Google on iOS needs a key + dev build). You = blue dot, 3 circles = Bluetooth distance bands (3/8/16 m, rough), match pins inside their band at a stable angle (direction is not real and the screen says so), band-grouped list, person card -> /match/[id]. Your coordinates never leave the phone. Web preview falls back to Akshar's Radar. Akshar's Event Mode card, QR link and dev links kept.
- Graph tab: now one purpose, "Your next conversations": 6 fully labeled people around you (name, match %, #1 shared topic), line thickness = match strength, topic chips re-pick the 6, list of the rest. Old ring view removed.
- docs/mocks/event_matches.json: +5 mock matches with proximity so Nearby isn't empty in mock mode.
**How to run/test it:** `scripts/start-app.sh` -> scan with Expo Go -> "Skip sign-in (mock mode)" -> Nearby (turn scanning on) and Graph.
**Next step for whoever continues:** Akshar: check the Nearby map with real BLE bands on a dev build. Replace mock data with the live ML server when it's up.
**Known issues / blockers:** none new.
**Contract changes:** none (mock additions only)

## 2026-09-26 05:31 UTC | adam | Cursor cloud agent
**Task:** AD1 Supabase project
**Status:** done
**What I did:** Live check via `npx supabase db query --linked` on Adam's Mac: 36/36 public tables have RLS; missing_rls NULL; HackGT 13 seed event present; all 9 migrations applied (…00001–…00009 including push_tokens). Local `./supabase/tests/run-local.sh` also ALL AD1 CHECKS PASSED. No Supabase MCP on the cloud VM; this CLI query is the live evidence.
**How to run/test it:** `./scripts/check-ad1-live.sh` or the npx query in AGENTS.md.
**Next step for whoever continues:** AD2/AD3 leftover on a phone: magic-link sign-in after auth redirects (already on live); Expo via `./scripts/start-app.sh`; Railway deploy per docs/deploy.md if not done.
**Known issues / blockers:** Cloud VM still has no Supabase MCP. Goal asked for MCP; CLI --linked is the available live proof.
**Contract changes:** none

## 2026-09-26 05:30 UTC | adam | Cursor cloud agent
**Task:** AD1 Supabase project
**Status:** in progress
**What I did:**
- Added `./scripts/check-ad1-live.sh`: finds repo root, runs the linked one-line AD1 SQL (tables/RLS/seed/migrations), prints three-line expected output so Adam does not paste stale `db push` or `start-ml.sh` logs.
- Documented the script on the AGENTS.md supabase run-and-test line.
**How to run/test it:** From repo root on a linked Mac: `./scripts/check-ad1-live.sh`
**Next step for whoever continues:** Adam runs `./scripts/check-ad1-live.sh` from ~/hackgt-project and pastes output.
**Known issues / blockers:** Live query still requires Adam's machine (`npx supabase login` + link); this VM has no linked Supabase credentials.
**Contract changes:** none

## 2026-09-26 05:30 UTC | adam | Cursor cloud agent
**Task:** AD1 Supabase project
**Status:** in progress
**What I did:**
- Local replay on this VM (`sudo service postgresql start && ./supabase/tests/run-local.sh`) ends with `ALL AD1 CHECKS PASSED` — all nine migrations replay cleanly into throwaway Postgres with pgvector and `rls_checks.sql` passes.
- Nine migration files on disk under `supabase/migrations/` (`20260926000001` through `20260926000009_push_tokens.sql`).
- Adam ran `npx supabase db push --linked` on his Mac, applying `20260926000009_push_tokens.sql` to the live project `mwfzgkikbmnghueolfnw` (recorded in team PROGRESS; not re-run here — no `SUPABASE_*` on this VM).
- AL1 FastAPI `GET /health` from this VM against Adam's cloudflared tunnel URL returned `{"ok":true,"db":true}`, so the live database is reachable from the ML service.
- The live table-count / RLS / HackGT 13 seed verification query has **not** been pasted into PROGRESS or the agent transcript yet (no read-only Supabase MCP here).
**How to run/test it:** On Adam's Mac from repo root, run and paste the full output back into chat / PROGRESS:

`npx supabase db query --linked "select (select count(*) from pg_tables where schemaname='public') as tables, (select count(*) from pg_tables where schemaname='public' and rowsecurity) as tables_with_rls, (select string_agg(tablename, ', ') from pg_tables where schemaname='public' and not rowsecurity) as missing_rls, (select name from events where name='HackGT 13') as seed_event, (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations) as migrations"`

Local check (no secrets): `sudo service postgresql start && ./supabase/tests/run-local.sh` → last line `ALL AD1 CHECKS PASSED`.
**Next step for whoever continues:** Adam runs the `npx supabase db query --linked "select …"` one-liner above and pastes the row. Expected: `tables` = `tables_with_rls` = **36**, `missing_rls` empty/null, `seed_event` = `HackGT 13`, `migrations` lists all **9** versions ending with `20260926000009`. Then add a PROGRESS entry with that output and set AD1 **done**.
**Known issues / blockers:** This cloud VM has no Supabase MCP and no `SUPABASE_*` env — cannot run linked queries or invent live results.
**Contract changes:** none

## 2026-09-26 13:30 | akshar | Claude Code (Opus 5.5)

**Task:** Tap to verify ("hold your phones together"), extends AK3 verification

**Status:** in progress (server tested on Postgres; phone side needs two dev-build phones)

**What I did:**
- Why: NameDrop and iPhone NFC phone-to-phone aren't available to apps, and UWB is iPhone-only. A Bluetooth "hold together" gives the same tap moment on iPhone + Android using the AK2 tokens/engine. QR stays the fallback.
- `ml/app/routers/tap.py` (mounted), api.md **38**: `POST /tap/claim {token, rssi}`. Needs rssi >= -50 dBm, the token live now (1-min grace across rotation), not self, not blocked. Verified only when BOTH phones claim each other within 15 s → `conversations` row method `ble` (no schema change; Alan's 10-min dedupe gives both the same id) + `connect_prompt` notifications. `ml/tests/test_tap.py` 6 tests (incl. one-sided claims never verify, window expiry).
- `mobile/features/ble/tap.ts` `TapDetector` (strongest heard phone at >= -50 dBm for 2 s; `tap.test.mjs` 4 tests). `app/verify.tsx` gets a **Tap phones** tab (default when Bluetooth is available): progress meter, claims every engine tick, vibrates, then the same checklist + silent connect prompt as QR. Mock mode has a "Simulate a tap" button.

**How to run/test it:** `cd ml && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test .venv/bin/python -m pytest tests/test_tap.py -q`. `cd mobile && node --experimental-strip-types --test features/ble/tap.test.mjs`. Phones: both on Nearby → "Just talked with someone?" → Tap phones → touch backs → both land on the checklist.

**Next step for whoever continues:** On real phones, log the RSSI when touching vs. 30 cm vs. across a table (the Tap meter / `/ble-debug`). If touching reads weaker than -50 on some model, lower `TAP_RSSI_DBM` in BOTH `mobile/features/ble/tap.ts` and `ml/app/routers/tap.py`.

**Known issues / blockers:** Pending claims are held in process memory (fine with one uvicorn process; with several workers use a table). iPhone ↔ iPhone needs both apps open (iOS foreground-only scanning), which the tap flow already assumes.

**Contract changes:** `docs/api.md` section 38 (new endpoint), mock `tap_claim.json`. No schema change.

## 2026-09-26 12:30 | akshar | Claude Code (Opus 5.5)

**Task:** AK8 Event Mode

**Status:** in progress (code done and bundles for iOS + Android; Kotlin not compiled here: no Android SDK on this Mac)

**What I did:**
- `mobile/modules/event-mode/` (local Expo module, Android only, autolinked): `EventModeService` is a foreground service with `foregroundServiceType="connectedDevice"`, the `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_CONNECTED_DEVICE` + `POST_NOTIFICATIONS` permissions, a low-importance persistent "Event Mode is on" notification (tap opens the app) and `START_NOT_STICKY`. It catches the Android 14 SecurityException / background-start refusal and reports `lastError()` instead of crashing. JS binding via `requireOptionalNativeModule` (null on iOS / Expo Go).
- `features/ble/eventMode.ts`: enable = Bluetooth permissions + engine → `expo-keep-awake` → (Android 13+ notification permission) → foreground service; disable reverses it. Remembers the choice and offers "Resume" (never auto-starts).
- The engine is now reference-counted by owner (`nearby`, `event-mode`, `app`), so leaving the Nearby tab no longer kills Event Mode's scan.
- `features/ble/EventModeCard.tsx` at the top of the Nearby tab: switch + honest status (screen stays on; Android: scanning when locked, or "keep the app open" if the service failed; iOS: "keep the app open") + phones heard.
- Checked with `expo prebuild --platform android`: the merged app manifest has all BLE, camera, location, FGS and notification permissions (generated folder deleted afterwards).

**How to run/test it:** `cd mobile && npx tsc --noEmit && npx expo export --platform android`. On an Android phone (dev build, rebuilt): Nearby → Event Mode ON → the notification appears → lock the phone for 2 minutes → the other phone's Nearby should keep seeing it, and `sightings` rows keep arriving. iPhone: Event Mode ON → the screen doesn't dim.

**Next step for whoever continues:** First Android dev build: `npx expo run:android --device` (needs Android Studio / JDK 17) or `npx eas-cli build --profile development --platform android`. If Gradle fails in `modules/event-mode`, the code is in `android/src/main/java/expo/modules/eventmode/`. Then run the locked-phone test above and log it in the test matrix.

**Known issues / blockers:** Kotlin never compiled locally. iOS can't scan in the background (platform limit, spec 7.2), so the pitch line is "at least one phone foregrounded". Cross-folder: Adam's `app/(tabs)/nearby.tsx` (card added).

**Contract changes:** none

## 2026-09-26 11:30 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR4/AR5/AR7 moved native into the app (Arjun's call: no WebView), clarity pass
**Status:** done (mock data verified in Expo web; iOS bundle builds)
**What I did:**
- Graph tab (`mobile/app/(tabs)/graph.tsx`, `mobile/features/graph/{model.ts,RingGraph.tsx}`): native react-native-svg. You in the center, up to 20 people on 3 labeled rings (inner = best match), green ring = top match only, topic chips (your strongest interests first) that highlight + draw lines to people who share them, "Find more people into X" (/graph/expand), tap a person -> card with a plain "You both have X, Y and Z in common." + link to /match/[id], full list under the chart. My network mode = same view of your connections.
- `mobile/app/network.tsx` (Profile -> Your network, /me/dashboard) and `mobile/app/insights.tsx` (Profile -> Feed insights, /feed/insights): big number + one sentence, then simple bars.
- api client: `api.graph`, `api.graphExpand`, `api.meDashboard`, `api.feedInsights` (+ mocks from docs/mocks). Removed react-native-webview and the WebView screens.
- The web dashboard (Vercel) stays for the organizer big-screen map `/map`; its /graph, /me, /insights pages are no longer used by the app.
**How to run/test it:** `cd mobile && npm install && npx expo start` (Expo Go) -> Graph tab, Profile -> Your network / Feed insights. Quick look without a phone: `cd mobile && EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web`, "Skip sign-in (mock mode)". Checks: `npx tsc --noEmit`, `npx expo export --platform ios`.
**Next step for whoever continues:** Point the app at the live ML server (EXPO_PUBLIC_USE_MOCKS=0, EXPO_PUBLIC_API_BASE_URL) and seed synthetic attendees so the graph shows real people.
**Known issues / blockers:** Supabase keys still needed for seeding (see older entries).
**Contract changes:** none

## 2026-09-26 11:30 | akshar | Claude Code (Opus 5.5)

**Task:** AK7 Meetup location sharing

**Status:** in progress (server live + tested on Postgres; app screens done; needs two phones to try for real)

**What I did:**
- `ml/app/routers/location.py` (mounted in ROUTERS), api.md **37**: `POST/GET/DELETE /location-shares/{suggestion_id}`, `GET /location-shares`. Allowed only for a `matched` suggestion, the two participants, both Open to Meet, no verified conversation since the match, within 2 h of the match. One shared 30-minute window per meetup that updates never extend. Any refusal is the same `410 sharing ended` and deletes both rows. Stop ends it for both. Alan's existing cleanup (QR/BLE verify, Open to Meet off, retention) is exercised in `ml/tests/test_location.py` (10 tests).
- App: `app/meetup/[id].tsx` "Find them". Explicit "Share my location" consent, `expo-location` foreground watch every 10 s → POST, the other's point via Supabase Realtime on `location_shares` + a 10 s poll, a compass arrow (`watchHeadingAsync`) and a **rough band only** ("About a minute away", "Very close. Look around!"), never meters or a map. Countdown, Stop sharing, and "Found them? Verify with QR". Ends cleanly on 410.
- `features/location/geo.ts` (haversine, bearing, arrow angle, bands; `geo.test.mjs` 4 tests). `features/location/MeetupBanner.tsx` on Home lists live meetups ("Find Maya"); a "Find <name>" button was added to Adam's matched suggestion card. `expo-location` plugin: when-in-use only, no background.

**How to run/test it:** `cd ml && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test .venv/bin/python -m pytest tests/test_location.py -q` (10 passed). `cd mobile && node --experimental-strip-types --test features/location/geo.test.mjs && npx tsc --noEmit && npx expo lint`. Mock mode: Home shows "You're meeting Maya R." → Find Maya → Share my location.

**Next step for whoever continues:** Rebuild the dev build (new native module `expo-location`). On two phones signed in as two users who both said yes to a suggestion: Home → Find → Share on both → walk apart/together and check the arrow and band change, then QR-verify and confirm both screens show "Location sharing ended".

**Known issues / blockers:** Untested on devices. Realtime depends on `location_shares` being in the `supabase_realtime` publication (migration 8 adds it) and on the app's Supabase session; the 10 s poll covers it otherwise. Indoor GPS is ±10-20 m, which is why the bands are coarse. Cross-folder: Adam's `app/(tabs)/index.tsx` (MeetupBanner + Find button), `lib/api.ts` (4 calls).

**Contract changes:** `docs/api.md` section 37 (new endpoints), mocks `location_share.json`, `location_meetups.json`. No schema change.

## 2026-09-26 10:30 | akshar | Claude Code (Opus 5.5)

**Task:** AK2 / AK3 / AK4 / AK6 live on Alan's service + team merge

**Status:** in progress (server side live and tested on Postgres; everything Bluetooth still untested on phones)

**What I did:**
- Merged 57 + 8 team commits (AL1-AL11, AR1-AR8, Adam's redesign). Invites contract is now api.md **36** (15 and 35 were taken). Removed `ml/tests/__init__.py`, which broke Alan's `from conftest import`.
- `ble` and `invites` added to `ROUTERS` in `ml/app/main.py`, with `PgBleStore` and `PgInviteStore` on Alan's pool and `app/deps.py:get_user_id` on `auth.current_user`. Invite accept is one locked transaction: connection (`how_met='invite'`, `invite_id`), invite accepted, `social.ensure_chat` + `connected` notifications for both, then `population.invalidate()`. Fixed a UUID-vs-str bug the DB tests caught.
- `ml/tests/test_ak_db.py`: invites + BLE through the real app with JWTs on Postgres, including the exact `sightings join ephemeral_ids` AL8 uses.
- AK3 `mobile/app/verify.tsx` now uses `GET /qr/verify-token` + `POST /qr/verify`, then shows the checklist (toggle topics, "something else"), a silent "Do you want to connect?" → `POST /conversations/{id}/feedback`, and the same "we'll let you know" screen for waiting. New client calls `verifyToken`, `qrVerify`, `conversationFeedback`.
- AK6 `ml/scripts/ak6_to_sessions.py` now writes Alan's CSV format to `ml/datasets/ble_labeled/`; the test runs the output through `app.encounters.load_labeled`.

**How to run/test it:**
- Throwaway DB: `docker run -d --name fc_test_pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=fc_test -p 5433:5432 pgvector/pgvector:pg16`
- `cd ml && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test .venv/bin/python -m pytest -q tests` → 146 passed; 2 LightGBM failures on Macs without `libomp` (`brew install libomp`), not code.
- `cd mobile && npx tsc --noEmit && npx expo lint` (my files clean; the remaining lint errors are in `(tabs)/_layout.tsx`, `+not-found.tsx`, `useClientOnlyValue.web.ts`).
- Note: ml needs Python 3.10+. On Akshar's Mac: `~/.local/bin/uv venv -p 3.12 .venv && ~/.local/bin/uv pip install -p .venv/bin/python -r requirements.txt`.

**Next step for whoever continues:** Get a dev build on two phones (Xcode `npx expo run:ios --device` or `npx eas-cli build --profile development`). Expo Go can't do Bluetooth. With the ML tunnel URL in `mobile/.env` (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_USE_MOCKS=0`): Nearby toggle on both phones → check `sightings` rows appear → QR verify between them → both see the checklist. Then AK6 recordings → `python scripts/ak6_to_sessions.py ak6_*.json` → `python scripts/train_encounter.py`.

**Known issues / blockers:** No hardware test yet. `sightings` drops `event_id`/`device_model`/`foreground` (no columns; asked Alan in REQUESTS). No `stationary` signal. The QR checklist lives inside `verify.tsx` until Adam's AD8 screen exists. The invite https redirect page on the dashboard doesn't exist yet (links are `formalconnect://invite/...`).

**Contract changes:** api.md invites renumbered to 36 (content unchanged). New client calls only; no schema change.

## 2026-09-26 07:00 | akshar | Claude Code (Opus 5.5)

**Task:** AK2 Tokens, advertising, scanning, uploads + AK5 Proximity radar

**Status:** in progress (code + tests done; needs real phones and AL1's app to go live)

**What I did:**
- Server `ml/app/routers/ble.py`: `POST /ble/tokens` (144 tokens, one per 10-min window for 24 h, idempotent, 8-char base32 = 5 bytes to fit the iOS local name) and `POST /ble/sightings` (max 2000, drops own/unknown/not-live tokens and stale or future timestamps; returns `{accepted, dropped}`), `purge_old_sightings()` for 24 h retention. `ml/tests/test_ble.py`: 10 tests. Shared `ml/app/deps.py:get_user_id` (invites now uses it too).
- App `mobile/features/ble/`: `native.ts` loads ble-plx/munim lazily, so **Expo Go no longer crashes**; BLE screens say "needs the dev build" instead. `tokens.ts` (batch + rotation; local random tokens in mock mode), `signal.ts` (5 s rolling median → 1D Kalman, bands -60/-75 dBm, per-model offsets hook; `signal.test.mjs` 5 tests), `uploader.ts` (1 reading/token/s, flush every 30 s, retries only unsent), `engine.ts` (advertise current token, re-advertise at each window boundary, one long scan, publish heard tokens every 1 s).
- `useProximity` (Adam's stub) is now real, with the same exported shape (+ optional `highlight`, `why`, `heardCount`): runs the engine and polls `GET /events/1/matches` every 15 s, turning `proximity` immediate/near/far into bands.
- `features/ble/Radar.tsx` on the Nearby tab (list header): 3 rings, dots at stable pseudo-random angles (not positions), green = highlight, tap or pill shows band + shared topics.

**How to run/test it:** `cd ml && .venv/bin/python -m pytest tests -q` (30 passed). `cd mobile && node --experimental-strip-types --test features/ble/signal.test.mjs && npx tsc --noEmit`. Mock mode: Nearby → toggle on → radar shows Maya (nearby, green) and Jordan (farther away).

**Next step for whoever continues:** Alan (AL1/AL3/AL8): mount `ble.router`, back `BleStore` with `ephemeral_ids`/`sightings`, schedule `purge_old_sightings`, and have `/events/{id}/matches` fill `proximity` from each viewer's recent sightings (smoothed RSSI > -60 immediate, -60..-75 near, else far). Akshar: dev build on 2 phones → Nearby toggle on both → check `/ble-debug`-style logs that tokens rotate every 10 min and sightings upload.

**Known issues / blockers:** Nothing tested on hardware. Expo Go can show the UI on mocks but can never do Bluetooth; a dev build is required. `sightings` has no `device_model`/`foreground`/`event_id` columns yet; the router passes them to the store, which can drop them until Adam adds columns. Quick-profile tap target is an inline card until Adam's AD6 screen exists. Cross-folder: `app/(tabs)/nearby.tsx` (radar as list header, removed the forever-loading branch), `lib/api.ts` (bleTokens, bleSightings).

**Contract changes:** `docs/api.md` section 12 rewritten additively: token format (8 lowercase base32), idempotent batch, optional `device_model`/`foreground` on sightings, sightings response `{accepted, dropped}`, drop rules. New mocks `ble_tokens.json`, `ble_sightings.json`.

## 2026-09-26 06:10 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR4 deploy + AD9 embed (Arjun)
**Status:** done (dashboard live; app wired)
**What I did:**
- Deployed `dashboard/` to Vercel production: https://formal-connection-dashboard.vercel.app (/graph, /me, /insights, /map), public, HTTPS. Vercel team `hackgt13`, project `formal-connection-dashboard`.
- `mobile/lib/env.ts` default `DEFAULT_DASHBOARD_URL` already points there, so the Graph tab and Profile -> Your network / Feed insights load it in Expo Go with no extra env.
**How to run/test it:** `cd mobile && npm install && npx expo start` -> Expo Go -> Graph tab. Redeploy dashboard: `cd dashboard && npx vercel@latest deploy --prod --yes`.
**Next step for whoever continues:** Pages show preview (mock) data until the app points at a live ML server (EXPO_PUBLIC_API_BASE_URL + EXPO_PUBLIC_USE_MOCKS=0); then they call /graph, /me/dashboard, /feed/insights with the user's token. Vercel auto-deploy on git push is NOT connected (needs the repo owner, Adam, to install the Vercel GitHub app): until then, redeploy manually after dashboard changes.
**Known issues / blockers:** Supabase keys + GitHub OAuth app still needed for real data (see older entries).
**Contract changes:** none

## 2026-09-26 05:50 | adam | Cursor cloud agent
**Task:** Infra: one-command Expo start
**Status:** done
**What I did:**
- Added `scripts/start-app.sh` so Expo can be started from any folder (Adam hit `ConfigError` running `npx expo start` from `~`).
- Script finds the repo (`git rev-parse --show-toplevel` from the script dir, or walks up), `cd`s to `mobile`, copies `mobile/.env.example` → `mobile/.env` if missing and tells him to fill it, warns if `EXPO_PUBLIC_USE_MOCKS=0` and `EXPO_PUBLIC_API_BASE_URL` is empty, `npm install`s only when `node_modules` is missing, then `npx expo start --go --lan --clear`.
- Documented the command on the AGENTS.md mobile run-and-test line.
**How to run/test it:** From any folder: `<this-repo>/scripts/start-app.sh`. Syntax check: `bash -n scripts/start-app.sh`.
**Next step for whoever continues:** Adam: on his Mac run the full path to this repo's `scripts/start-app.sh` (often `~/hackgt13-project/scripts/start-app.sh`). Open Expo Go and scan the QR. Do not run `npx expo start` from `$HOME`.
**Known issues / blockers:** Expo Go cannot do Bluetooth (needs a dev build). If `mobile/.env` is new, fill the Supabase publishable values or keep `EXPO_PUBLIC_USE_MOCKS=1`.
**Contract changes:** none

## 2026-09-26 05:45 | adam | Cursor cloud agent
**Task:** Infra: Railway deploy for ml + auto-update mobile/.env
**Status:** done
**What I did:**
- Added `ml/Dockerfile` (Python 3.12-slim, CPU torch, pre-bakes `BAAI/bge-small-en-v1.5`, uvicorn on `$PORT`), `ml/.dockerignore`, and `ml/railway.json` (Dockerfile builder, `/health` check, 300s timeout).
- Wrote `docs/deploy.md` (plain Railway click-by-click for Adam) and extended AGENTS.md ml run/deploy commands.
- `scripts/start-ml.sh` + `scripts/set-mobile-api-url.py` now set `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_USE_MOCKS=0` in `mobile/.env` when cloudflared prints a URL (macOS-safe Python rewrite).
**How to run/test it:** `python3 scripts/set-mobile-api-url.py https://example.trycloudflare.com /tmp/test.env` (temp file). Local ML: `./scripts/start-ml.sh`. Railway: follow `docs/deploy.md`. Docker smoke (laptop): `docker build -t fc-ml ml && docker run --rm -p 8000:8000 -e DATABASE_URL=postgresql://invalid fc-ml` then `curl localhost:8000/health` (not run here: Docker socket permission denied in cloud VM).
**Next step for whoever continues:** Adam completes Railway deploy per `docs/deploy.md`, posts the permanent URL in chat, and sets GitHub OAuth callback + `ML_API_URL`. Teammates set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env`.
**Known issues / blockers:** Cloud agent could not `docker build` (permission denied on `/var/run/docker.sock`). Trained pickles under `ml/data/` are not in the image; encounter classifier retrains at runtime, ranker uses V1 unless `MATCH_MODEL=lr` and a pickle is added later.

## 2026-09-26 05:40 | akshar | Claude Code (Opus 5.5)

**Task:** AK6 Labeled Bluetooth recordings

**Status:** in progress (tooling done; the 45-minute recording session itself needs the team + phones)

**What I did:**
- `mobile/app/record.tsx` (route `/record`, dev-only link on the Nearby tab): pick a label (talking face to face, standing in line, walking past, across the room, same table on laptops), optional distance note, Start/Stop. While recording the phone advertises and scans; every sighting (peer local name, ts, RSSI, app state) is kept, then "Share JSON with Alan" writes `ak6_<label>_<phone>_<time>.json` and opens the share sheet.
- `mobile/features/ble/recording.ts`: recording format v1 (label, conversation flag, device model, platform, OS version, start/end, sightings). New deps: `expo-device`, `expo-file-system`, `expo-sharing` → rebuild the dev build.
- `ml/scripts/ak6_to_sessions.py` (+ `ml/tests/test_ak6_to_sessions.py`): turns those files into `{t, rssi, label}` sessions for `ml/ml/encounter.py`. Placed in Alan's folder as a helper; Alan, move it if you want.

**How to run/test it:** `cd ml && .venv/bin/python -m pytest tests -q` (20 passed). Recording: dev build on both phones → Nearby → "Record session (AK6)" → same label on both → Start on both → Stop on both → Share. Then `python scripts/ak6_to_sessions.py ak6_*.json > data/ak6_sessions.json`.

**Next step for whoever continues:** Needs AK1 confirmed on real phones first (same dev build). Saturday morning: 5 to 10 recordings per label per pair, both phones recording each time, collect files in one shared folder, run the converter, hand `data/ak6_sessions.json` to Alan for AL8.

**Known issues / blockers:** Untested on hardware. Uses the AK1 per-launch local name as the peer ID (fine for recordings; AK2 swaps in rotating tokens). No keep-awake yet: keep the screen on while recording.

**Contract changes:** none

## 2026-09-26 05:30 | adam | Cursor cloud agent
**Task:** Team process: no team lead
**Status:** done
**What I did:**
- Adam is not a team lead. Removed lead/architect/referee/approver wording: AGENTS.md (new "There is no team lead" line, owners table role now "full-stack", conflict and contract-change rules), CLAUDE.md, `adam.md` + `prompts/adam.md`, the "Ask <owner> only for" lines in all alan/arjun/akshar briefs (root and `prompts/`), `/next-task` and `/contract-change` skills, REQUESTS.md header, and the role label in `.claude/hooks/session_context.py`.
- New rule for everyone: decide within your own area without asking Adam or anyone. A contract change affecting another owner: make the smallest additive change yourself, record it under Contract changes, and add a `- [ ] (from <you>)` item in that owner's REQUESTS.md section. Merge conflicts: whoever hits the conflict resolves it (keep both sides).
- Not changed: MASTER_SPEC.md Section 13 still says "Adam (lead full-stack, architect)" (spec content, left as is); lines about asking Adam for the team kit files (physical file handoff).
**How to run/test it:** `rg -n -i "architect|referee|ask adam" --glob '!MASTER_SPEC.md' --glob '!PROGRESS.md'` shows only the team-kit handoff lines.
**Next step for whoever continues:** Nothing for this task. If the team wants the spec aligned too, change "Adam (lead full-stack, architect)" to "Adam (full-stack)" in MASTER_SPEC.md Section 13.
**Known issues / blockers:** none
**Contract changes:** none

## 2026-09-26 05:30 | adam | Claude Code
**Task:** AD4-AD6 UI redesign + Alan's requests
**Status:** in progress
**What I did:**
- Merged PR #1 (Alan AL1-AL8). Root `.env` written on Adam's Mac (gitignored); only ANTHROPIC_API_KEY is empty. Project uses JWKS (ES256), so SUPABASE_JWT_SECRET stays empty. `scripts/start-ml.sh` runs uvicorn + cloudflared (installed at ~/.local/bin).
- Mobile: design system (constants/Colors.ts tokens, components/ui.tsx), redesigned Home (Open to Meet via PATCH /me/open-to-meet, AI suggestions with silent yes/no, match cards), new `app/match/[id].tsx` (quick-profile + AI starters + facet overlap), redesigned Profile (AI interests by facet, confirm/hide, delete account). tsc clean.
**How to run/test it:** `./scripts/start-ml.sh` (separate terminal), then put the printed URL in mobile/.env as EXPO_PUBLIC_API_BASE_URL with EXPO_PUBLIC_USE_MOCKS=0; `cd mobile && npx expo start --go --lan`.
**Next step for whoever continues:** Add ANTHROPIC_API_KEY to root .env, run `./scripts/start-ml.sh`, switch mobile/.env to the tunnel URL, sign in by email on the phone (needs `npx supabase config push` first). Then redesign Nearby/Feed/Graph/sign-in with components/ui.tsx, and add `profiles.expo_push_token` via /contract-change (REQUESTS.md).
**Known issues / blockers:** Supabase auth redirect URLs not pushed yet. Arjun and Akshar have no commits yet. Adam's DB password was shared in chat: rotate it after the hackathon.
**Contract changes:** none

## 2026-09-26 05:05 UTC | adam | Cursor cloud agent
**Task:** AD10 Push notifications (schema part: `push_tokens`)
**Status:** in progress
**What I did:**
- New migration `supabase/migrations/20260926000009_push_tokens.sql`: `push_tokens(user_id → profiles on delete cascade, token, platform ios|android, updated_at)`, PK (user_id, token), RLS on with owner-only select/insert/update/delete. A table, not a profiles column, because any signed-in user can read profile rows.
- Same table appended to `docs/schema.sql`.
- `supabase/tests/rls_checks.sql`: A can't see, insert for, update, or delete B's token; A can insert its own; B reads its own unchanged; deleting a profile cascades its tokens. A leaky select policy makes the run fail (checked, then reverted).
- Alan's DELETE /me (`ml/app/account.py` `delete_rows`) deletes the profile and relies on cascades, so it already covers `push_tokens`. REQUESTS.md: Alan's push-column ask marked done; new ask for Alan to build the Expo sender on this table.
**How to run/test it:** `./supabase/tests/run-local.sh` (local Postgres + pgvector, no secrets) ends with `ALL AD1 CHECKS PASSED`.
**Next step for whoever continues:** On Adam's Mac from repo root: `npx supabase db push --linked` to apply migration 9 to the live project, then `npx supabase gen types typescript --linked > mobile/lib/database.types.ts`. Then in `mobile/`, after sign-in, get the Expo push token and upsert `{user_id, token, platform}` into `push_tokens`.
**Known issues / blockers:** Not applied to live yet (this VM has no Supabase keys or MCP). Expo push sender in `ml/` is Alan's (REQUESTS.md).
**Contract changes:** `docs/schema.sql` + `supabase/migrations/20260926000009_push_tokens.sql`: new owner-only table `push_tokens`. Additive. Affects Alan (reads it to send pushes) and Adam's mobile (writes it).

## 2026-09-26 05:00 | akshar | Claude Code (Opus 5.5)

**Task:** AK3 Verification QR screens

**Status:** in progress (screens done on mocks; waiting on Alan's AL6 for live `/qr/token` + `/handshake`)

**What I did:**
- `mobile/app/verify.tsx` (route `/verify`, linked from the Nearby tab): "Show my code" renders `GET /qr/token` as a QR and refetches every 30 s; "Scan their code" uses `expo-camera` `CameraView` (`barcodeScannerSettings: { barcodeTypes: ['qr'] }`) → `POST /handshake` with `HACKGT_EVENT_ID`; friendly copy for `expired` / `invalid_signature` / `already_used` / `self_scan`; camera permission, loading and error states.
- `mobile/features/qr/code.ts`: QR string format `fcv1:<payload>.<signature>` (both base64url, straight from `/qr/token`); non-matching QR codes are ignored with a message.
- Added `expo-camera` (+ config plugin with camera permission text, mic disabled) to `mobile/app.json`. Native change → rebuild the dev build.

**How to run/test it:** `cd mobile && npx tsc --noEmit && npx expo export --platform ios` (clean). On two phones with the dev build: phone A Nearby → "Verify with QR" → Show my code; phone B → Scan their code. With mocks it always "verifies" as Maya R.

**Next step for whoever continues:** When AL6 lands, run the flow on two phones against the live API and confirm the error cases (wait 60 s → `expired`; scan the same code twice → `already_used`; scan your own → `self_scan`). Then Adam's AD8: in `Verified` in `mobile/app/verify.tsx`, replace the inline checklist preview with navigation into the AD8 checklist screen using `result.handshake_id`.

**Known issues / blockers:** Not tested on a device (no Xcode here). The spec text says `/qr/verify-token` + `/qr/verify`, but `docs/api.md` (the contract) has `/qr/token` + `/handshake`; I followed api.md. Cross-folder: one `Link` added to Adam's `app/(tabs)/nearby.tsx`.

**Contract changes:** none

## 2026-09-26 04:55 UTC | adam | Cursor cloud agent
**Task:** Team process: push straight to main
**Status:** done
**What I did:**
- AGENTS.md "Commit and push protocol": everyone pushes straight to `main` (`git pull --rebase origin main`, `git push origin HEAD:main`), no PRs, no waiting on Adam; cloud-agent branches land on `main` themselves; PROGRESS.md/REQUESTS.md/api.md conflicts keep both sides; side branch only as a last resort, with a note to the owner.
- CLAUDE.md: one line saying push directly to `main`, never open a PR or ask Adam to merge. Handoff skill (`.claude/skills/handoff/SKILL.md`) updated to the same sequence.
- Confirmed `adami/ad1-verify-fe21` (PR #3) is already in `main`; `./supabase/tests/run-local.sh` ends with ALL AD1 CHECKS PASSED.
**How to run/test it:** `sudo service postgresql start && ./supabase/tests/run-local.sh`
**Next step for whoever continues:** Nothing for this task. Everyone: from your next push on, use `git pull --rebase origin main && git push origin HEAD:main`.
**Known issues / blockers:** The force-push hint in `.claude/hooks/guard.py` (line 103-104) still says "push to a new branch" without "last resort"; the file couldn't be edited from here because its own scraping guard matches text inside it. Edit it by hand if you care.
**Contract changes:** none

## 2026-09-26 04:30 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL11 Chatbot
**Status:** done (tested with a scripted adversarial model; live replies need ANTHROPIC_API_KEY)
**What I did:**
- `ml/app/assistant.py`: Sonnet manual tool loop (max 6 turns, strict tool schemas, cached system prompt); the viewer id is bound in Python and no tool takes one. Tools reuse the REST scope rules: search_event_attendees (checked-in event only, Open to Meet only, candidate-pool exclusions, first name/role/shared topics), get_match_profile (matching.relationship), get_connections_activity (my connections' feed, 1-14 days), get_my_profile.
- `ml/app/routers/assistant.py`: POST /assistant/chat {messages[], event_id?} -> {reply}; 503 when Claude is unreachable. docs/api.md 35 + docs/mocks/assistant_chat.json.
- Tests (`ml/tests/test_assistant.py`): an adversarial fake model asking for a connection's connections, another event's attendees, and a stranger's profile gets only 'not available' results; no tool output contains connection lists or counts; Open-to-Meet-off and other-event people never surface.
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_assistant.py`
**Next step for whoever continues:** All Section 13 AL tasks now have code. Remaining for Alan: (1) with real keys, finish AL1 (tunnel URL) and AL2 (tune extraction on the four real profiles), and try the chatbot's adversarial prompts live; (2) when Adam adds a push-token column, add the Expo push sender in `ml/app/social.py::notify`; (3) when Akshar's AK2/AK6 land, retrain with `python scripts/train_encounter.py` and check the real same-table false-positive rate; (4) pitch prep (Sunday): IDF overlap, complementarity, ranker, encounter limitation, every number labeled simulated vs real.
**Known issues / blockers:** Chatbot quality untested against the live model (no key in the cloud container).
**Contract changes:** docs/api.md: new 35 POST /assistant/chat (renumbered from 33 on merge with Arjun's 33-34); docs/mocks/assistant_chat.json. No owner currently has the chat screen in Section 13; mention to Adam if there is time.

## 2026-09-26 04:30 | akshar | Claude Code (Opus 5.5)

**Task:** AK4 Invites

**Status:** in progress (backend logic + screens done; needs AL1's FastAPI app to go live)

**What I did:**
- `ml/app/routers/invites.py`: `POST /invites`, `GET /invites`, `DELETE /invites/{id}`, `GET /invites/resolve/{token}`, `POST /invites/{token}/respond`. Token `secrets.token_urlsafe(16)`, stored only as SHA-256, 7-day expiry, single use, revocable, 10 per sender per rolling 24h. Decline writes nothing (indistinguishable from ignore). Blocked pairs get `not_found`. Accept inserts `connections` with `how_met='invite'`, `invite_id`.
- Storage is behind an `InviteStore` protocol with `MemoryInviteStore` as the reference; `ml/tests/test_invites.py` (18 tests) covers create/resolve/accept/decline/revoke/expiry/limit/blocks/self-invite/privacy.
- Mobile: `app/invites.tsx` (create link + QR via `react-native-qrcode-svg`, share sheet, list + revoke), `app/invite/[token].tsx` (deep-link accept screen: "Have you talked with X, and do you want to connect?"), "Invite someone you know" link on the Profile tab. New native dep `react-native-svg` → dev build must be rebuilt.
- Cross-folder edits (additive only): Adam's `mobile/lib/api.ts` (invite types + 5 calls + mocks) and `mobile/app/(tabs)/profile.tsx` (one Link). Alan's `ml/requirements.txt` (fastapi, httpx, pytest).

**How to run/test it:**
- `cd ml && python3 -m venv .venv && .venv/bin/pip install fastapi httpx pytest && .venv/bin/python -m pytest tests/test_invites.py -q` → 18 passed.
- `cd mobile && npx tsc --noEmit && npx expo export --platform ios` (clean). With `EXPO_PUBLIC_USE_MOCKS=1`: Profile → "Invite someone you know"; deep link `npx uri-scheme open formalconnect://invite/abc --ios` (or open it on a device) shows the accept screen.

**Next step for whoever continues:** When Alan's AL1 app (`ml/app/main.py`) lands: write `SupabaseInviteStore` in `ml/app/routers/invites.py` implementing the `InviteStore` methods against tables `invites`, `profiles`, `blocks`, `connections` (service key), then in main.py `app.include_router(invites.router)` and override `invites.get_user_id` (JWT verify) and `invites.get_invite_store`. Then run the flow on two phones.

**Known issues / blockers:**
- Not live: no FastAPI app yet (AL1). Router raises NotImplementedError until the two dependencies are overridden.
- `INVITE_BASE_URL` defaults to `formalconnect://invite` (only opens in the app). The https redirect page on the dashboard (`/invite/[token]` → `formalconnect://invite/<token>`) isn't built; dashboard is Arjun's.
- Recipient's "how we know each other" note isn't stored (no column); if the token was opened while signed out, the user must reopen the link after signing in.
- `.claude/rules/mobile.md` lists "invites UI" under Adam; Akshar's brief assigns the AK4 app side to Akshar. Adam: shout if you'd rather own these two screens.
- Still can't `git push` from Akshar's laptop (GitHub auth). Commits are local until Akshar logs in.

**Contract changes:** `docs/api.md` new section 15 (invites; section 13's `POST /invites/{invite_id}/respond` now points to 15 and is keyed by token, per MASTER_SPEC/AK4). New mocks `docs/mocks/invites_{create,list,resolve,respond}.json`. New env var `INVITE_BASE_URL` in `.env.example` (ML service only). No schema change: uses existing `invites` table and `connections.how_met/invite_id`.

## 2026-09-26 04:27 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL8 Bluetooth verification
**Status:** in progress (server side done and tested on simulated sightings; needs Akshar's AK2 real sightings and AK6 labeled recordings)
**What I did:**
- `ml/app/encounters.py` + worker every 30 s: resolve tokens via ephemeral_ids (validity window), one stream per direction (each phone's own scans, like training data), sessions split at gaps > 60 s, verified when p >= 0.7 AND >= 180 s above -65 dBm (smoothed) -> `conversations.create_conversation(method='ble', minutes, p_conversation)` + connect prompts + an `encounters` row with features. Overlapping sessions extend instead of re-prompting. Unverified sessions store nothing (MASTER_SPEC 7.7).
- Classifier: HistGradientBoosting on synthetic sessions + `ml/datasets/ble_labeled/*.csv` weighted 3x; only features the pipeline can observe (stationary/same_zone dropped until sightings has a stationary column / event zones exist). `ml/scripts/train_encounter.py` writes data/encounter_gbm.pkl + encounter_report.json.
- Report (SIMULATED SESSIONS, 8 observable features): AUC 0.94; 'same table, not talking' false-positive rate 36% at threshold 0.7. That is the Bluetooth limitation to state in the pitch; QR stays the fallback.
- 85 tests pass (`ml/tests/test_encounters.py`: verified once, no duplicate prompt on the next tick, walking past / across the room store nothing, unknown/expired tokens ignored, 3-minute rule, labeled CSV loader + report).
**How to run/test it:** `cd ml && . .venv/bin/activate && python scripts/train_encounter.py` and `TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_encounters.py` (~45 s, trains the model).
**Next step for whoever continues:** AL11 chatbot: `ml/app/routers/assistant.py` POST /assistant/chat {messages[], event_id?} -> {reply}, Sonnet with 4 tools (search_event_attendees, get_match_profile, get_connections_activity, get_my_profile) each enforcing scope in Python via matching.relationship / rank_for_viewer / feed.visible_items; test adversarial asks (someone's connection count, list everyone, who declined me).
**Known issues / blockers:** Calibration risk: a very steady real signal (sd ~2 dB, no body-block dips) scores low because synthetic 'talking' sessions are noisier; AK6 recordings fix this (REQUESTS.md). When AK2 lands, check that sightings arrive per phone every ~1 s like the simulator; batching every 30 s is fine.
**Contract changes:** none

## 2026-09-26 04:20 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL9 Learned ranker
**Status:** done (speed-dating validation not done: optional, needs Arjun's prepared data)
**What I did:**
- `ml/app/ranker_job.py` + `ml/scripts/train_ranker.py`: trains V1 vs logistic regression vs LightGBM LambdaRank, split by user; `--source auto` uses real outcomes (verified conversations + checklist answers, is_synthetic profiles excluded, needs >= 60 rows / 8 viewers / both outcomes) and otherwise simulated outcomes. Report `ml/data/ranker_report.json` always carries `data: simulated outcomes | real outcomes` plus counts of real data available.
- Simulated run (200 people, SIMULATED OUTCOMES): AUC V1 0.73 / LR 0.82 / LambdaRank 0.81; NDCG@10 0.85 / 0.89 / 0.87; top LR coefficients idf_overlap 0.66, sim_personal 0.65, role_pair 0.64 (matches MASTER_SPEC 6.7). Note: this container used the hashed fallback embedder.
- Serving: `MATCH_MODEL=lr` makes /events/{id}/matches rank with data/ranker_lr.pkl (hot-reloaded), responses and impressions say `model: lr`; default stays V1.
- 80 tests pass (`ml/tests/test_ranker_job.py`).
**How to run/test it:** `cd ml && . .venv/bin/activate && python scripts/train_ranker.py --source synthetic --n 200` (about 25 s); with DATABASE_URL set, `--source auto`.
**Next step for whoever continues:** AL8 sessionizer + encounter classifier on `sightings` (Akshar's AK2 shape, api.md 12): `ml/app/encounters.py` with a @every(30) worker: resolve observed_token -> user via ephemeral_ids, sessionize per pair with gaps < 60 s (`ml.encounter.sessionize`), features (`ml.encounter.session_features`), p = GBM model (train from synth now; add AK6 labeled CSVs weighted 3x later), verify when p >= 0.7 AND >= 3 min above -65 dBm -> `conversations.create_conversation(method='ble', minutes, p_conversation)`. Then AL11 chatbot.
**Known issues / blockers:** Speed-dating validation (optional) waits on Arjun preparing the Kaggle data. Nightly retrain isn't scheduled; run the script (or add a cron) once real conversations exist.
**Contract changes:** none (.env.example: MATCH_MODEL name only; `model` in api.md 5 can now be `lr`)

## 2026-09-26 04:18 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL10 Feed
**Status:** done (summaries/replies use templates until ANTHROPIC_API_KEY is set)
**What I did:**
- `ml/app/feed.py`: visibility = my items + my connections' items allowed by their feed_prefs; embeddings filled on first read (AR8's poller can leave them null); score 0.6*cos + 0.3*exp(-h/48) + 0.1*talked-topic mention; bursts (>=3 items/24 h) collapse into one Haiku summary (cached); insights = trending topics (authors' interests mentioned in items), 7-day activity, counts by kind.
- `ml/app/routers/feed.py`: GET /feed (offset cursor), POST /feed/posts, POST /feed/{id}/reply-suggestion, GET /feed/insights. `ml/ml/generation.py`: feed_summary, reply_suggestion + templates.
- docs/api.md 29-32 and mocks feed.json, feed_insights.json, feed_reply_suggestion.json.
- 77 tests pass (`ml/tests/test_feed.py`: strangers and disallowed kinds never shown, relevance/recency/talked-topic ordering, burst summary, pagination, post + reply scope, insights exclude own items).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_feed.py`
**Next step for whoever continues:** AL9 learned ranker: add `ml/scripts/train_ranker.py` that (a) runs the synthetic loop from run_demo (make_population -> simulate_meetings -> ranker.build_dataset -> train_and_evaluate, split by user) and (b) when there are real verified conversations with feedback in Postgres, builds rows from conversations+feedback (y = both wants_connect, rel 2/1/0), writes `ml/data/ranker_report.json` with AUC/NDCG@10 for V1 vs logistic vs LambdaRank labeled 'simulated outcomes' or 'real outcomes', and saves ranker_lr.pkl.
**Known issues / blockers:** Feed pagination is offset-based over a ranked list rebuilt per request (fine at hackathon scale; items can shift between pages if new ones arrive).
**Contract changes:** docs/api.md: new 29-32 (feed). docs/mocks: feed.json, feed_insights.json, feed_reply_suggestion.json. Affects Adam (AD11) and Arjun (AR7 feed insights page, AR8 poller).

## 2026-09-26 04:15 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** Coordination: asks from Alan to Adam, Arjun, Akshar
**Status:** done
**What I did:**
- Added `REQUESTS.md` with one section per owner; my asks for Adam (6), Arjun (7), Akshar (6) and Alan's human to-dos (3) are in it.
- `.claude/hooks/session_context.py`: new `open_requests()`; the SessionStart brief now prints the owner's unchecked `- [ ]` items (additive; nothing else changed in the hook).
- AGENTS.md / CLAUDE.md: one line telling agents to check and use REQUESTS.md.
**How to run/test it:** `python3 .claude/hooks/session_context.py --brief` shows 'Open requests for <owner> in REQUESTS.md'.
**Next step for whoever continues:** AL10 feed: `ml/app/routers/feed.py` (GET /feed, POST /feed/posts, POST /feed/{item_id}/reply-suggestion, GET /feed/insights) per MASTER_SPEC 6.11.
**Known issues / blockers:** Teammates only see REQUESTS.md once the PR from `claude/quirky-euler-dnbsgt` is merged into main.
**Contract changes:** none (edited Adam's kit hook additively; noted here per rule 0.4)

## 2026-09-26 04:09 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** DELETE /me (unassigned in Section 13; Alan's per his brief)
**Status:** done (Storage/GoTrue admin calls unverified against the live project from this container)
**What I did:**
- `ml/app/account.py`: storage objects under resumes/<uid>/ (Storage REST list + remove), DB in one transaction (null invites.used_by and organizations.owner_id, delete others' sightings of the user's tokens, delete profile -> cascades), then the auth user (GoTrue admin DELETE); clears in-memory caches.
- `DELETE /me` in `ml/app/routers/me.py`; docs/api.md 28.
- Test scans EVERY uuid column of EVERY public table for the deleted id, so a future table that isn't covered fails the test. 71 tests pass.
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_delete_me.py`
**Next step for whoever continues:** AL10 feed: `ml/app/routers/feed.py` with GET /feed?cursor= (connections' feed_items + my own, filtered by each author's feed_prefs, ranked 0.6*cos(item embedding, my combined vector) + 0.3*exp(-hours/48) + 0.1*(mentions a topic we talked about); summaries when an author has >=3 items in 24h via Haiku; POST /feed/posts {kind: post|update, body} (embed on insert), POST /feed/{item_id}/reply-suggestion, GET /feed/insights. Before AL10 check PROGRESS.md for Adam/Akshar asks first.
**Known issues / blockers:** Once someone has a Supabase service key handy, run DELETE /me once on a throwaway account to confirm the Storage list/remove and GoTrue admin endpoints (URLs in the account.py docstring).
**Contract changes:** docs/api.md: new 28 DELETE /me. Affects Adam (the delete-account button).

## 2026-09-26 04:08 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** Organizer community map data (MASTER_SPEC 6.13; feeds Arjun's AR6)
**Status:** done
**What I did:**
- `ml/app/routers/dashboard.py`: api.md 14 shape via `ml/ml/viz.py::dashboard_json`; node ids are per-event HMAC hashes (no user ids, no names); clusters < 5 folded into -1; gaps = expected (sum of clipped V1 scores over each person's top-10) vs connections formed at this event; 10 s cache.
- `ml/app/population.py::recompute_clusters` now also stores the 2-D UMAP layout, so polling the dashboard never runs UMAP; newcomers sit at their cluster center until the 5-minute worker places them.
- Checked on 60 synthetic attendees with real UMAP + HDBSCAN: 6 clusters with sensible c-TF-IDF labels (e.g. 'stochastic calculus + statistics + time series analysis'), top gap between the climate and robotics clusters. First build ~19 s (numba JIT), the worker does it at startup.
- 69 tests pass (`ml/tests/test_dashboard.py`: no ids or names leak, min group size, live edge, gaps exclude -1).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_dashboard.py`; live: `curl localhost:8000/dashboard/1`.
**Next step for whoever continues:** Build `DELETE /me` (unassigned, Alan's per the brief) in `ml/app/routers/me.py`: delete the caller's rows in every table (profiles cascade covers most; also chats/messages/feedback/handshakes/impressions/notifications/suggestions/conversations/invites/web_mentions/location_shares), their Storage objects under resumes/<user_id>/ and the auth user via the Supabase admin API (SUPABASE_URL + SUPABASE_SERVICE_KEY). Then AL10 feed (`GET /feed`, `POST /feed/posts`, `GET /feed/insights`).
**Known issues / blockers:** Gaps use V1 scores as stand-in probabilities until AL9's logistic ranker is served (said in the module docstring and api.md).
**Contract changes:** docs/api.md 14: notes on anonymized ids, min group size, extra `event_id`/`people` fields, refresh cadence, DASHBOARD_REQUIRE_AUTH. .env.example: DASHBOARD_REQUIRE_AUTH, QUIET_HOURS (names only). Affects Arjun (AR6).

## 2026-09-26 04:05 UTC | alan | Claude Code (cloud session, branch `claude/quirky-euler-dnbsgt`)
**Task:** AL7 Graph data
**Status:** done (shape needs a quick look from Arjun for AR4; event mode is /dashboard/{event_id}, not built yet)
**What I did:**
- `ml/app/graph.py`: Builder emits only me->person and (me|person)->topic edges, so no person->person edge can exist; matches mode reuses `matching.rank_for_viewer` (allowed people only), depth 2 via shared topics, facet/min_score/max_people filters, 150-node cap; network mode = my connections with connected_at for the timeline.
- Expand: topic -> allowed holders ranked by score; person -> shared topics with their evidence lines (never their connections); strangers get an empty graph.
- `ml/app/routers/graph.py`: GET /graph and GET /graph/expand (must be checked in for matches mode).
- `docs/mocks/graph.json` generated from the real endpoint on seeded data; docs/api.md 26-27.
- 67 tests pass (`ml/tests/test_graph.py`: shape, only shared topics, no person->person edges even when my connections are connected to each other, filters, check-in rule, expand scope/ranking/evidence).
**How to run/test it:** `cd ml && . .venv/bin/activate && TEST_DATABASE_URL=postgresql://postgres@localhost:5433/fc_test python -m pytest -q tests/test_graph.py`
**Next step for whoever continues:** Build GET /dashboard/{event_id} for Arjun's AR6 in a new `ml/app/routers/dashboard.py` using `ml/ml/viz.py` (layout, clusters from population._clusters via recompute_clusters, ctfidf_labels, connection_gaps with predicted pairs = top-10 V1 matches per person, edges = connections formed at the event) with NO names and min cluster size 5 (organizer-only once orgs exist; open for the demo per api.md 14). Then AL8 (needs Akshar's AK2 sightings) or AL10 feed.
**Known issues / blockers:** Network-mode IDF is computed over me + my connections (small population); fine for display, not for ranking. Clusters are null until the 5-minute worker has run for an event with 10+ people.
**Contract changes:** docs/api.md: new 26 GET /graph and 27 GET /graph/expand (MASTER_SPEC 9 shape plus an additive `shared_count` on person nodes and `evidence` on expanded topic nodes). docs/mocks/graph.json. Affects Arjun (AR4/AR5) and Adam (AD9).

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

## 2026-09-26 01:45 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AD9 (done by Arjun, in Adam's `mobile/` folder with his blessing via Arjun): embed dashboard pages in the app
**Status:** in progress (app wired; waiting on the Vercel deploy URL)
**What I did:**
- `mobile/components/DashboardWebView.tsx`: react-native-webview (Expo Go compatible, 13.16.1) loading `${env.dashboardUrl}${path}`; posts `{type:"auth", token, api}` on load, on the page's `{type:"ready"}`, and on token refresh; handles `export_png` via Share.
- Graph tab (`mobile/app/(tabs)/graph.tsx`) now shows /graph. New route `mobile/app/web/[page].tsx` (network -> /me, insights -> /insights), linked from Profile ("Your network" card). Registered in `app/_layout.tsx` under the signed-in guard.
- `mobile/lib/env.ts`: `dashboardUrl` = EXPO_PUBLIC_DASHBOARD_URL or the Vercel default. Added to `mobile/.env.example`.
- Dashboard pages wait for the app's auth (2.5 s max) and use the app's ML API base (mock data when the app is in mock mode).
**How to run/test it:** `cd mobile && npm install && npx expo start` (Expo Go), open Graph tab / Profile -> Your network. Checks: `npx tsc --noEmit`, `npx expo export --platform ios`.
**Next step for whoever continues:** Deploy `dashboard/` to Vercel (`cd dashboard && npx vercel --prod`) and make sure `DEFAULT_DASHBOARD_URL` in `mobile/lib/env.ts` matches the production URL.
**Known issues / blockers:** Vercel login pending (Arjun). Until then the Graph tab shows the WebView error state unless EXPO_PUBLIC_DASHBOARD_URL points at a running dashboard.
**Contract changes:** none (postMessage protocol: app -> page `{type:"auth", token, api}`, page -> app `{type:"ready"}` / `{type:"export_png", dataUrl}`)

## 2026-09-26 01:30 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR4 Dashboard and Connection Graph (matches mode) on mocks
**Status:** in progress
**What I did:**
- `dashboard/`: Next.js 16 + TypeScript strict. `/graph` page: `components/ConnectionGraph.tsx` (react-force-graph-2d, loaded client-only via `components/GraphCanvas.tsx`), self pinned at center, node size by score, green ring = top match (dashed = Open to Meet), dashed suggested links, facet-colored topic nodes with shape per facet (validated colorblind-safe palette in `lib/theme.ts`), tap to focus + side panel (why you matched, their topics), ranked list doubles as table view. Matches / My network tabs, min-score slider, facet filter, search, Export PNG (posts `{type:"export_png", dataUrl}` to the RN WebView, downloads in a browser). Light + dark.
- `lib/auth.ts`: `useEmbeddedToken()` listens for `{type:"auth", token}` on window AND document, token kept in memory only. `lib/api.ts`: live `GET ${NEXT_PUBLIC_ML_API_URL}/graph?event_id=&mode=` with Bearer token when both exist, else `/mocks/graph_<mode>.json`. `lib/privacy.ts` drops any person-person edge client-side.
- Mocks: `docs/mocks/graph_matches.json`, `graph_network.json` generated by `ml/scripts/make_graph_mocks.py` (synthetic; PROVISIONAL shape, see below).
- Checked in the browser at 390x844 and 1440x900, dark and light: renders, tap-to-select works, no console errors. `npm run build` passes.
**How to run/test it:** `cd dashboard && npm install && npm run dev` -> http://localhost:3000/graph ; checks: `npm run typecheck && npm run lint && npm run build`
**Next step for whoever continues:** Deploy `dashboard/` to Vercel (root dir `dashboard`, env `NEXT_PUBLIC_ML_API_URL`) and send the HTTPS URL to Adam for AD9. Then, when MASTER_SPEC.md lands, compare Section 9's `/graph` example to `dashboard/lib/types.ts` + `docs/mocks/graph_*.json` and align (regenerate mocks with `cd ml && .venv/bin/python scripts/make_graph_mocks.py && cd ../dashboard && npm run sync-mocks`). Then AR5 expand (merge by id into the stable node cache in ConnectionGraph.tsx, `d3ReheatSimulation`).
**Known issues / blockers:** `/graph` response shape is my proposal, not from MASTER_SPEC (file missing) and not yet in docs/api.md: agree with Alan (AL7) before he builds it. Vercel account needed from Arjun. In a hidden browser tab the canvas doesn't paint until visible (rAF paused), which is expected. Not pushed yet: waiting on Arjun's `gh auth login`.
**Contract changes:** none yet; proposed `/graph` payload lives in `docs/mocks/graph_*.json` (to be added to docs/api.md after Alan agrees)

## 2026-09-26 01:20 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR8 GitHub activity poller + AR7 personal dashboard and feed insights
**Status:** done (code + tests); live data needs connected GitHub accounts and Supabase
**What I did:**
- AR8: `ml/app/github_activity.py`, worker `github_activity` every 10 min (registered via import in app/main.py). Public events (new repo, push, release) with ETags + `/user/repos` pushed_at catch-up for events-API lag, deduped by payload.key, bge-embedded, into feed_items(kind='github'). Tests: `ml/tests/test_github_activity.py`.
- AR7 API: `GET /me/dashboard` (`ml/app/routers/me_dashboard.py`, api.md 34): total, cumulative growth, how_met, top shared topics (+ talked). Private: only the caller's connections. DB tests: `ml/tests/test_me_dashboard.py`.
- AR7 pages: dashboard `/me` (hero count, growth line with crosshair, in-person vs invite donut, shared-topic bars) and `/insights` (activity sparkline, by-kind counts, trending topics; uses Alan's /feed/insights). Both take the WebView token via postMessage, mocks otherwise. Components: `dashboard/components/charts.tsx`.
- Ran the full ML suite against a real local Postgres+pgvector: 106 pass (only failure: Alan's LightGBM test needs `brew install libomp`).
**How to run/test it:** DB tests locally: `/opt/homebrew/bin/python3.12 -m venv /tmp/pgenv && /tmp/pgenv/bin/pip install pgserver`, start it (`pgserver.get_server(dir).psql("create database fc_test")`), then `cd ml && TEST_DATABASE_URL="postgresql://postgres@/fc_test?host=<dir>" .venv/bin/python -m pytest -q tests`. Dashboard: `cd dashboard && npm run dev` -> /me, /insights.
**Next step for whoever continues:** Adam: embed `/me` and `/insights` in the app (same postMessage auth as /graph). Then Arjun's remaining: AR9 datasets, AR10 web mentions (stretch). Blocked items unchanged: Supabase keys (seed_synthetic.py), GitHub OAuth app, Vercel deploy.
**Known issues / blockers:** same as below (credentials).
**Contract changes:** docs/api.md 34 `GET /me/dashboard` (new, additive).

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

## 2026-09-26 00:45 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR1-AR6 (rebased onto Alan's AL1-AL10 + Adam's latest)
**Status:** in progress (code done + tested locally; NOT PUSHED yet: Arjun's `gh auth login` pending)
**What I did:**
- AR1: `ml/app/routers/github.py` inside Alan's app (his `current_user`, `db`, `profile_store.ingest_text`): `GET /connect/github/start`, `GET /connect/github/callback` (signed state, Fernet token in linked_accounts, 302 to `formalconnect://connect/github`), `ingest_github(user_id)` (ETag-cached repo digest -> raw_documents -> shared extraction pipeline). Helpers: `ml/ml/github_oauth.py`, `ml/ml/github_ingest.py`. Tests: `ml/tests/test_github_connect.py`, `test_github_oauth.py`.
- AR2: `ml/ml/resume_text.py` (pdfplumber + scanned detection + `extract_interests_from_pdf` Claude document fallback; Alan's /profile/ingest currently 400s on scanned PDFs and could call it).
- AR3: `ml/scripts/seed_synthetic.py` (80 attendees via Supabase admin API, is_synthetic, registered + checked in, 35% Open to Meet, bge-small vectors, 6 RL demo boosters; `--dry-run`, `--delete`). Uses `ml/ml/supa.py` (PostgREST + service key).
- AR4/AR5: dashboard `/graph` renders Alan's /graph shape (api.md 26/27): controls, left panel + search, expand merge, My Network timeline, privacy guards. AR6: `/map` organizer community map for api.md 14.
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests` (all pass except Alan's test_ranker_job on Macs without `brew install libomp`); `cd dashboard && npm install && npm run typecheck && npm run lint && npm test && npm run build`; dev: `cd dashboard && npm run dev` -> /graph, /map.
**Next step for whoever continues:** (1) `git push` (needs Arjun's GitHub login). (2) Fill `.env` (SUPABASE_URL, SUPABASE_SERVICE_KEY) and run `cd ml && .venv/bin/python scripts/seed_synthetic.py --n 80`. (3) GitHub OAuth app (callback `<ML_API_URL>/connect/github/callback`) + GITHUB_CLIENT_ID/SECRET + TOKEN_ENCRYPTION_KEY, then test connect on a phone. (4) Vercel deploy of `dashboard/` with NEXT_PUBLIC_ML_API_URL, URL to Adam (AD9). (5) AR8 GitHub poller.
**Known issues / blockers:** no Supabase/GitHub OAuth/Vercel credentials on Arjun's Mac. Organizer map labels are small on phones (big-screen design).
**Contract changes:** docs/api.md 33 (GitHub connect). New env var APP_GITHUB_REDIRECT.

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

## 2026-09-26 00:20 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR1 GitHub connect and ingestion (offline core) + AR2 Resume text
**Status:** in progress
**What I did:**
- `ml/ml/github_ingest.py`: `fetch_repos(token=|username=, cache=)` lists public non-fork repos, fetches languages + README (1,200 chars, badges stripped), ETag cache so re-ingest is 304s. `digest_meta()` for `raw_documents.meta`. Feeds `llm.github_to_text()`.
- `ml/ml/github_oauth.py`: signed 10-min `state` bound to user_id (HMAC from TOKEN_ENCRYPTION_KEY), `authorize_url()` with scope `read:user` only, `exchange_code()`, Fernet `encrypt_token/decrypt_token`, `linked_account_row()`, `app_redirect()` deep link.
- `ml/ml/resume_text.py`: `download_resume(path)` from private `resumes` bucket (service key), `pdf_to_text()` via pdfplumber with scanned detection, `extract_interests_from_pdf()` fallback that sends the PDF to Claude as a document block.
- Repo-local setup done on Arjun's Mac (owner.local, .gitignore lines, core.hooksPath). Global `~/.claude/settings.json` step of `scripts/claude-setup.sh` NOT run (Arjun to run it himself).
**How to run/test it:** `cd ml && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest -q tests` ; live GitHub check: `.venv/bin/python -m ml.github_ingest octocat 3`
**Next step for whoever continues:** When Alan's FastAPI app exists, add routes `GET /connect/github/start` (JWT -> `{"url": github_oauth.authorize_url(user_id)}`) and `GET /connect/github/callback` (verify_state -> exchange_code -> GET /user for login -> upsert `linked_account_row` -> 302 `app_redirect("ok")`), and make `POST /profile/ingest {"source":"github"}` call `fetch_repos(token=decrypt_token(...))` -> `github_to_text` -> `raw_documents` -> `llm.extract_interests`. Record the two /connect routes in docs/api.md with Adam (AD4). Needs GITHUB_CLIENT_ID/SECRET from Arjun's GitHub OAuth app.
**Known issues / blockers:** MASTER_SPEC.md still missing from repo. No FastAPI app yet (Alan). No GitHub OAuth app yet (Arjun). Supabase storage download URL (`/storage/v1/object/resumes/<path>`) not yet tested against the real project. Not pushed yet: Arjun's `gh auth login` pending.
**Contract changes:** none (new env var `APP_GITHUB_REDIRECT` added to .env.example)

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

## 2026-09-25 23:42 | Akshar | Claude (Sonnet 5)

**Task:** AK1 Bluetooth hello world

**Status:** in progress (blocked on physical device testing)

**What I did:**
- (Rebased onto Adam's AD3 shell: my duplicate `src/app` router, assets and LICENSE were dropped; BLE deps and config plugins merged into his `package.json` / `app.json`.)
- Added `react-native-ble-plx` (central/scan role) and `munim-bluetooth` + `react-native-nitro-modules` (peripheral/advertise role, since ble-plx can't advertise — matches MASTER_SPEC 7.1's plan to try `munim-bluetooth` first).
- Wrote `mobile/features/ble/`: `constants.ts` (shared service UUID), `deviceId.ts` (per-launch random local-name suffix — a placeholder for AK2's real rotating server token), `scanner.ts` (ble-plx scan + Android permission handling for API 30 and 31+), `advertiser.ts` (munim-bluetooth advertise).
- Wrote `mobile/app/ble-debug.tsx` (route `/ble-debug`): a single "AK1: BLE Hello World" screen — Start/Stop button, live list of discovered peers with local name + RSSI, shows this device's own advertised local name.
- Added `react-native-ble-plx` + `munim-bluetooth` config plugins to `app.json`.
- Verified: `npx tsc --noEmit` clean, `npx expo-doctor` 21/21 checks pass, `npx expo export --platform ios` bundles with no errors. None of this proves the BLE hello-world actually works — it only proves the code compiles and bundles.
- Note: MASTER_SPEC.md was missing from the repo at the time (see Adam's entry above) — I worked from the copy of it Akshar had downloaded locally (`prompt gt.pdf`). Worth confirming it matches whatever lands at the repo root.

**How to run/test it:**
- `cd mobile && npm install` (already run, `node_modules` is gitignored).
- This needs a **dev build**, not Expo Go (`react-native-ble-plx` and `munim-bluetooth` are native modules). From a Mac with full Xcode installed: `npx expo run:ios --device`. For Android: `npx expo run:android` with USB debugging on, or build one via EAS (`npx eas-cli build --profile development --platform ios|android`) if you'd rather not install Xcode locally.
- Once running on two physical phones: tap Start on both, and each should show the other's local name (`fc-XXXX`) and a live RSSI reading within a few seconds.

**Next step for whoever continues:**
1. **This machine has no full Xcode.app, only Command Line Tools** — I could not build or test on a real device from here. Akshar (or whoever has a Mac with Xcode, or an EAS account) needs to: install Xcode from the App Store, run `npx expo run:ios --device` (free Apple ID is enough for 7-day provisioning), and separately `npx expo run:android` on an Android phone with USB debugging.
2. With two real phones running the dev build, tap Start on both and confirm they see each other. Log device models, foreground/background state, and what RSSI/local-name each saw into this file's test matrix (Section "Test matrix" in the Akshar brief / MASTER_SPEC Section 13 test matrix).
3. Specifically check the iOS local-name truncation risk called out in the brief: does `fc-XXXX` (7 chars) survive fully next to our 128-bit service UUID? If truncated, we have headroom to shorten further.
4. Once AK1 is confirmed working end to end on real hardware, move to AK3 (Verification QR screens, blocked on Alan's AL6) or AK4 (Invites backend + screens, not blocked) per the owner order in MASTER_SPEC Section 13.

**Known issues / blockers:**
- No physical phones or Xcode available in this environment — everything above is untested on real Bluetooth hardware.
- `munim-bluetooth`'s peripheral advertising is unverified in practice; if it fails on either platform within the spec's 30-minute budget, MASTER_SPEC 7.1 says fall back to a hand-written local Expo module around `CBPeripheralManager` (iOS) / `BluetoothLeAdvertiser` (Android).
- `npm install` in `mobile/` currently needs `--legacy-peer-deps` — an unrelated peer-dependency conflict between `expo-router`'s bundled `@expo/ui` (which pulls in `vaul`/`radix-ui` for web) and the React version this Expo SDK ships. Not caused by anything BLE-related.

**Contract changes:** none (`docs/schema.sql` and `docs/api.md` untouched).
