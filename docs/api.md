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
Only for events with no company (`org_id` null, e.g. the HackGT demo event). Company events check people in by QR
(45, `POST /events/join`) or printed join code (`POST /events/enter`): `403 scan the event QR or enter the join code`.

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

## 12. Bluetooth (AK2, Akshar; code in `ml/app/routers/ble.py`)
- `POST /ble/tokens` (body `{}`) -> `{ "tokens": [ { "token": "k3j9x2p1", "valid_from": "...", "valid_to": "..." } ] }`
  One token per 10-minute window, from the current window through the next 24 hours (144 tokens). Idempotent:
  calling again returns the same token for windows already issued. Token = 8 lowercase base32 chars (5 random bytes),
  advertised as the BLE local name next to the service UUID. The token -> user mapping never leaves the server.
- `POST /ble/sightings` <- `{ "event_id": 1, "device_model": "iPhone 15", "foreground": true, "sightings": [ { "token": "k3j9x2p1", "rssi": -58, "ts": "...", "zone_id": null } ] }`
  -> `{ "accepted": 1, "dropped": 0 }`. `device_model` and `foreground` are optional (the observer's own phone).
  Max 2000 sightings per batch. Dropped silently: unknown tokens, tokens not live at `ts`, the caller's own tokens,
  `ts` older than 24 h or more than 2 minutes in the future. Raw sightings are deleted after 24 h.

## 13. Presence / open to chat (nice to have)
- `POST /presence` <- `{ "building_id": "student_center", "open_to_chat": true }`
- `DELETE /presence`
- Invites: see section 36.

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
    {"source": "me", "target": "u_<uuid>", "kind": "match", "weight": 0.74, "facet": "technical",
     "explanation": {
       "summary": "You both work on reinforcement learning and pytorch. Your strongest overlap is technical.",
       "basis": "v1",
       "factors": [ {"label": "technical overlap", "contribution": 0.196, "share": 0.259} ],
       "shared_topics": ["reinforcement learning", "pytorch"]}},
    {"source": "u_<uuid>", "target": "t_42", "kind": "has_topic", "weight": 0.9},
    {"source": "me", "target": "t_42", "kind": "has_topic", "weight": 0.8}
  ]
}
```
`explanation` is on `match` and `connection` edges only ("why you matched", MASTER_SPEC 6.9). It is the
match score decomposed into the features the ranker actually used, so the parts sum back to the score:
`factors` is the top 3 by `contribution` (weight x feature value), `share` is that factor's fraction of the
positive total — enough to draw a small bar. `basis` says where the numbers came from: `v1` (hand-tuned
linear score, exact), `lr` (logistic ranker, exact in the logit), or `v1_proxy` (a tree ranker is serving and
is not linearly decomposable, so the bars are indicative — label them as approximate). `summary` is
template-built from those factors and the shared topics; it never names an interest the two do not share.
By default the strongest few summaries are then rewritten by Haiku in one batched call per request, for
variety across a screenful of matches — those carry `"varied": true`. The rewrite is rejected if it names
an interest the pair does not share, and the factor numbers are never touched, so the bars always stay the
ranker's. Set `EXPLAIN_VARY=0` to serve the deterministic templates only (no API key needed).
Topic edges carry no `explanation`. Evidence lines are not repeated here — they are on
`GET /matches/{id}/quick-profile` and `expand()`.
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

`POST /connect/github/session` (Bearer JWT) — for users who signed in with GitHub, so they are not asked to
authorize GitHub a second time. Supabase returns a `provider_token` once, in the session right after an OAuth
sign-in (it is not persisted), and the app posts it here immediately:
```json
{ "provider_token": "gho_...", "scopes": "read:user" }
```
The server validates the token against GitHub before trusting it, stores it Fernet-encrypted in `linked_accounts`
(same as the callback above), and runs the same background ingestion. `scopes` is optional and defaults to
`read:user`. Response:
```json
{ "connected": true, "login": "octocat" }
```
Errors: `400 {"error": "github rejected that token"}` if GitHub will not accept it. The token is never returned
to the client.

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

## 36. Private invites (AK4, Akshar; code in `ml/app/routers/invites.py`)
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

## 37. Meetup location sharing (AK7, Akshar; code in `ml/app/routers/location.py`)
Only between the two people in a `matched` suggestion, while both are Open to Meet, until they meet (any verified
conversation after the match), for at most 30 minutes, and only within 2 hours of the match. Every "not allowed"
reason returns the same `410 {"error": "sharing ended"}` and deletes both rows. The other phone can also subscribe
to its `location_shares` row through Supabase Realtime (RLS: only the other participant with an active temporary
share reads).

`POST /location-shares/{suggestion_id}` <- `{ "lat": 33.7756, "lng": -84.3963 }` (every ~10 s while sharing)
-> `{ "sharing": true, "expires_at": "2026-09-26T15:34:05Z" }` (one shared 30-minute window; updates never extend it)

`GET /location-shares/{suggestion_id}`
```json
{ "suggestion_id": 12, "other": { "user_id": "uuid", "name": "Maya R." }, "sharing": true,
  "expires_at": "2026-09-26T15:34:05Z",
  "their_location": { "lat": 33.7760, "lng": -84.3970, "updated_at": "2026-09-26T15:10:02Z" } }
```
`their_location` is null until both people have opted into temporary sharing. The app can show a rough distance band,
an arrow, and an external walking-navigation action only during that reciprocal sharing window.

`DELETE /location-shares/{suggestion_id}` -> `{ "sharing": false }` (ends sharing for both)

`GET /location-shares` -> `{ "meetups": [ { "suggestion_id": 12, "other": { "user_id": "uuid", "name": "Maya R.", "photo_url": null } } ] }`
(matched in the last 2 hours and not met yet)

Errors: `404 meetup not found` (not a participant), `410 sharing ended`.

## 38. POST /tap/claim   "hold your phones together" (Akshar; code in `ml/app/routers/tap.py`)
Request `{ "token": "k3j9x2p1", "rssi": -38, "event_id": 1 }`: the other phone's current Bluetooth token (api.md 12), heard
at touching range (smoothed RSSI >= -50 dBm) for ~2 s. The app repeats the claim every second while the phones stay together.
```json
{ "status": "waiting" }      // the other phone hasn't claimed me back yet (within 15 s)
{ "status": "verified", "conversation_id": 31, "handshake_id": null,
  "other": { "user_id": "uuid", "name": "Maya R.", "photo_url": null },
  "checklist": [ { "interest_id": 42, "name": "reinforcement learning" } ] }
```
Verified only when BOTH phones claim each other within 15 s. Creates a `conversations` row with method `ble` (no schema
change) and `connect_prompt` notifications, same as 20. Errors: `400 too_far`, `400 self_scan`, `404 not_found` (token not live),
`403 this profile isn't available` (blocked). QR (19-20) stays the fallback.

## 39. PATCH /profile/manual   owner: Alan (MASTER_SPEC 9)
LinkedIn-style fields the user types (LinkedIn is sign-in only, nothing is fetched from it). Every field optional; only sent fields change.
Request `{ "headline": "CS @ Georgia Tech", "experience": "...", "interests_text": "I build robots", "seeking": "...", "offering": "..." }`
```json
{ "profile": { "headline": "CS @ Georgia Tech", "experience": "...", "seeking": "...", "offering": "...", "interests_text": "I build robots" },
  "job_id": "a1b2c3", "status": "queued" }
```
Re-runs manual extraction over everything typed so far (poll 2 `GET /profile/status`). `status: "nothing_to_extract"`, `job_id: null` when all fields are empty.

## 40. GET /me/accounts   owner: Alan
The caller's sign-in method and profile sources for the "Your sources" screen. Never returns tokens.
```json
{ "sign_in": { "provider": "linkedin", "email": "maya@gatech.edu" },
  "profile": { "name": "Maya Rao", "photo_url": null, "headline": "", "experience": "", "seeking": "", "offering": "", "interests_text": "", "web_search_opt_in": false },
  "sources": {
    "github":   { "available": true, "connected": true, "login": "maya-codes", "last_synced_at": "2026-09-26T15:04:05+00:00",
                  "added": true, "updated_at": "2026-09-26T15:04:05+00:00", "interests": 9 },
    "resume":   { "added": true, "updated_at": "2026-09-26T14:00:00+00:00", "interests": 12 },
    "manual":   { "added": false, "updated_at": null, "interests": 0 },
    "facebook": { "available": false, "connected": false } } }
```
`sign_in.provider` is `linkedin | email` (or Supabase's raw provider name). `github.available` is false when the server has no GitHub OAuth app configured.

## 41. DELETE /profile/sources/{source}   owner: Alan
`source` = `github | resume | manual`. Removes that source's documents and rebuilds interests from what's left (interests added on the review
screen stay). `github` also deletes the stored OAuth token and the user's GitHub feed items. Response: `{ "removed": "github", ...same shape as 3 }`.

## 42. GET /profile/skills   owner: Adam (onboarding, docs/ONBOARDING.md)
The caller's active structured skill profile. Empty (`skills: []`, `profile_version: 0`) until the builder has run.
```json
{ "user_id": "uuid",
  "skills": [ { "name": "python", "confidence": 0.92, "sources": ["github", "resume"] } ],
  "experience_years_estimate": 3.5, "domains": ["ml", "backend"],
  "project_highlights": [ { "name": "rag-eval", "description": "", "stars": 12, "forks": 2, "languages": ["Python"],
                            "frameworks": ["fastapi"], "commits_last_year": 80, "pinned": true, "url": "https://github.com/..." } ],
  "education": [], "certifications": [], "generated_at": "2026-09-26T19:00:00Z", "profile_version": 1 }
```
`POST /profile/ingest` (1) now also accepts DOCX resumes (multipart `file`, max 10 MB); the file is stored in the private
`resumes` bucket and tracked in the `resumes` table.

## 43. POST /assistant/demo   owner: Adam (demo mode)   ⚠️ no JWT (documented exception to the ml rules)
The assistant for the app's demo mode, which has no account. It never reads the database: the model only sees the
fictional demo data the app sends in `context` (lib/demo/backend.ts `assistantContext()`), capped at 20 KB.
Rate-limited in memory: 12 requests/minute per client IP and 600/hour overall; `429 slow down...` beyond that.
Request `{ "messages": [ { "role": "user", "content": "Who should I meet?" } ], "context": { ... } }` (max 20 messages)
Response `{ "reply": "..." }`; `503` if the model can't be reached (the app then falls back to its offline answers).
Live mode keeps using 35 (`/assistant/chat`, JWT + server-scoped tools).

## 44. POST /conversations/simulate   owner: Adam (demo attendees)
Seeded demo attendees (profiles.is_synthetic) can't tap phones or scan a QR, so after a mutual yes with one, the app
may create the verified conversation directly. Request `{ "user_id": "<demo attendee uuid>" }`.
Response: the same shape as one item of `GET /conversations/pending` (conversation_id, method, other, checklist).
`403 only available with demo attendees` for a real person (or if the caller is synthetic);
`403 you can simulate meeting only after you both said yes` without a matched suggestion.
Demo attendees also answer on their own (ml/app/synthetic.py): they say yes after the real person does, reply in chat
in character, and say yes to connecting. Suggestions never pair two demo attendees.

## 45. Company events   owner: Adam (web + company check-in)
`GET /events` → `{ "events": [ { "id": 1, "name": "HackGT 13", "host": "", "location": "", "starts_at": null, "ends_at": null, "description": "", "promo": "", "registered": true, "checked_in": true, "mine": false } ] }`

`GET /me/org` → `{ "account": "person" | "company", "org": { "id": 3, "name": "Acme", "website": "", "industry": "", "about": "", "city": "", "contact_name": "", "contact_email": "", "size_band": "" } | null, "events": [] }`
`account` is `company` only when `profiles.account_kind = company` (separate company login). A person who happens to sit on an org stays `person` and does not get organizer tools.

`POST /orgs` ← `{ "name": "Acme" }` → `{ "org": { "id": 3, "name": "Acme" } }` (legacy; new companies use 46)

`POST /events` ← `{ "name": "Fall fair", "location": "Klaus", "starts_at": null, "ends_at": null }` (org members only; else `403 create a company first`)
→ `{ "event": { ...same card as GET /events } }`

`POST /events/{event_id}/register` → `{ "ok": true }` (signs up only; does NOT check in. `checked_in` stays false)
`GET /events/{event_id}/join-token` (organizers only) → `{ "payload", "signature", "expires_at", "event_id", "qr_payload" }` (7-day join QR)
`POST /events/join` ← `{ "payload", "signature" }` → `{ "event_id": 3, "name": "Fall fair" }`
Checks in a person who already registered. Registered but not scanned = not checked in = invisible to other attendees.
`POST /events/enter` ← `{ "code": "ABC-123" }` → `{ "event_id": 3, "name": "Fall fair" }` registers **and** checks in (`404 code not found`). Printed join codes are the QR equivalent.
`GET /events/{event_id}/updates` (registered or organizer) → `{ "event_id": 3, "promo": "", "description": "", "posts": [ { "id": 1, "body": "Talks start at 2", "created_at": "..." } ] }`
Errors: `400 invalid_signature`, `400 expired`, `403 organizers only` (join-token), `403 register for this event first` (join), `404 event not found`, `404 code not found`.
Joining an event is not a connection. People at the event appear through 5 `GET /events/{id}/matches` (checked-in attendees, ranked), not a full attendee directory. Organizers see registration and check-in counts, never attendee names.

## 46. Company accounts   owner: Adam   ⚠️ POST /orgs/signup is public (no JWT; documented exception)
Separate company login from attendee LinkedIn/email. Demo does **not** verify the work email: the service creates a confirmed Auth user.

`POST /orgs/signup` ← `{ "company_name", "contact_name", "contact_email", "password", "website?", "industry?", "city?", "about?", "size_band?" }`
→ `{ "ok": true, "org": { ...same org object as GET /me/org } }`
Then the app signs in with email+password. `409 that work email already has an account. Sign in.` `400 enter a work email`. Rate limit 30/hour.

`PATCH /orgs` ← any subset of `{ name, website, industry, city, about, size_band, contact_name }` → `{ "org": { ... } }`

`POST /orgs/events` ← `{ "name", "location?", "starts_at?", "ends_at?", "description?", "promo?" }`
→ `{ "event": { "id", "name", "location", "starts_at", "ends_at", "description", "promo", "join_code", "registered", "checked_in" } }`
`join_code` is shown once (hashed at rest). Shape `XXX-XXX`, case-insensitive, dashes ignored.

`GET /orgs/events/{event_id}` (organizers only) → `{ "event": { ...studio, join_code: null }, "join": { "payload", "signature", "expires_at", "qr_payload" }, "posts": [ ... ] }`

`POST /orgs/events/{event_id}/rotate-code` → `{ "join_code": "NEW-001" }` (invalidates the previous code)

`POST /orgs/events/{event_id}/promote` ← `{ "body": "Talks start at 2" }` → `{ "post": { "id", "body", "created_at" } }`
Writes `event_posts`, updates `events.promo`, and notifies registered people (`notifications.kind = event_update`). Not a group chat.

Additive fields (no breaking changes):
- `GET /matches/{id}/quick-profile` (15): `"demo_attendee": true|false`.
- `GET /me/accounts` (40): `sources.github.repo_count` = public repos read by the last import (`0` = connected but nothing
  public; `null` = never imported).
- `POST /profile/ingest` (1): a PDF with little or no text layer is transcribed by Claude before extraction.
