"""Persist one LLM extraction (`llm.extract_interests` output) for a user.

Minimal version so ingestion produces interests end to end (AR1/AR2 done-when):
- canonical match is exact lowercase name (Alan's AL2/AL3 swaps in embedding canonicalization from
  profiles.InterestIndex and fills interests.embedding / profile_vectors);
- weight per MASTER_SPEC 6.5 squash: 1 - exp(-trust * strength), never lowered by a weaker source;
- never touches a user's `confirmed` / `hidden` choices.
"""
import math

from . import supa
from .config import FACETS, SOURCE_TRUST

MAX_INTERESTS = 20


def _clean(name):
    return " ".join(str(name).lower().split())[:60]


def store_extraction(user_id, source, extraction):
    items = []
    for it in (extraction.get("interests") or [])[:MAX_INTERESTS]:
        name = _clean(it.get("name", ""))
        facet = it.get("facet")
        if not name or facet not in FACETS:
            continue
        strength = max(0.0, min(1.0, float(it.get("strength", 0.5))))
        items.append((name, facet, strength, str(it.get("evidence", ""))[:300]))
    if not items:
        return []

    # 1. canonical interests (create missing ones)
    names = sorted({n for n, *_ in items})
    existing = {r["canonical_name"]: r for r in supa.select(
        "interests", {"select": "id,canonical_name,facet", "canonical_name": f"in.({','.join(_quote(n) for n in names)})"})}
    missing = [{"canonical_name": n, "facet": f} for n, f, *_ in items if n not in existing]
    if missing:
        # dedupe within this batch, then upsert so a concurrent insert can't fail us
        uniq = {m["canonical_name"]: m for m in missing}
        for r in supa.upsert("interests", list(uniq.values()), on_conflict="canonical_name"):
            existing[r["canonical_name"]] = r

    # 2. user_interests: keep the stronger weight
    current = {r["interest_id"]: r for r in supa.select(
        "user_interests", {"select": "interest_id,weight", "user_id": f"eq.{user_id}"})}
    trust = SOURCE_TRUST.get(source, 1.0)
    rows = {}
    for name, facet, strength, evidence in items:
        iid = existing[name]["id"]
        w = round(1 - math.exp(-trust * strength), 4)
        prev = current.get(iid, {}).get("weight") or 0
        if w <= prev and iid in current:
            continue
        if iid not in rows or rows[iid]["weight"] < w:
            rows[iid] = {"user_id": user_id, "interest_id": iid, "weight": w, "source": source, "evidence": evidence}
    if rows:
        supa.upsert("user_interests", list(rows.values()), on_conflict="user_id,interest_id")

    # 3. goals boxes: fill seeking/offering only if the user left them empty
    prof = supa.select("profiles", {"select": "seeking,offering", "id": f"eq.{user_id}"})
    if prof:
        patch = {k: extraction[k] for k in ("seeking", "offering")
                 if extraction.get(k) and not (prof[0].get(k) or "").strip()}
        if patch:
            supa.update("profiles", {"id": user_id}, patch)
    return [{"name": n, "facet": f, "evidence": e} for n, f, _s, e in items]


def _quote(s):
    """PostgREST `in.(...)` list value."""
    return '"' + s.replace('"', '\\"') + '"'
