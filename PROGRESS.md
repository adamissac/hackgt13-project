# Progress log

Newest entries at the top. Template and rules: MASTER_SPEC.md Section 0.3.

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
