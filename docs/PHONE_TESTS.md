# Phone test checklist (Saturday morning)

Everything Bluetooth, camera, location and Event Mode has only been tested in code. This is the first run on real
phones. Work top to bottom; each part says what "pass" looks like and what to write down. Log results in the
**Results** tables at the bottom of this file (commit them) and copy the headline numbers into PROGRESS.md.

Time budget: build 30-45 min, parts 2-9 about 60 min, recordings (part 10) 45 min.

## 0. What you need

- [ ] **Phones:** at least 2, ideally 2 iPhones + 1-2 Androids (iPhone↔iPhone, iPhone↔Android, Android↔Android are all in the matrix). Bluetooth on, charged, not in Low Power Mode.
- [ ] **One laptop runs the ML server** (`./scripts/start-ml.sh`, needs the root `.env`). Keep it awake and plugged in.
- [ ] **For iPhones: a Mac with full Xcode** (App Store, about 10 GB; Command Line Tools alone is not enough) + a free Apple ID.
- [ ] **For Android: an Expo account** (free, expo.dev) for the EAS build, or Android Studio + USB debugging.
- [ ] **Two test accounts** signed in on different phones (sign-in with email magic link is fine).

## 1. Build the dev app (not Expo Go)

Expo Go can't do Bluetooth, background service, or our native modules. You'll see "Bluetooth needs the development build" if you're in Expo Go.

**Android (fastest, no Mac needed):**
- [ ] `cd mobile && npx eas-cli login`
- [ ] `npx eas-cli build --profile development --platform android` (about 15 min in the cloud; `eas.json` is in `mobile/`)
- [ ] Open the link or QR it prints on each Android phone → install the APK (allow "install unknown apps").

**iPhone (free Apple ID):**
- [ ] Plug the iPhone into the Mac, unlock it, tap Trust. On the iPhone: Settings → Privacy & Security → **Developer Mode** on (it restarts).
- [ ] `cd mobile && npm install && npx expo run:ios --device` → pick the phone. First time: Xcode → Settings → Accounts → add your Apple ID; in the project's Signing & Capabilities choose your Personal Team if it asks.
- [ ] On the iPhone: Settings → General → VPN & Device Management → trust your developer certificate.
- [ ] Repeat for the second iPhone. Free-account builds expire after 7 days (fine for the weekend).

**If the Android build fails in `modules/event-mode`** (the Kotlin foreground service was never compiled before): paste the Gradle error to Akshar's agent. Quick unblock: rename `mobile/modules/event-mode` to `mobile/modules/_event-mode`, rebuild; everything except "scan while locked" still works.

Pass: the app opens on every phone and shows the five tabs.

## 2. Point the app at the live server

- [ ] On the server laptop: `./scripts/start-ml.sh` → it prints `ML_API_URL for phones: https://….trycloudflare.com` and writes it into `mobile/.env`.
- [ ] `mobile/.env` has `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, that URL as `EXPO_PUBLIC_API_BASE_URL`, and **`EXPO_PUBLIC_USE_MOCKS=0`**.
- [ ] Start Metro for the dev build: `cd mobile && npx expo start --dev-client --lan --clear` (**not** `--go`, which the script prints). Phones on the same Wi-Fi; open the app → it connects to Metro.
- [ ] Sign in on each phone (different accounts). Profile tab shows your email and no "Missing config" warning.
- [ ] On both phones: Nearby → **Event Mode ON** once (this checks you in to HackGT; there's no separate check-in button yet), then Home → **Open to Meet ON**.

Pass: Home loads real matches (not "Maya R." mock data). If the tunnel restarts, the URL changes: rerun the script and restart Metro.

## 3. Bluetooth hello world (AK1)

Nearby tab → "BLE hello world" (dev link) on both phones → Start.
- [ ] Permission prompts appear (iOS: Bluetooth; Android: Nearby devices / Location on Android ≤ 11). Allow.
- [ ] Each phone lists the other's name `fc-XXXX` with a live RSSI within 10 s.
- [ ] **iOS name truncation:** on an iPhone scanning another iPhone, is the full `fc-XXXX` shown (7 chars)? The real tokens are 8 chars. Write down what you see.
- [ ] Repeat for every pair type you have (iPhone↔iPhone, iPhone↔Android, Android↔Android).

**If nothing shows up after 30 s on a pair:** both apps in the foreground? Bluetooth on? Permission denied (Settings → the app → Bluetooth)? If one direction works and the other doesn't, it's that phone's *advertising* (munim-bluetooth). Note which platform. That's the "write our own advertiser module" fallback in MASTER_SPEC 7.1, so tell Akshar right away.

## 4. Real proximity pipeline (AK2 + AK5)

On both phones: Nearby tab → toggle "Scan for people nearby" ON, and stay on the screen for 2 minutes.
- [ ] No red error on the screen.
- [ ] Server has tokens and sightings. From the repo root:
  ```
  npx supabase db query --linked "select count(*) from ephemeral_ids where valid_to > now()"
  npx supabase db query --linked "select observer_id, observed_token, rssi, ts from sightings order by ts desc limit 10"
  ```
  Pass: ~144 tokens per phone; new sightings every 30 s from each phone, `rssi` values that match what `/ble-debug` showed.
- [ ] After a few minutes, the radar/Nearby list shows the other test account with a band (needs Alan's matches to fill `proximity`).
- [ ] Leave it running across a :x0 minute boundary (e.g. 10:20): sightings keep arriving with a **new** `observed_token` (rotation works).

## 5. RSSI test matrix (calibrates the bands)

Use `/ble-debug` (raw RSSI). Phones at chest height, screens on, apps open. For each pair and distance, watch ~15 s and write the **typical** value (not the best one).
- [ ] Distances: touching, 0.5 m, 1 m, 2 m, 5 m, across the room.
- [ ] Repeat 1 m with the observed phone **backgrounded** (home button) and **in a pocket**.
- [ ] Fill in table A below.

What we do with it: the bands are "very close" > −60 dBm, "nearby" −60 to −75, else "farther away" (`mobile/features/ble/signal.ts`). If 1 m typically reads below −60 on some model, add a per-model offset in `RSSI_OFFSETS`.

## 6. Tap to verify (hold phones together)

Both phones: Nearby → "Just talked with someone? Verify with QR" → **Tap phones** tab.
- [ ] Touch the backs together. The meter fills, both phones vibrate within ~5 s, and both land on "You talked with …" with the checklist.
- [ ] Hold 30 cm apart for 20 s: it should **not** verify.
- [ ] Only one person on the Tap screen, other phone on Home: it should **not** verify.
- [ ] Try iPhone↔Android too.
- [ ] Pick topics → "Yes, connect" on both → both see "You're connected". Try one Yes + one No on a fresh pair of accounts: the Yes side must only ever see "We'll let you know".

If touching never fills the meter, write down the touching RSSI from `/ble-debug`. The threshold is −50 dBm in **both** `mobile/features/ble/tap.ts` and `ml/app/routers/tap.py`; lower both together.

## 7. QR verify (the always-works fallback)

- [ ] Phone A: Show code. Phone B: Scan code (camera permission prompt → allow) → B lands on the checklist; A sees the prompt too (notifications / pending conversations).
- [ ] Wait 60 s without refreshing, scan an old screenshot → "That code expired".
- [ ] Scan your own code → "That's your own code".

## 8. Event Mode (AK8)

- [ ] **Android:** Nearby → Event Mode ON → a notification "Event Mode is on" appears (Android 13+: allow notifications). Card says "Keeps scanning when your phone is locked". Lock the phone for 2 minutes → new `sightings` rows from that phone keep arriving (query in part 4). Event Mode OFF → notification disappears.
- [ ] **iPhone:** Event Mode ON → the screen doesn't dim or lock for 3 minutes. Card says "Keep the app open".
- [ ] Leave Nearby for another tab and come back: Event Mode is still on and still scanning.

If the card says "Background scanning is off", write down the error text shown under it.

## 9. Meetup location sharing (AK7) and invites (AK4)

**Meetup:** needs a *matched* suggestion between the two test accounts. Make one by hand:
```
npx supabase db query --linked "select id, name from profiles where name ilike '%<name>%'"
npx supabase db query --linked "insert into suggestions (user_a, user_b, context, a_response, b_response, status, expires_at) values (least('<uuid1>'::uuid,'<uuid2>'::uuid), greatest('<uuid1>'::uuid,'<uuid2>'::uuid), 'public', 'yes', 'yes', 'matched', now() + interval '30 minutes')"
```
- [ ] Both Homes show "You're meeting …" → Find → Share my location → allow location (While Using).
- [ ] Walk ~100 m apart outside: the band says minutes away and the arrow points toward the other person when you turn.
- [ ] Walk together: "Very close. Look around!" + "Found them? Verify with QR" → verify → both screens say "Location sharing ended".
- [ ] Separately: Stop sharing on one phone → the other shows ended within ~10 s.

**Invites:** Profile → "Invite someone you know" → Create invite link.
- [ ] Share link → send to the other phone → tap it → "Have you talked with …?" → Yes, connect → connected.
- [ ] Scan the invite QR with the other phone's **camera app**. Does it offer to open the app? (`formalconnect://` links may not open from the camera until the dashboard https redirect exists. Write down what happens.)
- [ ] Revoke an invite → opening its link says "This invite isn't available".

## 10. Labeled recordings for the conversation classifier (AK6, 45 min, whole team)

Pairs of people, both phones on Nearby → "Record session (AK6)". Each recording: **both phones pick the same label → Start on both → 60-90 s → Stop on both → Share JSON** to one shared folder (AirDrop/Drive).
- [ ] talking face to face (1 m, actually talking): 5-10 recordings
- [ ] standing in line (one behind the other, not talking): 5-10
- [ ] walking past each other: 5-10
- [ ] across the room (5+ m, not talking): 5-10
- [ ] same table, on laptops, not talking: 5-10 (the hard case)
- [ ] Mix phone models and pockets vs. hands; put notes in the distance field ("1 m, iPhone in pocket").

Then:
```
cd ml && .venv/bin/python scripts/ak6_to_sessions.py ~/Downloads/ak6_*.json   # -> ml/datasets/ble_labeled/*.csv
.venv/bin/python scripts/train_encounter.py                                   # Alan: retrain with the real data
git add datasets/ble_labeled && git commit -m "[ml] AK6 labeled recordings" && git push
```

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| "Bluetooth needs the development build" | You're in Expo Go. Open the dev-build app instead. |
| App can't reach Metro | Same Wi-Fi? Use `--tunnel` instead of `--lan`. |
| Every API call fails / 401 | Signed out or wrong `EXPO_PUBLIC_API_BASE_URL` (tunnel URL changed). Restart Metro after editing `.env`. |
| Nothing heard between two iPhones | Both apps must be open and on screen (iOS scans only in the foreground). |
| Android hears nothing | Nearby devices permission denied, or Location off on Android ≤ 11. |
| Tap never completes | Touching RSSI weaker than −50 on that model (see part 6), or the other phone isn't on the Tap screen. |
| Event Mode "background scanning is off" | Android refused the service; note the error. The app still works while open. |

## Results

**A. RSSI matrix** (typical dBm; fg = foreground, bg = observed phone backgrounded)

| Observer → observed (models) | touching | 0.5 m | 1 m | 1 m bg | 1 m pocket | 2 m | 5 m | room |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| e.g. iPhone 15 → Pixel 8 | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

**B. Pass/fail**

| Part | iPhone↔iPhone | iPhone↔Android | Android↔Android | Notes |
| --- | --- | --- | --- | --- |
| 3 hello world | | | | iOS name shown in full? |
| 4 sightings + rotation | | | | |
| 6 tap | | | | touching RSSI: |
| 7 QR | | | | |
| 8 Event Mode | n/a | | | locked-phone sightings? |
| 9 meetup / invites | | | | camera opens invite link? |
