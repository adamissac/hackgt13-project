# Claude Code brief: Arjun · research, data, and visualization
HackGT 13 · Formal Connection · Tracks: AI/ML + Data Visualization
Start from the repo root with `claude "$(cat prompts/arjun.md)"`, or paste this whole file as the first message.

You are Arjun's lead coding agent. Arjun owns what feeds the AI and what the judges see: GitHub and resume ingestion, the synthetic attendees that make the event feel alive, the research datasets, and the entire `dashboard/` (Connection Graph, organizer community map, personal dashboard, feed insights). The Data Visualization track is won or lost on your pages, so they must be correct, fast, and beautiful on a phone and on a big screen. Three other agents (Adam's, Alan's, Akshar's) build in this repo at the same time; PROGRESS.md and `docs/api.md` keep you in sync.

## Operating mode
- Auto mode is on. Don't ask permission for routine work: editing files in `dashboard/` and your ingestion code in `ml/`, installing dependencies, running builds and tests, committing and pushing, deploying the dashboard to the team's Vercel project.
- Ask Arjun only for: secrets and accounts (GitHub OAuth app, Vercel, Kaggle credentials, dataset registrations), physical phone steps, or anything irreversible outside the repo. Never ask Adam (or anyone) for approval: decide within your area, and for a contract change that affects another owner, make the smallest additive change yourself, record it in PROGRESS.md, and note it in that owner's `REQUESTS.md` section. Ask for everything you need in one message and keep working on what isn't blocked.
- Verify before you code: Next.js, react-force-graph, GitHub API, and pdfplumber details go to `docs-researcher` first.
- After any visual change, send `browser-tester` to check the page at 390x844 and 1440x900. Use the `frontend-design` plugin skill to push the pages past "default chart" quality.
- Keep your context lean: tests through `test-runner`, audits through `privacy-auditor` and `contract-keeper`.

## First session
0. Check the team kit is installed: `.claude/owner.local` says `arjun` and `.claude/skills/handoff/` exists. If not, tell Arjun to copy the kit into the repo root and run `./scripts/claude-setup.sh arjun`. Until then, follow MASTER_SPEC Section 0 by hand.
1. `git pull --rebase`. Read MASTER_SPEC.md fully (Sections 3.11, 3.12, 5, 6.13, and 10 twice), then AGENTS.md, PROGRESS.md, docs/schema.sql, docs/api.md, and `ml/README.md`.
2. Run `/next-task` and go.

## Your tasks in order (MASTER_SPEC Section 13)

### Phase 0: Friday night
**AR1 GitHub connect and ingestion.** Done when connecting GitHub produces interests.
- A GitHub OAuth App (Arjun creates it; callback `<FastAPI base URL>/connect/github/callback`). Request the smallest scope that works: `read:user`, no `repo` (public repos only, which is all we need).
- `GET /connect/github/start` authenticates the user by JWT and returns the authorize URL as JSON with a signed, short-lived `state` bound to the user, because the phone opens the URL in a browser and can't send headers there. Record it in `docs/api.md` and note it in Adam's `REQUESTS.md` section (his AD4 builds the app side).
- The callback exchanges the code server-side, encrypts the token with Fernet using `TOKEN_ENCRYPTION_KEY`, stores it in `linked_accounts`, and redirects to the app's deep link. Tokens never reach the client.
- Ingestion per Section 5.3: `GET /user/repos?sort=updated&per_page=100`, skip forks, then languages, README (first ~1,200 characters), topics, stars, pushed_at. Build the digest, store it in `raw_documents`, and call Alan's extraction function (agree on its signature early).
- Use ETags (`If-None-Match`); 304 responses don't count against the 5,000 per hour limit.

**AR2 Resume text.** Done when an uploaded PDF becomes text. Download from the private `resumes` bucket with the service key, extract with pdfplumber. If a PDF yields almost no text (scanned), hand the PDF itself to Claude as a document block through Alan's LLM helper instead of failing.

**AR3 Synthetic attendees.** Done when the matches endpoint has people to rank.
- 60 to 100 attendees from `ml/ml/synth.py` (8 archetypes, cross-disciplinary secondaries, recruiters), `is_synthetic = true`, registered and checked in to HackGT 13, a subset Open to Meet.
- If `profiles.id` references `auth.users`, create the users through the Supabase admin API with `example.com` emails. Initials avatars only, no real faces or real names of real people.
- Run them through the same pipeline as real users (interests, weights, vectors) so matching treats them identically.
- Make the demo sing: seed a few attendees who share rare topics with the teammates' real profiles, so the Section 12.1 story has strong matches and a visible "reinforcement learning" cluster.

### Phase 1: Saturday morning (Must items end to end)
**AR4 Dashboard and Connection Graph (matches mode).** Adam's AD9 waits on this.
- Next.js with TypeScript in `dashboard/`. Graph page first on mock JSON that matches Section 9's `/graph` example (put it in `docs/mocks/`), then live `/graph` once Alan's AL7 lands.
- `react-force-graph-2d` loaded with `dynamic(..., { ssr: false })`. Forces from Section 10, self node pinned at the center, `nodeCanvasObject` for size, green ring, and labels, dashed links for suggested matches, facet colors that are colorblind-safe.
- Embedded mode: listen for `{type: "auth", token}` messages on both `window` and `document`, keep the token in memory, never read it from the URL.
- Deploy to Vercel over HTTPS early (iOS WebViews block plain http pages) and share the URL with Adam.

### Phase 2: Saturday afternoon (Should items)
**AR5 Graph interactions.** Expand that merges nodes by id without resetting positions, then a gentle reheat; controls bar (Depth, Max people, Min score, Facet, Rebuild); side panel with topic tags, "why you matched", and search; timeline slider filtering client-side; My Network mode (never an edge between two connections); Export PNG that posts the canvas data URL back to the app, since downloads rarely work inside a WebView.
**AR6 Organizer community map.** Needs Alan's clusters (AL3). UMAP 2D scatter with cluster hulls and c-TF-IDF labels, new connections drawn live as anonymous edges (poll the FastAPI endpoint every 5 to 10 seconds; organizers can't read `connections`), and the gap table ("these groups should be talking and aren't"). No names, groups of at least 5. Big-screen layout with large type.
**AR8 GitHub activity poller.** Every 10 to 15 minutes per connected user, public events into `feed_items` (new repo, push to a public repo, release), ETag-cached, embedded with Alan's embedding helper. GitHub's events API can lag from 30 seconds to hours, so for the demo also catch new repos from `/user/repos` `pushed_at`.

### Phase 3: stretch
**AR7 Personal dashboard and feed insights.** Network growth line, in person vs invite donut, top shared topics bars; trending topics and an activity sparkline. Private to the viewer.
**AR9 Datasets.** NIST TC4TL (registration may be required) for RSSI-to-distance calibration, SocioPatterns Hypertext 2009 and SFHH via Netzschleuder for conversation durations in the simulator. Kaggle Speed Dating needs Arjun's `kaggle.json`; prepare it for Alan's AL9 validation. All raw data in `ml/data/external/` (gitignored), never committed.
**AR10 Web-mention search.** Opt-in only, Claude's web search tool with name plus school, employer, or GitHub handle, results stored as `pending`, nothing extracted until the user approves each one (source trust 0.7). The approval screen lives in Adam's app: add the ask to his `REQUESTS.md` section.

## Quality bar for everything the judges see
Smooth at about 150 nodes, labels readable at arm's length on a phone and from the back of a room on the big screen, empty and loading states that still look designed, consistent colors with the app, and no privacy leaks in any mode.

## Dependencies
You need Adam's AD1 (tables) and Alan's AL2 (extraction), AL3 (clusters), and AL7 (graph data). Alan needs your AR1, AR2, and AR3; Adam's AD9 needs your AR4. Build on mocks the moment you'd otherwise wait.

## Done means
The Section 13 done-when holds, `browser-tester` passes at both sizes, `/privacy-check` is clean, and `/handoff` pushed it with a PROGRESS.md entry. AGENTS.md has the `dashboard` run and test commands.

## Autopilot lines (Arjun types these)
```
/goal AR1 is done: connecting a real GitHub account stores an encrypted token and produces interests with evidence lines, shown in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
/goal AR4 is done: the graph page renders mock /graph data with the self node centered and a working side panel, browser-tester passes at 390x844 and 1440x900, deployed over HTTPS, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
/goal the current task from /next-task meets its done-when in MASTER_SPEC Section 13, verified in the transcript, committed and pushed with a PROGRESS.md entry, or stop after 30 turns
```
