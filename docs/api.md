# API contract: mobile / dashboard  <->  ML service (FastAPI)

Base URL: `ML_API_URL`. Every request from the app sends the Supabase session token:
`Authorization: Bearer <supabase_access_token>`. The ML service verifies it and gets `user_id` from it.
Errors: `{ "error": "message" }` with a 4xx/5xx status.

Build order: 1, 2, 3, 5 tonight. The rest Saturday.

---

## 1. POST /profile/ingest
Start extraction for one source. Returns immediately; extraction runs in the background.

Request (resume): `multipart/form-data` with field `file` (PDF) and field `source=resume`
Request (others): JSON
```json
{ "source": "github" }                 // uses stored GitHub token
{ "source": "facebook" }
{ "source": "manual", "text": "I love rock climbing and film photography",
  "seeking": "quant research internship", "offering": "RL and time-series projects" }
```
Response `202`
```json
{ "job_id": "a1b2c3", "status": "queued" }
```

## 2. GET /profile/status?job_id=a1b2c3
```json
{ "job_id": "a1b2c3", "status": "queued | running | done | error", "error": null }
```

## 3. GET /profile/interests
```json
{
  "user_id": "uuid",
  "seeking": "quant research internship",
  "offering": "RL and time-series projects",
  "interests": [
    { "interest_id": 42, "name": "reinforcement learning", "facet": "technical",
      "weight": 0.91, "source": "github",
      "evidence": "Built an RL trading agent (repo: rl-trader)",
      "confirmed": false, "hidden": false }
  ]
}
```
`facet` is one of `technical | career | personal | academic`. Sorted by weight descending.

## 4. PATCH /profile/interests
```json
{
  "confirm": [42, 17],
  "hide": [88],
  "add": [ { "name": "chess", "facet": "personal" } ]
}
```
Response: same shape as GET /profile/interests (updated).

## 5. GET /events/{event_id}/matches?limit=20
Only people checked in to the event.
```json
{
  "event_id": 1,
  "model": "v1",
  "matches": [
    {
      "user_id": "uuid",
      "name": "Maya R.",
      "photo_url": "https://...",
      "role": "student",
      "score": 0.74,
      "rank": 1,
      "highlight": true,
      "why": ["reinforcement learning", "time series analysis", "rock climbing"],
      "proximity": "near"          // "immediate" | "near" | "far" | null (null until Bluetooth works)
    }
  ]
}
```

## 6. POST /events/{event_id}/checkin
Request: `{}`   Response: `{ "ok": true }`

## 7. GET /matches/{other_user_id}/starters
```json
{ "why": "You both build trading models with reinforcement learning.",
  "openers": ["Ask how they backtest their RL agent.", "Compare notes on reward design for trading."] }
```

## 8. GET /qr/token
The app shows this as a QR code and refreshes it every 30 seconds.
```json
{ "payload": "base64url(user_id|nonce|expires_at)", "signature": "base64url", "expires_at": "2026-09-26T15:04:05Z" }
```
(V1: server signs with its secret. Later: device Ed25519 key.)

## 9. POST /handshake
Request (scanner sends what it read from the other phone's QR):
```json
{ "payload": "...", "signature": "...", "event_id": 1 }
```
Response
```json
{ "handshake_id": 123, "other": { "user_id": "uuid", "name": "Maya R.", "photo_url": "..." },
  "checklist": [ { "interest_id": 42, "name": "reinforcement learning" },
                 { "interest_id": 7, "name": "rock climbing" } ] }
```
Errors: `expired`, `invalid_signature`, `already_used`, `self_scan`.

## 10. POST /feedback
```json
{ "handshake_id": 123, "talked_about": [42, 7], "other_topic": "", "wants_connect": true }
```
Response
```json
{ "status": "waiting" }                       // other person has not answered
{ "status": "connected", "connection": { "user_id": "uuid", "name": "Maya R." } }
{ "status": "no_connection" }                 // never reveals who said no
```

## 11. GET /connections
Only the caller's own connections. Never return counts of other users' connections.
```json
{ "connections": [ { "user_id": "uuid", "name": "Maya R.", "photo_url": "...", "met_at": "HackGT 13",
                     "created_at": "...", "talked_about": ["reinforcement learning"],
                     "minutes_talked": 12 } ] }
```

## 12. Bluetooth (Saturday)
- `POST /ble/tokens` -> `{ "tokens": [ { "token": "k3j9x2p1", "valid_from": "...", "valid_to": "..." } ] }`
- `POST /ble/sightings` <- `{ "event_id": 1, "sightings": [ { "token": "k3j9x2p1", "rssi": -58, "ts": "...", "zone_id": null } ] }`

## 13. Presence / open to chat (nice to have)
- `POST /presence` <- `{ "building_id": "student_center", "open_to_chat": true }`
- `DELETE /presence`
- Invites: see section 15.

## 14. GET /dashboard/{event_id}   (organizer dashboard, no auth for demo)
```json
{
  "nodes":    [ { "id": "u001", "x": 3.2, "y": -1.4, "cluster": 2, "role": "student" } ],
  "clusters": [ { "id": 2, "label": "genomics + biotech + bioinformatics", "size": 14 } ],
  "edges":    [ { "source": "u001", "target": "u045" } ],
  "gaps":     [ { "clusters": [1, 5], "expected": 7.6, "actual": 0, "gap": 7.6, "ratio": 0.0 } ]
}
```
No names in dashboard data.

## 15. Private invites (AK4, Akshar; code in `ml/app/routers/invites.py`)
Token: 128-bit random, returned once at creation, stored only as a SHA-256 hash. 7-day expiry, single use,
revocable, 10 new invites per sender per rolling 24 hours. Decline writes nothing: the sender can't tell it from silence.

`POST /invites` <- `{ "channel": "link | qr | contact", "recipient_hint": "Sam from lab", "note": "Great chatting at the ML meetup" }` (all optional; `recipient_hint` is only ever shown back to the sender)
Response `201`
```json
{ "invite_id": 5, "url": "https://<dashboard>/invite/Xc2...", "qr_payload": "https://<dashboard>/invite/Xc2...", "expires_at": "2026-10-03T12:00:00Z" }
```
`url` base is `INVITE_BASE_URL` (the dashboard's https page, which redirects to `formalconnect://invite/<token>`). Errors: `rate_limited` (429).

`GET /invites` (the caller's own invites; never the token)
```json
{ "invites": [ { "invite_id": 5, "channel": "link", "recipient_hint": "Sam from lab", "note": "...",
                 "status": "active | accepted | revoked | expired", "expires_at": "...", "created_at": "..." } ] }
```

`DELETE /invites/{invite_id}` -> `{ "ok": true }` (revoke). Errors: `not_found` (404, also for someone else's invite).

`GET /invites/resolve/{token}`
```json
{ "sender": { "user_id": "uuid", "name": "Alice A.", "photo_url": "https://...", "headline": "ML @ GT" },
  "note": "Great chatting at the ML meetup", "expires_at": "...", "is_own": false, "already_connected": false }
```
Errors: `not_found` (404, also when either side blocked the other), `expired` (410, also revoked or already used).

`POST /invites/{token}/respond` <- `{ "response": "accept | decline" }`
```json
{ "status": "connected", "connection": { "user_id": "uuid", "name": "Alice A." } }   // accept; connections.how_met = 'invite'
{ "status": "ok" }                                                                   // decline: nothing is stored
```
Errors: same as resolve, plus `self_invite` (400).
