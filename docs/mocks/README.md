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
| match_quick_profile.json | GET /matches/{other_user_id}/quick-profile |
| qr_token.json | GET /qr/token |
| handshake.json | POST /handshake |
| feedback.json | POST /feedback |
| connections.json | GET /connections |
| me_open_to_meet.json | PATCH /me/open-to-meet |
| suggestions.json | GET /suggestions |
| suggestion_respond.json | POST /suggestions/{id}/respond (mutual-yes case; otherwise {"status": "waiting"}) |
| qr_verify.json | POST /qr/verify (GET /qr/verify-token uses qr_token.json) |
| conversations_pending.json | GET /conversations/pending |
| conversation_feedback.json | POST /conversations/{id}/feedback (mutual-yes case) |
| followup_draft.json | POST /connections/{user_id}/followup-draft |
| graph.json | GET /graph?mode=matches (real output of the service on seeded data) |
| feed.json | GET /feed |
| feed_insights.json | GET /feed/insights |
| feed_reply_suggestion.json | POST /feed/{item_id}/reply-suggestion |
| graph_matches.json | GET /graph?mode=matches |
| graph_network.json | GET /graph?mode=network |
| graph_expand.json | GET /graph/expand (node_id = the "reinforcement learning" topic) |
| dashboard_event.json | GET /dashboard/{event_id} (organizer map, real UMAP+HDBSCAN on synthetic) |
| me_dashboard.json | GET /me/dashboard |
| ble_tokens.json | POST /ble/tokens (3 of the 144 tokens) |
| ble_sightings.json | POST /ble/sightings |
| invites_create.json | POST /invites |
| invites_list.json | GET /invites |
| invites_resolve.json | GET /invites/resolve/{token} |
| invites_respond.json | POST /invites/{token}/respond |

Graph mocks are generated: `cd ml && .venv/bin/python scripts/make_graph_mocks.py` (then `cd dashboard && npm run sync-mocks`).
