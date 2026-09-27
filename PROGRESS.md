

## 2026-09-27 | arjun | Claude Code
**Task:** AR6 / "inside an event" mode: auto Event Mode after scanning, app limited to attendees, Leave event (confirmed)
**Status:** done
**What I did:**
- New `mobile/lib/eventSession.ts` (persisted in AsyncStorage). `enterEventSession(id, name, endsAt)` sets the current event (Home, Nearby, Constellation, matches, assistant, verify all already follow `getCurrentEventId`, so they show only that event's registered + scanned attendees) and turns on Event Mode. Scanning the company QR is the consent, so there is no switch. `leaveEventSession()` turns Event Mode off, calls `POST /events/{id}/leave` (Alan's checkout), goes back to HackGT roaming (everyone), and clears the session.
- New `mobile/components/EventBar.tsx`, rendered on top of every tab by `app/(tabs)/_layout.tsx` (Adam's; noted) while in an event. Top-left "✕ Leave event" opens a confirm dialog (Alert on phones, `confirm` on web), then leaves. The right side shows the event name, "Event Mode on", and "only people at this event", or "Event ended" after `ends_at`. It keeps Event Mode running (resumes after restart). The tabs below get top inset 0 via `SafeAreaInsetsContext.Provider`.
- `app/join-event.tsx`: a successful QR or join code enters the session and returns to Home. `app/attend/[id].tsx`: the Event Mode switch is replaced by a status line in `features/ble/EventConnect.tsx` (on, starting, or the error with Retry); Leave uses the same confirmed flow; "Go to this event" re-enters if you're checked in but not in the session. Home's eyebrow shows the event name. The Events tab refetches company events when the session changes.
- Browser-tested in demo: Attending, Scan, simulated scan, Home with the bar; Leave, confirm, bar gone and everyone back; scan again, back in.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx expo lint && npm run test:demo`. Demo: Events, Demo test event, Attending, Scan company QR code, Simulate scanning, then Home with the Leave event bar.
**Next step for whoever continues:** On phones with the dev build (Bluetooth), confirm Event Mode starts automatically after scanning and stops after Leave event. Redeploy ml for the demo event, unregister, and leave.
**Known issues / blockers:** In Expo Go the bar says "Bluetooth unavailable" (expected). An event ending doesn't auto-leave; the bar says "Event ended" and Leave is one tap.
**Contract changes:** none

## 2026-09-27 03:27 | akshar | Claude Code (Opus 5.5)
**Task:** Simplify navigation: merge Nearby into Home (Akshar's request)
**Status:** done
**What I did:**
- Home and Nearby were two tabs for one job (finding people in the room), and Home already linked to Nearby twice. The Nearby content moved to `features/nearby/NearbySection.tsx` and sits on Home under Open to Meet: Scan button, then "Around you" map + everyone nearby once scanning (the map stays hidden until you scan, so Home stays short), then Up next, best matches, and "Verify with QR" + developer tools at the bottom.
- Bottom bar: Home, Feed, Constellation, Events, Profile (was 6 tabs). `/nearby` is a hidden route that redirects to Home, so join-event, chats, attend and notification links keep working.
- Removed Home's two "go to Nearby" buttons (same page now).
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint .`; app: Home -> Scan -> map + nearby matches appear.
**Next step for whoever continues:** Check on a phone with Bluetooth that scanning from Home shows people and the expanded map opens/closes.
**Known issues / blockers:** none known.
**Contract changes:** none

## 2026-09-27 | arjun | Claude Code
**Task:** AR6 / Events: instant Attending / Interested / Not attending with a tap animation; switch away from Attending
**Status:** done
**What I did:**
- Lag fix (`app/(tabs)/events.tsx`): picks are optimistic. The screen updates immediately, AsyncStorage and the server confirm in the background, and a failure rolls back with a message. The global `busy` that disabled every picker is gone. `RsvpPicker` is `memo` with a stable `onPick(id, status)` (ref updated in `useLayoutEffect`), so a tap re-renders only that picker.
- Animation (`features/events/Calendar.tsx`): each option presses to 0.93 and springs back on the UI thread (Reanimated `withTiming`/`withSpring`), gives a light haptic tick (`expo-haptics`, added via `npx expo install`, bundled in Expo Go), and the choice shows a small ✓ badge on its corner.
- Company events can switch: Interested / Not attending after Attending calls the new `POST /events/{id}/unregister` (drops registration and any check-in, so you leave the session); Attending re-registers. The scan button shows only while Attending.
- Server: `ml/app/routers/events.py` unregister + test in `ml/tests/test_event_checkin_qr.py`; docs/api.md 45 + `docs/mocks/post-events-unregister.json`; demo backend `unregisterEvent`.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx expo lint && npm run test:demo`; `cd ml && .venv/bin/python -m pytest -q tests/test_event_checkin_qr.py` (DB tests in CI). Restart Expo after pulling (new package).
**Next step for whoever continues:** Redeploy ml (unregister + demo event): `cd ml && npx @railway/cli up --detach --path-as-root .`
**Known issues / blockers:** Tap animation verified in the browser; haptics only on a phone.
**Contract changes:** docs/api.md 45 adds `POST /events/{event_id}/unregister` → `{ "ok": true }` (additive). Affects Adam (company events), noted in REQUESTS.md.

## 2026-09-27 10:05 | alan | Claude Code (Opus 5)
**Task:** Dark mode toggle for the dashboard — **edits in Arjun's folder**
**Status:** done — typecheck, lint, 11 tests, build all pass; verified in a browser in both themes
**What I did:**
- Found most of it already built: `globals.css` already had `:root` variables, a `prefers-color-scheme` block, and a `:root[data-theme="dark"]` override, and `lib/theme.ts` already bridged the CSS theme to the canvas palette with a `MutationObserver` on `data-theme`. **Nothing set `data-theme`** — the system had no switch. So this was wiring, not a refactor.
- **Three states, not two** (`system -> light -> dark -> system`). The existing CSS used `:root:not([data-theme="light"])` inside the media query, which only makes sense if an explicit light choice can beat a dark system — the original author clearly intended three. A two-way toggle would strand people off "follow system" permanently. "system" is stored as the *absence* of `data-theme`, so the CSS needed no fourth case.
- **No flash of the wrong theme:** an inline script in `<head>` (`THEME_INIT_SCRIPT`) applies the stored choice synchronously before first paint. Verified with the system set to dark and the stored choice light: on load `data-theme="light"` is already present and the body paints light. A bundled module would run too late.
- `useTheme()` uses `useSyncExternalStore`, not `useState` + `useEffect`. localStorage is external to React, and reading it in an effect trips `react-hooks/set-state-in-effect` (it did — that is how I caught it). Bonus: subscribing to the `storage` event gives cross-tab sync for free.
- **The only genuinely hardcoded colors were two shadows** (`rgba(0,0,0,.15)` and `rgba(0,0,0,.25)`), which read as mud on a dark background. Added `--shadow` to all three theme blocks and replaced them. Everything else was already variable-driven.
- Toggle lives in the root layout, fixed bottom-right: the four pages use four different header classes (`.topbar`, `.map-head`, `.page-head`, …) so there is no shared nav, and bottom-right avoids both the existing top-right controls and the status bar in the app's WebView.
**How to run/test it:** `cd dashboard && npm run typecheck && npm run lint && npm test && npm run build`. Visually: `npm --prefix dashboard run dev -- --port 3100`, click the sun/moon bottom-right; reload to confirm the choice survives.
**Next step for whoever continues:** The mobile app embeds these pages in a WebView and has its own theme. Worth deciding whether the in-WebView toggle should be hidden so it cannot disagree with the app's own appearance — one CSS rule if so.
**Known issues / blockers:** `dashboard/` is Arjun's folder (`app/globals.css`, `app/layout.tsx`, `lib/theme.ts`, new `components/ThemeToggle.tsx`) — Arjun, revert freely. `usePalette()`'s server snapshot returns dark unconditionally (pre-existing); harmless today because the graph is client-only, but it would mismatch if that ever server-renders.
**Contract changes:** none

## 2026-09-27 09:15 | alan | Claude Code (Opus 5)
**Task:** Render "why you matched" in the Connection Graph side panel — **edits in Arjun's folder**
**Status:** done — dashboard typecheck, lint, 11 tests and build all pass; verified in a real browser at desktop and 375px
**What I did:**
- The `explanation` field I shipped yesterday was **invisible**: `GraphView.tsx` only rendered `why` as topic chips, so the summary and factor bars never reached a screen. MASTER_SPEC 14's *"matches list shows ranked people with 'why you matched'"* was not really satisfied by chips alone.
- Side panel now shows the summary sentence, then one bar per contributing feature (label, bar width from `share`, percentage), then the shared-topic chips. Falls back to the old chips-only rendering when an edge has no explanation, so nothing regresses if the server is older.
- `basis` is surfaced honestly: `v1`/`lr` read "Share of this match's score, from the features the ranker used"; `v1_proxy` reads "Approximate: a tree ranker is serving, so these shares are indicative."
- Types added to `dashboard/lib/types.ts` (`MatchExplanation`, `ExplanationFactor`). The panel also guards on shape — a malformed `explanation` is ignored rather than blanking the whole panel.
- **The dashboard serves its own mocks**, separate from `docs/mocks/`. Without a token `/graph` reads `dashboard/public/mocks/graph_*.json`, and those had no explanations, so mock mode would have rendered nothing. Generated them for all 46 match/connection edges across the three files, using the same phrasing and facet ordering as `ml/ml/scoring.py` so the mock exercises the real contract. Deterministic (seeded by node id).
- Verified in the browser, not just by types: clicked a person, confirmed the summary, three bars (28% / 23% / 18%) and the basis line render; at 375px there is no horizontal overflow and the rows reflow via a media query. The element overlapping the rows in a dev screenshot is `NEXTJS-PORTAL`, the Next dev-tools button — dev only, not a layout bug.
**How to run/test it:** `cd dashboard && npm run typecheck && npm run lint && npm test && npm run build`. Visually: `npm --prefix dashboard run dev -- --port 3100`, open `/graph`, click any person.
**Next step for whoever continues:** The mobile app embeds this page in a WebView — worth one look on a real phone, since that is the surface a judge sees. `mobile/features/graph` has its own native renderer that does **not** read `explanation`; if the app shows its own panel rather than the WebView, it needs the same treatment.
**Known issues / blockers:** `dashboard/` is Arjun's folder — Arjun, revert freely if this cuts across your panel work; the API contract is unchanged either way. Mock explanations are generated, not captured from a live run, so the numbers are plausible rather than real; live mode shows the ranker's actual values.
**Contract changes:** none (consumes the `explanation` field added yesterday in docs/api.md §26).

## 2026-09-27 03:05 | akshar | Claude Code (Opus 5.5)
**Task:** Mobile dark mode: finish what Alan started (7fea3f6 palette + store, 66876c7 picker)
**Status:** done in JS; "System" following the phone needs a native rebuild (app.json change)
**What I did:**
- Tab bars (`app/(tabs)/_layout.tsx`, `app/(company)/_layout.tsx`) used `Colors.light` directly; now `useColors()`.
- `AppIcon`, `ConstellationMark`, `ChatMark` defaulted to fixed navy (invisible on dark); default is now the theme's `tabIconSelected`.
- Sign-in and company sign-in: background, form divider, inputs, placeholders and chips from the theme (were fixed light hexes).
- `app.json` `userInterfaceStyle: automatic` (was `light`, which pins iOS to light, so "System" could never go dark and native controls stayed light).
- Left intentionally fixed: white text on tinted buttons, white QR backgrounds (scanners need contrast), the graph's dark space card, dark hero cards, resume "paper" preview.
- Verified in the web build in dark and light: sign-in, onboarding, Home, Feed, Constellation, Nearby, Events, Profile, Your sources (picker), match page. Light/dark switch is instant.
**How to run/test it:** Profile -> Edit profile -> Appearance -> Light / Dark / System. `cd mobile && npx tsc --noEmit && npx eslint .`
**Next step for whoever continues:** Rebuild the dev/Release app once so "System" follows the iPhone's dark mode (light/dark choices already work without a rebuild).
**Known issues / blockers:** Light/Dark picks work immediately; System needs the rebuild. The web Nearby map is a placeholder; native Apple Maps follows the system appearance.
**Contract changes:** none

## 2026-09-27 02:57 | adam | coding agent
**Task:** Company events: isolated event session + leave event
**Status:** done
**What I did:**
- Checked what exists (company QR + join code, register, scan in, event page listing only checked-in people). Added `POST /events/{id}/leave` (attendance removed, pending suggestions from it expire, registration kept) and a "Leave event" button in the session on `app/attend/[id].tsx` (turns off Event Mode, switches back to roaming = HackGT event).
- Constellation graph, match screen, assistant and QR/tap verification now use the current event (`lib/currentEvent`) instead of the hardcoded HackGT id, so after scanning into a company event everything shows only that event's people.
- Startup falls back to roaming if the remembered company event no longer has me checked in.
**How to run/test it:** `cd ml && pytest -q tests/test_events.py`; mobile `npx tsc --noEmit && npm run test:demo`. Live: company creates event → shows QR; attendee registers, scans, sees only that event in Constellation/Nearby; Leave event → back to everyone.
**Next step for whoever continues:** Walk through it on two phones (company + attendee).
**Known issues / blockers:** none known.
**Contract changes:** `docs/api.md` 45a `POST /events/{event_id}/leave` (new).

## 2026-09-27 02:16 | akshar | Claude Code (Opus 5.5)
**Task:** AK3/AK2 phone testing fixes: tap-to-verify feedback, "nothing was sent" after connecting
**Status:** done (server fix goes live with the Railway auto-deploy of this push)
**What I did:**
- Tap screen (`mobile/app/verify.tsx`, `features/ble/tap.ts`): shows what the server answered (too far / not recognized / waiting on them) instead of a silent "Waiting for their phone"; if the server says too_far, the app raises its own threshold to match; "Use QR instead" after 10 s. 6 tap tests.
- Connect feedback (`ml/app/conversations.py`): re-verifying the same pair within the dedupe window reuses the conversation, and the first answer used to be locked in, so a later "yes" was ignored and showed "Nothing was sent". Now your latest answer counts; already-connected pairs see "connected" (notified once). Still only a mutual yes connects. +3 tests; full suite 265 passed on a local Postgres+pgvector.
**How to run/test it:** `cd ml && TEST_DATABASE_URL=postgresql://postgres@localhost:5444/fc_test .venv/bin/python -m pytest -q tests/test_verification.py`; `cd mobile && node --experimental-strip-types --test features/ble/tap.test.mjs`.
**Next step for whoever continues:** After Railway redeploys, two real accounts: Verify → Tap phones (or QR) → both "Yes, connect" → both see "You're connected". One "No thanks" → the other only ever sees "waiting".
**Known issues / blockers:** iOS 27 phones (Adam's) crash at launch without a UIScene adoption; a config-plugin fix exists on Akshar's machine (`akshar/backup-before-force-push`, `mobile/plugins/withIOSSceneLifecycle.js`) and still needs to land. Note: team `main` was force-pushed earlier today; check nothing was lost.
**Contract changes:** none

## 2026-09-27 02:08 | adam | coding agent
**Task:** Demo loop with synthetic attendees, onboarding step, speed, smarter GitHub feed
**Status:** done
**What I did:**
- Demo attendees (`profiles.is_synthetic`): `POST /suggestions/demo` lets a real person say "Want to meet" now instead of waiting until both are around. Most answer yes 3-8 s later (normal match + chat); ~1 in 5 never answer (silent). On a matched meetup, once the real person shares location, the demo attendee shares a made-up point ~150 m away that walks toward them (`synthetic.share_locations`, every 5 s tick). Real-people flows unchanged.
- Match screen: "Want to meet" for demo attendees; the app remembers who I said yes to (it used to fall back to "when you're both around") and re-checks every 4 s while waiting.
- Onboarding: once shown it stays open until Continue / Skip (connecting GitHub used to mark the profile complete and jump past the resume step); it also opens after sign-in when resume or GitHub is missing (`mobile/lib/useOnboarding.ts`).
- Speed: resume section parse and interest extraction run in parallel (`app/resumes.py`); assistant uses low effort (`ASSISTANT_EFFORT`, default low) and gets the user's top 5 matches up front, so "who should I meet" needs no tool round trip.
- Feed: replaced per-repo briefs with ONE "working on" item per person across their public repos pushed in the last 7 days (up to 3), rewritten when the active set changes or at most every 6 h; the feed shows one GitHub card per person (`feed.one_github_card_per_person`).
**How to run/test it:** `cd ml && TEST_DATABASE_URL=... .venv/bin/python -m pytest -q tests` (268 pass). `cd mobile && npm run test:demo && npx tsc --noEmit`.
**Next step for whoever continues:** Live: check in, turn on Open to Meet, open a demo attendee from Constellation, tap Want to meet, then Find them and share location.
**Known issues / blockers:** The "said yes, waiting" memory for real suggestions is per app session (server never reveals the other side).
**Contract changes:** `docs/api.md` 18a `POST /suggestions/demo` (new, demo attendees only) + `docs/mocks/suggestions_demo.json`; 29: GitHub items are one "working on" brief per person. `.env.example`: `ASSISTANT_EFFORT`. No schema change (demo requests are marked `suggestions.building_id = 'demo-request'`).

## 2026-09-27 01:17 | adam | coding agent
**Task:** AD11 + AR8 feed: GitHub updates say what they actually built
**Status:** done
**What I did:**
- Every GitHub feed item gets a brief in `payload.details`: 1-2 sentences on what they built, up to 4 concrete highlights, one question to ask them next time, and stack chips. Written by LLM_SMART from the repo's public data only (description, topics, languages, manifest frameworks, their recent commit subjects, release notes, README). Any number not in those facts is dropped; the facts-only `template_brief` is used when the model is unavailable. No gendered pronouns.
- The AR8 poller (`ml/app/github_activity.py` `refresh_briefs`) writes up to 4 briefs per user per 10-minute cycle, which also backfills existing items. A brief is rewritten when the repo gets new pushes: right away if the first one was thin (empty new repo), else at most every 6 h. Private, forked, or deleted repos get no brief.
- `GET /feed` items carry `details`; burst `summary` entries carry their `items` so the app can expand them. Reply suggestions and the assistant's `get_connections_activity` use the brief too.
- Mobile feed card shows the brief (summary, bullets, stack chips, "Ask <name> next time"); bursts expand into the individual updates. The demo feed mock has a quant-finance example (Daniel) and an expandable burst (Sara).
- Edited Arjun's `ml/app/github_activity.py` (AR8) and Alan's `ml/app/feed.py` (AL10), additively, with their tests extended.
**How to run/test it:** `cd ml && TEST_DATABASE_URL=<empty pgvector db> .venv/bin/python -m pytest -q tests` (263 pass). `cd mobile && npm run test:demo && npx tsc --noEmit`. Demo: Try the demo, then Feed. Live: a connection links GitHub; within 10 minutes their recent GitHub items show a brief.
**Next step for whoever continues:** After the next live poll, open Feed on an account connected to someone with GitHub linked and read one brief; `railway logs` shows `github briefs: N written for <user>`.
**Known issues / blockers:** Briefs cover GitHub items from the last 14 days (LOOKBACK). Only public repos are read.
**Contract changes:** `docs/api.md` 29 (additive): feed items gain `details` `{summary, highlights, ask, stack, ai}` (null for posts, updates, and not-yet-briefed items); `summary` entries gain `items`. `docs/mocks/feed.json` updated. No schema change (`feed_items.payload` jsonb). Affects the mobile feed (updated here); the dashboard does not read `/feed`.

## 2026-09-27 01:11 | adam | Cursor Grok 4.7
**Task:** Nearby map restore (user request)
**Status:** done
**What I did:**
- Nearby shows a street map as soon as the tab opens, in `mobile/app/(tabs)/nearby.tsx` (`NearbyScreen`).
- Phone map (`mobile/features/nearby/NearbyMap.tsx`) is Apple/Google Maps again, with the 3/8/16 m rings. Match pins still appear only after Scan.
- Website map (`mobile/features/nearby/NearbyMap.web.tsx`) is an OpenStreetMap embed centered on you, or Georgia Tech if location is off.
**How to run/test it:** `cd mobile && npx tsc --noEmit`. Web: open `/nearby` (verified at http://127.0.0.1:8081/nearby, map of campus). Phone: Expo Go on this Mac’s tunnel, Nearby tab.
**Next step for whoever continues:** On a phone, open Nearby in Expo Go and confirm the Apple Maps blue dot and distance rings. Scan, then tap a pin and confirm it selects that person in the list.
**Known issues / blockers:** The website map cannot draw match pins (no MapView on web). Pins stay on the phone map only, and they are browse slots, not real positions.
**Contract changes:** none

## 2026-09-27 00:20 | adam | Codex
**Task:** AD2 / AD9 / AR5 / AK5 — login icons, score-sized stars, Nearby navigation
**Status:** done
**What I did:**
- Added vector Google, GitHub, LinkedIn, email and code icons to sign-in actions; removed the dark rectangular banner so the constellation artwork sits directly on the page.
- Added brighter blue/pink/mint/gold category colors and score-based star diameters (16–44 pixels) inside unchanged tap targets; updated the legend and added a score-size regression test.
- Removed reintroduced native-map proximity circles. Queued expanded-map navigation until iOS modal dismissal, with a post-close effect on other platforms.
- Changes to the graph/Nearby areas are explicitly user-requested.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint app/sign-in.tsx 'app/(tabs)/nearby.tsx' 'app/(tabs)/graph.tsx' components/SignInIcon.tsx features/graph/Atom.tsx features/graph/starStyle.ts features/nearby/NearbyMap.tsx && node --experimental-strip-types --test features/graph/*.test.mjs && npm run test:demo`; passed (18 demo flows, 4 graph tests). `EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform ios --platform android --platform web` passed. Browser verified expanded Nearby → select Maya → View profile opens Maya's matching user ID and profile.
**Next step for whoever continues:** On iPhone, open Nearby → expand → choose a match → View profile; confirm native dismissal completes and the correct profile opens. Logic lives in `mobile/app/(tabs)/nearby.tsx` (`openFromMap`, `finishDismiss`).
**Known issues / blockers:** Native modal behavior and Apple Maps appearance were not exercised on a physical iPhone; browser flow and all platform bundles passed. No live OAuth attempt was made.
**Contract changes:** none

## 2026-09-27 | arjun | Claude Code
**Task:** AR6 / shared live "Demo test event" (all day Sep 27) + calendar "Coming up" follows the selected day
**Status:** done (live needs a Railway redeploy)
**What I did:**
- New `ml/app/demo_event.py`, run at server startup (`app/main.py` lifespan): creates or refreshes "Demo Company" and "Demo test event", Sep 27 12:00 AM to 11:59 PM ET (`DEMO_EVENT_DATE`), join code `DEMO-927` (`DEMO_EVENT_JOIN_CODE`), in the real DB. Every user sees the same event in `GET /events`. Idempotent. `DEMO_EVENT=0` disables it. Optional company login to show the QR: only if the team sets `DEMO_COMPANY_EMAIL` + `DEMO_COMPANY_PASSWORD` in Railway (created confirmed, like /orgs/signup; I didn't invent credentials). Check-in rules are unchanged: register first, then QR or code, any time.
- Tests: `ml/tests/test_demo_event.py` (created once, 00:00-23:59 ET, visible to every user, join code needs registration). `tests/conftest.py` sets `DEMO_EVENT=0` so other DB tests stay clean.
- Calendar: "Coming up after <selected day>" lists plans that start after the tapped day (and haven't ended). Tapping the 27th shows the 28th event as coming up; tapping the 28th shows it under that day. Same-day events show start and end ("Sun, Sep 27 · 12:00 AM – 11:59 PM ET"). Demo-mode event 777 matches the live one.
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests/test_demo_event.py` (DB tests: TEST_DATABASE_URL / CI). `cd mobile && npx tsc --noEmit && npx expo lint && npm run test:demo`.
**Next step for whoever continues:** In Railway (service `ml`), optionally set `DEMO_COMPANY_EMAIL` / `DEMO_COMPANY_PASSWORD`, then redeploy: `cd ml && npx @railway/cli up --detach --path-as-root .`. Test: two attendee phones mark "Demo test event" Attending, then scan the QR from the company login (or type DEMO-927), then enter the session and turn on Event Mode (dev build for Bluetooth).
**Known issues / blockers:** Bluetooth needs the dev build (not Expo Go). This laptop isn't logged in to Railway.
**Contract changes:** `.env.example` adds DEMO_EVENT, DEMO_EVENT_DATE, DEMO_EVENT_JOIN_CODE, DEMO_COMPANY_EMAIL, DEMO_COMPANY_PASSWORD (names only). No schema/API shape change.

## 2026-09-26 23:30 | adam | Claude Code
**Task:** Full pre-demo audit (repo, server, app, database, live API, dashboard)
**Status:** done
**What I did:**
- Server suite now runs against a real Postgres + pgvector locally (pip `pgserver`): 214/214 pass, repeated runs; it had never run with a DB here before. Fixed what that exposed: signup-trigger test leaked a trigger into the shared test DB (26 errors), assistant topic search regressed to non-Open-to-Meet people + extra fields (privacy test), QUIET_HOURS comment crashed suggestions, short text PDFs rejected, tests read the developer's .env.
- `.env` files: python-dotenv turns `KEY=   # note` into the value "# note". The Mac's root .env had 13 such keys (incl. SUPABASE_JWT_SECRET, DATABASE_URL): settings now treats comment-values as unset (+test); the local file was repaired (backup .env.bak-*). Production unaffected (Railway vars, no .env shipped).
- App (Arjun's Constellation redesign included): tsc, eslint (0 errors), demo-flow 15/15, expo-doctor 21/21, iOS + Android bundles, every navigation link resolves. Live notifications now use payload-aware titles/routes; auto check-in per signed-in user.
- DB: 11/11 migrations applied, 38/38 tables RLS, live RLS isolation 11/11 (incl. resumes, user_skill_profiles), `supabase db lint` clean. Secrets: none in files or full git history (only the public anon JWT).
- Live API: `ml/scripts/smoke_all_endpoints.py` (36 checks) + `e2e_live_loop.py` pass after the final deploy. Dashboard: live 200, builds, tsc/eslint clean.
**How to run/test it:** `cd ml && TEST_DATABASE_URL=<pgvector db> python -m pytest -q`; `cd ml/scripts && npx @railway/cli run ../.venv/bin/python smoke_all_endpoints.py`; `cd mobile && npx tsc --noEmit && npx eslint . && npm run test:demo`
**Next step for whoever continues:** Adam: `gh auth refresh -h github.com -s workflow`, then commit `.github/workflows/ci.yml` (on Adam's Mac, runs the full suite on pgvector + mobile checks).
**Known issues / blockers:** Root .env on Adam's Mac has empty values for keys that were wiped (use `npx @railway/cli run` for local server runs). /assistant/demo is unauthenticated by design (rate-limited, api.md 43). Matches endpoint takes ~7 s cold.
**Contract changes:** api.md 44 (simulate + additive fields)

## 2026-09-26 22:45 | adam | Codex
**Task:** AD2 — flatten login layout
**Status:** done
**What I did:**
- Removed the enclosing rounded white sign-in card and replaced it with spacing and a subtle top divider.
- Reduced corner rounding on the constellation illustration, fields and buttons so the login no longer stacks bubble-shaped containers.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint app/sign-in.tsx`.
**Next step for whoever continues:** Reload `/sign-in` to inspect the flatter styling in `mobile/app/sign-in.tsx`.
**Known issues / blockers:** Styling-only change; no physical-device visual check.
**Contract changes:** none

## 2026-09-26 22:40 | adam | Claude Code
**Task:** Live app loop broken (matches/graph 403, no suggestions, demo attendees inert) + milestone-only feed
**Status:** done, verified live
**What I did:**
- App checks in to HackGT 13 automatically after sign-in and retries any "check in first" 403 (matches/graph were 403 for anyone who hadn't toggled Open to Meet).
- `ml/app/synthetic.py` (tick every 5 s): seeded attendees (is_synthetic) accept suggestions after the real person says yes, reply in chat in character (Haiku, grounded in their profile), and agree to connect. Suggestions never pair two synthetic people, and synthetic percentiles/caps never block a real person. POST /conversations/simulate (demo attendees only, after a mutual yes). quick-profile `demo_attendee`; match page shows "Simulate meeting".
- Feed = milestones only: started working on, launched (links the live site: homepage/GitHub Pages), shipped release, open-sourced, star milestones. Deleted 102 "pushed to hackgt13-project" items.
- Skill-profile backfill task; scanned PDFs transcribed by Claude; onboarding explains "no public repos".
- Live e2e `ml/scripts/e2e_live_loop.py`: suggestion -> mutual yes -> in-character reply -> simulated meeting -> connected (throwaway account deleted).
**How to run/test it:** `cd ml/scripts && npx @railway/cli run ../.venv/bin/python e2e_live_loop.py`
**Next step for whoever continues:** Walk the same loop on a phone signed in live; then have a teammate test the PDF upload with the new [resume] logs.
**Known issues / blockers:** Feed is empty until someone hits a real milestone (synthetic attendees have no feed items). Two people deploying Railway from different checkouts caused regressions; deploy only from up-to-date main.
**Contract changes:** POST /conversations/simulate, quick-profile `demo_attendee` (additive), /me/accounts github.repo_count (additive)

## 2026-09-26 22:30 | adam | Codex
**Task:** AD2 — login visual polish
**Status:** done
**What I did:**
- Added a restrained night-sky constellation illustration and a rounded white sign-in card, clearer field labels, softer input styling, and a primary email action.
- Made the email-code form appear after a successful link request or an explicit Already have a code action. Kept OAuth, company login, demo access and the privacy disclosure.
- Added safe-area spacing, disabled email autocorrect, and live announcements for form feedback.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint app/sign-in.tsx && npm run test:demo`; passed (17 demo checks). `EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform ios --platform android --platform web` passed before final placeholder/footer copy placement cleanup.
**Next step for whoever continues:** Open `/sign-in` to inspect the form; email-link/code handling and visual styles live in `mobile/app/sign-in.tsx`.
**Known issues / blockers:** No real authentication email sent or physical-device visual check in this increment.
**Contract changes:** none

## 2026-09-26 22:22 | adam | Cursor Grok 4.6
**Task:** Company tools verification
**Status:** done
**What I did:**
- Live API checklist 25/25: signup, duplicate 409, login, patch, create event, studio QR, promote, rotate (old code 404), attendee enter, updates, matches, organizer counts only.
- Browser: company home, event studio, mint code, save profile, sign out, existing-account login.
- Company scroll views now pad above the tab bar so Sign out / Create event aren’t covered.
**How to run/test it:** Company? Separate login → create or sign in → New event → Make a code. Attendee: Events → Enter join code.
**Next step for whoever continues:** On a second attendee phone, enter a join code and confirm Nearby uses that event.
**Known issues / blockers:** Work email is not verified (demo). Printed join code is shown once until you tap Make a code / New code.
**Contract changes:** none

## 2026-09-26 22:15 | adam | Codex
**Task:** AD9 / AR5 — irregular constellation spacing
**Status:** done
**What I did:**
- Gave each featured star a different radius and a small angular offset so the constellation no longer forms an evenly spaced ring.
- Reduced the projection tilt to preserve name separation on small phones throughout the animation. Kept deterministic positions and existing motion performance.
- User requested this refinement in Arjun's graph area.
**How to run/test it:** `cd mobile && node --experimental-strip-types --test features/graph/atomLayout.test.mjs && npx tsc --noEmit && npx eslint features/graph/atomLayout.ts`; passed, including full-orbit bounds and label separation at widths 286–440 for 1–6 stars.
**Next step for whoever continues:** Reload Constellation and inspect varied star distances; layout parameters are in `mobile/features/graph/atomLayout.ts`.
**Known issues / blockers:** No physical-device visual check this increment.
**Contract changes:** none

## 2026-09-26 22:00 | adam | Cursor Grok 4.6
**Task:** Company separate login + organizer studio (events, join codes, promote)
**Status:** done
**What I did:**
- Companies have a separate sign-in (`mobile/app/company-sign-in.tsx`): company name, contact, work email, password, industry, size, city, about. Demo does not verify email (`POST /orgs/signup` creates a confirmed Auth user).
- Company accounts skip student onboarding and land on `(company)` tabs: event list, create event, studio (join code + QR + share + promote), company profile.
- People join with a typed code (`POST /events/enter`) or the event QR. Organizers see counts only. Promote writes `event_posts`, updates `events.promo`, and notifies registrants.
- Live migration `20260926220000_company_accounts.sql` applied to project `mwfzgkikbmnghueolfnw`.
**How to run/test it:** Sign-in → Company? Separate login → create company → New event → share code. Attendee: Events → Enter join code. `cd mobile && npx tsc --noEmit`. Live API: `/orgs/signup`, `/orgs/events`, `/events/enter` are on Railway.
**Next step for whoever continues:** On a second attendee phone, enter a printed join code on Events → Enter join code and confirm Nearby uses that event. If Expo web is stale, reload `http://localhost:8081`.
**Known issues / blockers:** Work email is not verified (demo). Join code plaintext is shown once / after rotate (hashed at rest). `ml/.venv` is Python 3.9 without pytest; org unit tests were not run in that venv.
**Contract changes:** `docs/schema.sql` + `supabase/migrations/20260926220000_company_accounts.sql` (`profiles.account_kind`, org profile fields, `events.join_code_hash`/`promo`). `docs/api.md` 45–46 and new mocks under `docs/mocks/`.

## 2026-09-26 22:00 | adam | Codex
**Task:** AD9 / AR5 — space constellation visual refinement
**Status:** done
**What I did:**
- Restyled the constellation as a near-black night sky with a deterministic starfield, soft blue haze, glowing stellar cores, and thin straight connection lines.
- Replaced the atom spheres and orbital rings with stars; retained subtle facet colors, upright names, profile selection, pause, and reduced-motion handling.
- Kept native-driven animation and static SVG lighting with no new dependencies. User requested changes to Arjun's visualization area.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint features/graph/Atom.tsx 'app/(tabs)/graph.tsx' && node --experimental-strip-types --test features/graph/atomLayout.test.mjs`; all passed. Expo export: `EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform ios --platform android --platform web`.
**Next step for whoever continues:** Reload the app and open Constellation; check the starfield and tap a named star on a physical phone. Rendering lives in `mobile/features/graph/Atom.tsx`.
**Known issues / blockers:** Physical-device visual/performance verification remains unmeasured.
**Contract changes:** none

## 2026-09-26 21:40 | adam | Claude Code
**Task:** Assistant quality + verify resume/GitHub profile building live
**Status:** done (GitHub OAuth callback not exercised by a real login yet)
**What I did:**
- Assistant (ml/app/assistant.py): new tools get_my_top_matches and get_conversation_starters; search uses the /events/{id}/matches scope; profile snapshot preloaded; sharper prompt. Demo mode calls the real model via POST /assistant/demo (no JWT, documented exception api.md 43). App renders bold + bullets.
- GitHub manifests one folder deep (monorepos); markup languages capped. Sign-in shows only providers enabled in Supabase (LinkedIn + email today).
- Live e2e (`ml/scripts/e2e_profile_check.py` via `npx @railway/cli run`): DOCX + PDF resumes stored/parsed, public GitHub import, 20 interests with evidence, skill profile versions, onboarding complete, live assistant answers; throwaway account deleted.
**How to run/test it:** `cd ml && npx @railway/cli run .venv/bin/python scripts/e2e_profile_check.py <github_user>`
**Next step for whoever continues:** On a phone: onboarding -> Connect GitHub -> finish GitHub login; confirm a linked_accounts github row. If GitHub shows a redirect_uri error, set the OAuth app callback to https://ml-production-04c0.up.railway.app/connect/github/callback.
**Known issues / blockers:** Assistant replies 3-15 s. GitHub sign-in needs its own GitHub OAuth app enabled in Supabase Auth. CI workflow file needs `gh auth refresh -s workflow`.
**Contract changes:** api.md 43 POST /assistant/demo

## 2026-09-26 21:15 | adam | Adam
**Task:** Web home-screen app + extra add-people paths + company events
**Status:** in progress
**What I did:**
- Expo web is now a home-screen PWA (`mobile/app/+html.tsx`, `mobile/public/manifest.webmanifest`). Bluetooth still needs the native app; QR verify, invites, and event join work on the site.
- Invites screen is the "already know them" path: conversation QR, connect QR, contact name + share. Post-talk checkboxes were already `ChecklistForm`.
- Company events: `GET/POST /events`, `/orgs`, `/me/org`, register, join-token, `/events/join`. Nearby uses the event you entered (`lib/currentEvent.ts`).
**How to run/test it:** `cd mobile && npx tsc --noEmit`. `cd ml && .venv/bin/python -m pytest -q tests/test_event_join_qr.py`. Redeploy ML, then web: `cd mobile && npx expo start --web`.
**Next step for whoever continues:** Redeploy Railway `ml` so the new event endpoints are live. On a phone, Safari → Share → Add to Home Screen.
**Known issues / blockers:** Event list needs `events.org_id` / `location_text` (already in schema). Scanning a person QR still does not auto-connect; both must say yes.
**Contract changes:** docs/api.md 45 (company events); docs/mocks/get-events.json. Alan: new routes live in `ml/app/routers/events.py`.

## 2026-09-26 21:10 | adam | Codex
**Task:** AD9 / AK5 — Nearby cleanup and reciprocal Maps navigation
**Status:** done in code; backend test environment unavailable locally
**What I did:**
- Removed the nearby proximity rings and band filters. The map/list now show all eligible nearby matches in one organized surface; decorative pin positions never represent a person’s real direction or location.
- Added a Find action only for a mutual match. It enters the existing 30-minute meetup flow rather than exposing coordinates from Nearby.
- Added an external walking-navigation button only after the viewer and the other matched person have both started temporary location sharing. The API now withholds `their_location` until both shares exist.
- Added a pure navigation-URL test and updated the location API test and contract documentation for reciprocal sharing.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint 'app/(tabs)/nearby.tsx' 'app/meetup/[id].tsx' features/nearby/NearbyMap.tsx features/nearby/NearbyMap.web.tsx features/location/navigation.ts && node --experimental-strip-types --test features/location/navigation.test.mjs features/nearby/mapLayout.test.mjs`; mobile checks pass. Backend: `cd ml && .venv/bin/python -m pytest -q tests/test_location.py` when the ML virtualenv is installed.
**Next step for whoever continues:** On two physical phones, both accept the same suggestion, both press Find → Share my location, then confirm Navigate to opens walking Maps; confirm it is absent if either person has not shared.
**Known issues / blockers:** This checkout lacks `ml/.venv` and system Python lacks pytest, so the new backend test could not run locally. Expo preview process is local only; native Maps/Bluetooth needs devices.
**Contract changes:** `docs/api.md` §37: `their_location` is now explicitly reciprocal; external navigation is allowed only in the reciprocal share window.

## 2026-09-26 20:49 | adam | Codex
**Task:** AD9 / AR5 — user-requested lightweight 3D atom constellation
**Status:** done
**What I did:**
- Replaced flat rotating initials with shaded spheres around a central nucleus, three tilted orbital paths and three moving particles; kept the current palette and facet meanings.
- Projected a tilted 3D ring with depth-based size/opacity and curved self-only connections. Precomputed 73 motion samples; native transform/opacity interpolation avoids per-frame React state, physics, WebGL and new dependencies.
- Kept upright labels, six-node limit, profile selection, pause/resume and reduced-motion/background/focus cleanup. Moved Pause to the chart header for easy access on phones.
- Added full-orbit bounds/label-separation tests across phone/tablet widths and 1–6 people, plus depth and seamless-wrap checks.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint 'app/(tabs)/graph.tsx' features/graph/Atom.tsx features/graph/atomLayout.ts && node --experimental-strip-types --test features/*/*.test.mjs && npm run test:demo`; `EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform ios --platform android --platform web`. Passed before integration: 25 unit tests, 15 demo checks, all three exports. Browser at 390x844 verified rendering, animation, pause and person-sheet opening. 120-frame desktop sample: median/p95 16.7ms, zero intervals over 50ms (not a phone benchmark).
**Next step for whoever continues:** Reload Expo Go and open Constellation; check orbit smoothness, tap targets and system Reduce Motion on a physical iPhone/Android. Pure projection lives in `mobile/features/graph/atomLayout.ts`; renderer in `Atom.tsx`.
**Known issues / blockers:** Physical-phone performance not measured. This is lightweight projected 3D, not an interactive WebGL scene. Changes to Arjun's graph area explicitly requested by the user; contracts unchanged.
**Contract changes:** none

## 2026-09-26 19:55 | adam | Claude Code
**Task:** Fix the intermittent live stall (matches / graph / quick profile / dashboard hang), final verification
**Status:** done, verified live
**What I did:**
- Found live: /dashboard/1 hung 936 s and /events/1/matches timed out while /health stayed fast. Every event-model request waited on one per-event build lock, so any slow rebuild stalled everyone; UMAP (numba, not thread-safe) could run in several threads at once; PyTorch/numba used one thread per reported CPU.
- Fix (ml/app/population.py, __init__.py, tasks.py, ranker_job.py, routers/dashboard.py): serve the cached model while another thread rebuilds (only the first build waits), HEAVY_LOCK so one UMAP/HDBSCAN/global-embed job runs at a time, native math threads capped at 2 (override with Railway vars / ML_THREADS), global vectors skip users deleted mid-run. +2 tests; 216/216 with Postgres.
- Live after deploy: `ml/scripts/load_check.py` 6 min across the heavy-job cycle: matches median 2.5 s (max 6.7 s cold), graph 1.9 s, dashboard 1.5 s, zero errors. Smoke 36/36. Core loop e2e passes.
- Removed 2 leftover "Sam Smoke" test accounts (a killed smoke run had skipped cleanup and they appeared as matches). Scripts now clean up on SIGTERM/SIGHUP; `ml/scripts/cleanup_test_accounts.py` finds strays.
**How to run/test it:** `cd ml/scripts && npx @railway/cli run ../.venv/bin/python -u load_check.py 6`
**Next step for whoever continues:** Keep one deployer, from up-to-date main. Adam: `gh auth refresh -h github.com -s workflow`, then commit .github/workflows/ci.yml.
**Known issues / blockers:** Matches ~2.5 s per call is acceptable but could be cached per viewer if it matters for the demo.
**Contract changes:** none

## 2026-09-26 16:00 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR3 live verification (with Adam on Railway)
**Status:** done
**What I did:**
- After a Railway restart the ML service reported `"db": false` (30 s timeouts): Supabase's session pooler (5432) connection cap. Adam switched Railway's DATABASE_URL to the transaction pooler (port 6543; `app/db.py` already disables prepared statements for it) and stopped other servers on the same DB. `/health` -> `{"ok":true,"db":true}` in 0.4 s.
- Live `GET /dashboard/1`: 80 people, 6 interest clusters (health tech; CS/CE; hardware + C++; math + reinforcement learning + quant research; design + sports analytics; business + fintech), 4 unclustered, 10 gaps.
**How to run/test it:** `curl -s https://ml-production-04c0.up.railway.app/health`; `curl -s https://ml-production-04c0.up.railway.app/dashboard/1`.
**Next step for whoever continues:** Keep ONE ML server per database (Railway). Local dev servers should use a separate DB or port 6543 too. Sign in on a phone (EXPO_PUBLIC_USE_MOCKS=0) and check the Graph/matches show these people.
**Known issues / blockers:** Rotate the Supabase secret key and the Anthropic key (both were pasted in chat).
**Contract changes:** none

## 2026-09-26 15:40 | adam | Codex
**Task:** AD9 / AD11 / AR5 / AK5 — user-requested Home, Nearby and graph polish (cross-owner presentation changes)
**Status:** done
**What I did:**
- Integrated with the team's latest navigation and facet-based graph; preserved Feed as Home and meeting activity under Nearby. Replayed only this increment after the remote history rewrite.
- Warm-white/charcoal theme, quieter avatars/cards, compact Home composer with draft preservation, and a neutral Open to Meet card instead of a large colored panel.
- Full-screen Nearby map with band filters and a match selector. Preview shows at most three per band; every eligible match stays in the list and selecting one includes them on the map. Selected-only native pin labels and evenly spaced decorative positions reduce crowding. Fixed asynchronous location-watcher cleanup on expansion/close.
- Slow 90-second graph rotation with upright names, pause/resume, selected-profile pause, reduced-motion support and focus/background cleanup. Added rotating-layout bounds and dense-map regression tests.
**How to run/test it:** `cd mobile && npx tsc --noEmit && node --experimental-strip-types --test features/*/*.test.mjs && npm run test:demo && EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform ios --platform web`. Passed: 24 unit checks, 15 demo-flow checks, touched-file ESLint, iOS/web exports. Browser at 390x844 verified Home, Nearby expand/close/filter/select, graph movement/pause and profile opening.
**Next step for whoever continues:** Pull main, run `./scripts/start-app.sh`, then on a physical phone test Nearby → scan → Expand map → select/filter → Done, and Constellation → pause/resume → select a person. Native street maps/Bluetooth cannot be verified by the browser radar fallback.
**Known issues / blockers:** No physical-phone verification claimed. Existing Node module-type and Expo color-environment warnings persist. Dependency installation reports 16 moderate advisories; dependency upgrades are outside this UI increment. Local mock web preview is on port 8086, not continuously monitored after handoff.
**Contract changes:** none

## 2026-09-26 15:10 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR3 follow-up: live server didn't see the 80 seeded attendees (edit in Alan's `ml/app/population.py`, flagged for Alan)
**Status:** fixed in code; NEEDS A RAILWAY REDEPLOY to take effect
**What I did:**
- Found: `population.event_model()` cached the attendee list and only rebuilt on this process's `invalidate()`. Attendance written by anything else (seed script, Supabase, a 2nd replica) stayed invisible until restart; live `/dashboard/1` showed 10 people (a mid-seed snapshot) instead of 80.
- Fix: `event_model` also compares the current attendee ids (one small query) and rebuilds when they changed; `EventModel.ids` added. Test `test_event_model_sees_attendees_added_outside_the_process`. Full ML suite 175 passed on local Postgres.
**How to run/test it:** `curl -s https://ml-production-04c0.up.railway.app/dashboard/1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['people'], len(d['clusters']))"` should say 80 after the redeploy.
**Next step for whoever continues:** Redeploy Railway: `cd ml && npx @railway/cli up --detach --path-as-root .` (Adam's Railway login). Then re-check `/dashboard/1` and sign in on a phone to see real matches.
**Known issues / blockers:** Railway redeploy needs someone logged into the `formal-connection` Railway project.
**Contract changes:** none

## 2026-09-26 14:40 | arjun | Arjun

## 2026-09-26 14:40 | arjun | Claude Code (Claude Opus 5.5)
**Task:** AR3 synthetic attendees: SEEDED INTO LIVE SUPABASE
**Status:** done
**What I did:**
- Ran `ml/scripts/seed_hackathon_attendees.py` against the live project (mwfzgkikbmnghueolfnw) in its new API mode (SUPABASE_URL + SUPABASE_SECRET_KEY, no DATABASE_URL needed): 80 synthetic attendees (is_synthetic, synth-NNN@example.com), all checked in to HackGT 13 (event 1), 43 open_to_meet, 171 canonical interests with bge embeddings, 903 user_interests (weights = Alan's 1-exp(-sum interest_weight)), 80 raw_documents with meta.extraction (interest ids) so profile_store.rebuild_user_interests reproduces them.
- Verified counts with read-only REST queries.
**How to run/test it:** re-run (idempotent): `cd ml && SUPABASE_URL=https://mwfzgkikbmnghueolfnw.supabase.co SUPABASE_SECRET_KEY=... .venv/bin/python scripts/seed_hackathon_attendees.py`; remove all: same with `--delete`.
**Next step for whoever continues:** Start the ML server against this project (Alan/Adam: DATABASE_URL + keys in ml/.env, `./scripts/start-ml.sh` or Railway). Its workers compute profile_vectors/IDF/clusters for the 80 within 5 min; then `GET /events/1/matches` ranks them. SECURITY: the Supabase secret key was pasted in chat; rotate it (Project Settings -> API Keys) before real attendees.
**Known issues / blockers:** profile_vectors not written by the seeder (the ML service's global_vectors worker does it on startup/every 5 min).
**Contract changes:** none

## 2026-09-26 14:00 | arjun | Arjun
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

## 2026-09-26 13:45 | alan | Claude Code (Opus 5)
**Task:** AL3 follow-up — Haiku rewrites the why-you-matched sentences so a screenful of matches does not read identically
**Status:** done — 121 passed, 118 skipped (6 new). On by default; `EXPLAIN_VARY=0` turns it off.
**What I did:**
- The template summaries were correct but repetitive: across 8 real matches only **2 of 8** had a distinct opening, which looks robotic when a judge scrolls. `generation.vary_why()` rewrites them with Haiku (`LLM_FAST`), reusing the existing `messages.parse` + pydantic + one-retry pattern already in that module. Measured on the synthetic population: **2/8 distinct openings -> 6/8**, all 8 grounded.
- **The rewrite can only change words, never numbers.** It receives the shared topics, the factor labels and the template, and only `explanation.summary` is replaced — `factors`/`contribution`/`share` are untouched, so the bars a judge sees are still the ranker's. A test asserts that.
- **Grounding is enforced, not hoped for.** `_grounded()` rejects any rewrite naming a canonical interest the pair does not share (checked against the whole population vocabulary, which catches the failure that matters: attributing someone else's interest). Rejected rows silently keep their template. A test feeds a hallucinated row through and asserts it is dropped.
- **Never a hard dependency.** No API key, no network, API error, refusal, `max_tokens`, unparseable output — every path returns `{}` and the caller keeps the deterministic template. Tested.
- Cost and latency bounded: **one batched call per graph request**, capped at the `MAX_VARIED = 10` strongest edges (a graph holds 150 people; nobody reads 150 summaries), plus an in-process cache keyed by (person, template). Measured: first build 3547 ms, second build **0 ms**.
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests/test_explain.py` (18 passed, all offline — no test makes a real API call). To see real output, build a graph with `EXPLAIN_VARY=1` and `ANTHROPIC_API_KEY` set.
**Next step for whoever continues:** If the graph feels slow on first load during the demo, drop `MAX_VARIED` or set `EXPLAIN_VARY=0` — templates alone are still correct and instant.
**Known issues / blockers:** First uncached graph build pays ~3.5 s for the Haiku call; repeat loads are free. `_varied_cache` is per-process and unbounded — fine for a hackathon, but it would need a TTL or size cap to run for days. The grounding check cannot catch every possible fabrication (it catches named interests, not invented employers), which is exactly why the template remains the fallback rather than the LLM becoming the source of truth.
**Contract changes:** `docs/api.md` §26 — `explanation` may now carry `"varied": true` when a summary was rewritten; behaviour and the `EXPLAIN_VARY` switch documented. `.env.example` gains `EXPLAIN_VARY` (optional, defaults on). Additive; nothing renamed.

## 2026-09-26 13:30 | akshar | Akshar

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

## 2026-09-26 13:10 | alan | Claude Code (Opus 5)
**Task:** AL3 "why you matched" (MASTER_SPEC 6.9) — decompose the match score into the features that produced it
**Status:** done — 110 passed, 118 skipped (12 new). Wired into `rank_candidates` and the Connection Graph.
**What I did:**
- **No refactor was needed.** `scoring.pair_features()` already returns all 9 features and `v1_score` is a pure linear sum, so contributions are exact rather than reverse-engineered. `Builder.person()` in `app/graph.py` already received `features`. Checked this before writing anything, since the alternative would have been a much bigger change.
- `scoring.score_contributions(f, model)` splits the score the pair actually got. **v1**: `weight x value`, exact — a test asserts the parts sum back to `v1_score` to 1e-12. **lr**: LogisticRegression on standardised features is linear in the logit, so `coef * (value - mean) / scale` is honest. **Tree rankers (LGBMRanker) are not linearly decomposable** — rather than invent per-feature numbers a tree never produced, it falls back to v1 weights and reports `basis: "v1_proxy"` so the UI can label those bars approximate.
- `scoring.explain_match(a, b, index, features=..., model=...)` returns `summary`, `factors` (top 3 by contribution, each with `label`/`value`/`contribution`/`share`), `all_factors`, `shared_topics` (with both evidence lines) and `basis`. Callers pass the features they already scored with, so the explanation always describes the ranking the user saw.
- **The bars rank by contribution; the sentence deliberately does not.** `bridge` (0.05) and `role_pair` (0.0) carry tiny weights so they never top the bars, yet they are the most interesting thing about a pair. Without this a cross-community match read identically to an obvious one — I saw that in the first output and fixed it. The verb also comes from the topic's facet, so a personal interest reads "you are both into formula 1", not "work on".
- Graph: `match`/`connection` edges carry a trimmed `explanation` (summary, top factors, topic names — 536 bytes/edge, ~80KB at the 150-node cap). Topic edges stay lean; evidence lines are not duplicated since they are already on quick-profile and `expand()`.
- 12 tests in `ml/tests/test_explain.py`, pure in-memory, no DB. They cover the things that would silently rot: contributions summing to the score, every feature having a label, zeroing a weight removing it from the breakdown, never naming an unshared interest, the bridge sentence appearing only for cross-community pairs, and `lr` vs `v1_proxy` basis.
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests/test_explain.py` (12 passed).
**Next step for whoever continues:** Frontend can render either half — `explanation.summary` as a sentence, or `explanation.factors` as a bar per factor using `share`. If a tree ranker is ever served (`MATCH_MODEL=lgbm`), check `basis == "v1_proxy"` and caption the bars as approximate.
**Known issues / blockers:** The summary is template-built, not an LLM call — deliberate, so it is deterministic, free, offline, and cannot invent facts. MASTER_SPEC 6.9's LLM icebreaker path is separate and untouched. `role_pair` has weight 0.0 in `V1_WEIGHTS`, so a student/recruiter pair scores nothing extra for it; the sentence still calls it out, which is the right behaviour but worth knowing if anyone tunes the weights.
**Contract changes:** `docs/api.md` §26 — `match` and `connection` edges in the Connection Graph gain an `explanation` object (`summary`, `basis`, `factors[]`, `shared_topics[]`); `docs/mocks/graph.json` updated to match. Additive, nothing renamed, existing fields untouched. Affects Arjun (graph rendering) and Adam (mobile graph WebView).

## 2026-09-26 13:00 | arjun | Arjun
**Task:** Graph = "atom" data viz (Arjun's direction)
**Status:** done in code (mock data); motion to confirm on a phone
**What I did:**
- `mobile/features/graph/Atom.tsx`: you = nucleus, 12 best matches = electrons on tilted orbits (one plane per interest group), color = shared interest (3 color-blind-safe hues + gray "other"), opacity = strength (solid = strong, see-through = weaker), stronger = inner/faster orbit. All motion on the UI thread (Reanimated useFrameCallback + useAnimatedProps on SVG); drag writes shared values (no React re-render) -> smooth. Tap pauses spin + opens the profile sheet.
- `mobile/features/graph/PersonSheet.tsx`: tap -> headline, shared interests with evidence, looking for / can offer; for connections: how/when met, minutes, last talked about (GET /connections/{id}, added `api.connection`).
**How to run/test it:** `scripts/start-app.sh` -> Expo Go -> Explore the demo -> Graph.
**Next step for whoever continues:** Real data once the ML server is live (EXPO_PUBLIC_USE_MOCKS=0).
**Known issues / blockers:** Expo web preview doesn't animate in a hidden tab (expected); verify spin on a device.
**Contract changes:** none

## 2026-09-26 12:30 | akshar | Akshar

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

## 2026-09-26 12:20 | alan | Claude Code (Opus 5)
**Task:** Chase the Railway-vs-laptop clustering split; make both silent ML fallbacks visible
**Status:** done — 96 passed, 118 skipped. Clustering split diagnosed as numerical instability, not a broken deploy.
**What I did:**
- Tested two hypotheses for Railway `[65,14,1]` vs laptop `[20,20,12,15,8,5]` on the same 80 people. **Both were wrong, and I checked before reporting them.** (a) umap missing on Railway: reproduced on 78 planted clusters — the `Z = X` fallback in `ml/ml/viz.py` labels **every point noise (0 clusters)**, it does not make one blob. (b) hashed fallback embedder: it yields *more* clusters (5, largest 20%) than the real model (3, largest 48%), not fewer.
- **Actual cause: the pipeline is numerically unstable across environments.** Direct evidence from earlier tonight — switching this laptop's embedder MPS -> CPU changed local clustering from `[18,15,13,15,9,6]` to `[20,20,12,15,8,5]` on identical data. Tiny float differences feed UMAP, which is chaotic, and HDBSCAN amplifies the result. Each server is internally deterministic (3 identical requests each) but they disagree. Neither is "broken"; the community structure is simply not reproducible across machines.
- **The bug worth fixing was the silence.** `ml/ml/embed.py` and `ml/ml/viz.py` both degrade without anyone noticing: a server with a failed `sentence-transformers` or `umap` import still returns 200 and still serves a dashboard, just with different vectors or an empty map. Both now log at ERROR, and `/health` reports `embedder` (`model`/`device`/`fallback`) and `umap`. Comparing two deployments took an hour; it is now one curl.
**How to run/test it:** `curl -s localhost:8000/health` -> `{"ok":true,"db":true,"embedder":{"model":"BAAI/bge-small-en-v1.5","device":"cpu","fallback":false},"umap":true}`. `cd ml && .venv/bin/python -m pytest -q tests`.
**Next step for whoever continues:** After the next Railway deploy, `curl -s https://ml-production-04c0.up.railway.app/health` and compare the `embedder`/`umap` block with a laptop. If both read `fallback:false` and `umap:true`, the clustering difference is confirmed as environment noise and can be left alone.
**Known issues / blockers:** Community structure is not reproducible across machines, so demo the organizer map from whichever server you rehearsed on — the cluster count and labels will differ elsewhere. The deeper fix (pin the numerics, or cache the layout per event instead of recomputing) is out of scope tonight.
**Contract changes:** `/health` response gains `embedder` and `umap` keys. Additive; existing `ok`/`db` unchanged, so nothing that reads it today breaks. docs/api.md does not document `/health`.

## 2026-09-26 12:10 | arjun | Arjun
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

## 2026-09-26 11:45 | alan | Claude Code (Opus 5)
**Task:** Google and X become link-only (Adam's `linkIdentity` path), so they can never create a duplicate account
**Status:** done (`tsc --noEmit` clean; only pre-existing eslint error in `AuthProvider` remains). Providers still need enabling in Supabase.
**What I did:**
- Alan's call after weighing the trade-off: no duplicate accounts. Adam had already built the right mechanism — `connectLoginProvider()` + `components/LoginConnections.tsx` use `supabase.auth.linkIdentity()` to attach a provider to the **current** user. It was already mounted on the accounts screen; it just wasn't the only path in.
- Removed the Google and X buttons from `mobile/app/sign-in.tsx`, and deleted `signInWithGoogle()` / `signInWithX()` from `mobile/lib/auth.tsx`. They were unused after the button removal, and leaving them exported is a trap: calling either reintroduces exactly the duplicate-account bug this change exists to prevent. Left a comment at the deletion site saying so. Sign-in is now LinkedIn, GitHub, or email; Google and X attach afterwards under Profile -> Sign-in accounts.
- **Fixed the same X slug bug in `LoginConnections`** that I had just fixed on the sign-in screen: it gated on `enabled['x']`, which is permanently `undefined` here, so the button read "X not available yet" forever. It now resolves via `xProviderSlug()` (prefers `x`, falls back to legacy `twitter`) and builds its provider list from what the server actually reports, with an explicit empty state when nothing is on.
- Added `LinkableProvider = 'google' | XSlug` so the link path and the component agree on one type.
**How to run/test it:** `cd mobile && npx tsc --noEmit`. On a phone: sign in with LinkedIn or GitHub, then Profile -> Sign-in accounts -> Connect Google; signing out and back in with Google should land on the *same* profile, not a new one.
**Next step for whoever continues:** Enable the providers, neither is on yet. **Google:** OAuth client in Google Cloud Console, authorised redirect `https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback`, then enable Google in Supabase Auth. **X:** our instance only exposes legacy `twitter` (OAuth 1.0a), so the X developer app must have OAuth 1.0a enabled, same callback. Both surface automatically afterwards.
**Known issues / blockers:** `mobile/` is Adam's folder (`app/sign-in.tsx`, `lib/auth.tsx`, `components/LoginConnections.tsx`) — Adam, I deleted two of your exported functions; say the word and I'll restore them behind a comment instead. **The cost of this design:** Google and X cannot create an account, only add a login to an existing one. Someone whose only identity is Google has to start with email magic link, then link Google. That is the price of no duplicates and it is the right trade here, but it is a real UX constraint worth saying out loud in the demo if a judge asks.
**Contract changes:** none

## 2026-09-26 11:30 | arjun | Arjun
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

## 2026-09-26 11:30 | akshar | Akshar

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

## 2026-09-26 11:20 | alan | Claude Code (Opus 5)
**Task:** Google + X sign-in — Adam had already written them; fixed a slug that made the X button unreachable
**Status:** done in code (`tsc --noEmit` clean). **Neither provider is enabled in Supabase yet**, so neither button renders.
**What I did:**
- Asked to add Google and Twitter sign-in, pulled first, and found Adam had already landed `signInWithGoogle()`, `signInWithX()`, `connectLoginProvider()` and the gated buttons. Did not duplicate any of it.
- **Found a bug.** `signInWithX()` passed `'x'`, and the button was gated on `providers.x`. Current Supabase docs do say `'x'` is right for X OAuth 2.0 — but this project's `/auth/v1/settings` has **no `x` key at all**: it lists `twitter` (legacy OAuth 1.0a, disabled) alongside `google`, `github`, `linkedin_oidc`. Our GoTrue predates the `x` provider, so `providers.x` is permanently `undefined` and the X button could never render. Fails safe, but it was dead code.
- Added `xProviderSlug(providers)` in `mobile/lib/auth.tsx`: prefers `'x'`, falls back to legacy `'twitter'`, returns `null` when neither is on. `signInWithX(slug)` takes it; `mobile/app/sign-in.tsx` gates on the resolved slug. Works whether or not the project is later upgraded — no follow-up edit needed.
- Confirmed the one eslint error in `lib/auth.tsx` (`set-state-in-effect` in `AuthProvider`) is pre-existing, by stashing and re-running: same error at line 217 before my change, 225 after.
**How to run/test it:** `cd mobile && npx tsc --noEmit`. Check what the server actually supports: `curl -s -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/settings | python3 -c "import json,sys;print((json.load(sys.stdin).get('external') or {}))"`.
**Next step for whoever continues:** Enable the providers — neither is on. **Google:** create an OAuth client in Google Cloud Console, authorised redirect `https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback`, then enable Google in Supabase Auth with that client id/secret. **X:** our instance only offers the legacy `twitter` provider, which needs an X developer app with OAuth 1.0a enabled and the same callback. Both then appear automatically — no code change, `enabledProviders()` picks them up.
**Known issues / blockers:** `mobile/` is Adam's folder (`lib/auth.tsx`, `app/sign-in.tsx`). Two product notes: this is a further step away from MASTER_SPEC 65/174, which name LinkedIn as *the* sign-in identity; and the more login providers there are, the more likely one person ends up with duplicate accounts when a provider does not return a verified email that matches an existing one. Adam's `connectLoginProvider()` (links an identity to the current user) is the mitigation — worth using rather than adding more standalone sign-in paths.
**Contract changes:** none

## 2026-09-26 10:50 | alan | Claude Code (Opus 5)
**Task:** Signing in with GitHub should not make the user authorize GitHub a second time
**Status:** done (92 passed, 117 skipped; mobile `tsc --noEmit` + `eslint` clean). Still needs the Supabase GitHub provider enabled before it can run.
**What I did:**
- The gap: "Continue with GitHub" created a Supabase identity but left `linked_accounts` empty, so Manage sources still showed GitHub as unconnected and the user authorized GitHub twice — which reads as broken.
- Verified against Supabase's reference docs first: `session.provider_token` **is** returned after `signInWithOAuth`, is **not** persisted across refreshes, and extra scopes go through `options.scopes`. So the token has to be captured at sign-in or it is gone.
- Server (`ml/app/routers/github.py`): new `POST /connect/github/session` (JWT). Takes `{provider_token, scopes?}`, **validates it against GitHub before trusting it** (`github_ingest.get_user`), stores it Fernet-encrypted via a `_store_token()` helper now shared with the OAuth callback, and runs the same background ingestion. The token never goes back to the client.
- Client (`mobile/lib/auth.tsx`, `mobile/lib/api.ts`): `completeAuthFromUrl` now returns the session; `signInWithGitHub()` requests `read:user`, grabs `provider_token`, and posts it. Deliberately best-effort — on failure it warns and the normal Connect GitHub button still works, so sign-in is never blocked by it.
- 4 tests in `ml/tests/test_github_connect.py`: 401 unauthenticated, 200 stores-encrypted-and-ingests (asserts the raw token appears nowhere in the row), 400 when GitHub rejects the token (asserts nothing is written), 422 on an empty token.
- `contract-keeper` confirmed docs, mock, client types, tests and route all agree; no schema change needed (`linked_accounts` already has every column) and no new env var.
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests/test_github_connect.py` (10 passed). Mobile: `npx tsc --noEmit && npx eslint .`.
**Next step for whoever continues:** Enable **GitHub** under Supabase Auth -> Sign In / Providers and add `https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback` as a redirect URI on the `Ov23liFFJ8BwrDTDqrUW` OAuth app. Then sign in with GitHub on a phone and confirm Manage sources already shows GitHub connected, with no second authorization.
**Known issues / blockers:** `mobile/` is Adam's folder — this touches `lib/auth.tsx`, `lib/api.ts`, `app/sign-in.tsx`. Also a **spec deviation worth a decision**: MASTER_SPEC 65 and 174 define GitHub as a data connection and LinkedIn as *the* sign-in identity; GitHub sign-in is not in the spec. Alan asked for it knowing that. Supabase's GitHub provider may issue a token with broader scopes than `read:user` depending on how the provider is configured — the server stores whatever scopes are reported, so keep the provider's scope list tight.
**Contract changes:** `docs/api.md` section 33 gains `POST /connect/github/session` (request `{provider_token, scopes?}`, response `{connected, login}`, error `400 github rejected that token`); new `docs/mocks/connect_github_session.json`. Additive only — no schema change, no env var, nothing renamed. Affects Adam (mobile sign-in) and Arjun (AR1 GitHub ingestion now has a second entry point).

## 2026-09-26 10:30 | akshar | Akshar

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

## 2026-09-26 10:25 | alan | Claude Code (Opus 5)
**Task:** Add "Continue with GitHub" to the sign-in screen (Alan's request) — **edits in Adam's folder**
**Status:** code done, typecheck + lint clean; **dead until the Supabase GitHub provider is enabled**
**What I did:**
- `mobile/lib/auth.tsx`: pulled the OAuth handshake into `signInWithProvider(provider)` (LinkedIn and GitHub were otherwise identical) and added `signInWithGitHub()`.
- `mobile/app/sign-in.tsx`: "Continue with GitHub" as an outline button under LinkedIn; extracted the `SignInKind` union so `busy` covers the new state.
- `mobile/lib/accounts.ts`: `signInLabel('github') -> 'GitHub'` so Manage sources doesn't render a raw provider string.
- Ran `npm install` first — `expo-clipboard` had landed in `package.json` after my earlier install and was failing typecheck for an unrelated reason.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint .` (both clean). On a phone the button 400s until the provider below is enabled.
**Next step for whoever continues:** Enable **GitHub** under Supabase Auth -> Sign In / Providers, and add `https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback` as a redirect URI on a GitHub OAuth app (the existing `Ov23liFFJ8BwrDTDqrUW` app can carry it alongside the Railway callback). Until then the button fails.
**Known issues / blockers:** Two things Adam should weigh, since this is his area and his call. (1) **Spec deviation** — MASTER_SPEC 65 and 174 define GitHub as a data connection and LinkedIn as the sign-in identity; GitHub sign-in is not in the spec. (2) **Double authorization** — signing in with GitHub creates a Supabase identity but does **not** write `linked_accounts`, which is what `/connect/github` populates. A user who signs in with GitHub will still see "Connect GitHub" as unconnected and authorize GitHub a second time. Worth either wiring sign-in to seed `linked_accounts`, or relabelling the connect step so the repeat isn't confusing. Adam was pushing to `mobile/` while I wrote this — conflict risk is real; revert freely if it cuts across his onboarding work.
**Contract changes:** none

## 2026-09-26 10:05 | alan | Claude Code (Opus 5)
**Task:** Verify Adam's Railway redeploy; record two findings that were only living in a chat window
**Status:** redeploy confirmed good; one open question on Railway, one gap in push
**What I did:**
- **Railway redeploy verified.** `/health` `{"ok":true,"db":true}`; cold `/dashboard/1` **6.0 s** then 0.4 s warm (Akshar measured 96 s before `2ce6860`), 80 attendees present. Route parity with local on `/me/accounts`, `/connect/github/start`, `/assistant/chat`, `/suggestions`, `/conversations/pending` (401/405 on both), so the deployed build is current. Akshar's demo-blocker is cleared.
- **Open question — Railway and a laptop cluster the same 80 people differently.** local `[20,20,12,15,8,5]` (6 clusters) vs Railway `[65,14,1]` (3, one 65-person blob). Both deterministic over 3 requests each, so not randomness. Ruled out: clustering params are not env-tunable (only `EMBED_MODEL`/`EMBED_DEVICE`/LLM ids are), `ml/Dockerfile` bakes bge-small in with `HF_HUB_OFFLINE=1`, and route parity rules out a stale build. **Two diagnostics for whoever has Railway access:** grep the deploy logs for `[embed] sentence-transformers unavailable` (that fallback is the hashed n-gram embedder — `ml/ml/embed.py` calls it "fine for testing plumbing, NOT for demo", and it would explain the blob), and confirm `EMBED_MODEL` is not overridden in Railway variables. If both are clean, the likely remainder is float differences between torch builds amplified by UMAP/HDBSCAN. Matters because the organizer map is a headline demo visual.
- **Push notifications are half-built and will not work in the demo.** Server side is done (`ml/app/push.py` worker every 5 s, `push_tokens` migrated), but the client never registers: `expo-notifications` is absent from `mobile/package.json` and nothing under `mobile/app|lib|features` calls `getExpoPushTokenAsync`, so the worker has no tokens to send to. Finishing it is client work plus a dev-client rebuild, and Android standalone builds would additionally need Firebase/FCM credentials in EAS (`eas.json` builds Android APKs). Firebase is not used anywhere else and is not needed for GitHub connect.
**How to run/test it:** `curl -s https://ml-production-04c0.up.railway.app/health`. Compare clustering across hosts: `curl -s <host>/dashboard/1 | python3 -c "import json,sys;d=json.load(sys.stdin);print([c['size'] for c in d['clusters']])"`.
**Next step for whoever continues:** Complete one GitHub connect on a phone against Railway (sign in with LinkedIn -> Profile -> Manage sources -> Connect GitHub). Still the only unproven path; failures come back on the deep link as `reason=oauth` (state/exchange) or `reason=denied`.
**Known issues / blockers:** The clustering divergence above. `dashboard/.env.local` points at `localhost:8000`, which is what produces the nicer 6-cluster map — decide deliberately whether to demo the dashboard off the laptop (better visual, laptop dependency) or off Railway. GitHub client secret and the Supabase DB password were pasted into a chat transcript; rotate after the hackathon, coordinating the DB one with Adam since Railway's `DATABASE_URL` embeds it.
**Contract changes:** none

## 2026-09-26 10:00 | akshar | Claude Code (Opus 5.5)

**Task:** Tap works port-to-port; checklist shows common interests; QR error follow-up

**Status:** in progress (code pushed; needs the Railway redeploy + a Release rebuild; waiting on the exact QR error text)

**What I did:**
- Tap: the app threshold is now -58 dBm (back-to-back reads about -30 to -45, port-to-port weaker). The server check is a looser floor of -65, set by the `TAP_RSSI_DBM` env var. The Tap screen shows the live signal ("Signal -52 dBm (touching counts at -58 or stronger)") so the team can calibrate by holding positions. Still mutual claims within 15 s, 2 s hold.
- Checklist: verified live with two throwaway accounts: manual interests → AI extraction → QR verify → checklist `['reinforcement learning', 'rock climbing']`. The phone accounts (akshar.exe, arjunkattragadda) have 0 interests, so their checklist has nothing shared. Fix = data: Profile → Edit profile ("Your sources") → type interests or upload a resume → Save, on both phones.

**How to run/test it:** `cd mobile && node --experimental-strip-types --test features/ble/tap.test.mjs` (5 pass); `cd ml && pytest tests/test_tap.py` (6 pass).

**Next step for whoever continues:** Adam redeploys `ml` (REQUESTS). Rebuild both iPhones (`npx expo run:ios --device --configuration Release`). Both add interests with some overlap. Tap port-to-port and note the dBm shown; if port-to-port reads weaker than -58, lower `TAP_RSSI_DBM` in `mobile/features/ble/tap.ts`.

**Known issues / blockers:** QR "error pulling up the code": need the exact text. It may have been the null-name crash (fixed by data + code).

**Contract changes:** none

## 2026-09-26 09:30 | akshar | Claude Code (Opus 5.5)

**Task:** Fix crash after tap verify on the iPhones ("Cannot read property 'split' of null")

**Status:** done (data fix live now; code fix ships with the next Release rebuild)

**What I did:**
- Cause: both phone accounts came from email sign-in, so `profiles.name` was null. The verify screen's Avatar (and ~15 other places) called `name.split(...)`. The tap verification itself had succeeded on the server.
- Code: `firstName()` helper + null-safe `Avatar` in `mobile/components/ui.tsx`; patched every `name.split` in app/ and features/ (connections, match, Home, meetup, MeetupBanner, graph model + Atom, NearbyMap, ChecklistForm, verify).
- Data: set `profiles.name = split_part(email,'@',1)` for the only 2 of 84 profiles with no name (Akshar approved), then refreshed the live event cache. The live matches list now has 0 nameless people.

**How to run/test it:** `cd mobile && npx tsc --noEmit && npx expo lint`. Phones: force-quit, reopen → Tap phones → the checklist shows the other person's name.

**Next step for whoever continues:** Rebuild the Release app on both iPhones (also needed for `expo-clipboard`, a new native module on main): `cd mobile && npm install && npx expo run:ios --device --configuration Release`.

**Known issues / blockers:** New email sign-ups still get no name until onboarding asks for one (REQUESTS → Adam).

**Contract changes:** none

## 2026-09-26 09:20 | alan | Claude Code (Opus 5)
**Task:** AL1 stability — server aborted mid-session on an Apple GPU assertion; LinkedIn + GitHub config verified
**Status:** done (local, Railway and tunnel all `{"ok":true,"db":true}`; 71 passed, 108 skipped)
**What I did:**
- The local uvicorn died with SIGABRT: `failed assertion _status < MTLCommandBufferStatusCommitted at -[IOGPUMetalCommandBuffer setCurrentCommandEncoder:]`. `SentenceTransformer(EMBED_MODEL)` took no `device`, so on an M-series Mac it auto-selected the **MPS** backend, and bge-small on MPS aborts the whole process once the background workers call it concurrently. Added `EMBED_DEVICE` (default `cpu`) in `ml/ml/config.py` and passed it in `ml/ml/embed.py`. Verified 384-dim unit-normalized output, then 30 s of polling with workers running and zero Metal errors. macOS-only — Railway has no GPU — and pinning CPU also keeps laptop vectors identical to Railway's, which writes the same pgvector column.
- **LinkedIn OIDC verified live**: `GET /auth/v1/settings` now returns `external: {email, linkedin_oidc}` (OIDC, not the legacy `linkedin`, matching `signInWithOAuth({provider:'linkedin_oidc'})`). Real people signed in.
- **Proved the `TOKEN_ENCRYPTION_KEY` mismatch and fixed it.** Railway's key differed from this laptop's. Without knowing Railway's value: sign an OAuth `state` with the laptop key, send it to Railway's callback with a junk `code`, and time the redirect — a rejected signature returns immediately, an accepted one first round-trips to GitHub. Before: +0 ms (differ). After Alan copied Railway's value into `.env`: +207 ms (match).
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests`. Service: `ml/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`.
**Next step for whoever continues:** Complete one GitHub connect on a phone (sign in with LinkedIn -> Profile -> Manage sources -> Connect GitHub). Every piece is verified but the end-to-end flow has never run to completion; on failure the deep link carries `reason=oauth` (state/exchange) or `reason=denied` (user cancelled).
**Known issues / blockers:** `mobile/.env` still points at Alan's trycloudflare tunnel — switch `EXPO_PUBLIC_API_BASE_URL` to `https://ml-production-04c0.up.railway.app` before demo day so the demo doesn't depend on a laptop staying awake. The dashboard's "Should be talking, aren't" panel reads `0 made` on every row until someone completes a verified conversation. GitHub client secret and the Supabase DB password were both pasted into a chat transcript — rotate after the hackathon (the DB one needs coordinating with Adam, since Railway's `DATABASE_URL` embeds it).
**Contract changes:** `.env.example` gains `EMBED_DEVICE` (optional, defaults to `cpu`). Additive; nothing renamed or removed.

## 2026-09-26 09:10 | akshar | Claude Code (Opus 5.5)

**Task:** Verify the HTTP 500 fix on the live server after Adam's Railway redeploy

**Status:** done (live API healthy; phones should now work; one intermittent stall left for Adam to check in the Railway logs)

**What I did:**
- Live replay with two throwaway accounts (created and deleted with the admin key, never printed): check-in 0.9 s, Open to Meet 0.8 s, suggestions 0.4 s, matches 3.7 s (was 96 s), `/ble/tokens` 1.0 s (was 41 s), tap claim → verified ~2 s, QR verify ~1.8 s. 5 runs over 6 minutes.
- Intermittent: 3 single requests hung ~60 s in the first ~12 minutes after the deploy. A 9-minute probe afterwards showed no hangs, only `/health` at 3-7 s a few times while a no-DB 404 stayed instant (so the process isn't frozen; it's waiting on the DB pool or threads). I tested and discarded a "move UMAP to a subprocess" change: locally UMAP doesn't block other threads, so it wasn't the cause.

**How to run/test it:** `curl -s https://ml-production-04c0.up.railway.app/health`; phone sequence in the entry below.

**Next step for whoever continues:** Phones: force-quit and reopen the app → Nearby → Event Mode ON on both → Tap phones. Rebuild the Release app when convenient to pick up the mobile hardening (30 s timeout, no stacked polls, Event Mode error text), which keeps a brief server stall from snowballing.

**Known issues / blockers:** The ~60 s stall cause is unconfirmed without the Railway logs (asked Adam in REQUESTS). Don't redeploy right before or during the demo.

## 2026-09-26 09:00 | akshar | Claude Code (Opus 5.5)

**Task:** Diagnose HTTP 500s on the two-iPhone Release build (Nearby, Home check-in / Open to Meet, Event Mode, Tap, QR)

**Status:** fixed in code; NEEDS A RAILWAY REDEPLOY of the `ml` service to take effect

**What I did:**
- Root cause: two slow endpoints on the live server. `POST /ble/tokens` took **41 s** (my per-row queries: ~290 round trips at ~150 ms Railway→Supabase) and a cold `GET /events/1/matches` took **96 s** (~500 one-sentence embedding calls for ~80 attendees after every restart, with concurrent requests each starting their own build). The phones poll matches every 15 s, so requests piled up, the 10-connection pool / thread pool starved, and every endpoint failed with a plain 500 (no JSON body → the app shows "HTTP 500"); `/health` itself hung for minutes.
- Verified it was not auth or config: `mobile/.env` points at Railway with the publishable key and mocks off; both phones were signed in as different users (profiles exist, not checked in, zero BLE tokens ever issued); bad or missing tokens correctly return 401 JSON; all 9 migrations are applied; DB connections were healthy. With throwaway accounts (created with the admin key and deleted afterwards), the full flow worked on the live server, just slowly.
- Fixes: `ml/app/routers/ble.py` issues tokens and ingests sightings in constant round trips (3 statements, verified with statement logging). `ml/app/population.py` does one build per event at a time and batch-embeds all texts first (6× faster locally, same vectors); `tests/test_event_model_singleflight.py`. Mobile: 30 s API timeout with a readable error, no stacked matches polls, Event Mode reports why Bluetooth failed instead of "Starting Bluetooth..." forever.
- Deploy: GitHub pushes don't deploy the live `ml` service (all 26 GitHub-triggered deploys belong to a misconfigured `hackgt13-project` service and failed). REQUESTS.md asks Adam to run `cd ml && npx @railway/cli up --detach --path-as-root .`.

**How to run/test it:** Backend: 177 tests pass (`TEST_DATABASE_URL=... pytest -q tests`, minus the 2 libomp LightGBM tests). After the redeploy, a new account's `POST /ble/tokens` should take about 1 s, not 41 s.

**Next step for whoever continues:** Adam redeploys `ml` → phones: sign in → Nearby → Event Mode ON on both → Tap phones. A mobile rebuild is optional (the fixes above are UX hardening); the server fix alone unblocks the existing Release builds.

**Known issues / blockers:** No Railway access from Akshar's Mac. The first matches request after each redeploy still does one cold build (now ~6× faster), and the background clusters job starts it at boot.

**Contract changes:** none

## 2026-09-26 07:55 | alan | Claude Code (Opus 5)
**Task:** AL1 finish — every server credential verified live on Alan's Mac; dashboard running against real data
**Status:** done locally (`/health` = `{"ok":true,"db":true}`); GitHub connect on Railway still needs 4 env vars
**What I did:**
- Filled the root `.env` and verified each value rather than trusting it: `DATABASE_URL` (probed both `aws-0`/`aws-1-us-east-1` pooler hosts since both resolve — `aws-0` authenticates, PostgreSQL 17.6), `SUPABASE_SERVICE_KEY` (HTTP 200 on GoTrue admin + Storage REST), `ANTHROPIC_API_KEY` (real call; `claude-sonnet-5` and `claude-haiku-4-5-20251001` both served), GitHub OAuth (callback / `read:user` scope / state signing / Fernet round-trip).
- `mobile/.env` was missing both Supabase values, so the phone could not sign in at all — filled and verified the anon key against `/auth/v1/settings`. That call also showed **only the `email` provider is enabled, no `linkedin_oidc`**, even though `mobile/app/sign-in.tsx` offers a LinkedIn button (noted for Adam in REQUESTS.md).
- `dashboard/` had no `node_modules` and no `NEXT_PUBLIC_ML_API_URL`; installed deps and added a gitignored `.env.local`. It still would have rendered empty: the dev server runs on **3100** but `CORS_ORIGINS` only listed 3000/8081/19006, so the browser dropped every response (request returns 200, just no allow-origin header). Added 3100 to the default in `app/settings.py`. `/map` now shows 80 attendees, 6 communities, live gap analysis.
- Toolchain on this Mac: `uv` + Python 3.12 (`ml/.venv`), `cloudflared`, Node 22, `gh` — all under `~/.local/bin`, no Homebrew, no sudo.
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests` (69 passed, 108 skipped — DB tests need a throwaway Postgres). Service: `ml/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`; dashboard: `npm --prefix dashboard run dev -- --port 3100`.
**Next step for whoever continues:** Set four variables on the Railway `ml` service so GitHub connect works there: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ML_API_URL=https://ml-production-04c0.up.railway.app`, and `TOKEN_ENCRYPTION_KEY`. Then add `https://ml-production-04c0.up.railway.app/connect/github/callback` to the OAuth app's redirect URIs.
**Known issues / blockers:** **`TOKEN_ENCRYPTION_KEY` must be byte-identical on Railway and any laptop server** — both write `linked_accounts.access_token_enc` to the same Supabase database, so a mismatch means whichever server didn't encrypt a token cannot decrypt it. Generating a fresh one for Railway silently breaks GitHub ingestion for anyone who connected via the other server. It also must never be rotated once tokens exist. Separately: two servers (laptop + Railway) now write to the same production database — be deliberate about which one the phone points at. `TEST_DATABASE_URL` must never point at Supabase; the DB test suite wipes its target.
**Contract changes:** none (`app/settings.py` default CORS list gained `http://localhost:3100`; no env var added or renamed)

## 2026-09-26 07:00 | akshar | Akshar

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

## 2026-09-26 06:50 | alan | Alan
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

## 2026-09-26 06:27 | arjun | Codex
**Task:** AR6 / AD11 — simplify navigation and restore floating AI
**Status:** done
**What I did:**
- Per user request, replaced the AI tab with a bottom-left floating message button containing the constellation logo. Mounted it at the signed-in root so secondary stack screens also have access; hidden in the assistant itself and while typing.
- Promoted Constellation and Nearby to direct primary tabs, alongside Feed, Events and Profile. Removed the redundant Discover launcher card. Kept original Home functions under Nearby's Meeting activity & Open to Meet action.
- Kept old AI route as a redirect and existing assistant query links intact. Added bottom scroll space on Feed, Events and Profile and protected the launcher from SVG pointer interception.
- Mobile owner files changed under explicit user authorization; no backend or dependency changes.
**How to run/test it:** `cd mobile && npm run typecheck && npm run lint`; `npx expo export --platform ios --output-dir /tmp/constellation-nav-ios`. Passed. Existing browser preview verified direct Constellation/Nearby destinations and assistant modal keyboard activation.
**Next step for whoever continues:** Reload Expo from this clone. Validate floating launcher taps and native modal stacking on an iPhone; desktop browser pointer automation was unreliable, so keyboard navigation was used for interaction checks.
**Known issues / blockers:** No physical iPhone test performed. Existing sample-event and installed-app release limitations remain unchanged.
**Contract changes:** none

## 2026-09-26 06:14 | arjun | Codex
**Task:** AR6 / AD11 — user-requested Constellation mobile redesign
**Status:** done
**What I did:**
- Updated the existing mobile app (Adam/Akshar-owned mobile files at the user's explicit request): shared navy/white light-only theme, constellation vector branding, vector icons, photo avatars with initials fallback, and branded loading states. No new site or dependencies.
- Made Feed the default route; preserved old Home as Discover. Five primary tabs: Feed, Discover, AI Chat, Events, Profile. Graph, Nearby, Messages, profile editing, verification and invites remain reachable; existing route aliases remain intact.
- Graph colors now follow actual shared-interest facets consistently. Line opacity/weight represents existing score; straight star connections replace orbital ellipses. Person sheets retain server-backed interests, meeting context and recorded conversation topics, with clearly labeled profile-overlap strength.
- Added sample event catalog adapter, category filters, event details, and per-account local RSVP/cancellation persistence. Sample status is explicit; RSVP never creates real attendance or contacts organizers. Backend contracts unchanged.
- Verified main screens in the existing Expo web preview at phone width; fixed clipped tab labels and SVG web warnings. Verified event RSVP persists across reload; feed refresh deduplicates new posts.
**How to run/test it:** `cd mobile && npm run typecheck && npm run lint && npm run test:demo`; `npx -y tsx --test features/graph/atomLayout.test.mjs`; `npx expo export --platform ios --output-dir /tmp/constellation-ios-final`. Typecheck/lint, 15 demo checks, 2 layout tests and iOS export pass. Existing preview: http://localhost:8081 (this clone); demo checked manually through Feed, Discover, graph/person sheet, AI Chat, Events/RSVP, Profile and Messages.
**Next step for whoever continues:** Reload the existing Expo app to see this commit. Physical-device validation is still needed; rebuild the native client to apply app display-name/light-appearance configuration. To add live event registration later, replace `mobile/features/events/catalog.ts` only after a listings/RSVP API exists.
**Known issues / blockers:** Events are explicitly sample/local, not live registrations. No EAS project/update pipeline is configured, so GitHub push does not distribute an installed-app release. iOS bundle validated; no physical-device test claimed. No teammate servers restarted.
**Contract changes:** none

# Progress log

## 2026-09-26 06:10 | arjun | Arjun
**Task:** AR4 deploy + AD9 embed (Arjun)
**Status:** done (dashboard live; app wired)
**What I did:**
- Deployed `dashboard/` to Vercel production: https://formal-connection-dashboard.vercel.app (/graph, /me, /insights, /map), public, HTTPS. Vercel team `hackgt13`, project `formal-connection-dashboard`.
- `mobile/lib/env.ts` default `DEFAULT_DASHBOARD_URL` already points there, so the Graph tab and Profile -> Your network / Feed insights load it in Expo Go with no extra env.
**How to run/test it:** `cd mobile && npm install && npx expo start` -> Expo Go -> Graph tab. Redeploy dashboard: `cd dashboard && npx vercel@latest deploy --prod --yes`.
**Next step for whoever continues:** Pages show preview (mock) data until the app points at a live ML server (EXPO_PUBLIC_API_BASE_URL + EXPO_PUBLIC_USE_MOCKS=0); then they call /graph, /me/dashboard, /feed/insights with the user's token. Vercel auto-deploy on git push is NOT connected (needs the repo owner, Adam, to install the Vercel GitHub app): until then, redeploy manually after dashboard changes.
**Known issues / blockers:** Supabase keys + GitHub OAuth app still needed for real data (see older entries).
**Contract changes:** none

## 2026-09-26 05:50 | adam | Adam
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

## 2026-09-26 05:45 | adam | Adam
**Task:** Infra: Railway deploy for ml + auto-update mobile/.env
**Status:** done
**What I did:**
- Added `ml/Dockerfile` (Python 3.12-slim, CPU torch, pre-bakes `BAAI/bge-small-en-v1.5`, uvicorn on `$PORT`), `ml/.dockerignore`, and `ml/railway.json` (Dockerfile builder, `/health` check, 300s timeout).
- Wrote `docs/deploy.md` (plain Railway click-by-click for Adam) and extended AGENTS.md ml run/deploy commands.
- `scripts/start-ml.sh` + `scripts/set-mobile-api-url.py` now set `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_USE_MOCKS=0` in `mobile/.env` when cloudflared prints a URL (macOS-safe Python rewrite).
**How to run/test it:** `python3 scripts/set-mobile-api-url.py https://example.trycloudflare.com /tmp/test.env` (temp file). Local ML: `./scripts/start-ml.sh`. Railway: follow `docs/deploy.md`. Docker smoke (laptop): `docker build -t fc-ml ml && docker run --rm -p 8000:8000 -e DATABASE_URL=postgresql://invalid fc-ml` then `curl localhost:8000/health` (not run here: Docker socket permission denied in cloud VM).
**Next step for whoever continues:** Adam completes Railway deploy per `docs/deploy.md`, posts the permanent URL in chat, and sets GitHub OAuth callback + `ML_API_URL`. Teammates set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env`.
**Known issues / blockers:** Cloud agent could not `docker build` (permission denied on `/var/run/docker.sock`). Trained pickles under `ml/data/` are not in the image; encounter classifier retrains at runtime, ranker uses V1 unless `MATCH_MODEL=lr` and a pickle is added later.

## 2026-09-26 05:40 | akshar | Akshar

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

## 2026-09-26 05:31 UTC | adam | Adam
**Task:** AD1 Supabase project
**Status:** done
**What I did:** Live check via `npx supabase db query --linked` on Adam's Mac: 36/36 public tables have RLS; missing_rls NULL; HackGT 13 seed event present; all 9 migrations applied (…00001–…00009 including push_tokens). Local `./supabase/tests/run-local.sh` also ALL AD1 CHECKS PASSED. No Supabase MCP on the cloud VM; this CLI query is the live evidence.
**How to run/test it:** `./scripts/check-ad1-live.sh` or the npx query in AGENTS.md.
**Next step for whoever continues:** AD2/AD3 leftover on a phone: magic-link sign-in after auth redirects (already on live); Expo via `./scripts/start-app.sh`; Railway deploy per docs/deploy.md if not done.
**Known issues / blockers:** Cloud VM still has no Supabase MCP. Goal asked for MCP; CLI --linked is the available live proof.
**Contract changes:** none

## 2026-09-26 05:30 UTC | adam | Adam
**Task:** AD1 Supabase project
**Status:** in progress
**What I did:**
- Added `./scripts/check-ad1-live.sh`: finds repo root, runs the linked one-line AD1 SQL (tables/RLS/seed/migrations), prints three-line expected output so Adam does not paste stale `db push` or `start-ml.sh` logs.
- Documented the script on the AGENTS.md supabase run-and-test line.
**How to run/test it:** From repo root on a linked Mac: `./scripts/check-ad1-live.sh`
**Next step for whoever continues:** Adam runs `./scripts/check-ad1-live.sh` from ~/hackgt-project and pastes output.
**Known issues / blockers:** Live query still requires Adam's machine (`npx supabase login` + link); this VM has no linked Supabase credentials.
**Contract changes:** none

## 2026-09-26 05:30 | adam | Adam
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

## 2026-09-26 05:05 UTC | adam | Adam
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

## 2026-09-26 05:00 | akshar | Akshar

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

## 2026-09-26 04:55 UTC | adam | Adam
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

## 2026-09-26 04:55 | adam | Adam
**Task:** Each laptop runs the app and makes its own Expo QR
**Status:** done
**What I did:**
- Added `scripts/phone-qr.sh`. On a clean `main` it pulls, starts Expo through a tunnel, writes `~/Desktop/formal-connection-expo.png`, and prints `PHONE_URL`.
- Asked Alan, Arjun, and Akshar in REQUESTS.md to run that script instead of scanning someone else's QR.
**How to run/test it:** `bash -n scripts/phone-qr.sh`. On a laptop: `./scripts/phone-qr.sh`, then scan the Desktop PNG with Expo Go.
**Next step for whoever continues:** Alan, Arjun, Akshar: run `./scripts/phone-qr.sh` and leave it open.
**Known issues / blockers:** The QR only works while that laptop stays awake. Campus Wi-Fi still cannot use the LAN script `scripts/start-app.sh`.
**Contract changes:** none

## 2026-09-26 04:40 | adam | Adam
**Task:** AD2 sign-in for every phone, not only a filled-in mobile/.env
**Status:** done
**What I did:**
- The publishable Supabase URL, anon key, and Railway API address are now the defaults in `mobile/lib/env.ts` and `mobile/.env.example`. A blank `mobile/.env` still signs into the team project.
- Sign-in accepts the email code in the app (`verifyEmailCode`) when the phone's mail app will not open the magic link.
**How to run/test it:** Reload Expo Go on `exp://bej2jrm-adamissac-8081.exp.direct`. LinkedIn opens LinkedIn and returns through `https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback`. Email: send a link, then open it on that phone or type the code.
**Next step for whoever continues:** If LinkedIn still rejects a teammate, add that LinkedIn account on the developer app (client id `78lllikuxa9uve`, app id `266531181`). The Supabase provider is already enabled.
**Known issues / blockers:** none in the app. LinkedIn may still limit sign-in to people listed on that developer app.
**Contract changes:** none

## 2026-09-26 04:30 UTC | alan | Alan
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

## 2026-09-26 04:30 | akshar | Akshar

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

## 2026-09-26 04:27 UTC | alan | Alan
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

## 2026-09-26 04:20 UTC | alan | Alan
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

## 2026-09-26 04:18 UTC | alan | Alan
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

## 2026-09-26 04:15 UTC | alan | Alan
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

## 2026-09-26 04:09 UTC | alan | Alan
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

## 2026-09-26 04:08 UTC | alan | Alan
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

## 2026-09-26 04:05 UTC | alan | Alan
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

## 2026-09-26 04:03 UTC | alan | Alan
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

## 2026-09-26 03:59 UTC | alan | Alan
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

## 2026-09-26 03:55 UTC | alan | Alan
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

## 2026-09-26 03:51 UTC | alan | Alan
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

## 2026-09-26 03:47 UTC | alan | Alan
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

## 2026-09-26 03:43 UTC | alan | Alan
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

## 2026-09-26 03:38 UTC | alan | Alan
**Task:** Kit unblock: add MASTER_SPEC.md (pre-AL1)
**Status:** done
**What I did:**
- Added `MASTER_SPEC.md` at the repo root, converted from the team's spec PDF (text extraction; some tables lost alignment, the PDF is the original).
- Agent work for Alan lives on branch `claude/quirky-euler-dnbsgt` (merge into main when ready).
**How to run/test it:** `less MASTER_SPEC.md` (Section 13 = build order, Section 6 = ML spec).
**Next step for whoever continues:** Start AL1: create `ml/app/main.py` (FastAPI + `/health`), `ml/app/auth.py` (Supabase JWT via PyJWT), `ml/app/db.py` (psycopg pool).
**Known issues / blockers:** Supabase project ref still unset in `.mcp.json` (Adam).
**Contract changes:** none

## 2026-09-26 03:32 | adam | Adam
**Task:** Document where every API key comes from for Alan / Arjun / Railway
**Status:** done
**What I did:**
- Added `docs/secrets-setup.md`: click-by-click for Supabase URL/anon/service/DATABASE_URL, Anthropic, GitHub OAuth, signing keys, Railway variables, and `mobile/.env`. No secret values in the file.
- Linked it from `docs/deploy.md` and pointed Alan’s open ask at §4 / §8.
**How to run/test it:** Open `docs/secrets-setup.md`. Teammates fill a local `.env` from it; never commit the values.
**Next step for whoever continues:** Alan: do the open `(from adam)` ask (callback + AirDrop three values). Adam: when they arrive, set them on Railway `ml`.
**Known issues / blockers:** none for the doc itself.
**Contract changes:** none

## 2026-09-26 03:26 | adam | Adam
**Task:** Fix the Alan GitHub/Railway ask (Alan has no Railway access)
**Status:** done
**What I did:**
- Rewrote Alan's open ask: he only adds the Railway callback on the GitHub OAuth app and privately sends `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `TOKEN_ENCRYPTION_KEY` to Adam. Adam sets them on Railway.
- Added a matching open item under Adam's `REQUESTS.md` section for when those values arrive.
**How to run/test it:** After Adam sets the vars, Profile → Manage sources → Connect GitHub on a phone against `https://ml-production-04c0.up.railway.app`.
**Next step for whoever continues:** Alan: do the open `(from adam)` item (callback + private send). Adam: when the three values arrive, run `cd ml && npx @railway/cli variable set NAME --stdin` for each.
**Known issues / blockers:** Do not put the client secret in git or chat.
**Contract changes:** none

## 2026-09-26 03:25 | adam | Adam
**Task:** Ask Alan to finish GitHub connect on Railway
**Status:** superseded (Alan has no Railway login; see 03:26 entry)
**What I did:**
- Added an open ask in Alan's `REQUESTS.md` section: add the Railway callback on the GitHub OAuth app, then set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (and confirm `ML_API_URL` + `TOKEN_ENCRYPTION_KEY`) on the Railway `ml` service. Secret stays out of git and chat.
**How to run/test it:** After Alan marks it done, on a phone open Profile → Manage sources → Connect GitHub against `https://ml-production-04c0.up.railway.app`.
**Next step for whoever continues:** See the 03:26 entry. Alan does not set Railway vars.
**Known issues / blockers:** GitHub connect stays off on Railway until those vars are set. `GITHUB_CLIENT_SECRET` must not be committed.
**Contract changes:** none

## 2026-09-26 03:05 | adam | Adam
**Task:** Commit history shows the four teammates, not the tools
**Status:** done
**What I did:**
- Past commits authored as Claude are now Alan (`m-alan08`). Past commits authored as Cursor are now Adam. Akshar's `.local` email is his gmail. Co-authored-by lines for those tools are removed, because GitHub counts them as contributors.
- `.githooks/commit-msg` strips those lines on future commits.
**How to run/test it:** `git log --format='%an <%ae>' | sort | uniq -c`. GitHub contributors should be Adam, Alan, Arjun, and Akshar after the history update.
**Next step for whoever continues:** If your local `main` rejects a pull, run `git fetch origin && git reset --hard origin/main` on a clean checkout. Do not merge the old history back in.
**Known issues / blockers:** Teammates with unpushed commits must rebase them onto the updated `main`. The old `claude/quirky-euler-dnbsgt` and `adami/ad1-verify-fe21` branches are already merged and should be deleted.
**Contract changes:** none

## 2026-09-26 02:55 | adam | Adam
**Task:** Put the ML API on Railway so a laptop does not have to stay on
**Status:** done
**What I did:**
- Filled the gitignored root `.env` and `mobile/.env` from the secrets already on this Mac. `SUPABASE_JWT_SECRET` stays empty (JWKS). `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are not on this Mac (Alan has them on his laptop).
- Railway project `formal-connection`, service `ml`, domain `https://ml-production-04c0.up.railway.app`. `GET /health` returns `{"ok":true,"db":true}`. The public domain targets port 8080 because that is the `PORT` Railway gave the process.
- `mobile/.env` now has `EXPO_PUBLIC_API_BASE_URL` set to that domain and `EXPO_PUBLIC_USE_MOCKS=0`.
**How to run/test it:** `curl -s https://ml-production-04c0.up.railway.app/health`. Redeploy after `ml/` changes: `cd ml && npx @railway/cli up --detach --path-as-root .`
**Next step for whoever continues:** On Alan's laptop, add callback `https://ml-production-04c0.up.railway.app/connect/github/callback` to the existing GitHub OAuth app, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the Railway `ml` service from his root `.env` (`cd ml && npx @railway/cli variable set GITHUB_CLIENT_ID --stdin`). Do not paste them into chat or commit them.
**Known issues / blockers:** GitHub connect on the Railway URL stays off until those two variables are set there. GitHub auto-deploy is not connected; root directory must be `ml` before connecting the repo, or the build will miss the Dockerfile.
**Contract changes:** none

## 2026-09-26 02:45 | adam | Adam
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

## 2026-09-26 02:37 | adam | Adam
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

## 2026-09-26 02:28 | adam | Adam
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

## 2026-09-26 02:11 | adam | Adam
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

## 2026-09-26 02:10 | adam | Adam
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

## 2026-09-26 01:45 | arjun | Arjun
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

## 2026-09-26 01:30 | arjun | Arjun
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

## 2026-09-26 01:20 | arjun | Arjun
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

## 2026-09-26 01:15 | adam | Adam
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

## 2026-09-26 00:45 | arjun | Arjun
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

## 2026-09-26 00:30 | adam | Adam
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

## 2026-09-26 00:20 | arjun | Arjun
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

## 2026-09-26 | arjun | Claude Code
**Task:** AR6 + matching / match scores spread out (everyone was ~50%), common skills in Constellation list
**Status:** done (needs Railway redeploy to go live)
**What I did:**
- Cause: bge-small cosine similarity is compressed. On the 80-person HackGT population (SYNTHETIC data), raw facet similarities sat at p10 0.67-0.77 and p90 0.85-0.90 for everyone, while real shared interests (`idf_overlap`, median 0.03) had only 20% weight. So 80% of V1 scores fell between 0.50 and 0.60.
- `ml/ml/config.py` + `ml/ml/scoring.py` (Alan's area, noted): features are calibrated before weighting. Facet sims are rescaled from `SIM_RANGE` (0.60, 0.95) to 0..1, complementarity from `COMPLEMENT_RANGE` (0.45, 0.85), and `idf_overlap / OVERLAP_FULL` (0.20), capped at 1. V1 weights now favor shared niche interests (0.30).
- Evaluation on SYNTHETIC data (80 people, teammates as ground truth): teammate hit@5 0.994 before and after; teammate-vs-rest AUC 0.998 before, 0.992 after; score std 0.047 before, 0.113 after; range 0.35-0.79 before, 0.16-0.84 after (median 0.37). Ranking quality is unchanged, and the percentages are now meaningful.
- Suggestions use per-user percentile cutoffs, so they're unaffected. A trained `ranker_lr.pkl` (only if `MATCH_MODEL=lr`) was trained on the old uncalibrated features: retrain with `python scripts/train_ranker.py --source auto` before serving it.
- `mobile/app/(tabs)/graph.tsx`: rows in "More people you could meet" show up to 4 common skills as light-blue chips plus the "why you matched" sentence (`explanation.summary` from the graph edge).
**How to run/test it:** `cd ml && .venv/bin/python -m pytest -q tests` (130 passed; the ranker_job test needs libomp locally, see AGENTS.md). Redeploy: `cd ml && npx @railway/cli up --detach --path-as-root .`
**Next step for whoever continues:** Redeploy ml to Railway (this laptop isn't logged in to Railway). Then check that /graph scores for a real account vary.
**Known issues / blockers:** Accounts with very few interests will still score low and flat against everyone (nothing to match on). The fix there is a richer profile (GitHub/resume), not the formula.
**Contract changes:** none (score stays 0..1; values are distributed differently)

## 2026-09-26 | alan | Codex
**Task:** Finish Claude's match explanations and make extraction less opaque
**Status:** done (code); live deployment / phone smoke test pending
**What I did:**
- Continued a74fe37/e7a1dfa after syncing team commits through 647e3f5. Graph UI now consumes actual summary/factors/basis and identifies AI rewording versus numeric scoring. Fixed graph builder losing learned-ranker attribution (it previously mislabeled every explanation V1).
- Quick-profile returns an additive explanation derived from its exact V1 features. Full profile shows all signed score contributions; graph shows top positive shares with denominator and approximation caveats. Removed misleading percent-match/profile-overlap labels from the touched profile surfaces and shared MatchMeter.
- Extraction review now explains source weighting, confirmation, diminishing returns, evidence limitations, and weight versus confidence/proficiency. Each topic shows confirmation and matching weight; no evidence is fabricated when absent.
- Cross-owner mobile edits explicitly requested by Alan; docs, current/legacy mocks, regression tests and REQUESTS updated. Privacy/contract review completed; no privacy blockers.
**How to run/test it:** Mobile `tsc --noEmit` and `eslint .` pass; `pnpm dlx tsx scripts/demo-flow.test.ts`: 17 pass. ML `pytest -q tests/test_quick_profile_explanation.py tests/test_explain.py`: 21 pass using bundled Python and temporary dependency targets (hashed embedder, no model download). `git diff --check` passes.
**Next step for whoever continues:** Deploy ML when safe, reload app, smoke-test graph → person → full profile and Profile → Review on phone. Git pushes do not deploy ML.
**Known issues / blockers:** No live DB or device verification in this session. Extraction explanation describes actual existing rules, not a new per-document provenance ledger. Learned graph scores and quick-profile V1 scores can differ; UI labels the scoring basis.
**Contract changes:** Optional quick-profile `explanation`; docs/api.md 15 and new explained fixture. Existing graph shape unchanged; client now types/consumes it. No schema/migration or secret changes.

## 2026-09-26 | adam | Adam
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

## 2026-09-25 23:45 | adam | Adam

**Task:** Kit install (pre-AD1)

**Status:** blocked

**What I did:**
- Moved the Claude kit to repo root; added the hidden kit files that were missing from the first push (`.claude/`, `.mcp.json`, `.githooks/`).
- Started this PROGRESS.md.

**How to run/test it:** `./scripts/claude-setup.sh <your name>`, then `claude "$(cat prompts/<your name>.md)"`

**Next step for whoever continues:** Add `MASTER_SPEC.md` to the repo root (it's referenced everywhere but isn't in the repo or on Adam's Mac). Put the Supabase project ref in `.mcp.json` in place of `YOUR_PROJECT_REF`. Then start AD1 (`supabase init` in `supabase/`).

**Known issues / blockers:** MASTER_SPEC.md missing; Supabase project ref not set; claude-setup.sh not yet run on Adam's laptop.

**Contract changes:** none

## 2026-09-25 23:42 | Akshar | Akshar

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
## 2026-09-27 01:00 | adam | Codex
**Task:** AD9 — company check-in counts and loading responsiveness
**Status:** done
**What I did:**
- Company home and event studio now refresh existing authorized aggregate endpoints every two seconds after the previous request completes, only while the screen is focused and app foregrounded. This picks up other phones' registrations/check-ins without reopening the screen.
- Shared async loading now coalesces overlapping requests per hook and retains current data during manual refreshes; new dependency loads still use the loading state. Removed the artificial 250 ms delay on every demo API request.
- Corrected demo company events to share attendee registration/check-in state, use event-specific QR payloads/codes, and derive counts rather than permanent zero placeholders.
- Kept the displayed event QR stable during background refreshes and renewed it before expiry. Added a regression covering registration, scan, repeat scan, leave, code re-entry and unregister counts on both company views.
**How to run/test it:** `cd mobile && npx tsc --noEmit && npx eslint lib/useAsync.ts lib/useLiveRefresh.ts lib/useOrg.ts lib/api.ts lib/demo/backend.ts scripts/demo-flow.test.ts 'app/(company)/index.tsx' 'app/(company)/event/[id].tsx' && npm run test:demo`; passed (19 demo checks). Three-platform Expo export passed before the final QR-stability refactor; typecheck and lint passed again after it.
**Next step for whoever continues:** On two signed-in devices, keep a company's event studio open; register on the attendee phone and scan its QR. Counts should change on the next poll (roughly 2 seconds plus network time), without a loading flash. Polling lives in `mobile/lib/useLiveRefresh.ts`.
**Known issues / blockers:** This is near-live polling, not websocket push. A real two-account/two-phone scan was not performed; demo state remains local to each device. No backend deployment or schema change is required.
**Contract changes:** none
