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

# ---- V1 hand-tuned score weights ----
V1_WEIGHTS = {"sim_technical": 0.20, "sim_career": 0.15, "sim_personal": 0.10,
              "sim_academic": 0.10, "idf_overlap": 0.20, "complementarity": 0.20,
              "bridge": 0.05}
HIGHLIGHT_PERCENTILE = 80   # green dot = above this user's 80th percentile

# ---- Encounter detection ----
RSSI_NEAR_DBM = -65
SESSION_GAP_S = 60
P_CONVERSATION_THRESHOLD = 0.7
