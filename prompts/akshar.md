# Claude Code brief: Akshar · Bluetooth, automation, integrations, and pitch
HackGT 13 · Formal Connection · Tracks: AI/ML + Data Visualization
Start from the repo root with `claude "$(cat prompts/akshar.md)"`, or paste this whole file as the first message.

You are Akshar's lead coding agent. Akshar owns the part of the app that happens in the physical world: phone-to-phone Bluetooth, the proximity radar, QR verification, private invites, Open to Meet, meetup location sharing, Event Mode, and the pitch that ties it all together. This is the riskiest hardware-facing work in the project, so you prove things on real phones early and always keep a fallback ready. Three other agents (Adam's, Alan's, Arjun's) build in this repo at the same time; PROGRESS.md and `docs/api.md` keep you in sync.

## Operating mode
- Auto mode is on. Don't ask permission for routine work: editing your files, installing dependencies, running dev builds, committing and pushing.
- Ask Akshar only for: physical phone steps (install a build, grant a permission, walk to a distance, hold two phones apart), developer accounts (Apple, Google, EAS), secrets, or anything irreversible outside the repo. Never ask Adam (or anyone) for approval: decide within your area, and for a contract change that affects another owner, make the smallest additive change yourself, record it in PROGRESS.md, and note it in that owner's `REQUESTS.md` section. Batch requests into one message with numbered steps and keep working on what isn't blocked.
- Bluetooth APIs change and many blog posts are wrong. Every library, config plugin option, and permission string goes to `docs-researcher` first. The `ble-proximity` skill has the platform limits that matter.
- Use Opus (`/model opus`) for native module work and BLE debugging. Sonnet is fine for screens.

## First session
0. Check the team kit is installed: `.claude/owner.local` says `akshar` and `.claude/skills/handoff/` exists. If not, tell Akshar to copy the kit into the repo root and run `./scripts/claude-setup.sh akshar`. Until then, follow MASTER_SPEC Section 0 by hand.
1. `git pull --rebase`. Read MASTER_SPEC.md fully (Sections 3.3 to 3.7, 7, and 12.1 twice), then AGENTS.md, PROGRESS.md, docs/schema.sql, docs/api.md.
2. Your work lives in `mobile/features/ble/` and your own screens under `mobile/`, plus server routes in `ml/app/routers/` for invites, BLE tokens and sightings, presence, and location shares. Those routes sit in Alan's service: follow its conventions and leave a PROGRESS.md note when you add one.
3. Run `/next-task` and go.

## Your order (Akshar's instruction overrides lowest-number-first)
AK1, AK3, AK4, AK6, then AK2, AK5, AK7, then AK8, AK9, then AK10. Must items come before Should items, and AK3 and AK4 are Must.

### Phase 0: Friday night
**AK1 Bluetooth hello world.** Done when two physical phones advertise and discover each other in the Expo dev build and print RSSI. This is the highest-risk item in the whole project: start it first.
- Dev build, not Expo Go. iOS: `npx expo run:ios --device` from a Mac with Xcode (a free Apple ID works with 7-day provisioning) or an EAS development build. Android: `npx expo run:android` with USB debugging, or an EAS APK.
- Scanning: `react-native-ble-plx` 3.x with its config plugin (iOS Bluetooth usage description; Android 12+ BLUETOOTH_SCAN, BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE, plus ACCESS_FINE_LOCATION for Android 11 and lower).
- Advertising: ble-plx can't. Spend at most 30 minutes on `munim-bluetooth` (claims central and peripheral, published September 2026). If it doesn't work on both platforms, write a local Expo module (`npx create-expo-module@latest --local`) around `CBPeripheralManager` and `BluetoothLeAdvertiser`. Skip `react-native-ble-advertiser` (unmaintained since 2022).
- Test the iOS payload limit on night one: next to a 128-bit service UUID, iOS leaves only about 8 to 10 bytes for the local name, so a 13-character base32 form of an 8-byte token may be cut off. If it is, move to 5-byte tokens (8 base32 characters) and record it with `/contract-change`.
- Log every result (device models, foreground or background, what was seen) in PROGRESS.md.

### Phase 1: Saturday morning (Must items end to end)
**AK3 Verification QR screens.** Needs Alan's AL6 (build on mocks until then). Show the signed payload from `GET /qr/verify-token` as a QR (`react-native-qrcode-svg`) and refresh it before the 60-second expiry. Scan with `expo-camera` `CameraView` barcode scanning, `POST /qr/verify`, then route both people into Adam's checklist flow.
**AK4 Invites.** Backend in `ml/app/routers/invites.py`: `POST /invites` returns `{url, qr_payload, expires_at}`, token from `secrets.token_urlsafe(16)` (128 bits) stored only as a SHA-256 hash, 7-day expiry, revocable, 10 per user per day. `GET /invites/resolve/{token}` shows sender name, photo, headline. `POST /invites/{token}/respond` connects on accept (`how_met = invite`); decline or ignore tells the sender nothing. App side: share sheet and QR, deep link `formalconnect://invite/<token>` behind an https link served by the dashboard so it works from any camera app, and the recipient accept screen ("Have you talked with this person?").
**AK6 Labeled Bluetooth recordings (with the whole team).** Build a debug "Record session" screen: label picker (talking face to face, standing in line, walking past, across the room, same table on laptops), start and stop, device model, and upload of raw sightings with the label. Run the 45-minute session Saturday morning, 5 to 10 recordings per label, and hand the data to Alan for AL8.

### Phase 2: Saturday afternoon (Should items)
**AK2 Tokens, advertising, scanning, uploads.** `POST /ble/tokens` returns a 24-hour batch (one token per 10-minute window, mapping stored server-side only); advertise the current token; one long-running scan filtered by the service UUID (Android throttles more than 5 scan starts in 30 seconds); 5-second rolling median then a 1D Kalman filter per token; batched `POST /ble/sightings` every 30 seconds with device model and foreground state. Alan's AL8 waits on this.
**AK5 Proximity radar.** react-native-svg, three rings for the bands (very close, nearby, farther away), green dots for the viewer's strongest matches, tap for Adam's quick profile. Never show exact positions or meters.
**AK7 Meetup location sharing.** Only after a mutual yes. `expo-location` foreground updates every 10 seconds to `POST /location-shares/{suggestion_id}`; the other person subscribes to that row through Supabase Realtime. Ends on verified proximity, either toggle off, or 30 minutes, and rows are deleted. A distance-and-arrow "find them" view avoids the Google Maps API key that react-native-maps needs on Android.

### Phase 3: stretch
**AK8 Event Mode.** `expo-keep-awake`, foreground scanning, and on Android a foreground service of type `connectedDevice` (Android 14 requires the type and the FOREGROUND_SERVICE_CONNECTED_DEVICE permission) with a persistent notification.
**AK9 Building geofences.** `expo-location` geofencing with TaskManager (needs "Always" location, iOS monitors at most 20 regions). `POST /presence {building_id}` on entry, `DELETE /presence` on exit, 45-minute expiry. Use mock locations for the demo.

### Phase 4: Sunday (you lead)
**AK10 Pitch.** Deck, the Section 12.1 demo script rehearsed to under 3 minutes, and the recorded backup video in case Bluetooth or Wi-Fi fails. Use `/demo-day`. Prepare judge answers on privacy and on the Bluetooth limitation ("proximity, not conversation"), and make sure Alan can explain the ML in one breath each.

## Test matrix (fill it in PROGRESS.md as you go)
iPhone to iPhone, iPhone to Android, Android to Android; app foregrounded and backgrounded; at 0.5 m, 1 m, 2 m, 5 m, and across the room. Median RSSI per pair and device model sets the Saturday band calibration.

## Dependencies
You need Adam's AD3 shell (use the `features/ble` stub he creates, or create it yourself if it isn't there) and Alan's AL6 for AK3. Alan's AL8 needs your AK2 and AK6. If Bluetooth verification slips, QR verification is the fallback that keeps the demo alive, so AK3 is never optional.

## Done means
The Section 13 done-when holds on physical phones, `/privacy-check` is clean (tokens rotate, nothing identifying leaves the phone, location sharing ends and deletes), and `/handoff` pushed it with a PROGRESS.md entry. AGENTS.md has the `mobile` build commands you used.

## Autopilot lines (Akshar types these)
```
/goal AK1 is done: two physical phones running the dev build advertise and discover each other and the transcript shows logged tokens and RSSI from both, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
/goal AK4 is done: invite create, resolve, accept, revoke, expiry, and the 10 per day limit work and are covered by pytest in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
/goal the current task from /next-task meets its done-when in MASTER_SPEC Section 13, verified in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
```
