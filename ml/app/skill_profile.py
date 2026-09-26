"""Skill-profile builder (docs/ONBOARDING.md, section "Background job").

Runs after every successful extraction (profile_store.store_extraction) — i.e. when GitHub connects or a
resume lands, and again when the other source arrives, so the two are merged. It combines:
  - the LLM extraction per source (raw_documents.meta.extraction, already canonicalized),
  - GitHub signals from the digest (languages by bytes, frameworks from manifests, stars/forks,
    commit activity, pinned repos),
  - the resume structure (experience, education, named skills, certifications),
into one structured profile, and stores it as a new version in user_skill_profiles.

Idempotent: the input hash is compared under a per-user advisory lock, so re-running with the same
inputs returns the active version instead of writing a duplicate. Enqueues are de-duplicated on
(user_id, trigger_source). Failures never block the user: onboarding becomes 'partial' and it's logged.

Matching reads the active version (population.load_people) on top of user_interests.
"""
import hashlib
import json
import logging
import threading
from datetime import datetime, timezone

from psycopg.types.json import Jsonb

from ml.resume_structure import ResumeStructure, years_of_experience
from ml.skill_taxonomy import domains_for, normalize_skill

from . import db

log = logging.getLogger("skill_profile")

PROFILE_SOURCES = ("github", "resume", "manual")
TRIGGERS = ("github", "resume", "manual", "rebuild")
MAX_SKILLS = 60


# ---------------------------------------------------------------- pure composition
def _noisy_or(values: list[float]) -> float:
    p = 1.0
    for v in values:
        p *= 1 - max(0.0, min(1.0, v))
    return 1 - p


def compose_profile(user_id: str, *, extractions: dict, active_weights: dict, github_meta: dict | None,
                    resume: ResumeStructure | None, version: int, now: str | None = None) -> dict:
    """Pure: build the profile JSON (without interest ids) from already-loaded inputs.

    extractions: {source: [{"name", "facet", "strength", "interest_id"}]}
    active_weights: {interest_id: weight} from user_interests (confirmed/hidden already applied; hidden excluded)
    """
    evidence: dict[str, dict] = {}   # normalized name -> {"conf": [..], "sources": set, "interest_id"}

    def add(name: str, conf: float, source: str, interest_id=None):
        key = normalize_skill(name)
        if not key:
            return
        e = evidence.setdefault(key, {"conf": [], "sources": set(), "interest_id": None})
        e["conf"].append(conf)
        e["sources"].add(source)
        if interest_id is not None and e["interest_id"] is None:
            e["interest_id"] = interest_id

    for source, items in extractions.items():
        for it in items:
            if it.get("facet") != "technical":
                continue
            iid = it.get("interest_id")
            if iid is not None and iid not in active_weights:
                continue  # hidden by the user: never resurface it
            conf = active_weights.get(iid, it.get("strength", 0.5))
            add(it["name"], float(conf), source, iid)

    repos = (github_meta or {}).get("repos", [])
    for lang, share in (github_meta or {}).get("language_shares", {}).items():
        if share >= 0.02:
            add(lang, min(0.95, 0.35 + 2 * float(share)), "github")
    fw_counts: dict[str, int] = {}
    for r in repos:
        for fw in r.get("frameworks", []) or []:
            fw_counts[fw] = fw_counts.get(fw, 0) + 1
    for fw, n in fw_counts.items():
        add(fw, min(0.9, 0.55 + 0.1 * (n - 1)), "github")

    if resume:
        for s in resume.skills:
            add(s, 0.6, "resume")

    skills = []
    for name, e in evidence.items():
        srcs = sorted(e["sources"])
        skills.append({"name": name, "confidence": round(_noisy_or(e["conf"]), 3), "sources": srcs,
                       "interest_id": e["interest_id"]})
    skills.sort(key=lambda s: (-s["confidence"], s["name"]))
    skills = skills[:MAX_SKILLS]

    all_names = [s["name"] for s in skills] + [it["name"] for items in extractions.values() for it in items]
    highlights = sorted(
        repos,
        key=lambda r: (not r.get("pinned"), -(r.get("stars") or 0), -(r.get("commits_52w") or 0)),
    )[:5]
    return {
        "user_id": user_id,
        "skills": [{k: v for k, v in s.items() if k != "interest_id"} for s in skills],
        "experience_years_estimate": years_of_experience(resume.experience) if resume else None,
        "domains": domains_for(all_names),
        "project_highlights": [
            {"name": r.get("name"), "description": r.get("description", ""), "stars": r.get("stars", 0),
             "forks": r.get("forks", 0), "languages": r.get("languages", []), "frameworks": r.get("frameworks", []),
             "commits_last_year": r.get("commits_52w"), "pinned": bool(r.get("pinned")), "url": r.get("url")}
            for r in highlights
        ],
        "education": [s.model_dump() for s in resume.education] if resume else [],
        "certifications": list(resume.certifications) if resume else [],
        "generated_at": now or datetime.now(timezone.utc).isoformat(),
        "profile_version": version,
        "_skills_with_ids": skills,
    }


def input_hash(doc_ids: dict, weights: dict) -> str:
    blob = json.dumps({"docs": doc_ids, "w": {str(k): round(float(v), 3) for k, v in sorted(weights.items())}},
                      sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


# ---------------------------------------------------------------- DB
def _load_inputs(c, user_id: str):
    docs = c.execute(
        "select distinct on (source) id, source, meta from raw_documents "
        "where user_id = %s and source = any(%s) and coalesce(meta->>'kind', '') <> 'review_adds' "
        "order by source, fetched_at desc, id desc", (user_id, list(PROFILE_SOURCES))).fetchall()
    weights = {r["interest_id"]: float(r["weight"]) for r in c.execute(
        "select interest_id, weight from user_interests where user_id = %s and not hidden", (user_id,)).fetchall()}
    extractions, doc_ids, github_meta, resume = {}, {}, None, None
    for d in docs:
        meta = d["meta"] or {}
        doc_ids[d["source"]] = d["id"]
        if "extraction" in meta:
            extractions[d["source"]] = meta["extraction"].get("interests", [])
        if d["source"] == "github":
            github_meta = meta
        if d["source"] == "resume" and meta.get("structure"):
            try:
                resume = ResumeStructure.model_validate(meta["structure"])
            except Exception:
                resume = None
    return extractions, doc_ids, weights, github_meta, resume


def build(user_id: str, trigger_source: str, canon=None) -> dict | None:
    """Build and store a new active version if the inputs changed. Returns the active profile (or None
    if the user has nothing to build from yet). `canon(name) -> interest_id` resolves new skills."""
    if trigger_source not in TRIGGERS:
        raise ValueError(f"unknown trigger {trigger_source}")
    with db.conn() as c:
        # One builder per user at a time; a second run waits, then sees the same hash and exits.
        c.execute("select pg_advisory_xact_lock(hashtext(%s))", (f"skill_profile:{user_id}",))
        extractions, doc_ids, weights, github_meta, resume = _load_inputs(c, user_id)
        if not doc_ids:
            return None
        h = input_hash(doc_ids, weights)
        active = c.execute(
            "select version, input_hash, profile from user_skill_profiles where user_id = %s and is_active",
            (user_id,)).fetchone()
        if active and active["input_hash"] == h:
            return active["profile"]
        version = (active["version"] + 1) if active else 1
        profile = compose_profile(user_id, extractions=extractions, active_weights=weights,
                                  github_meta=github_meta, resume=resume, version=version)
        with_ids = profile.pop("_skills_with_ids")
        for s in with_ids:
            if s["interest_id"] is None and canon is not None:
                try:
                    s["interest_id"] = canon(c, s["name"])
                except Exception as e:  # a skill without an id still shows; it just can't match
                    log.warning("canonicalize %r failed: %s", s["name"], e)
        c.execute("update user_skill_profiles set is_active = false where user_id = %s and is_active", (user_id,))
        c.execute(
            "insert into user_skill_profiles (user_id, version, is_active, trigger_source, input_hash, profile, skills) "
            "values (%s, %s, true, %s, %s, %s, %s)",
            (user_id, version, trigger_source, h, Jsonb(profile), Jsonb(with_ids)))
        if profile["skills"]:
            c.execute("update profiles set onboarding_status = 'complete' where id = %s", (user_id,))
    log.info("skill profile v%d for %s (%s): %d skills", version, user_id, trigger_source, len(profile["skills"]))
    return profile


def active_profile(user_id: str) -> dict | None:
    row = db.fetchone("select profile from user_skill_profiles where user_id = %s and is_active", (user_id,))
    return row["profile"] if row else None


def mark_partial(user_id: str) -> None:
    """A source failed to parse: never 'complete', never block the user."""
    try:
        db.execute("update profiles set onboarding_status = 'partial' where id = %s and onboarding_status = 'pending'",
                   (user_id,))
    except Exception:
        log.exception("could not mark onboarding partial for %s", user_id)


# ---------------------------------------------------------------- enqueue (dedup on user_id + trigger)
_lock = threading.Lock()
_inflight: set[tuple[str, str]] = set()
_rerun: set[tuple[str, str]] = set()


def _canon(c, name: str) -> int:
    from .profile_store import canonicalize
    return canonicalize(c, name, "technical")


def build_safely(user_id: str, trigger_source: str) -> None:
    """Run the builder now, de-duplicated on (user_id, trigger_source). If the same key is requested
    while it runs, it runs once more afterwards (so the newest inputs always get built). Never raises."""
    key = (user_id, trigger_source)
    with _lock:
        if key in _inflight:
            _rerun.add(key)
            return
        _inflight.add(key)
    try:
        while True:
            try:
                build(user_id, trigger_source, canon=_canon)
            except Exception:
                log.exception("skill profile build failed for %s (%s)", user_id, trigger_source)
                mark_partial(user_id)
            with _lock:
                if key in _rerun:
                    _rerun.discard(key)
                    continue
                _inflight.discard(key)
                return
    finally:
        with _lock:
            _inflight.discard(key)
            _rerun.discard(key)
