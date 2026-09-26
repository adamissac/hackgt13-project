"""Profile storage: raw documents -> canonical interests -> user_interests (MASTER_SPEC 6.2, 6.4, 6.5).

raw_documents is the ledger. Each extracted document stores its validated extraction (with the
canonical interest id resolved for every item) in raw_documents.meta["extraction"]. user_interests is
always DERIVED by rebuild_user_interests(): the newest extraction per source, plus interests the user
added on the review screen, weighted and squashed. Re-ingesting a source replaces its old contribution
instead of double counting. confirmed/hidden flags survive rebuilds.

Interfaces other owners call:
- ingest_text(user_id, source, text, meta) -> result dict   (Arjun: GitHub digest, resume text)
"""
import logging
import math
import os

from psycopg.types.json import Jsonb

from ml.embed import embed
from ml.config import MERGE_THRESHOLD, LLM_TIEBREAK_BAND
from ml.profiles import interest_weight
from ml import extraction

from . import db, population

log = logging.getLogger("profile_store")

SOURCES = ("resume", "linkedin", "github", "facebook", "tiktok", "manual", "photos")
REVIEW_ADDS = "review_adds"          # raw_documents.meta.kind for user-added interests
USER_ADD_STRENGTH = 0.8


def _tiebreak_enabled() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY")) and os.getenv("CANON_LLM_TIEBREAK", "1") == "1"


# ------------------------------------------------------------------ canonicalization (6.4)
def canonicalize(conn, name: str, facet: str) -> int:
    """Return the canonical interest id for a raw name, creating it if nothing is close enough.

    cosine >= 0.88 merge; 0.80-0.88 ask Haiku (if enabled); below: new canonical interest.
    """
    key = " ".join(name.strip().lower().split())
    row = conn.execute("select id from interests where canonical_name = %s", (key,)).fetchone()
    if row:
        return row["id"]
    v = embed([key])[0]
    near = conn.execute(
        "select id, canonical_name, 1 - (embedding <=> %s) as sim from interests "
        "where embedding is not null order by embedding <=> %s limit 1", (v, v)).fetchone()
    if near:
        sim = float(near["sim"])
        if sim >= MERGE_THRESHOLD:
            log.info("canon merge %r -> %r (cos %.3f)", key, near["canonical_name"], sim)
            return near["id"]
        lo, hi = LLM_TIEBREAK_BAND
        if lo <= sim < hi and _tiebreak_enabled():
            try:
                from ml.llm import same_interest
                if same_interest(key, near["canonical_name"]).get("same"):
                    log.info("canon merge (llm) %r -> %r (cos %.3f)", key, near["canonical_name"], sim)
                    return near["id"]
            except Exception as e:  # tie-break is best effort
                log.warning("canon tie-break failed for %r: %s", key, e)
    row = conn.execute(
        "insert into interests (canonical_name, facet, embedding) values (%s, %s, %s) "
        "on conflict (canonical_name) do update set canonical_name = excluded.canonical_name "
        "returning id", (key, facet, v)).fetchone()
    log.info("canon new %r (nearest cos %s)", key, f"{float(near['sim']):.3f}" if near else "n/a")
    return row["id"]


# ------------------------------------------------------------------ documents
def save_document(conn, user_id: str, source: str, text: str, meta: dict | None = None) -> int:
    row = conn.execute(
        "insert into raw_documents (user_id, source, text, meta) values (%s, %s, %s, %s) returning id",
        (user_id, source, text, Jsonb(meta or {}))).fetchone()
    return row["id"]


def latest_document(user_id: str, source: str) -> dict | None:
    return db.fetchone(
        "select id, text, meta from raw_documents where user_id = %s and source = %s "
        "and coalesce(meta->>'kind', '') <> %s order by fetched_at desc, id desc limit 1",
        (user_id, source, REVIEW_ADDS))


def store_extraction(user_id: str, doc_id: int, source: str, result: extraction.ExtractResult) -> dict:
    """Canonicalize every interest, save the extraction on the document, rebuild the profile."""
    with db.conn() as c:
        items = []
        for it in result.interests:
            iid = canonicalize(c, it.name, it.facet)
            items.append({**it.model_dump(), "interest_id": iid})
        payload = {"interests": items, "seeking": result.seeking, "offering": result.offering,
                   "summary": result.summary.model_dump()}
        c.execute("update raw_documents set meta = coalesce(meta, '{}'::jsonb) || %s where id = %s",
                  (Jsonb({"extraction": payload}), doc_id))
        # extracted goals only fill empty profile fields; typed goals always win
        c.execute("update profiles set seeking = case when coalesce(seeking, '') = '' then %s else seeking end, "
                  "offering = case when coalesce(offering, '') = '' then %s else offering end where id = %s",
                  (result.seeking, result.offering, user_id))
        rebuild_user_interests(c, user_id)
    population.invalidate()
    # Merge this source into the versioned skill profile (docs/ONBOARDING.md). Never raises.
    from . import skill_profile
    skill_profile.build_safely(user_id, source if source in skill_profile.TRIGGERS else "rebuild")
    return payload


# ------------------------------------------------------------------ weights (6.5)
def rebuild_user_interests(conn, user_id: str) -> None:
    docs = conn.execute(
        "select distinct on (source) source, meta from raw_documents "
        "where user_id = %s and meta ? 'extraction' and coalesce(meta->>'kind', '') <> %s "
        "order by source, fetched_at desc, id desc", (user_id, REVIEW_ADDS)).fetchall()
    adds = conn.execute(
        "select meta from raw_documents where user_id = %s and meta->>'kind' = %s",
        (user_id, REVIEW_ADDS)).fetchone()
    flags = {r["interest_id"]: r for r in conn.execute(
        "select interest_id, confirmed, hidden from user_interests where user_id = %s", (user_id,)).fetchall()}

    contrib: dict[int, list[tuple[float, str, str]]] = {}
    for d in docs:
        for it in d["meta"]["extraction"]["interests"]:
            iid = it["interest_id"]
            confirmed = bool(flags.get(iid, {}).get("confirmed"))
            w = interest_weight({"source": d["source"], "strength": it["strength"], "confirmed": confirmed})
            contrib.setdefault(iid, []).append((w, d["source"], it.get("evidence", "")))
    for it in (adds["meta"].get("items", []) if adds else []):
        iid = it["interest_id"]
        w = interest_weight({"source": "manual", "strength": USER_ADD_STRENGTH, "confirmed": True})
        contrib.setdefault(iid, []).append((w, "manual", "Added by you"))

    conn.execute("delete from user_interests where user_id = %s and not (interest_id = any(%s))",
                 (user_id, list(contrib)))
    for iid, parts in contrib.items():
        total = sum(p[0] for p in parts)
        top = max(parts, key=lambda p: p[0])
        conn.execute(
            "insert into user_interests (user_id, interest_id, weight, source, evidence) "
            "values (%s, %s, %s, %s, %s) on conflict (user_id, interest_id) do update set "
            "weight = excluded.weight, source = excluded.source, evidence = excluded.evidence",
            (user_id, iid, 1 - math.exp(-total), top[1], top[2]))


# ------------------------------------------------------------------ API shapes (docs/api.md 3, 4)
def get_interests(user_id: str) -> dict:
    prof = db.fetchone("select seeking, offering from profiles where id = %s", (user_id,)) or {}
    rows = db.fetchall(
        "select ui.interest_id, i.canonical_name as name, i.facet, ui.weight, ui.source, ui.evidence, "
        "ui.confirmed, ui.hidden from user_interests ui join interests i on i.id = ui.interest_id "
        "where ui.user_id = %s order by ui.weight desc, i.canonical_name", (user_id,))
    return {"user_id": user_id, "seeking": prof.get("seeking") or "", "offering": prof.get("offering") or "",
            "interests": [{**r, "weight": round(float(r["weight"]), 4)} for r in rows]}


def patch_interests(user_id: str, confirm: list[int], hide: list[int], add: list[dict]) -> dict:
    with db.conn() as c:
        if confirm:
            c.execute("update user_interests set confirmed = true, hidden = false "
                      "where user_id = %s and interest_id = any(%s)", (user_id, confirm))
        if hide:
            c.execute("update user_interests set hidden = true, confirmed = false "
                      "where user_id = %s and interest_id = any(%s)", (user_id, hide))
        if add:
            row = c.execute("select id, meta from raw_documents where user_id = %s and meta->>'kind' = %s",
                            (user_id, REVIEW_ADDS)).fetchone()
            items = row["meta"].get("items", []) if row else []
            have = {i["interest_id"] for i in items}
            new_ids = []
            for a in add:
                iid = canonicalize(c, a["name"], a["facet"])
                new_ids.append(iid)
                if iid not in have:
                    items.append({"interest_id": iid, "name": a["name"], "facet": a["facet"]})
                    have.add(iid)
            meta = {"kind": REVIEW_ADDS, "items": items}
            if row:
                c.execute("update raw_documents set meta = %s where id = %s", (Jsonb(meta), row["id"]))
            else:
                save_document(c, user_id, "manual", "", meta)
        rebuild_user_interests(c, user_id)
        if add:  # an interest the user adds is confirmed and visible
            c.execute("update user_interests set confirmed = true, hidden = false "
                      "where user_id = %s and interest_id = any(%s)", (user_id, new_ids))
            rebuild_user_interests(c, user_id)
    population.invalidate()
    return get_interests(user_id)


# ------------------------------------------------------------------ one-call ingestion
def ingest_text(user_id: str, source: str, text: str, meta: dict | None = None) -> dict:
    """Store a document, extract, canonicalize, rebuild. Raises extraction.ExtractionError."""
    if source not in SOURCES:
        raise ValueError(f"unknown source {source}")
    with db.conn() as c:
        doc_id = save_document(c, user_id, source, text, meta)
    result = extraction.extract(text, source)
    return store_extraction(user_id, doc_id, source, result)


def extract_existing(user_id: str, doc_id: int, source: str, text: str) -> dict:
    """Extract a document someone else already stored (e.g. Arjun's GitHub digest)."""
    result = extraction.extract(text, source)
    return store_extraction(user_id, doc_id, source, result)
