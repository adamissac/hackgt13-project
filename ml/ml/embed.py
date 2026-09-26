"""Embedding wrapper.

Uses sentence-transformers (bge-small) when available. Falls back to a hashed
character n-gram embedder so every script still runs offline or on a laptop
with no model download. The fallback is fine for testing plumbing, NOT for demo.
"""
from functools import lru_cache
import numpy as np
from .config import EMBED_MODEL

_model = None
_fallback = False


def _load():
    global _model, _fallback
    if _model is not None or _fallback:
        return
    try:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(EMBED_MODEL)
    except Exception as e:  # no package, no network, etc.
        print(f"[embed] sentence-transformers unavailable ({type(e).__name__}); using hashed fallback")
        _fallback = True


def _hash_embed(texts, dim=384):
    from sklearn.feature_extraction.text import HashingVectorizer
    hv = HashingVectorizer(analyzer="char_wb", ngram_range=(3, 5), n_features=dim,
                           alternate_sign=False, norm="l2")
    return hv.transform(texts).toarray().astype(np.float32)


def embed(texts):
    """Return L2-normalized (n, 384) float32 array."""
    if isinstance(texts, str):
        texts = [texts]
    _load()
    if _fallback:
        return _hash_embed(texts)
    # bge models expect no instruction prefix for symmetric similarity
    v = _model.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False)
    return np.asarray(v, dtype=np.float32)


@lru_cache(maxsize=20000)
def embed_one(text):
    return embed([text])[0]


def normalize(v):
    n = np.linalg.norm(v)
    return v / n if n > 0 else v
