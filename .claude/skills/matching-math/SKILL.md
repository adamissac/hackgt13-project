---
name: matching-math
description: "Implementation guide for profile weighting, IDF, embeddings, pair features, the V1 match score, suggestions, the learned ranker, and the encounter classifier in ml/. Use whenever writing or changing matching, suggestions, shared-topic ranking, checklists, graph scores, ranker training or evaluation, or anything that computes or explains a match score."
---

# Matching implementation guide
Formulas live in MASTER_SPEC 6.5 to 6.8 and are already implemented in `ml/ml/profiles.py`, `scoring.py`, `ranker.py`, and `encounter.py`. Reuse them and wrap them for the database.

## Storage and serving
- Unit-normalized 384-d bge-small vectors (`normalize_embeddings=True`) in pgvector with an HNSW index using `vector_cosine_ops`. Cosine similarity = 1 minus the `<=>` distance.
- Load the embedding model once at FastAPI startup (lifespan), not per request.
- IDF is computed over the event population (or the building for public mode). Recompute on check-in batches and every 5 minutes, never per request.

## Invariants worth one pytest each
- `sim_*`, `idf_overlap`, `complementarity`, and `bridge` are symmetric, so V1(a, b) == V1(b, a).
- The green highlight is per viewer (above the viewer's own 80th percentile). A can be green for B while B isn't green for A, so the UI must never imply mutual interest.
- The candidate pool excludes blocks, prior declines, and existing connections (they go to the reconnect path), and includes only people who may be suggested right now.
- Shared topics sort by min(w_a, w_b) * idf and include only interests both users can see on each other's quick profile.
- Public mode: at most 3 suggestions per user per day and no repeat of a pair within 7 days.

## Learned ranker (6.7)
- Split by user (GroupKFold or GroupShuffleSplit), never by row. LambdaRank group = viewer id.
- Report AUC and NDCG@10 for V1, logistic regression, and LambdaRank side by side, labeled "simulated outcomes" until real data exists.
- Log every shown suggestion to `impressions`.

## Encounter classifier (6.8)
- A session merges sightings between two phones when gaps are under 60 seconds.
- Weight team-recorded real sessions 3x. Report the "same table, not talking" false-positive rate on its own line.

## Explaining a match
Rare shared interests count more (IDF), complementary goals count (what one seeks, the other offers), and cross-cluster bridges get a small boost. Every "why you matched" line must trace to evidence both users can see.
