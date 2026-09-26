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
Alias of 19 `GET /qr/verify-token` (same response). Expires after 60 s, single use.
The app shows this as a QR code and refreshes it every 30 seconds.
```json
{ "payload": "base64url(user_id|nonce|expires_at)", "signature": "base64url", "expires_at": "2026-09-26T15:04:05Z" }
```
(V1: server signs with its secret. Later: device Ed25519 key.)

## 9. POST /handshake
Alias of 20 `POST /qr/verify`; the response also carries `conversation_id`.
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
Alias of 23 `POST /conversations/{id}/feedback`; send `conversation_id` (preferred) or `handshake_id`.
A person who said yes gets `waiting` until both say yes, even if the other said no; `no_connection` only goes to someone who said no.
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
Also returns `headline` and `how_met` (`in_person | invite`); `met_at` is the event name or null.
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
No names in dashboard data. Node ids are opaque per-event hashes (not user ids). Clusters smaller than 5 are folded
into `-1` (unclustered); gaps are only between real clusters. Also returns `"event_id"` and `"people"` (attendee count).
Clusters and the 2-D layout refresh every 5 minutes; edges (connections formed at the event) are live, 10 s cache.
Public for the demo; set `DASHBOARD_REQUIRE_AUTH=1` to require a member of the event's organization.

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

## 19. GET /qr/verify-token
The verification QR the other person scans at the end of a conversation. Same shape as 8. Server-signed (HMAC-SHA256, `QR_SIGNING_KEY`), 60-second expiry, single-use nonce.

## 20. POST /qr/verify
Request `{ "payload": "...", "signature": "...", "event_id": 1 }` (`event_id` optional; defaults to an event both are checked in to)
```json
{ "conversation_id": 31, "handshake_id": 123,
  "other": { "user_id": "uuid", "name": "Maya R.", "photo_url": "..." },
  "checklist": [ { "interest_id": 42, "name": "reinforcement learning" }, { "interest_id": 7, "name": "rock climbing" } ] }
```
Creates a verified `conversations` row (method `qr`) and a `connect_prompt` notification for both. If they scan each other
within 10 minutes, both scans return the same conversation. Errors: `400 invalid_signature`, `400 expired`, `400 self_scan`, `409 already_used`.
`checklist` = shared interests ranked by min(w_a, w_b) * idf, top 5 (the app adds "something else").

## 21. GET /conversations/pending
Verified conversations (QR or Bluetooth) still waiting for MY checklist, newest first.
```json
{ "conversations": [ { "conversation_id": 31, "method": "qr", "event_id": 1, "minutes": null,
    "created_at": "2026-09-26T15:04:05+00:00", "other": { "user_id": "uuid", "name": "Maya R.", "photo_url": null },
    "checklist": [ { "interest_id": 42, "name": "reinforcement learning" } ] } ] }
```

## 22. GET /conversations/{conversation_id}/checklist
`{ "conversation_id": 31, "other": {...}, "checklist": [...] }` (participants only, else `404 conversation not found`).

## 23. POST /conversations/{conversation_id}/feedback
Request `{ "talked_about": [42, 7], "other_topic": "", "wants_connect": true }`
```json
{ "status": "waiting" }
{ "status": "connected", "connection": { "user_id": "uuid", "name": "Maya R." }, "chat_id": 9 }
{ "status": "no_connection" }
```
Silent: a yes gets `waiting` until both say yes, even if the other said no. Only the person who said no gets `no_connection`.
Mutual yes creates the `connections` row (`how_met = in_person`), a chat, and `connected` notifications for both.

## 24. GET /connections/{user_id}
My connection only (else `404 connection not found`): the 11 row plus `"shared_topics": ["reinforcement learning", ...]`.

## 25. POST /connections/{user_id}/followup-draft
`{ "draft": "Hi Maya, great talking with you about reward design ..." }` (2-3 sentences from what I checked, typed, and our
shared interests; the user edits and sends it in chat). Connections only.

## 26. GET /graph?mode=matches|network&event_id=1&depth=1&max_people=30&min_score=0&facet=all
Connection Graph data (MASTER_SPEC 3.12). Full sample: `docs/mocks/graph.json`.
```json
{
  "nodes": [
    {"id": "me", "type": "self", "label": "You"},
    {"id": "u_<uuid>", "type": "person", "label": "Maya", "score": 0.74, "highlight": true, "open_to_meet": true,
     "cluster": 3, "connected": false, "connected_at": null, "top_topic": "reinforcement learning", "shared_count": 2},
    {"id": "t_42", "type": "topic", "label": "reinforcement learning", "facet": "technical"}
  ],
  "edges": [
    {"source": "me", "target": "u_<uuid>", "kind": "match", "weight": 0.74, "facet": "technical"},
    {"source": "u_<uuid>", "target": "t_42", "kind": "has_topic", "weight": 0.9},
    {"source": "me", "target": "t_42", "kind": "has_topic", "weight": 0.8}
  ]
}
```
- `matches` (default): me, my allowed matches at the event (must be checked in; `event_id` defaults to my latest check-in),
  and topics we share (top 3 per person). `depth=2` also pulls in allowed people through those topics.
- `network`: me, my connections (`kind: "connection"`, `connected_at` set, for the timeline slider), shared topics.
- `mode=event` -> `400`, the organizer map is 14 `GET /dashboard/{event_id}`.
- `facet` keeps people who share a topic in that facet and only those topic nodes. `shared_count` sizes connection nodes.
- Edges are only `me -> person` and `me|person -> topic`. Never person -> person. Labels are first names. `cluster` is the
  HDBSCAN community id (null until computed, -1 = unclustered). Max ~150 nodes.

## 27. GET /graph/expand?node_id=t_42&mode=matches&event_id=1
Nodes and edges to merge into the current graph (by id).
- Topic (`t_<id>`): other allowed people holding that topic, ranked by score (max 10), with their `has_topic` edge.
- Person (`u_<uuid>`): the topics I share with them, each topic node with an `"evidence"` line (theirs). Never their connections.
  Someone I'm not allowed to see returns `{"nodes": [], "edges": []}`.

## 28. DELETE /me
Deletes everything about the caller: rows in every table (profile cascade; invites they used and orgs they own are
kept with the reference cleared), other people's raw Bluetooth sightings of their tokens, resume files under
`resumes/<user_id>/`, and the Supabase auth user.
```json
{ "deleted": true, "storage_objects_deleted": 1, "auth_user_deleted": true, "errors": [] }
```
`storage_objects_deleted` / `auth_user_deleted` are `null` if the server has no service key. The app should sign out after this.

## 29. GET /feed?cursor=&limit=20
My own items plus my connections' items (only kinds each author allows in `feed_prefs`), ranked by
0.6 x relevance to my interests + 0.3 x recency (48 h decay) + 0.1 x "mentions a topic I checked as discussed with them".
An author with 3+ items in 24 h appears as one `summary` entry instead.
```json
{ "items": [
    { "type": "item", "item_id": 5, "author": { "user_id": "uuid", "name": "Sam Lee", "photo_url": null },
      "kind": "post", "title": null, "body": "Wrote up my robotics notes", "url": null,
      "created_at": "2026-09-26T15:04:05+00:00", "score": 0.61, "talked_about": ["robotics"] },
    { "type": "summary", "author": { "user_id": "uuid", "name": "Priya S.", "photo_url": null },
      "summary": "Priya launched a new app and is hiring a frontend intern.", "item_ids": [7, 8, 9],
      "created_at": "2026-09-26T15:04:05+00:00", "score": 0.55 } ],
  "next_cursor": "MjA=" }
```

## 30. POST /feed/posts
Request `{ "kind": "post" | "update", "body": "Started a new role at ...", "title": null, "url": null }`
Response `201 { "item_id": 12, "kind": "update", "title": null, "body": "...", "url": null, "created_at": "..." }`
(GitHub items come from the poller, AR8, not from this endpoint.)

## 31. POST /feed/{item_id}/reply-suggestion
`{ "reply": "Nice one, Sam. Does this connect to the robotics work we talked about?" }` — only for items in my feed
(else `404 item not found`); grounded in the item and the topics we discussed when we met.

## 32. GET /feed/insights?days=7
Aggregate activity across my connections (not my own items):
```json
{ "days": 7, "trending_topics": [ { "name": "robotics", "count": 2 } ],
  "activity": [ { "date": "2026-09-20", "count": 0 } ],
  "by_kind": { "github": 0, "post": 2, "update": 1 } }
```

## 33. GitHub connect (MASTER_SPEC 5.2, 5.3)   owner: Arjun (AR1)
`GET /connect/github/start` (Bearer JWT) -> the app opens `url` in a browser (it can't send headers there,
so the user id rides in a signed, 10-minute `state`):
```json
{ "url": "https://github.com/login/oauth/authorize?client_id=...&redirect_uri=<ML_API_URL>/connect/github/callback&scope=read%3Auser&state=<signed>&allow_signup=false" }
```
`GET /connect/github/callback?code=...&state=...` (called by GitHub, no JWT): verifies `state`, exchanges the
code server-side, stores the Fernet-encrypted token in `linked_accounts`, runs GitHub ingestion in the background
(repo digest -> `raw_documents` -> extraction -> `user_interests` with evidence), then `302` to the app deep link
`APP_GITHUB_REDIRECT?status=ok` (or `status=error&reason=denied|oauth`). Default deep link
`formalconnect://connect/github`. Tokens never reach the client. Scope is `read:user` only (public repos).

## 34. GET /me/dashboard?days=30   owner: Arjun (AR7)
Private personal dashboard. Only the caller's own connections; nobody else's count or list is ever computed.
```json
{ "total": 12, "days": 30,
  "growth": [ { "date": "2026-09-20", "total": 3 } ],          // cumulative, one row per day
  "how_met": { "in_person": 9, "invite": 3 },
  "top_topics": [ { "name": "reinforcement learning", "facet": "technical", "connections": 5, "talked": 3 } ] }
```
`connections` = how many of my connections share the topic; `talked` = conversations where I checked it as discussed.

## 35. POST /assistant/chat   owner: Alan (AL11)
Request `{ "messages": [ { "role": "user", "content": "Who at this event works in quant finance?" } ], "event_id": 1 }`
(the full conversation so far, last message from the user; the server keeps no chat history)
Response `{ "reply": "Quinn (recruiter) lists quantitative finance ..." }`. `503 the assistant is unavailable right now` if Claude can't be reached.
Tools are scoped server-side: Open to Meet attendees of events I'm checked in to, quick profiles of current
matches/suggestions/connections only, my own connections feed, my own profile. It never reveals anyone's connections,
connection count, or whether someone declined.
