"""Central config. Every tunable number lives here so the team tunes in one place."""
import os

# ---- Models ----
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")   # 384-dim, CPU friendly
# CPU on purpose. Left to itself sentence-transformers picks Apple's MPS backend on an M-series
# Mac, and bge-small on MPS aborts the whole process with a Metal assertion
# ("_status < MTLCommandBufferStatusCommitted") under the background workers' concurrent calls.
# CPU also keeps laptop vectors identical to Railway's, which has no GPU and writes the same
# pgvector column. Set EMBED_DEVICE=mps or =cuda to override.
EMBED_DEVICE = os.getenv("EMBED_DEVICE", "cpu")
LLM_SMART = os.getenv("LLM_SMART", "claude-sonnet-5")               # resumes, starters
LLM_FAST = os.getenv("LLM_FAST", "claude-haiku-4-5-20251001")       # bulk: likes, bios, tie-breaks

# ---- Facets ----
FACETS = ["technical", "career", "personal", "academic"]

# ---- Canonicalization ----
MERGE_THRESHOLD = 0.88      # cosine sim above this = same interest
LLM_TIEBREAK_BAND = (0.80, 0.88)  # ask the LLM only inside this band

# ---- Source trust (alpha) ----
SOURCE_TRUST = {"github": 1.0, "resume": 1.0, "linkedin": 1.0,
                "manual": 1.2, "facebook": 0.6, "tiktok": 0.5, "photos": 0.6}
RECENCY_TAU_MONTHS = 12
CONFIRM_BOOST = 1.15        # user confirmed the interest in review screen

# ---- Profile vector blend ----
TAG_WEIGHT, SUMMARY_WEIGHT = 0.7, 0.3

# ---- Feature calibration ----
# bge-small cosine similarity is compressed: two unrelated profiles still score ~0.75 and near-twins ~0.95,
# so raw cosines made every match land at 49-60%. Features are rescaled from these (floor, ceiling) ranges
# to 0..1 before weighting (measured on the 80-person HackGT population: p10 ~0.7, p90 ~0.9).
SIM_RANGE = (0.60, 0.95)            # facet similarity
COMPLEMENT_RANGE = (0.45, 0.85)     # seeking vs offering similarity
OVERLAP_FULL = 0.20                 # sharing a quarter of your weighted, IDF-scaled interests = full overlap

# ---- V1 hand-tuned score weights ----
# Shared niche interests are the clearest signal of real common ground, so they carry the most weight.
V1_WEIGHTS = {"sim_technical": 0.18, "sim_career": 0.12, "sim_personal": 0.08,
              "sim_academic": 0.07, "idf_overlap": 0.30, "complementarity": 0.20,
              "bridge": 0.05}
HIGHLIGHT_PERCENTILE = 80   # green dot = above this user's 80th percentile

# ---- Encounter detection ----
RSSI_NEAR_DBM = -65
SESSION_GAP_S = 60
P_CONVERSATION_THRESHOLD = 0.7
