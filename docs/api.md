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
Same access rule as 15 (current match, open suggestion, or connection; otherwise `403 {"error": "this profile isn't available"}`).
Grounded only in what both people see on each other's quick profile. Cached per pair; falls back to a template if the LLM is down.
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
- `POST /invites/{invite_id}/respond` <- `{ "response": "accept" }`

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

## 15. GET /matches/{other_user_id}/quick-profile
Only for a current match (both checked in to the same event, not blocked/declined/connected-elsewhere), an open
suggestion, or a connection. Anyone else: `403 {"error": "this profile isn't available"}` (same message for every reason).
Only SHARED topics are returned, never the other person's full interest list.
```json
{
  "user_id": "uuid", "name": "Sam Lee", "photo_url": "https://...", "role": "recruiter",
  "headline": "ML recruiter at Acme", "seeking": "RL collaborators", "offering": "hiring quant interns",
  "connected": false,
  "score": 0.62,
  "shared_topics": [
    { "interest_id": 42, "name": "reinforcement learning", "facet": "technical", "strength": 0.71,
      "evidence": "Built an RL trading agent (repo: rl-trader)" }
  ],
  "facet_overlap": { "technical": 0.82, "career": 0.31, "personal": 0.44, "academic": 0.0 },
  "complementarity": 0.57
}
```
`strength` = min of both people's weights on the topic (0-1). `evidence` is the other person's evidence line.
`facet_overlap` = cosine similarity of the two people's facet vectors (0-1), for the overlap radar chart.

## 16. PATCH /me/open-to-meet
Request `{ "open": true }`   Response `{ "open_to_meet": true }`
OFF also ends any live meetup location sharing the caller is part of (chats remain).

## 17. GET /suggestions
Open "Do you want to meet X?" suggestions still waiting for MY answer. Never shows the other person's answer.
```json
{ "suggestions": [ {
    "suggestion_id": 12, "context": "event", "event_id": 1, "building_id": null,
    "expires_at": "2026-09-26T15:34:05+00:00",
    "other": { "user_id": "uuid", "name": "Sam Lee", "photo_url": null, "role": "recruiter", "headline": "" },
    "score": 0.62,
    "shared_topics": ["reinforcement learning", "rock climbing"] } ] }
```
`context` is `event | public | reconnect`. Created by a server job every 30 s for checked-in (or same-building) Open to Meet
users: above both people's 80th percentile, max 3 per person per day, same pair at most once per 7 days, expires after 30 min.

## 18. POST /suggestions/{suggestion_id}/respond
Request `{ "response": "yes" }` (or `"no"`)
```json
{ "status": "waiting" }                       // every outcome except a mutual yes, whatever the other person did
{ "status": "matched", "chat_id": 7 }         // both said yes: chats row created, both get a notification
```
Errors: `404 suggestion not found` (not a participant).
