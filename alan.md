# Claude Code brief: Alan · ML and algorithms
HackGT 13 · Formal Connection · Tracks: AI/ML + Data Visualization

## Start here (for Alan, not for the agent)

You need Claude Code installed and this repo cloned. Open a terminal, go to the repo folder, and run these three lines:

```
git pull
./scripts/claude-setup.sh alan
claude "$(cat prompts/alan.md)"
```

Line 2 runs once per laptop and takes about a minute. Line 3 starts Claude Code and hands it this file, so you never copy and paste anything.

- **Every session after the first:** just run `claude` and type `continue`. It already knows who you are and what you were doing.
- **After a long break, or picking up someone else's half-finished task:** `claude "$(cat prompts/resume.md)"`
- **If line 2 says the file doesn't exist:** Adam hasn't pushed the team kit yet. Ask him for it. You can still start now: run `claude`, paste this whole file in as your first message, and the agent will follow it.
- **On Windows:** do all of this inside WSL (Ubuntu), not PowerShell. Claude Code, python3, and the hooks all expect it.
- **First time Claude Code starts:** it asks whether you trust the folder (yes) and whether to use the project's MCP servers (yes). Then type `/mcp` once and sign in to Supabase.

Agent: the block above is for the human. If the setup script hasn't been run on this machine, offer to run it for them, then continue with the brief below.


You are Alan's lead coding agent. Alan owns the brain of the app: the FastAPI service in `ml/` and everything behind it, including profile extraction, embeddings, matching, suggestions, verification, the graph data, the feed ranking, and the chatbot. This is the core of the AI/ML track, so the work has to be correct, explainable, and honest about its numbers. Three other agents (Adam's, Arjun's, Akshar's) build in this repo at the same time; PROGRESS.md and `docs/api.md` keep you in sync.

## Operating mode
- Auto mode is on. Don't ask permission for routine work: editing files in `ml/`, installing Python dependencies, running scripts and tests, committing and pushing.
- Ask Alan only for: secrets (Anthropic API key, Supabase service key and database URL, signing keys), dashboard access, physical phone steps, contract changes that affect another owner beyond the smallest change, or anything irreversible outside the repo. Ask for everything you need in one message and keep working on what isn't blocked.
- Run `/claude-api` before writing any Anthropic SDK code, and send any other library or API question to `docs-researcher` before coding against it.
- Keep your context lean: tests through `test-runner`, metrics through `ml-evaluator`, audits through `privacy-auditor` and `contract-keeper`.
- Use Opus (`/model opus`) for scoring design, ranker and classifier work, and tricky privacy logic. Sonnet is fine for routine endpoints.

## First session
0. Check the setup ran: `.claude/owner.local` should say `alan` and `.claude/skills/handoff/` should exist. If not and `scripts/claude-setup.sh` is present, offer to run `./scripts/claude-setup.sh alan` for Alan now. If the script isn't there either, the team kit hasn't been pushed yet: tell Alan to ask Adam for it. Until then, follow MASTER_SPEC Section 0 by hand.
1. `git pull --rebase`. Read MASTER_SPEC.md fully (Section 6 twice), then AGENTS.md, PROGRESS.md, docs/schema.sql, docs/api.md, and `ml/README.md`.
2. Run `python run_demo.py` in `ml/` and map what already works: `ml/ml/llm.py`, `profiles.py`, `scoring.py`, `ranker.py`, `encounter.py`, `synth.py`, `viz.py`, `config.py`. You build endpoints on top of these modules. Don't rewrite what works.
3. Run `/next-task` and go.

## Service shape (set it up in AL1, keep it the whole weekend)
- `ml/app/main.py` (FastAPI app and lifespan), `auth.py` (JWT), `db.py` (connection pool), `routers/` with one file per area (profile, matching, suggestions, verification, conversations, connections, graph, feed, events, assistant, me), `workers.py` for background loops.
- Other owners add routers too: Arjun (GitHub connect, ingestion), Akshar (invites, BLE tokens and sightings, presence, location shares). Keep `main.py` easy to extend and review their PROGRESS.md notes.
- Every endpoint except `/health` requires the Supabase JWT. Errors are `{"error": "message"}`. Shapes match `docs/api.md` exactly.

## Your tasks in order (MASTER_SPEC Section 13)

### Phase 0: Friday night
**AL1 FastAPI service.** Done when a phone can hit `/health`.
- JWT: newer Supabase projects sign tokens with asymmetric keys published at `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`; older ones use the HS256 JWT secret. Check which one the project uses, then verify with PyJWT (a cached `PyJWKClient` for JWKS), audience `authenticated`, and expiry. The user id is `sub`.
- Database: psycopg 3 pool plus the `pgvector` adapter for vector queries. On Supabase's transaction pooler (port 6543) prepared statements break, so set `prepare_threshold=None` or use the session pooler. The service key and database URL come from env vars in `ml/.env.example`.
- Lifespan: load bge-small once, start the background loops: suggestions every 30 seconds, sessionizer every 30 seconds, IDF and clusters every 5 minutes, retention cleanup hourly (sightings older than 24 hours, ended location shares, presence older than 45 minutes).
- CORS for the dashboard origin and localhost.
- Reaching phones: auto mode won't let an agent open a public tunnel unless the setup script's allow rule is in place. If you get blocked, ask Alan to run `cloudflared tunnel --url http://localhost:8000` in a separate terminal and share the URL with the team, or deploy to Railway or Render. Put the working command in AGENTS.md.

**AL2 Extraction endpoints.** Done when all four teammates' real profiles are extracted and stored.
- `POST /profile/ingest` (resume multipart or `{source: github | manual | web}`), `GET /profile/status?job_id=`, `GET` and `PATCH /profile/interests`. Arjun's GitHub digest and resume text feed into your extraction function; agree on its signature with him early.
- Model IDs live in `ml/ml/config.py`: Sonnet for resumes, icebreakers, and the chatbot; Haiku for bulk work. As of today the API IDs are `claude-sonnet-5` and `claude-haiku-4-5-20251001`; confirm with `/claude-api`.
- JSON-only output with the Section 6.2 schema, validated by pydantic, one retry, then a clear failure. Prompt rules: specific over generic, no filler skills, max 20 interests, only facts in the document, evidence line per interest, never infer sensitive attributes. Add a post-filter for sensitive terms too.
- Cache the long static system prompt. Canonicalize with the Section 6.4 thresholds (merge at 0.88 or above, ask Haiku between 0.80 and 0.88) and print merges on real data to tune them.
- Tune on the team's four real profiles with their OK. Log token use per call.

### Phase 1: Saturday morning (Must items end to end)
**AL3 Vectors and matches.** Profile vectors into pgvector (HNSW, cosine), per-event IDF, `GET /events/{id}/matches` with V1 scores, shared topics, the per-viewer 80th-percentile highlight, and impression logging. Arjun's synthetic attendees (AR3) give you people to rank. Adam's AD6 is waiting on this.
**AL4 Quick profile and starters.** `GET /matches/{id}/quick-profile` (name, photo, role, headline, shared topics with strengths, facet overlap numbers) only for current matches or connections, otherwise 403. `GET /matches/{id}/starters` returns `{why, openers[2]}`, grounded only in what both users can see. Cache per pair.
**AL5 Suggestions.** `PATCH /me/open-to-meet`, generation for checked-in Open to Meet users (Section 7.5 limits), `POST /suggestions/{id}/respond`. Until both say yes, the response is `{status: "waiting"}` no matter what the other person did, with no timing or field differences. Mutual yes creates the `chats` row (`user_a < user_b`) and notifications. Adam's AD7 is waiting on this.
**AL6 Verification and connecting.** QR: `GET /qr/verify-token` returns an HMAC-SHA256 signed payload (user, nonce, expiry 60 seconds) using a new `QR_SIGNING_KEY` env var; `POST /qr/verify` checks signature, expiry, and that the nonce was never used (Section 8.2 keeps `handshakes` as QR verification records, so store nonce use there, adding a column through `/contract-change` if needed). Then conversations, `GET /conversations/pending`, checklist (shared topics ranked by min(w_a, w_b) * idf), `POST /conversations/{id}/feedback`, mutual connect (connections row with `how_met = in_person` plus a chat), and `POST /connections/{user_id}/followup-draft` with Haiku. One "no" leaves no trace. Akshar's AK3 and Adam's AD8 wait on this.
**AL7 Graph data.** `GET /graph` and `/graph/expand` in the exact JSON from Section 9. Pair with Arjun on the shape first and put a sample in `docs/mocks/`. Only allowed people, never an edge between two of the viewer's connections, cluster ids from HDBSCAN.

### Phase 2: Saturday afternoon (Should items)
**AL8 Bluetooth verification.** Needs Akshar's AK2 (sightings flowing) and AK6 (labeled recordings). Sessionize (gaps under 60 seconds), compute Section 6.8 features, retrain with real sessions weighted 3x, threshold 0.7 plus at least 3 minutes above -65 dBm, create `method = ble` conversations and prompts. Report the "same table, not talking" false-positive rate separately.
**AL10 Feed.** `GET /feed` ranked by 0.6 relevance + 0.3 recency (48-hour decay) + 0.1 talked-about topic, summaries when an author has 3 or more items in 24 hours, reply suggestions with Haiku, `POST /feed/posts`, `GET /feed/insights`.
**AL9 Learned ranker.** Retraining script, split by user, AUC and NDCG@10 for V1 vs logistic regression vs LambdaRank, report through `ml-evaluator`, labeled "simulated outcomes". Optional: speed-dating validation with Arjun's prepared data, validation only.

### Phase 3: stretch
**AL11 Chatbot.** `POST /assistant/chat`, Sonnet with the four Section 6.12 tools. Every tool enforces scope in Python, not in the prompt. Test adversarial asks ("how many connections does Maya have", "list everyone at the event", "who declined me") and make sure they get refused or scoped.

## Also yours (unassigned in the spec)
- `DELETE /me`: delete the user's rows in every table, their Storage objects, and their auth user (admin API). Adam adds the button. Every new table you create must be covered.
- The push sender for Adam's AD10 lives in FastAPI; build the helper when he's ready.
- Retention jobs from Section 7.7.

## Tests worth writing first
Score symmetry, per-viewer highlight, candidate-pool exclusions, silent "no" (identical responses for declined vs pending), quick-profile 403 for strangers, no connection-to-connection edges in network mode, QR signature, expiry, and nonce reuse.

## Pitch prep (Sunday)
Be ready to explain in one breath each: IDF overlap, complementarity, how the ranker learns from verified conversations, and the encounter classifier's honest limitation. Every number you quote says whether it came from simulated or real data.

## Dependencies
You need Adam's AD1 (schema) and AD2 (auth) to test real tokens, Arjun's AR1, AR2, and AR3 for inputs and people, and Akshar's AK2 and AK6 for AL8. Adam (AD6, AD7, AD8), Akshar (AK3), and Arjun (AR4 live data, AR6 clusters) are waiting on you, so ship thin working endpoints first and deepen them after.

## Done means
The Section 13 done-when holds, pytest passes, `contract-keeper` finds no drift, `/privacy-check` is clean for anything touching people data, and `/handoff` pushed it with a PROGRESS.md entry. AGENTS.md has the `ml` run and test commands.

## Autopilot lines (Alan types these)
```
/goal AL1 is done: FastAPI runs with JWT verification and the database pool, GET /health returns 200 through the phone-reachable URL shown in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 25 turns
/goal AL2 is done: all four teammates' profiles are extracted with evidence lines and stored, pytest passes, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
/goal the current task from /next-task meets its done-when in MASTER_SPEC Section 13 with tests passing in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
```
