"""Profile construction: canonicalize -> weight -> IDF -> facet vectors.

No training. Pure pretrained embeddings plus math. Deterministic and explainable.
"""
import math
from collections import defaultdict
import numpy as np
from .config import (FACETS, MERGE_THRESHOLD, LLM_TIEBREAK_BAND, SOURCE_TRUST,
                     RECENCY_TAU_MONTHS, CONFIRM_BOOST, TAG_WEIGHT, SUMMARY_WEIGHT)
from .embed import embed, normalize


class InterestIndex:
    """Canonical interest vocabulary. In production this is the `interests` table + pgvector."""

    def __init__(self, use_llm_tiebreak=False):
        self.names, self.facets, self.vecs = [], [], []
        self.alias = {}                  # raw lowercase name -> canonical id
        self.use_llm = use_llm_tiebreak
        self.idf = {}

    def _matrix(self):
        return np.vstack(self.vecs) if self.vecs else np.zeros((0, 384), np.float32)

    def resolve(self, raw_name, facet):
        key = raw_name.strip().lower()
        if key in self.alias:
            return self.alias[key]
        v = embed([key])[0]
        M = self._matrix()
        if len(M):
            sims = M @ v
            j = int(np.argmax(sims))
            s = float(sims[j])
            if s >= MERGE_THRESHOLD:
                self.alias[key] = j
                return j
            lo, hi = LLM_TIEBREAK_BAND
            if self.use_llm and lo <= s < hi:
                from .llm import same_interest
                try:
                    r = same_interest(key, self.names[j])
                    if r.get("same"):
                        self.alias[key] = j
                        return j
                except Exception:
                    pass
        self.names.append(key)
        self.facets.append(facet)
        self.vecs.append(v)
        idx = len(self.names) - 1
        self.alias[key] = idx
        return idx

    def compute_idf(self, people):
        """Smoothed IDF over the current population (whole app or one event)."""
        N = len(people)
        df = defaultdict(int)
        for p in people:
            for i in p["interests"]:
                df[i] += 1
        self.idf = {i: math.log((N + 1) / (df[i] + 1)) + 0.1 for i in range(len(self.names))}
        return self.idf


def interest_weight(item):
    """item: {source, strength, months_ago, depth, confirmed}."""
    trust = SOURCE_TRUST.get(item.get("source", "manual"), 0.8)
    recency = math.exp(-item.get("months_ago", 0) / RECENCY_TAU_MONTHS)
    depth = item.get("depth", 1.0)
    boost = CONFIRM_BOOST if item.get("confirmed") else 1.0
    return trust * item.get("strength", 0.5) * recency * depth * boost


def github_depth(language_byte_share, stars, is_owner):
    return language_byte_share * (1 + math.log1p(stars)) * (1.0 if is_owner else 0.3)


def build_interests(person, index):
    """Aggregate raw extracted interests into {canon_id: {weight, facet, evidence}}."""
    agg = {}
    for it in person["raw_interests"]:
        if it.get("hidden"):
            continue
        cid = index.resolve(it["name"], it["facet"])
        w = interest_weight(it)
        if cid not in agg:
            agg[cid] = {"weight": 0.0, "facet": index.facets[cid], "evidence": it.get("evidence", "")}
        agg[cid]["weight"] += w
    # squash so one spammy source can't dominate: w -> 1 - exp(-w)
    for v in agg.values():
        v["weight"] = 1 - math.exp(-v["weight"])
    person["interests"] = agg
    return agg


def build_vectors(person, index):
    """Facet vectors, combined vector, seeking/offering vectors."""
    vecs = {}
    summaries = person.get("summary", {}) or {}
    for f in FACETS:
        acc = np.zeros(384, np.float32)
        for cid, it in person["interests"].items():
            if it["facet"] == f:
                acc += it["weight"] * index.idf.get(cid, 1.0) * index.vecs[cid]
        tag_v = normalize(acc) if acc.any() else acc
        s = summaries.get(f, "")
        if s and tag_v.any():
            v = normalize(TAG_WEIGHT * tag_v + SUMMARY_WEIGHT * embed([s])[0])
        elif s:
            v = embed([s])[0]
        else:
            v = tag_v
        vecs[f] = v
    person["vec"] = vecs
    present = [vecs[f] for f in FACETS if vecs[f].any()]
    person["combined"] = normalize(np.mean(present, axis=0)) if present else np.zeros(384, np.float32)
    person["seek_vec"] = embed([person["seeking"]])[0] if person.get("seeking") else np.zeros(384, np.float32)
    person["offer_vec"] = embed([person["offering"]])[0] if person.get("offering") else np.zeros(384, np.float32)
    return person


def build_population(people, use_llm_tiebreak=False):
    index = InterestIndex(use_llm_tiebreak)
    for p in people:
        build_interests(p, index)
    index.compute_idf(people)
    for p in people:
        build_vectors(p, index)
    return index
