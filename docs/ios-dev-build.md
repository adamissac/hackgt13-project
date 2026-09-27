# iPhone dev build (Bluetooth) with Xcode

Bluetooth, the tap-to-verify flow, and Event Mode need a development build: Expo Go does not include the
Bluetooth libraries. This build was compiled end to end on EAS (iOS simulator profile, commit `fd06eb7`) with the
same config, so the native code, pods, and permissions are known to build.

## What you need (once per Mac)
1. Xcode from the Mac App Store. Open it once and let it install its components.
2. Xcode → Settings → Accounts → add your Apple ID (a free one works).
3. CocoaPods: `brew install cocoapods` (or `sudo gem install cocoapods`). `npx expo run:ios` also offers to install it.
4. An iPhone on iOS 16.4 or newer and a cable for the first install.

## Your own bundle id (free Apple IDs)
Apple lets a bundle id belong to one team, so each person on a free (personal) team needs their own. Add one line
to your personal `mobile/.env` (it is git-ignored):

```
IOS_BUNDLE_ID=com.formalconnection.app.<yourname>
```

People on the same paid Apple Developer team can skip this and share `com.formalconnection.app`.

## Build and install
```
cd mobile
git pull && npm install
npx expo run:ios --device        # pick your iPhone; the first build takes 10-20 minutes
```
If signing fails, open `mobile/ios/Constellation.xcworkspace` in Xcode → target Constellation → Signing &
Capabilities → Team: your Personal Team (bundle id as above) → press Run.

On the iPhone, the first time:
- Settings → Privacy & Security → Developer Mode → On (the phone restarts).
- Settings → General → VPN & Device Management → your Apple ID → Trust.

`ios/` is generated (`expo prebuild`) and git-ignored: change native settings in `app.json`, never in Xcode files.
A free Apple ID's install expires after 7 days (run `npx expo run:ios --device` again).

## Every day after that
```
cd mobile && npx expo start --dev-client --tunnel
```
Open Constellation on the phone; it connects to that server (or scan the QR with the Camera app). JavaScript changes
hot-reload. Rebuild only when a native package or `app.json` changes.

## Bluetooth test (two iPhones)
1. Both signed in with real accounts (not "Try the demo"), both checked in to the same event.
2. Both: Events → the event → Event Mode on. Allow Bluetooth when asked.
3. Keep the app open on screen on both phones: iOS only broadcasts the rotating code while the app is in the
   foreground (the screen stays awake in Event Mode).
4. Nearby shows the other person as a distance band within about 30-60 seconds (phones upload what they hear
   every 30 s; the band uses the last minute).
5. Tap to verify: Verify → hold the phones back to back for 2 seconds. Both get the "How did it go?" checklist.
   QR verification is the fallback.

If a screen says "Bluetooth needs the development build", you are in Expo Go. "Bluetooth is off" or "permission
was denied" name the fix (Control Center, or Settings → Constellation → Bluetooth).

## Checks run before this build
- `npx expo-doctor` 21/21, `npx tsc --noEmit`, `npx eslint .`, demo tests 19/19, BLE unit tests 11/11.
- `npx expo export --platform ios` (Hermes bundle builds).
- EAS iOS build (simulator profile) of commit `fd06eb7`: native compile and link OK.
- Server half of Bluetooth on the live API: `cd ml/scripts && npx @railway/cli run ../.venv/bin/python -u e2e_ble_live.py`
  (tokens, sightings, Nearby band, tap claim from both phones, checklist, far tap rejected).
