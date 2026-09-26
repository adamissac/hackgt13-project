# Progress log

Newest entries at the top. Template and rules: MASTER_SPEC.md Section 0.3.

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
