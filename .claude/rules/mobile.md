---
paths:
  - "mobile/**"
---
# Mobile rules (Expo)
- Expo SDK 57 dev build, never Expo Go: BLE, camera, background location, and push need native code. Test anything touching Bluetooth, location, camera, or notifications on physical phones.
- Folder split: Adam owns the app shell, auth, profile, chat, feed, and invites UI. Akshar owns `features/ble/`, the radar, QR screens, Open to Meet, and location. Cross-folder edits need a PROGRESS.md note.
- Server calls go through the typed client in `mobile/lib/api.ts`. With `EXPO_PUBLIC_USE_MOCKS=1` it serves `docs/mocks/*.json`. Simple reads and writes of your own rows may use Supabase directly under RLS. Anything involving other users, AI, matching, or verification goes through FastAPI.
- Client env holds only values safe to publish: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_USE_MOCKS`.
- UI truths: after tapping Yes, show the same waiting state whether the other person declined, ignored, or hasn't answered. Never render anyone else's connection count. Distances are bands ("very close", "nearby", "farther away").
- Every screen has loading, empty, and error states. Large touch targets: the demo happens on a phone in a loud room.
