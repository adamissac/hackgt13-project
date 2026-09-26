MASTER SPEC: Formal Connection App (working name)
HackGT 13 | Team: Adam, Alan, Arjun, Akshar | Tracks: AI/ML + Data Visualization
This is the single source of truth for the project: the product concept, every feature, the full technical design, the AI/ML design, the data model, the API, the team split, and the build order. It supersedes SCOPE.md. Where docs/schema.sql or docs/api.md disagree with this file, this file wins and those files must be updated to match it.

0. Instructions for AI coding agents (read first, follow always)
You are one of several AI coding agents working on this repo, possibly one after another on the same task. Credits can run out at any moment, and a different agent may have to pick up exactly where you stopped. Everything below exists so that handoff is painless.
0.1 Before you write any code
Read this file completely, then CLAUDE.md / AGENTS.md, then PROGRESS.md, then docs/schema.sql and docs/api.md.
Find your assigned owner and task in Section 13 (Team split and build order). Work on the lowest-numbered unfinished task for that owner unless the human tells you otherwise.
Run git pull --rebase before starting.
0.2 Commit and push frequently (mandatory)
Commit and push after every working increment. A working increment is anything that runs: a new endpoint that returns data, a screen that renders, a script that produces output, a passing test.
Never go more than 30 minutes of work without a commit and push. If you are in the middle of something that doesn't work yet, commit it anyway with a WIP: prefix and a note in PROGRESS.md explaining exactly what state it is in.
If you sense you are near the end of your context or credits, stop, commit, push, and update PROGRESS.md immediately. An unpushed hour of work is lost work.
Push sequence every time:
 git add -Agit commit -m "[area] short description"git pull --rebasegit push


Commit message format: [area] what changed, where area is one of ml, mobile, dashboard, supabase, docs, ble, infra. Examples: [ml] add /profile/ingest with GitHub extraction, WIP: [ble] scanner finds peers, RSSI smoothing not wired yet.
Never run git push --force, never rewrite history, never commit .env or any key.
If git pull --rebase produces a conflict you cannot resolve safely, run git rebase --abort, commit your work to a new branch named <owner>/<task>, push that branch, and note it in PROGRESS.md.
0.3 Keep PROGRESS.md current (mandatory)
Create PROGRESS.md at the repo root if it doesn't exist. Every push must update it. Newest entries go at the top. Use exactly this template:
## <date time> | <owner> | <agent name>
**Task:** <task id and name from Section 13>
**Status:** done | in progress | blocked
**What I did:** <2-5 bullets>
**How to run/test it:** <exact commands>
**Next step for whoever continues:** <the very next concrete action>
**Known issues / blockers:** <anything broken, anything the next agent must know>
**Contract changes:** <any change to docs/schema.sql or docs/api.md, or "none">

The "Next step" line is the most important line in the repo. Write it so a fresh agent with no memory of this session can act on it immediately.
0.4 Engineering rules
Stay inside the folder for your task. Don't edit another owner's folder without a note in PROGRESS.md.
Contracts (docs/schema.sql, docs/api.md) are shared. If you must change one, make the smallest change, update the doc in the same commit, and record it under "Contract changes."
Read secrets only from environment variables listed in .env.example. If you add a new variable, add it to .env.example with no value.
Never put SUPABASE_SERVICE_KEY, any OAuth client secret, or ANTHROPIC_API_KEY in mobile/ or dashboard/ client code.
Prefer boring, working code over clever code. Small increments. After each increment, state how to run and test it.
APIs change often (Expo, react-native-ble-plx, GitHub, Supabase, LinkedIn, X). If you are unsure of a current API, say so and ask for docs rather than guessing.
Never scrape or automate logins to LinkedIn or Instagram, under any framing (script, browser automation, or agent). See Section 5.
Follow the privacy rules in Section 11 in every feature.

1. Product overview
1.1 What we are building
A mobile app that helps students and professionals build real connections with people who share their interests: at career fairs and networking events, in everyday public spaces, and with people they already know. It is the opposite of LinkedIn's "collect connections to look impressive" culture.
The core rule: you can only connect with people you have actually talked to. There are two ways to get there:
Meet through the app. The app suggests a strong match nearby. You meet and talk in person. The app verifies the conversation happened. Then you both privately decide whether to connect.
Invite people you already know. You send a private invite (personal link, QR code, or phone contact) to someone you have talked to before. They accept only if they agree you've actually talked and want you as a connection.
Either way, a connection always means two people who genuinely know each other and both chose to connect. Once connected, users see a feed of what their connections are doing, so relationships stay meaningful after the first conversation.
1.2 The problem
Professional networking apps reward quantity over quality. People add strangers to inflate their connection count, send low-effort messages, and rarely build useful relationships. At career fairs, students waste time talking to people who don't align with their goals. And people's professional activity is scattered across platforms, so it is hard to keep up with the people you actually care about.
1.3 Core principles (every design decision must respect these)
Connections only between people who have really talked. Verified in person, or confirmed by both people through a private invite.
Connection counts are private. Only you see how many connections you have. With nothing to show off, there is no incentive to fake connections. If two people lie and connect anyway, they only hurt themselves.
Mutual, silent consent. Both people must say yes. If only one says yes, nothing happens and the other person is never told.
No public discovery of strangers. You cannot browse or search profiles to add random people. Invites are private and only go to people you choose.
Privacy by default. Users choose when they are discoverable and what appears in their feed. Location is never shown to anyone without mutual consent.
1.4 Track fit
AI/ML: LLM profile extraction, embeddings, a multi-feature match scorer that becomes a learned ranker, a conversation-detection classifier on Bluetooth time series, grounded icebreakers and follow-ups, feed ranking, and a chatbot.
Data visualization: the Connection Graph (Section 3.12), the proximity radar, interest-overlap charts, a private personal dashboard, feed insights, and an organizer community map that shows which interest groups should be talking and aren't.

2. User roles
Students / individual users
Sign in with LinkedIn (identity only), connect GitHub (live API), upload a resume, and manually enter LinkedIn-style experience and interests.
Optionally opt in to an AI web search for public articles or media about them (off by default, explicit checkbox, every result user-approved).
Subscribe to organizers, register for events, toggle Open to Meet, send private invites, browse their connections feed, and use the AI assistant.
Organizations / companies (separate account tier)
Create and promote local networking events and career fairs. Events must be hosted through the app to appear in listings.
Post updates to their event's attendee feed.
See aggregate, anonymized analytics for their events (never individual identities).

3. Features (conceptual specification)
Each feature lists what it does and the rules it must follow. Technical details live in Sections 4 to 10.
3.1 AI-generated interest profiles
An LLM reads the user's GitHub repos and READMEs, resume, manually entered LinkedIn-style experience, free-text interests, and (only if opted in and approved) public web mentions.
It extracts skills, interests, goals, and current work into a structured profile with four facets: technical, career, personal, academic. Every extracted interest carries an evidence line explaining where it came from.
Two free-text fields power complementary matching: "What I'm looking for" and "What I can offer."
The user reviews the generated profile and can confirm, hide, or add interests. Confirmed interests carry more weight.
The profile refreshes as GitHub activity changes or the user edits manual entries.
3.2 AI matching
Every profile becomes a set of embedding vectors. Pairs of people are scored on several signals: facet similarity, rarity-weighted shared interests, complementary goals (a recruiter hiring ML interns matches a student looking for ML internships), and cross-disciplinary "bridge" potential.
Each match shows which specific topics overlap and how strongly.
Matching starts with a hand-tuned score and becomes a learned ranker as real conversation outcomes come in.
3.3 Open to Meet toggle
A single prominent toggle on the home screen: Open to Meet or Not Open.
ON: the system looks for the best matches nearby (at an event or in public, e.g. the student center) and sends suggestions: "Do you want to meet [Name]?" with a quick profile and shared topics. The user taps Yes or No.
If both say yes: a chat unlocks between them and their live locations are shared with each other so they can find each other ("Want to meet by the coffee shop?").
If only one says yes: nothing happens and the other person is never told.
OFF: the user gets no suggestions and is never suggested to anyone.
Meetup location sharing ends when they have met (verified proximity) or either person turns the toggle off. The chat remains.
If two existing connections both have the toggle on and are near each other, the app can suggest meeting up again.
3.4 Nearby matches view (Bluetooth only, no extra hardware)
Uses phone-to-phone Bluetooth Low Energy signal strength to estimate how close other opted-in users are.
Shows a proximity radar: nearby matches placed by rough distance band (very close, nearby, farther away), with green dots for the strongest matches.
Tapping a dot shows a quick profile preview and shared topics.
Only users with the toggle ON appear. At an event, suggestions narrow to people registered and present in the room.
The UI never claims exact positions. Distances are rough bands by design.
3.5 Proximity verification (proof you talked in person)
Phones broadcast a random, rotating Bluetooth ID. Only the backend can resolve IDs to users.
A conversation counts as verified when two phones stayed within close range long enough that the encounter classifier is confident it was a real conversation (Sections 6.8 and 7.4), or when the two people scan each other's in-app QR code at the end of the conversation (fallback, always available).
Edge case: if two people start talking on their own and one has the toggle off, the app still records proximity privately so the conversation can be verified if they later want to connect. This data is never shown to anyone and is used only for verification. Onboarding must disclose this clearly.
3.6 Post-conversation flow (in-person connections)
After any verified in-person conversation:
Both users get a prompt with an AI-generated checklist of their shared interests.
Each user checks what they actually talked about and can type extra topics.
Each user is asked: "Do you want to connect with this person?"
If both say yes, they are connected. Otherwise nothing happens and nobody is told.
The same flow applies to people the user met through a suggestion, at an event, or manually added via QR.
3.7 Private invites (people you already know)
Every user has a personal connect link and QR code that is never publicly listed or searchable.
Users can import phone contacts and invite people they've talked to before (friends, classmates, coworkers, people met online or on a call). Contact import is a stretch goal.
The recipient sees who sent it and is asked: "Have you talked with this person, and do you want to connect?" They can note how they know each other.
Accept creates the connection. Decline or ignore does nothing, and the sender is not told.
Invite links are unique, revocable, and expire or rotate. Invites are rate-limited to discourage mass-inviting strangers.
3.8 Connections feed
Shows what your connections are doing: live GitHub activity (new repos, pushes to public projects), in-app posts, and self-reported updates (e.g. "started a new role," entered manually since it cannot be pulled from LinkedIn).
Only connections see a user's feed activity. Each user controls what appears.
AI features: rank posts by relevance to your interests and goals (not just recency), summarize bursts of activity ("Priya launched a new app and is hiring a frontend intern"), and suggest a thoughtful reply based on what you talked about when you first met.
3.9 Events
Organizer accounts create events. Users browse listings and subscribe to organizers for alerts.
When a user registers, their existing connections are notified that they're attending.
Each event has an attendee space: not a group chat, but a feed where the organizer and attendees see updates about that event.
At an event, the nearby view and suggestions narrow to people in the room.
3.10 AI assistant features
Icebreakers: e.g. "You both built RAG apps, and she's looking for ML interns," or "He's working on X, which you said you want to learn about."
Follow-up notes: after connecting, the AI drafts a short personalized note from the checklist answers so no connection starts as a blank request.
Chatbot: answers questions like "Who at this event works in quant finance?", "What should I ask this recruiter?", or "What have my connections been working on this week?" It only uses data the asking user is allowed to see.
3.11 Data visualizations (required for the track)
The live proximity radar with match-strength coloring.
The Connection Graph (Section 3.12).
A visual breakdown of interest overlap between you and a match (radar chart or topic bars).
A private personal dashboard: your connections, how you met them (in person vs invite), the topics you connect over most, and how your network grows over time.
A feed insights view: trending topics and activity across your network.
For organizers: an aggregate, anonymized community map of the event (interest clusters, and the biggest "missed connection" gaps between clusters).
3.12 Connection Graph (interactive node network)
Inspiration. A HackGT 12 project (RefNet) visualized research papers as an interactive force-directed network: papers were nodes labeled by author and year, citations were edges, node size reflected citation count, users could drag, zoom, and expand nodes to pull in more of the network, tune how many hops and neighbors to fetch ("iterations," "cited," "refs"), scrub a timeline slider from older to newer, see a side panel of items with topic tags, and export the view. We adapt that interaction model to people and potential connections.
What it is. An interactive force-directed graph where people and topics are nodes, and edges represent match strength or shared interests. It turns the abstract matching model into something users and judges can see and explore.
Node and edge types
You (center node, pinned).
Person nodes: your matches (only people currently allowed to be suggested to you: Open to Meet nearby, or registered at the same event) and your existing connections. Labeled with first name and top shared topic.
Topic nodes: canonical interests (e.g. "reinforcement learning"). People link to the topics they hold.
Person-to-you edges: thickness = match score; color = dominant shared facet (technical, career, personal, academic).
Person-to-topic edges: thickness = that person's weight on the topic.
Encodings
Node size: match score (for matches) or number of shared topics (for connections).
Green ring: top matches (above your 80th percentile) and people who are Open to Meet right now.
Color: community cluster (from HDBSCAN) or facet, user-toggleable.
Solid vs dashed edge: existing connection vs suggested match.
Interactions (mirroring RefNet)
Drag to rearrange, pinch/scroll to zoom, tap a node to open its side panel.
Expand a node:
Expanding a topic reveals other allowed people (same event or nearby Open to Meet) who share that topic, ranked by score.
Expanding a person reveals the topics you share with them and their evidence lines. It never reveals that person's own connections.
Controls (analog of RefNet's iterations / cited / refs): Depth (1 = your direct matches; 2 = also expand through shared topics), Max people, Min match score, and a facet filter.
Timeline slider: in "My Network" mode, scrub from oldest to newest connection to watch your network grow; in event mode, scrub through the event's hours.
Side panel list of people in view with topic tags and a "why you matched" line, plus a search box.
Export: save a PNG snapshot of your own graph.
Three modes, each privacy-scoped
Matches (event or nearby): you, your current allowed matches, and shared topic nodes. Default view at events.
My Network (private to you): you, your connections, and the topics you share with them. Never shows edges between two of your connections (that would reveal their connections to you).
Event Map (organizer, anonymized): the whole event as clusters, with no names, and connections formed during the event drawn live. This is the community map from Section 6.13.
Hard rules: no stranger browsing (only people already allowed as suggestions appear), no connection counts for anyone but you, no second-degree person-to-person edges, and names only for people you are connected to or currently matched with.

4. System architecture
4.1 Decisions (these override anything in earlier notes or brainstorms)
Topic
Decision
Proximity hardware
Phone Bluetooth only. No ESP32 beacons, no UWB required, no installed hardware.
Room positioning
No precise room map. A radar with rough distance bands.
LinkedIn / Instagram data
Manual entry and resume only. LinkedIn is used for sign-in identity only. Never scrape.
Verification
Bluetooth encounter classifier, with an in-app QR scan as the always-available fallback.
Chat
In scope, unlocked only by mutual yes or an existing connection.
Location
Live location shared only between two people who both said yes, and only until they meet. Otherwise, only a building-level presence ID ever leaves the phone.
Graph visualization
Built once as a web component in dashboard/, embedded in the mobile app via WebView.

4.2 Stack
Layer
Choice
Why
Mobile app
React Native, Expo dev build, TypeScript, Expo Router
Cross-platform, native modules for Bluetooth and location
Database, auth, storage, realtime
Supabase: Postgres + pgvector, Auth, Storage, Realtime
One service for users, vectors, PDFs, chat, live updates
ML / API service
Python FastAPI (ml/)
All ML libraries are Python
Embeddings
BAAI/bge-small-en-v1.5 via sentence-transformers (384 dims)
Free, fast, runs on a laptop CPU
LLM
Claude API. Sonnet for resumes, icebreakers, chatbot. Haiku for bulk work. Model IDs in ml/ml/config.py
Structured extraction and grounded generation
ML libraries
scikit-learn (incl. HDBSCAN), LightGBM, umap-learn
Ranking, classification, clustering, layout
Bluetooth
react-native-ble-plx (scan), a native advertising module or library for the peripheral role
Phone-to-phone proximity
Location
expo-location (foreground location, geofencing via TaskManager)
Building presence, meetup sharing
QR
expo-camera (scan), a QR rendering library (generate)
Invites and verification fallback
Push
Expo Notifications
APNs and FCM handled for us
Web dashboard + graph
Next.js, D3 (d3-force) or react-force-graph-2d
Connection Graph, organizer analytics, personal dashboard
Mobile charts
react-native-svg based charts
Overlap chart, small visuals

4.3 Components and data flow
[Mobile app] --Supabase Auth (LinkedIn OIDC)--> [Supabase Auth]
     |  \--reads/writes (anon key, RLS)--> [Supabase Postgres + Storage + Realtime]
     |                                              ^
     \--HTTPS + Supabase JWT--> [FastAPI ML service] --service key-->/
                                   |  -> Claude API (extraction, icebreakers, chatbot)
                                   |  -> GitHub API (repos, READMEs, events)
                                   |  -> embeddings (local bge-small)
[Dashboard (Next.js)] --HTTPS--> [FastAPI]  (graph data, analytics)
[Mobile WebView] ----loads----> [Dashboard graph page] (token passed via URL fragment or postMessage)

The mobile app talks directly to Supabase for simple reads and writes protected by row-level security (profile edits, chat messages, posts).
Anything involving AI, other users' data, matching, verification, or secrets goes through FastAPI, which verifies the Supabase JWT and uses the service key.
Background jobs (ingestion, extraction, IDF and cluster recomputation, sighting cleanup) run as FastAPI background tasks or a simple scheduled loop. No separate queue is needed for the hackathon.
4.4 Repo layout
/mobile      Expo app (Adam: shell, auth, profile, chat, feed, invites | Akshar: BLE, radar, QR, Open to Meet, location)
/ml          FastAPI service + ML package (Alan: AI/ML | Arjun: ingestion, synthetic data)
/dashboard   Next.js: Connection Graph, personal dashboard, organizer analytics (Arjun)
/supabase    migrations, seed data, policies (Adam)
/docs        schema.sql, api.md, git-cheatsheet.md
MASTER_SPEC.md  this file
PROGRESS.md     handoff log (every push updates it)


5. Data sources and integrations
5.1 What is legal to use
Source
Access
How we use it
LinkedIn
Official "Sign In with LinkedIn using OpenID Connect" returns only id, name, photo, email
Sign-in identity. Experience and interests are typed/pasted by the user or come from their resume or LinkedIn "Save to PDF" export
Instagram
No third-party access to personal accounts
Not integrated. Users may type hobbies manually
GitHub
Public API with OAuth
Live: repos, languages, topics, READMEs, public activity for the feed
Resume / LinkedIn PDF
User upload
Text extraction then LLM extraction
Manual entry
In-app forms
Headline, experience, interests, looking for, can offer, self-reported updates
Public web mentions
Opt-in, off by default
Claude with web search finds candidate articles; the user approves each one before it is used (same-name mix-ups are common)
X (Twitter)
Official API, limited free tier
Stretch goal only
Facebook likes
Official Facebook Login user_likes, needs Meta App Review for the public; testers can use it in development mode
Optional stretch only, testers only, never required

Never scrape, use browser automation, or have an agent log in on a user's behalf for LinkedIn or Instagram.
5.2 Auth and account linking
Primary sign-in: LinkedIn OIDC through Supabase Auth (scopes openid profile email). The LinkedIn developer app needs an associated LinkedIn Page.
Fallback sign-in for the demo: email magic link through Supabase, in case LinkedIn approval stalls.
GitHub is a "connect account" flow handled by FastAPI (/connect/github/start, /connect/github/callback), not the primary login. Tokens are encrypted at rest and never sent to the client.
Organizer accounts are normal accounts with an organizations membership row.
5.3 GitHub ingestion details
GET /user/repos?sort=updated&per_page=100, skip forks. Per repo: /languages, /readme, topics, stars, pushed_at.
Feed activity: the user's public events endpoint, polled every 10 to 15 minutes for connected users, normalized into feed_items (new repo, push to public repo, release).
Authenticated rate limit is 5,000 requests per hour; cache aggressively.

6. AI / ML specification
A working reference implementation of most of this section already exists in ml/ (run python run_demo.py). Its README.md documents it in detail. Build the FastAPI endpoints on top of those modules rather than rewriting them.
6.1 Map of every AI component
#
Component
Type
Model / method
Trained?
Code
1
Interest extraction
LLM structured output
Claude Sonnet (resume), Haiku (bulk)
No, prompted
ml/ml/llm.py
2
Web-mention search (opt-in)
LLM with web search
Claude + web search tool
No
to build
3
Canonicalization
Embedding nearest neighbor + LLM tie-break
bge-small + Haiku
No
ml/ml/profiles.py
4
Weighting + IDF
Math
n/a
No
ml/ml/profiles.py
5
Profile vectors
Pretrained embeddings
bge-small
No
ml/ml/profiles.py
6
Match scoring V1
Weighted feature sum
n/a
No
ml/ml/scoring.py
7
Match ranker V2
Learning to rank
Logistic regression, LightGBM LambdaRank
Yes
ml/ml/ranker.py
8
Encounter classifier
Binary classification on BLE time series
HistGradientBoosting
Yes
ml/ml/encounter.py
9
Icebreakers + "why you matched"
Grounded LLM generation
Claude Sonnet
No
ml/ml/llm.py
10
Follow-up notes
Grounded LLM generation
Claude Haiku
No
to build
11
Feed ranking + summaries + reply suggestions
Embedding relevance + LLM
bge-small + Haiku
No
to build
12
Chatbot
LLM with tools over permitted data
Claude Sonnet with tool use
No
to build
13
Community map + graph clustering
Unsupervised
UMAP, HDBSCAN, c-TF-IDF
No
ml/ml/viz.py

Only two components are trained: the match ranker and the encounter classifier. Everything else is pretrained models plus math or prompting. Matching is a ranking problem (order everyone for each person), not a classification problem.
6.2 Interest extraction
One LLM call per source document, JSON-only output. Schema: interests[] {name, facet, strength 0-1, evidence}, seeking, offering, summary {technical, career, personal, academic}.
Rules in the prompt: prefer specific interests over generic ones, skip filler skills, max 20 interests, use only information in the document, and never extract sensitive attributes (health, religion, politics, and so on).
GitHub input: a digest of non-fork repos (top languages, topics, description, first ~1,200 characters of README, stars, last push).
Resume input: text from pdfplumber.
Manual input: the user's typed experience, interests, looking-for, can-offer.
Output is stored in raw_documents and user_interests, then shown on the review screen.
6.3 Web-mention search (opt-in stretch)
Only runs if the user checks the opt-in box. Query uses the user's name plus school, employer, or GitHub handle to reduce same-name confusion.
Results become web_mentions rows with status pending. Nothing is extracted until the user approves each item.
Approved items go through the same extraction as other sources with source trust 0.7.
6.4 Canonicalization
Embed each raw interest name and find the nearest canonical interest in interests (pgvector HNSW).
Cosine at or above 0.88: merge. Between 0.80 and 0.88: ask Haiku whether they're the same. Below: create a new canonical interest.
Tune the threshold by printing merges on real extracted data.
6.5 Weights, IDF, and profile vectors
w(u,i)      = trust(source) * strength * exp(-months_since_activity / 12) * depth * (1.15 if confirmed)
w_final     = 1 - exp(-sum of w over all sources)            # squash
depth_github = language_byte_share * (1 + ln(1 + stars)) * (1 if owner else 0.3)
trust        = github 1.0, resume 1.0, manual 1.2, web 0.7, facebook 0.6

idf(i)      = ln((N + 1) / (df_i + 1)) + 0.1                 # over the current population or event

v_facet(u)  = normalize( 0.7 * normalize(sum_i w * idf * e_i) + 0.3 * embed(facet summary) )
combined(u) = normalize(mean of non-empty facet vectors)
seek(u), offer(u) = embeddings of the two goals fields

IDF is the key idea: sharing "Python" with 180 of 200 people means nothing; sharing "computational neuroscience" with 3 people means a lot.
6.6 Pair features and V1 score
Feature
Definition
sim_technical, sim_career, sim_personal, sim_academic
cosine of facet vectors
idf_overlap
sum over shared i of min(w_a,w_b)*idf / sum over union of max(w_a,w_b)*idf
complementarity
0.5 * [cos(seek_a, offer_b) + cos(seek_b, offer_a)]
bridge
max facet similarity * (1 - combined similarity), only if different HDBSCAN clusters
role_pair
complementarity, only for student-recruiter pairs

V1 = 0.20*sim_technical + 0.15*sim_career + 0.10*sim_personal + 0.10*sim_academic
   + 0.20*idf_overlap + 0.20*complementarity + 0.05*bridge

Highlight (green) = above that user's own 80th percentile score.
Shared topics for display and checklists = shared interests ranked by min(w_a, w_b) * idf.
Candidate pool: only people who may be suggested (same event and present, or Open to Meet in the same building), minus blocks, previous declines, and existing connections (existing connections go to the reconnect path).
6.7 Learned ranker (V2)
Item
Detail
Unit of data
One pair that had a verified conversation
X
The 8 features above
y (logistic regression)
1 if both said connect, else 0
rel (LambdaRank)
2 connected, 1 talked 8+ minutes, 0 otherwise
group
viewer id
Split
by user, never by row
Metrics
AUC (connect prediction), NDCG@10 (ranking quality)
Serving
Logistic regression (interpretable coefficients); LightGBM once data grows
Exploration
With 10% probability, one top-10 slot goes to the best "bridge" match; or add noise scaled by sqrt(p(1-p))
Logging
Every suggestion shown is written to impressions (for future bias correction)

Training data, in order of availability
Synthetic (now): ml/ml/synth.py generates attendees from 8 archetypes with cross-disciplinary secondaries and recruiters, and simulates outcomes from a hidden ground-truth model that differs from V1. Dry run: V1 AUC 0.73, logistic regression 0.82, LambdaRank 0.81; NDCG@10 0.85 / 0.89 / 0.87. Top learned signals: idf_overlap, sim_personal, role_pair. Always say these numbers are on simulated outcomes.
Validation on real human decisions (Saturday, optional): the public Kaggle "Speed Dating Experiment" dataset (Columbia, about 8,000 dates with mutual-yes labels, interest ratings, fields, career goals). Map its fields into our features to show the feature design predicts real mutual interest. Validation only; never train production on it.
Real data: HackGT attendees onboarded Saturday. Every verified conversation plus checklist answers becomes a labeled row. Retrain nightly after launch.
6.8 Encounter classifier (conversation detection)
Input: a session of Bluetooth sightings between two phones (sightings merged when gaps are under 60 seconds).
Features: duration, median RSSI after a 5-second rolling median, RSSI IQR and std, fraction of time above -65 dBm, max scan gap, scan rate, RSSI slope, fraction of time each phone was stationary (accelerometer), same zone flag.
Model: HistGradientBoostingClassifier, threshold 0.7. Logistic regression baseline.
Dry run on synthetic sessions: AUC 0.96, but 44% of "same table, not talking" sessions are false positives. Bluetooth cannot hear conversation. This is why the QR scan exists as the fallback and why verification also requires a minimum dwell time. State this limitation openly in the pitch.
Training data:
Synthetic sessions (simulate_ble_sessions) with 5 classes and per-phone calibration offsets.
Team-recorded labeled sessions (Saturday morning, 45 minutes): pairs record talking face to face, standing in a line, walking past, across the room, and same table on laptops, 5 to 10 each. Weight real rows 3x.
NIST TC4TL challenge data (real phone RSSI and IMU with distance labels) to calibrate RSSI-to-distance across device models. Registration may be required.
SocioPatterns conference face-to-face datasets (Hypertext 2009, SFHH) to set realistic conversation duration distributions in the simulator.
Production: sessions confirmed by a QR scan are weak positives.
6.9 Icebreakers and "why you matched"
Input: top 3 shared interests with both people's evidence lines, plus complementarity text (seeking vs offering).
Output JSON: {why: one sentence, openers: [2 openers under 20 words]}.
Grounded: the prompt only contains data both users can see on each other's quick profile. No invented facts.
6.10 Follow-up notes
After a connection forms, draft a 2 to 3 sentence note from: the checked topics, typed extra topics, and shared interests. The user edits and sends it in chat, or discards it.
6.11 Feed AI
Relevance ranking: score = 0.6 * cosine(embed(item text), viewer combined vector) + 0.3 * recency decay + 0.1 * (item mentions a topic the viewer talked about with the author). Recency decay = exp(-hours / 48).
Summaries: if an author has 3 or more items in 24 hours, Haiku summarizes them into one line.
Reply suggestions: on tap, Haiku drafts a reply using the item and the topics the two people discussed when they met.
6.12 Chatbot
Claude Sonnet with tool use. Tools only return data the asking user is allowed to see:
search_event_attendees(event_id, topic): Open to Meet attendees at an event the user is registered for, returning name, role, and shared topics only.
get_match_profile(user_id): quick profile of a current match or connection.
get_connections_activity(days): the user's own connections feed.
get_my_profile().
Never answers questions about people outside those scopes. Refuses to reveal anyone's connection count.
6.13 Community map and graph clustering
UMAP (10 dimensions) then HDBSCAN (min cluster size 5) on combined vectors gives communities; UMAP (2D) gives the organizer map layout.
c-TF-IDF names each cluster from interests common inside it and rare outside.
Gap analysis: for each pair of different clusters, expected connections (sum of model probabilities over each person's top 10 matches) vs actual connections. The biggest gaps are "these groups should be talking and aren't."
Recompute every 5 minutes per event, not per request.

7. Proximity and location specification
7.1 Ephemeral Bluetooth IDs
The backend issues each phone a batch of random 8-byte tokens, one per 10-minute window for 24 hours, and stores token-to-user mappings (ephemeral_ids). Nobody listening can tell who anyone is.
iOS can only advertise a local name and service UUIDs, not custom service data. So advertise the app's 128-bit service UUID and put the current token (base32) in the local name. Android may put it in service data. Scanners filter by the service UUID.
7.2 Platform constraints (design around these)
iOS scans reliably only while the app is in the foreground. Two backgrounded iPhones generally cannot discover each other. Android can scan in the background with a foreground service and a persistent notification.
Therefore:
Event Mode keeps the app open (screen-on prompt) while at an event.
Verification succeeds if at least one phone was foregrounded and scanning during the conversation.
At the "connect" moment, the app asks both people to open the app for a 10-second proximity check. If that fails, it offers the QR scan.
The "toggle off but still verifiable" edge case records proximity only when the app is running; disclose this in onboarding.
7.3 Scanning and signal processing
Scan with duplicates allowed, filtered by service UUID. Smooth RSSI per token with a 5-second rolling median, then a simple 1D Kalman filter.
Distance (display only): d = 10 ^ ((A - RSSI) / (10 * n)), A about -59 dBm at 1 m, n about 2.5 indoors.
Radar bands: stronger than about -60 dBm "very close," -60 to -75 "nearby," weaker "farther away." Calibrate on your own phones Saturday.
Upload sightings in batches every 30 seconds (POST /ble/sightings).
7.4 Verification rule
A conversation between A and B is verified when either:
Bluetooth: a session with at least 3 minutes above -65 dBm and encounter classifier probability at or above 0.7, or
QR: one scans the other's in-app verification QR (signed, 60-second expiry, single-use nonce).
Verification creates a conversations row and triggers the post-conversation prompt for both.
7.5 Open to Meet in public spaces
Building geofences (about 100 m radius) for key campus buildings (Student Center, CULC, library, Klaus). iOS allows up to 20 monitored regions per app.
On entry, if the toggle is ON, the phone sends only building_id (POST /presence), expiring after 45 minutes. On exit, delete.
A worker matches Open to Meet users in the same building: exclude blocks, prior declines, pairs suggested in the last 7 days; keep scores above each user's 80th percentile; max 3 suggestions per user per day; quiet hours.
Both get a suggestion notification with a quick profile and shared topics. Mutual yes unlocks chat and live location sharing.
7.6 Meetup location sharing
Only between the two people in an accepted suggestion. Foreground location updates every 10 seconds into location_shares (Supabase Realtime), visible only to the other person.
Ends automatically on verified proximity, either person turning the toggle off, or 30 minutes. Rows are deleted when sharing ends.
7.7 Retention
Raw sightings deleted after 24 hours. Encounter features kept only for verified conversations. Location shares deleted when sharing ends. Presence expires after 45 minutes.

8. Data model
docs/schema.sql already contains the base tables: profiles, linked_accounts, raw_documents, interests, user_interests, profile_vectors, events, event_zones, attendance, device_keys, ephemeral_ids, sightings, encounters, handshakes, feedback, connections, impressions, presence, chat_invites, blocks.
8.1 Required changes to existing tables
-- Open to Meet replaces "open to chat"
alter table presence rename column open_to_chat to open_to_meet;

-- profiles: manual LinkedIn-style fields, settings, account tier
alter table profiles
  add column headline text default '',
  add column experience text default '',          -- pasted/typed LinkedIn-style experience
  add column open_to_meet boolean default false,  -- the home toggle
  add column web_search_opt_in boolean default false,
  add column account_type text default 'individual' check (account_type in ('individual','organization')),
  add column is_synthetic boolean default false;   -- seeded demo profiles, excluded from training on real data

-- connections: how they met
alter table connections
  add column how_met text check (how_met in ('in_person','invite')) default 'in_person',
  add column conversation_id bigint,
  add column invite_id bigint;

-- events: organizer and details
alter table events
  add column org_id bigint,
  add column description text default '',
  add column location_text text default '';

-- feedback is keyed on a verified conversation (handshakes remain as QR verification records)
alter table feedback drop constraint if exists feedback_pkey;
alter table feedback add column conversation_id bigint;
alter table feedback alter column handshake_id drop not null;
alter table feedback add constraint feedback_conversation_rater unique (conversation_id, rater_id);

8.2 New tables
create table conversations (            -- a verified in-person conversation
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,   -- user_a < user_b
  user_b uuid references profiles(id) on delete cascade,
  method text check (method in ('ble','qr')) not null,
  event_id bigint references events(id),
  suggestion_id bigint,
  started_at timestamptz, ended_at timestamptz,
  minutes real,
  p_conversation real,
  created_at timestamptz default now(),
  check (user_a < user_b)
);

create table suggestions (              -- "Do you want to meet X?"
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  context text check (context in ('event','public','reconnect')),
  event_id bigint references events(id),
  building_id text,
  score real,
  shared_topics jsonb,                  -- [{interest_id, name, contribution}]
  a_response text check (a_response in ('pending','yes','no')) default 'pending',
  b_response text check (b_response in ('pending','yes','no')) default 'pending',
  status text check (status in ('pending','matched','expired')) default 'pending',
  created_at timestamptz default now(),
  expires_at timestamptz
);

create table chats (
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  origin text check (origin in ('suggestion','connection')),
  created_at timestamptz default now(),
  unique (user_a, user_b)
);

create table messages (
  id bigserial primary key,
  chat_id bigint references chats(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  body text not null,
  is_ai_draft boolean default false,
  created_at timestamptz default now()
);

create table location_shares (          -- live meetup sharing, deleted when it ends
  suggestion_id bigint references suggestions(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  lat double precision, lng double precision,
  updated_at timestamptz default now(),
  expires_at timestamptz not null,
  primary key (suggestion_id, user_id)
);

create table invites (
  id bigserial primary key,
  sender_id uuid references profiles(id) on delete cascade,
  token_hash text unique not null,      -- store only a hash of the link/QR token
  channel text check (channel in ('link','qr','contact')),
  recipient_hint text,                  -- e.g. contact name, never shown publicly
  note text,
  status text check (status in ('active','accepted','declined','revoked','expired')) default 'active',
  used_by uuid references profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table organizations (
  id bigserial primary key,
  name text not null,
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);
create table org_members (
  org_id bigint references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'admin',
  primary key (org_id, user_id)
);
create table org_subscriptions (
  org_id bigint references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (org_id, user_id)
);
create table event_registrations (
  event_id bigint references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  registered_at timestamptz default now(),
  primary key (event_id, user_id)
);
create table event_posts (              -- attendee space feed (not a group chat)
  id bigserial primary key,
  event_id bigint references events(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table feed_items (               -- connections feed: github activity, posts, self-reported updates
  id bigserial primary key,
  author_id uuid references profiles(id) on delete cascade,
  kind text check (kind in ('github','post','update')),
  title text, body text,
  url text,
  payload jsonb default '{}',
  embedding vector(384),
  created_at timestamptz default now()
);
create table feed_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  show_github boolean default true,
  show_posts boolean default true,
  show_updates boolean default true
);

create table web_mentions (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  url text, title text, snippet text,
  status text check (status in ('pending','approved','rejected')) default 'pending',
  created_at timestamptz default now()
);

create table notifications (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  kind text,                            -- suggestion, connect_prompt, connected, invite, event_update, connection_attending
  payload jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

8.3 Row-level security additions
chats, messages: readable and insertable only by the two participants.
location_shares: a row is readable only by the other participant of that suggestion; writable only by its owner.
feed_items: readable by the author and the author's connections (join on connections).
invites, notifications, web_mentions, feed_prefs: owner only.
suggestions, conversations, sightings, encounters, impressions: no client access. FastAPI only.
Nobody can query anyone else's connections rows.

9. API (FastAPI)
All requests carry Authorization: Bearer <supabase_access_token>. Errors are { "error": "message" }. Full request/response shapes for items 1 to 14 already exist in docs/api.md; extend that file with the new endpoints below using the same style.
Profile and ingestion
POST /profile/ingest (resume multipart, or {source: github | manual | web}), GET /profile/status?job_id=
GET /profile/interests, PATCH /profile/interests (confirm, hide, add)
PATCH /profile/manual {headline, experience, interests_text, seeking, offering}
GET /connect/github/start, GET /connect/github/callback
POST /profile/web-search (opt-in required), GET /profile/web-mentions, PATCH /profile/web-mentions/{id} {status}
Matching and suggestions
GET /events/{event_id}/matches
PATCH /me/open-to-meet {open: true|false}
POST /presence {building_id}, DELETE /presence
GET /suggestions (pending for me), POST /suggestions/{id}/respond {response: yes|no} returns {status: waiting | matched, chat_id?} and never reveals a "no"
GET /matches/{user_id}/quick-profile returns name, photo, role, headline, shared topics with strengths, overlap-by-facet numbers (only for current matches or connections)
GET /matches/{user_id}/starters
Location and chat
POST /location-shares/{suggestion_id} {lat, lng} (only after a match; server enforces expiry)
Chat messages go directly through Supabase (messages table with RLS and Realtime). FastAPI only creates the chats row on match.
Proximity and verification
POST /ble/tokens, POST /ble/sightings
GET /qr/verify-token, POST /qr/verify {payload, signature}
Server job: sessionize sightings, run the encounter classifier, create conversations, send connect prompts.
GET /conversations/pending (conversations awaiting my checklist)
GET /conversations/{id}/checklist, POST /conversations/{id}/feedback {talked_about[], other_topic, wants_connect} returns {status: waiting | connected | no_connection}
Invites
POST /invites {channel, recipient_hint?, note?} returns {url, qr_payload, expires_at} (rate limit: 10 per day)
GET /invites/resolve/{token} (recipient view: sender name, photo, headline)
POST /invites/{token}/respond {accept: bool, note?}
POST /invites/{id}/revoke
Connections, feed, notes
GET /connections (mine only), GET /connections/{user_id} (shared topics, how met, what we talked about)
POST /connections/{user_id}/followup-draft returns {draft}
GET /feed?cursor= (AI-ranked), POST /feed/posts {kind: post|update, body}, POST /feed/{item_id}/reply-suggestion
GET /feed/insights (trending topics across my network)
Events and organizers
GET /events, GET /events/{id}, POST /events (organizer), POST /events/{id}/register (notifies my connections), POST /events/{id}/checkin
POST /orgs/{id}/subscribe, GET /events/{id}/posts, POST /events/{id}/posts
GET /events/{id}/analytics (organizer, aggregate only)
Visualization data
GET /graph?mode=matches|network|event&event_id=&depth=1|2&max_people=30&min_score=0&facet=all returns:
{
  "nodes": [
    {"id": "me", "type": "self", "label": "You"},
    {"id": "u_123", "type": "person", "label": "Maya", "score": 0.74, "highlight": true,
     "open_to_meet": true, "cluster": 3, "connected": false, "connected_at": null,
     "top_topic": "reinforcement learning"},
    {"id": "t_42", "type": "topic", "label": "reinforcement learning", "facet": "technical"}
  ],
  "edges": [
    {"source": "me", "target": "u_123", "kind": "match", "weight": 0.74, "facet": "technical"},
    {"source": "u_123", "target": "t_42", "kind": "has_topic", "weight": 0.9}
  ]
}

GET /graph/expand?node_id=&mode=&event_id= returns more nodes and edges to merge in.
GET /me/dashboard (private: connections over time, in-person vs invite, top shared topics)
GET /dashboard/{event_id} (organizer community map: anonymized nodes, clusters, edges, gaps)
Assistant
POST /assistant/chat {messages[], event_id?} returns {reply} (tool use restricted as in 6.12)

10. Data visualizations (technical)
Visualization
Where
Tech
Data
Connection Graph
dashboard/app/graph page, embedded in mobile via react-native-webview
d3-force or react-force-graph-2d
GET /graph, GET /graph/expand
Proximity radar
Mobile, native
react-native-svg, animated dots in 3 rings
local BLE + GET /events/{id}/matches
Interest overlap
Mobile quick profile
Radar chart over 4 facets + top-5 topic bars
GET /matches/{id}/quick-profile
Personal dashboard
Web page embedded in mobile
Line chart (network growth), donut (in person vs invite), bar (top topics)
GET /me/dashboard
Feed insights
Web page embedded in mobile
Trending topic bars, activity sparkline
GET /feed/insights
Organizer community map
Dashboard, big screen
UMAP scatter with cluster hulls and labels, live edges, gap table
GET /dashboard/{event_id}

Connection Graph implementation notes
Force simulation: link distance inversely proportional to weight, charge -120 for people and -60 for topics, collision radius = node radius + 4, "self" node fixed at center.
Expanding merges returned nodes and edges into the existing simulation without resetting positions, then gently reheats (alpha 0.3).
Controls bar across the top (Depth, Max people, Min score, Facet, Rebuild), side panel on the left (list with topic tags and search), timeline slider at the bottom, Export button (canvas to PNG).
Auth in WebView: pass the Supabase access token via postMessage (not a query string).
Performance: cap at about 150 nodes; beyond that, aggregate topics.

11. Privacy and security requirements
Connection counts are visible only to their owner. No endpoint, screen, graph, chatbot answer, or analytics view may expose another user's count or list of connections.
A "no" is never revealed. Suggestion responses, connect prompts, and invites that are declined or ignored produce no signal to the other person.
No stranger discovery. There is no user search. People appear only as current suggestions (event or nearby, Open to Meet) or as your connections.
Location: only building IDs for presence; live coordinates only between two mutually matched people and only until they meet; deleted afterward. Raw Bluetooth sightings deleted after 24 hours.
Bluetooth IDs rotate every 10 minutes and resolve to users only on the server.
OAuth tokens encrypted at rest with TOKEN_ENCRYPTION_KEY. Secrets never reach client code.
Invite tokens: random 128-bit values, stored hashed, expire in 7 days by default, revocable, rate-limited to 10 per day per user.
Verification QR payloads are signed, expire in 60 seconds, and nonces are single-use.
Organizer analytics are aggregate and anonymized (no names, minimum group size of 5 for any breakdown).
The LLM never receives more personal data than the task needs, and extraction skips sensitive attributes.
Onboarding clearly explains what is collected, including private proximity recording for verification.
Provide DELETE /me that deletes all of a user's data.

12. Scope, tiers, and checkpoints
12.1 Demo story (about 3 minutes)
A student signs in with LinkedIn, connects GitHub, uploads a resume, and types what they're looking for.
The AI-built profile appears with evidence. They remove one wrong tag.
They check in to "HackGT 13" and turn on Open to Meet. A suggestion arrives: "Do you want to meet Maya?" with shared topics and an overlap chart. Both tap Yes; a chat opens with an AI icebreaker.
The Connection Graph shows them, their matches, and shared topic nodes. Expanding "reinforcement learning" pulls in two more people.
They meet and talk. The app verifies the conversation (Bluetooth, or a QR scan), shows the checklist, and both say yes. The connection appears, along with an AI follow-up draft.
A private invite QR connects a friend they already know.
Big screen: the organizer community map of the whole event with clusters labeled, the new connection drawn live, and the biggest "missed connection" gap highlighted. Close on: nobody can see anyone else's connection count.
12.2 Tiers
Must have (the demo breaks without these)
Sign-in (LinkedIn OIDC, email fallback) and profile creation from GitHub, resume, and manual entry, with LLM extraction, review screen, and embeddings.
V1 matching with shared-topic explanations for an event.
Open to Meet toggle, suggestions at an event, mutual yes unlocks chat.
Conversation verification via QR (Bluetooth verification is Should).
Post-conversation checklist and mutual connect.
Private invite link and QR with recipient confirmation.
Connection Graph (matches mode) and the interest overlap chart.
Seeded synthetic attendees so the event has enough people to match and visualize.
Should have
Bluetooth radar and Bluetooth-based verification with the encounter classifier.
Meetup live location sharing.
Icebreakers and follow-up notes.
Connections feed (GitHub activity plus in-app posts) with AI relevance ranking.
Organizer community map with gap analysis.
Learned ranker with the AUC comparison on synthetic (and optionally speed-dating validation).
Connection Graph expand, controls, timeline, My Network mode.
Nice to have / stretch
Chatbot assistant, personal dashboard, feed insights, feed summaries and reply suggestions.
Full events: organizer accounts, listings, subscriptions, attendee feed, "your connection is attending" alerts.
Public-space Open to Meet via building geofences (mock location for demo), reconnect suggestions.
Web-mention search, contact import, X API, Facebook likes (testers only).
Explicitly out: Instagram integration, any LinkedIn or Instagram scraping, ESP32 or any installed hardware, precise indoor positioning, public profile search, public connection counts.
12.3 Checkpoints (adjust to the official submission deadline)
Friday night (before sleeping): sign in on a real phone, manual entry or resume goes in, extracted interests come back; FastAPI reachable from phones; Bluetooth hello world between two phones; graph page renders mock data.
Saturday noon: every Must works end to end, even if ugly. If not, nobody starts Should items.
Saturday 6 pm: Should items work or get cut.
Saturday midnight: feature freeze. Only stretch items that won't destabilize anything.
Sunday morning: no new features. Polish, record a backup demo video, rehearse.
12.4 Cut order if behind
Contact import, X, web search, chatbot, public-space geofencing, full events tier, feed summaries, personal dashboard, learned ranker (keep V1), meetup location sharing, Bluetooth verification (keep QR), Bluetooth radar (keep matches list).

13. Team split and build order
Owners: Adam (lead full-stack, architect), Alan (ML and algorithms), Arjun (research, data, visualization), Akshar (Bluetooth, automation, integrations, pitch). Task IDs are used in commit messages and PROGRESS.md. Do tasks in order unless blocked; if blocked, note it and take the next unblocked task.
Phase 0: Friday night (foundation)
ID
Owner
Task
Done when
AD1
Adam
Supabase project: run docs/schema.sql plus Section 8 changes, RLS, seed the HackGT 13 event
Tables exist; seed event row present
AD2
Adam
Auth: LinkedIn OIDC through Supabase, email magic link fallback, create profiles row on first sign-in
Sign-in works on a physical phone
AD3
Adam
Expo app shell: Expo Router tabs (Home with Open to Meet toggle, Nearby, Graph, Feed, Profile), typed API client from docs/api.md, env config, dev build on a phone
App runs on a device, tabs navigate
AL1
Alan
FastAPI app in ml/: Supabase JWT verification, DB access with service key, /health, CORS; expose to phones with a quick tunnel (e.g. cloudflared tunnel --url http://localhost:8000) or deploy
Phone can hit /health
AL2
Alan
/profile/ingest (resume, manual), /profile/status, /profile/interests GET/PATCH using ml/ml/llm.py and profiles.py; tune the extraction prompt on all four team members' real data
Real team profiles extracted and stored
AR1
Arjun
GitHub connect flow (/connect/github/*), encrypted token storage, repo digest ingestion into raw_documents, hand off to extraction
Connecting GitHub produces interests
AR2
Arjun
Resume PDF text extraction from Supabase Storage (pdfplumber)
Uploaded PDF becomes text
AR3
Arjun
Seed 60 to 100 synthetic attendees for HackGT 13 (ml/ml/synth.py or llm_population), is_synthetic = true, registered and checked in
Matches endpoint has people to rank
AK1
Akshar
Bluetooth hello world: two physical phones advertise and discover each other in the Expo dev build, printing RSSI
Two phones see each other

Phase 1: Saturday morning (Must items end to end)
ID
Owner
Task
AD4
Adam
Onboarding screens: manual entry (headline, experience, interests, looking for, can offer), resume upload, GitHub connect button, web-search opt-in checkbox (hidden until built)
AD5
Adam
Interest review screen (confirm, hide, add)
AL3
Alan
Profile vectors into pgvector, per-event IDF, /events/{id}/matches V1 with shared topics, impression logging
AL4
Alan
/matches/{id}/quick-profile (with facet overlap numbers) and /matches/{id}/starters
AL5
Alan
Suggestions: /me/open-to-meet, suggestion generation for checked-in Open to Meet users, /suggestions/{id}/respond, create chats row on mutual yes, notifications
AD6
Adam
Matches list, quick profile with overlap chart, suggestion Yes/No UI
AD7
Adam
Chat screen (Supabase Realtime), icebreaker shown as a suggested first message
AL6
Alan
QR verification endpoints, conversations, checklist, feedback, mutual connect, follow-up draft
AK3
Akshar
Verification QR display and scan screens (uses AL6)
AD8
Adam
Post-conversation checklist and connect prompt screens, connections list
AK4
Akshar
Invites: backend endpoints, link and QR generation, deep link handling, recipient accept screen, rate limit
AR4
Arjun
Next.js dashboard scaffold and Connection Graph page (matches mode), first on mock JSON, then live /graph
AL7
Alan
/graph and /graph/expand (pair with Arjun on the JSON)
AD9
Adam
Embed the graph page in the Graph tab via WebView with token passed by postMessage
AK6
Akshar + all
Record labeled Bluetooth sessions (45 minutes): talking, in line, walking past, across the room, same table on laptops

Gate: Saturday noon, full Must demo path works on real phones.
Phase 2: Saturday afternoon (Should items)
ID
Owner
Task
AK2
Akshar
Ephemeral token rotation (/ble/tokens), advertise current token, scanning, RSSI smoothing, batched /ble/sightings
AK5
Akshar
Proximity radar screen (3 bands, green dots, tap for quick profile)
AL8
Alan
Sessionize sightings, run encounter classifier (retrained with AK6 data), create Bluetooth-verified conversations and prompts
AK7
Akshar
Meetup location sharing with auto-end rules
AD10
Adam
Push notifications: suggestion, connect prompt, connected, invite
AR5
Arjun
Graph: expand, controls (Depth, Max people, Min score, Facet), side panel, timeline, export, My Network mode
AR6
Arjun
Organizer community map page with clusters, live edges, gap table
AR8
Arjun
GitHub activity poller into feed_items
AL10
Alan
Feed ranking and /feed endpoints
AD11
Adam
Feed screen and post composer
AL9
Alan
Learned ranker retraining script and AUC/NDCG report; optional speed-dating validation (Arjun prepares data)

Phase 3: Saturday evening to midnight (stretch, then freeze)
ID
Owner
Task
AL11
Alan
Chatbot /assistant/chat with restricted tools
AR7
Arjun
Personal dashboard and feed insights pages
AK8
Akshar
Event Mode (keep awake, foreground scanning, Android foreground service)
AK9
Akshar
Building geofence presence for public Open to Meet (mock location for the demo)
AD12
Adam
Events list, registration, attendee feed, "connection attending" alert
AR9
Arjun
Datasets: TC4TL calibration, SocioPatterns duration fitting into the simulator
AR10
Arjun
Web-mention opt-in search with approval screen

Phase 4: Sunday morning (no new features)
Everyone: bug fixes only, on the demo path.
AK10 (Akshar, lead) with all: pitch deck, demo script rehearsal, and a recorded backup demo video in case live Bluetooth or Wi-Fi fails.
Alan: prepare to explain IDF overlap, complementarity, the learned ranker, and the encounter classifier's limitation.
Final PROGRESS.md entry describing exactly how to run everything.
Dependencies to watch
AD6 needs AL3 and AL4. AD7 needs AL5. AK3 and AD8 need AL6. AD9 needs AR4. AL8 needs AK2 and AK6. AR6 needs AL3 clusters.
Until a dependency lands, build against mock JSON matching docs/api.md, then swap to live.

14. Definition of done and test checklist
Before calling a Must item done, verify on two physical phones:
[ ] Sign in with LinkedIn (or email fallback) creates a profile.
[ ] Resume, GitHub, and manual entry each produce interests with evidence; review screen edits persist.
[ ] At HackGT 13, matches list shows ranked people with "why you matched."
[ ] Open to Meet ON produces a suggestion; mutual yes opens chat; one-sided yes shows nothing to the other person.
[ ] QR verification creates a conversation and checklist prompts on both phones.
[ ] Mutual yes connects; one no leaves no trace for the other.
[ ] Invite QR/link: recipient sees sender, accepts, connection forms; revoked or expired links fail.
[ ] Connection Graph renders matches and topics; tapping a node shows the side panel.
[ ] No screen shows anyone else's connection count.
[ ] PROGRESS.md explains how to run the full demo from a fresh clone.

15. Reference: datasets and resources
Kaggle "Resume Dataset": stress-test extraction across majors.
ESCO skills taxonomy or O*NET: seed canonical interest names.
Kaggle "Speed Dating Experiment": validate that match features predict real mutual yes (validation only).
NIST TC4TL challenge data: phone Bluetooth RSSI and sensor data with distance labels.
SocioPatterns conference contact datasets (Hypertext 2009, mirrored on the Netzschleuder network catalogue; SFHH 2009): realistic face-to-face contact durations.
The best dataset is HackGT itself: onboard 30 to 50 hackers Saturday for real profiles, real handshakes, and a live community map.
16. Glossary
Embedding: a list of 384 numbers representing meaning; similar meanings are close together.
Cosine similarity: closeness of two embeddings, roughly 0 (unrelated) to 1 (same).
IDF: inverse document frequency; makes rare shared interests count more.
Complementarity: what one person seeks matches what the other offers.
LambdaRank: a learning-to-rank objective that optimizes the order of a list.
AUC / NDCG@10: ranking quality metrics (pair ordering; quality of the top 10).
RSSI: Bluetooth received signal strength in dBm; noisy proxy for distance.
UMAP / HDBSCAN / c-TF-IDF: 2D layout, clustering, and automatic cluster naming.
