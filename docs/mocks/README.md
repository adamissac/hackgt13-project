# Mock API responses

One file per endpoint in `docs/api.md`, same shapes. The mobile client serves these when
`EXPO_PUBLIC_USE_MOCKS=1` (see `mobile/lib/api.ts`). Update the mock in the same commit as any
change to `docs/api.md`.

| File | Endpoint |
| --- | --- |
| profile_ingest.json | POST /profile/ingest |
| profile_status.json | GET /profile/status |
| profile_interests.json | GET and PATCH /profile/interests |
| event_matches.json | GET /events/{event_id}/matches |
| event_checkin.json | POST /events/{event_id}/checkin |
| match_starters.json | GET /matches/{other_user_id}/starters |
| qr_token.json | GET /qr/token |
| handshake.json | POST /handshake |
| feedback.json | POST /feedback |
| connections.json | GET /connections |
