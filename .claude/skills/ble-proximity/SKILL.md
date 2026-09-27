---
name: ble-proximity
description: "Field notes for phone-to-phone Bluetooth in this app: advertising rotating tokens, scanning, RSSI smoothing and distance bands, encounter sessions, iOS and Android limits, permissions, Event Mode, and the physical test matrix. Use whenever working on BLE code, the proximity radar, sightings upload, Bluetooth verification, Event Mode, or encounter classifier features, even for small changes."
---

# BLE proximity field notes
Spec: MASTER_SPEC 3.4, 3.5, 6.8, and all of Section 7.

## Stack
- Scanning (central): `react-native-ble-plx` 3.x with its Expo config plugin. Confirm plugin options and permission strings with `docs-researcher` before editing `app.json` or `app.config.ts`.
- Advertising (peripheral): ble-plx cannot advertise. Timebox 30 minutes to try `munim-bluetooth` (published September 2026, claims central and peripheral). If it fails on either platform, write a small local Expo module (`npx create-expo-module@latest --local`) wrapping `CBPeripheralManager` (iOS) and `BluetoothLeAdvertiser` (Android). Skip `react-native-ble-advertiser`: unmaintained since 2022.
- Dev build on physical phones only. Simulators and emulators have no usable Bluetooth.

## Payload (Section 7.1)
- One app-specific 128-bit service UUID. Scanners filter on it.
- iOS advertises only a local name and service UUIDs. With a 128-bit UUID in the packet, only about 8 to 10 bytes are left for the name, so a 13-character base32 encoding of an 8-byte token can get cut off. Test on real iPhones first. If truncated, switch to 5-byte tokens (exactly 8 base32 characters); collisions stay negligible at event scale. Record it with `/contract-change`.
- Android: put the token bytes in service data under the same UUID.
- Tokens rotate every 10 minutes from a server-issued 24-hour batch. Only the server maps token to user. Never store MAC addresses or device names.

## Platform limits
- iOS scans reliably only in the foreground, reports duplicates only in the foreground, and drops the local name from its advertisement in the background. Verification works if at least one phone was foregrounded and scanning.
- Android 7+: starting more than 5 scans in 30 seconds gets throttled silently. Start one long-running scan and never restart it in a loop.
- Android 12+: request BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, and BLUETOOTH_CONNECT at runtime. Android 11 and lower need ACCESS_FINE_LOCATION to get scan results.
- Android 14+: an Event Mode foreground service must declare type `connectedDevice` and hold FOREGROUND_SERVICE_CONNECTED_DEVICE, with a persistent notification.

## Signal processing (Section 7.3)
- Per token: 5-second rolling median, then a 1D Kalman filter. Start with small process noise and measurement noise near the observed RSSI variance, then tune on recorded data.
- Bands: stronger than about -60 dBm "very close", -60 to -75 "nearby", weaker "farther away". Calibrate per device model on Saturday and keep per-model offsets.
- The distance formula (A about -59 dBm at 1 m, n about 2.5) is for debugging only. UI copy shows bands, never meters.
- Upload sightings in batches every 5 seconds (Quick Scan responsiveness; changed September 27) with device model and whether the app was foregrounded.

## Verification (Section 7.4)
- Bluetooth: at least 3 minutes above -65 dBm and classifier probability at or above 0.7. Otherwise offer the signed QR (60-second expiry, single-use nonce).
- Bluetooth measures proximity, not conversation. "Same table, not talking" is the known false positive. Say so in the pitch.

## Test matrix (log results in PROGRESS.md)
iPhone to iPhone, iPhone to Android, Android to Android; foreground and background; at 0.5 m, 1 m, 2 m, 5 m, and across the room. Record median RSSI per pair and device model.
