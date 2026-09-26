# REQUESTS

Asks between owners. The session hook shows each agent the open (`- [ ]`) items in its owner's section at
session start. When you finish one, change `- [ ]` to `- [x]` and mention it in your PROGRESS.md entry.
Add asks to someone else's section as `- [ ] (from <you>) <ask>`. Keep each item actionable in one line or two.

## adam
- [x] (from alan) Review and merge the ML service PR (branch `claude/quirky-euler-dnbsgt`): AL1-AL7, `/dashboard/{event_id}`, `DELETE /me`. It also adds `REQUESTS.md` and this hook feature.
- [ ] (from alan) Mobile endpoints now live (docs/api.md 15-28, mocks in docs/mocks/): AD6 uses `GET /events/{id}/matches`, `GET /matches/{id}/quick-profile` (overlap radar = `facet_overlap`), `GET /matches/{id}/starters`, `GET /suggestions` + `POST /suggestions/{id}/respond`; AD8 uses `GET /conversations/pending`, `POST /conversations/{id}/feedback`, `GET /connections`, `POST /connections/{id}/followup-draft`. The old `/qr/token`, `/handshake`, `/feedback` names still work as aliases.
- [x] (from alan) Home toggle: call `PATCH /me/open-to-meet {open}` instead of writing `profiles.open_to_meet` directly, so turning it OFF also ends live meetup location sharing (MASTER_SPEC 3.3).
- [x] (from alan) Add a "Delete my account" button that calls `DELETE /me`, then signs out.
- [ ] (from alan) AD10 push: there is no column for Expo push tokens yet. Please add one via /contract-change (e.g. `profiles.expo_push_token text`, owner-writable). The ML service already writes `notifications` rows (kinds: suggestion, connect_prompt, connected); I'll add the Expo push sender in FastAPI once the column exists.
- [ ] (from alan) For the ML server `.env`: the Supabase session-pooler `DATABASE_URL`, and whether the project signs user JWTs with JWKS (new signing keys) or the legacy HS256 secret (then share `SUPABASE_JWT_SECRET`).

## arjun
- [ ] (from alan) AR1 GitHub: don't write extraction. Store the digest as a `raw_documents` row (`source='github'`, `text=ml.llm.github_to_text(repos)`), then either the app calls `POST /profile/ingest {"source":"github"}` or you call `app.profile_store.extract_existing(user_id, doc_id, "github", text)`.
- [ ] (from alan) AR2 resume from Storage: after pdfplumber, call `app.profile_store.ingest_text(user_id, "resume", text, {"path": ...})`. (Multipart upload to `/profile/ingest` already works too.)
- [ ] (from alan) AR3 synthetic attendees: follow `seed_person()` in `ml/tests/conftest.py` (auth.users + profiles with `is_synthetic=true`, then `profile_store.store_extraction` per source from `ml.synth.make_population`), check them in to event 1 (`attendance`), set ~half `open_to_meet=true`. The 60-person version was already exercised successfully (see PROGRESS 'dashboard' entry).
- [ ] (from alan) AR4/AR5 graph: build against `docs/mocks/graph.json` (real output) and docs/api.md 26-27. Node ids `me`, `u_<uuid>`, `t_<id>`; edges only me->person and me|person->topic.
- [ ] (from alan) AR6 organizer map: `GET /dashboard/{event_id}` is live (api.md 14): anonymized node ids, clusters >= 5, `gaps`, live `edges`; poll every 5-10 s.
- [ ] (from alan) AR8 GitHub poller: insert `feed_items` with `kind='github'`, `title`, `body`, `url`, `payload`; leave `embedding` null (the feed endpoint embeds on first read).
- [ ] (from alan) AR10 web mentions: `raw_documents.source` has no `'web'` value, so `/profile/ingest {"source":"web"}` returns 400 until a /contract-change adds it.

## akshar
- [ ] (from alan) AK3 QR screens: show `GET /qr/verify-token` (refresh every 30 s, expires in 60 s); scanner sends `POST /qr/verify {payload, signature, event_id?}`; errors `invalid_signature | expired | self_scan | already_used`; the response has `conversation_id` + `checklist` for the checklist screen.
- [ ] (from alan) AK2 BLE: your `/ble/tokens` + `/ble/sightings` router goes in `ml/app/routers/ble.py` (expose `router`, add `"ble"` to `ROUTERS` in `ml/app/main.py`). I read `sightings` (observer_id, observed_token, rssi, ts, zone_id) + `ephemeral_ids` for AL8. Upload batches every 30 s as in api.md 12.
- [ ] (from alan) AK2/AK6: the encounter features include "fraction of time each phone was stationary" (accelerometer), but `sightings` has no field for it. If you can send it, add `stationary boolean` to sightings via /contract-change; otherwise I'll drop that feature.
- [ ] (from alan) AK6 labeled sessions: save as `ml/datasets/ble_labeled/<session>.csv` with columns `session_id,label,observer,observed,ts,rssi` and `label` in `talking|in_line|walking_past|across_room|same_table_laptops`, one file per recording (small, fine to commit). These matter: the classifier is trained on simulated sessions and scores a very steady real signal as 'same table, not talking'; your recordings (weighted 3x) calibrate it. Retrain with `cd ml && python scripts/train_encounter.py`.
- [ ] (from alan) AK7 meetup location: `POST /location-shares/{suggestion_id}` only when `suggestions.status='matched'`; I already delete `location_shares` rows on a verified conversation and when either person turns Open to Meet off. Please enforce the 30-minute expiry on write.
- [ ] (from alan) AK4 invites: on accept, create the connection (`how_met='invite'`, `invite_id`) and a chat with `app.social.ensure_chat(conn, a, b, "connection")` + `app.social.notify(conn, user, "connected", {...})`, and call `app.population.invalidate()`.

## alan
- [ ] Put server secrets in a local `.env` (never committed): DATABASE_URL, SUPABASE_URL=https://mwfzgkikbmnghueolfnw.supabase.co, SUPABASE_JWT_SECRET (only if legacy HS256), QR_SIGNING_KEY (any long random string), ANTHROPIC_API_KEY, SUPABASE_SERVICE_KEY (for DELETE /me).
- [ ] Run `cd ml && uvicorn app.main:app --host 0.0.0.0 --port 8000` + `cloudflared tunnel --url http://localhost:8000` on a laptop and share the URL as ML_API_URL (finishes AL1).
- [ ] Get the team's OK, then run the four real profiles through `/profile/ingest` and tune from the `canon merge` log lines (finishes AL2).
