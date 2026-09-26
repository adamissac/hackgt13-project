# Connect: AI / ML components

Everything AI in the app, why it is there, what model it uses, and what it trains on.
Run `python run_demo.py` to exercise every piece end to end on synthetic data (about 1 minute on a laptop).

## Quick start

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # only needed for extraction, starters, --llm
python run_demo.py                  # offline dry run: profiles, clusters, ranker, encounter model, dashboard JSON
python run_demo.py --llm            # adds Claude-generated conversation starters
```

Outputs land in `data/`: `ranker_lr.pkl`, `ranker_lgbm.pkl`, `encounter_gbm.pkl`, `dashboard.json`.
First run of sentence-transformers downloads `bge-small-en-v1.5` (about 130 MB). Do that on good Wi-Fi tonight.
If it can't load, `ml/embed.py` falls back to a hashed n-gram embedder so the plumbing still runs (not demo quality).

## The map: 8 AI components

| # | Component | Type | Model | Trained? | File |
|---|---|---|---|---|---|
| 1 | Interest extraction | LLM, structured output | Claude Sonnet (resumes), Claude Haiku (bulk) | No, prompted | `ml/llm.py` |
| 2 | Photo hobby extraction (optional) | Vision LLM | Claude Haiku | No | `ml/llm.py` |
| 3 | Canonicalization | Embedding nearest neighbor + LLM tie-break | bge-small + Haiku | No | `ml/profiles.py` |
| 4 | Profile vectors | Pretrained embeddings + IDF weighting | bge-small | No | `ml/profiles.py` |
| 5 | Match scoring | V1 weighted sum, V2 learned | LogReg, LightGBM LambdaRank | **Yes** | `ml/scoring.py`, `ml/ranker.py` |
| 6 | Encounter detection | Binary classifier on BLE time series | HistGradientBoosting | **Yes** | `ml/encounter.py` |
| 7 | Explanations + starters | Grounded LLM generation | Claude Sonnet | No | `ml/llm.py`, `ml/scoring.py` |
| 8 | Community map | Unsupervised: UMAP + HDBSCAN + c-TF-IDF | umap-learn, scikit-learn | No (unsupervised) | `ml/viz.py` |

Model IDs are set in `ml/config.py` (`claude-sonnet-5`, `claude-haiku-4-5-20251001`) and can be overridden by env vars.

## Why it is not a classifier

Matching is a **ranking** problem: for each person, order everyone else by how likely a conversation
turns into a real connection. So the design is:

1. **Represent** each person (weighted interests + facet vectors) with pretrained models. No training.
2. **Score** each pair with explainable features.
3. **Learn** how to combine those features from real outcomes (learning to rank).

The only true classifier is the encounter model (#6).

## 1. Interest extraction

**Why:** raw resumes, READMEs, and Facebook likes are messy text. Matching needs clean, weighted interests with evidence.

**How:** one call per source document, JSON schema in `EXTRACT_SYSTEM`. Each interest has `name, facet, strength, evidence`.
Also extracts `seeking`, `offering`, and a one-line summary per facet.
Facets: `technical, career, personal, academic`.

**Inputs per source:**
- LinkedIn PDF / resume: `pdfplumber` text, Sonnet
- GitHub: `github_to_text()` builds a digest of non-fork repos (languages, topics, description, README first 1200 chars), Haiku
- Facebook likes: `likes_to_text()` (Page name + category), Haiku
- TikTok bio + video captions, Haiku
- Manual goals boxes: embedded directly, and also extracted

The prompt tells the model to skip sensitive attributes (health, religion, politics). Keep that.

## 2. Photo hobbies (optional)

User picks up to 6 photos. Vision call extracts hobbies only (personal facet), never appearance. Cut this first if short on time.

## 3. Canonicalization

**Why:** "RL", "reinforcement learning", and "deep RL" must be the same interest or overlap scores break.

**How:** embed the raw name, find the nearest canonical interest.
- cosine >= 0.88: merge
- 0.80 to 0.88: ask Haiku `same_interest(a, b)` (only if `use_llm_tiebreak=True`)
- below: create a new canonical interest

In production this is the `interests` table with a pgvector HNSW index. Tune 0.88 by printing merges on real extracted data Saturday.

## 4. Profile vectors and weights

Per user-interest weight:

```
w = trust(source) * strength * exp(-months_ago / 12) * depth * (1.15 if user confirmed)
w_final = 1 - exp(-sum of w across sources)        # squash so one source can't dominate
depth (GitHub) = language_byte_share * (1 + ln(1 + stars)) * (1 if owner else 0.3)
```

IDF over the current population (the whole app or just this event):

```
idf(i) = ln((N + 1) / (df_i + 1)) + 0.1
```

Facet vector = normalize(0.7 * normalize(sum w * idf * e_i) + 0.3 * embed(facet summary)).
Combined vector = normalized mean of non-empty facet vectors (used for retrieval + UMAP).
`seek_vec`, `offer_vec` = embeddings of the goals boxes.

## 5. Match scoring (the part you present)

**Features for a pair (a, b)**, in `scoring.FEATURES`:

| Feature | Meaning |
|---|---|
| sim_technical / career / personal / academic | cosine of facet vectors |
| idf_overlap | IDF-weighted Jaccard: shared rare interests count far more than shared "python" |
| complementarity | 0.5 * [cos(seek_a, offer_b) + cos(seek_b, offer_a)]: what one wants, the other has |
| bridge | strong similarity in one facet but different HDBSCAN communities overall |
| role_pair | complementarity, only for student-recruiter pairs |

**V1 (ship tonight):** weighted sum with `V1_WEIGHTS` in config. Highlight (green dot) = above that user's 80th percentile.

**V2 (learned):**

| | Detail |
|---|---|
| Unit of data | one pair that **met** (QR handshake or detected encounter) |
| X | the 8 features above |
| y (LogReg) | 1 if both said "connect", else 0 |
| rel (LambdaRank) | 2 = connected, 1 = talked 8+ min, 0 = neither |
| group | viewer id (ranking is per person) |
| Split | by user, never by row (prevents leakage) |
| Metrics | AUC for connect prediction, NDCG@10 for ranking |
| Serving | LogReg probabilities (interpretable coefficients for judges), LightGBM once data grows |
| Exploration | epsilon slot swap with a bridge match, or `thompson_scores()` noise scaled by p(1-p) |

Log every recommendation shown (`impressions` table) so you can later correct for the fact that people only meet who you showed them.

**Training data, in order of availability:**

1. **Tonight: synthetic.** `synth.make_population()` builds 200 fake attendees from 8 archetypes with
   30% cross-disciplinary secondaries and 15% recruiters. `simulate_meetings()` has each person meet mostly
   V1-suggested people plus randoms, and decides outcomes with a **hidden ground-truth model** that is
   deliberately different from V1 (weights rare shared interests, shared hobbies, and student-recruiter
   career fit). The learned ranker's job is to recover it. Optional: `llm_population()` for more realistic fake profiles.
2. **Saturday: your own team and friends.** 10 to 20 real people onboard, do real handshakes and checklists. Too little to train on, but proves the loop is live.
3. **After launch: real handshakes.** Retrain nightly.

Current dry-run result (200 synthetic people, 1,651 met pairs):

| Model | AUC | NDCG@10 |
|---|---|---|
| V1 hand-tuned | 0.73 | 0.85 |
| Logistic regression | 0.82 | 0.89 |
| LightGBM LambdaRank | 0.81 | 0.87 |

Top learned coefficients: idf_overlap, sim_personal, role_pair. That is the pitch line: "the model learned that
shared niche interests and shared hobbies predict real connections better than generic skill overlap."
Be upfront that the numbers are on simulated outcomes.

**Checklist + feedback:** checklist items = top 5 shared interests by `min(w_a, w_b) * idf`, plus "something else".
Answers become the pair label and also nudge each user's interest weights (discussed topics up, never-discussed topics slowly down).

## 6. Encounter classifier

**Why:** distinguish a real conversation from standing in line, walking past, or sitting at the same table on laptops.

**Features** (`ENC_FEATURES`): duration, median RSSI (after 5 s rolling median), IQR, std, fraction of time above -65 dBm,
max scan gap, scan rate, RSSI slope, fraction of time each phone was stationary, same zone.

**Model:** HistGradientBoostingClassifier, threshold 0.7. LogReg as a baseline.

**Training data:**
1. Synthetic: `simulate_ble_sessions()` with 5 classes, per-phone calibration offsets (±4 dB), 25% dropped scans.
2. **Real, Saturday morning (45 min, highest value):** pairs of teammates record sessions with Event Mode on:
   talk face to face, stand in a line, walk past, sit across the room, sit at the same table on laptops.
   5 to 10 of each, labeled in a sheet. Retrain on synthetic + real, weight real rows 3x.
3. Production: sessions ending in a QR handshake are weak positives.

**Dry-run result:** AUC 0.96, but 44% of "same table, not talking" sessions are misclassified as conversations.
This is a real limitation of Bluetooth signal alone, and it is exactly why a **connection requires the QR handshake**;
the classifier only powers the "you talked for about N minutes" recap. Say this to judges, it shows you understand your data.

## 7. Explanations and starters

`shared_interests()` ranks shared interests by contribution. The top 3 plus both people's evidence lines go to
`conversation_starters()`, which returns `{why, openers[2]}`. Only uses data both people can see on each other's profiles.

## 8. Community map (the data-viz track)

- `communities()`: UMAP to 10 dimensions, then HDBSCAN (min cluster 5). Unclustered = -1.
- `layout()`: UMAP to 2D for the dashboard.
- `ctfidf_labels()`: class-based TF-IDF names each cluster by interests common inside it but rare outside.
- `connection_gaps()`: for each pair of different clusters, expected connections (sum of model probabilities over
  top-10 matches) vs actual. Largest gaps = missed bridges ("ML researchers and bio students should be talking and aren't").
- `dashboard_json()`: nodes (no names), clusters, edges, gaps. Feed to D3/deck.gl, update live with Supabase Realtime.

## Cut order if time runs out

1. Photo extraction  2. LLM canonicalization tie-break  3. LightGBM (keep LogReg)  4. Learned ranker entirely (keep V1)
Never cut: extraction, IDF overlap, complementarity, the community map.

## Integration notes for the backend

- Wrap these as FastAPI endpoints: `/profile/ingest`, `/events/{id}/matches`, `/encounters/score`, `/dashboard/{id}`.
- Vectors live in Postgres (pgvector). `InterestIndex` is the in-memory version of the `interests` table.
- Recompute IDF and clusters per event on a timer (every 5 min is plenty), not per request.
