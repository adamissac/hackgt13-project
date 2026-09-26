"""AR3: seed synthetic attendees for HackGT 13 so matching and the graphs have people.

Same pipeline as real users: raw extracted interests -> canonicalize + weights (profiles.py) ->
IDF -> facet/combined/seeking/offering vectors (bge-small). Each attendee is a real Supabase auth user
(admin API, @example.com email) so profiles.id -> auth.users holds, with is_synthetic = true, registered
and checked in to HackGT 13, a subset Open to Meet. Initials avatars only (photo_url null), no real people.

    cd ml
    .venv/bin/python scripts/seed_synthetic.py --dry-run          # offline: build + summary + JSON, no writes
    .venv/bin/python scripts/seed_synthetic.py --n 80             # write (needs SUPABASE_URL + SUPABASE_SERVICE_KEY)
    .venv/bin/python scripts/seed_synthetic.py --delete           # remove every synthetic attendee

Idempotent: re-running updates the same users (emails synth-000@example.com ...).
"""
import argparse
import json
import os
import sys
import urllib.parse
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np  # noqa: E402

from ml import supa  # noqa: E402
from ml.config import FACETS  # noqa: E402
from ml.synth import PERSONAL, make_population  # noqa: E402

EVENT_NAME = "HackGT 13"
EMAIL = "synth-{:03d}@example.com"
OPEN_TO_MEET_FRAC = 0.35
OUT_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic_attendees.json")

# Demo boosters (MASTER_SPEC 12.1): people who share RARE topics with the team's own profiles, so the
# demo has strong matches and a visible "reinforcement learning" cluster. Edit topics to fit the team.
BOOSTERS = [
    ("Maya", "R.", "student", ["reinforcement learning", "reward shaping", "pytorch", "multi-agent systems"],
     ["quantitative research", "ai research"], ["rock climbing", "film photography"], "mathematics"),
    ("Kai", "M.", "student", ["reinforcement learning", "robot learning", "ros", "control systems"],
     ["autonomous vehicles"], ["rock climbing", "chess"], "mechanical engineering"),
    ("Priya", "S.", "student", ["reinforcement learning", "time series analysis", "backtesting", "stochastic calculus"],
     ["quantitative research", "trading"], ["chess", "piano"], "mathematics"),
    ("Leo", "T.", "recruiter", ["reinforcement learning", "machine learning", "python"],
     ["ai research", "ml engineering"], ["hiking"], "computer science"),
    ("Zara", "K.", "student", ["reinforcement learning", "offline rl", "transformers", "jax"],
     ["ai research", "phd programs"], ["film photography", "running"], "computer science"),
    ("Diego", "A.", "student", ["multi-agent systems", "game theory", "reinforcement learning", "c++"],
     ["quantitative research"], ["poker", "chess"], "economics"),
]


def booster_people(start_id):
    out = []
    for k, (first, last, role, tech, career, personal, academic) in enumerate(BOOSTERS):
        raw = []

        def add(names, facet, source, strength):
            for nm in names:
                raw.append({"name": nm, "facet": facet, "source": source, "strength": strength,
                            "months_ago": 1.0, "depth": 1.2, "evidence": f"{source}: {nm}"})
        add(tech, "technical", "github", 0.9)
        add(career, "career", "resume", 0.85)
        add([academic], "academic", "resume", 0.8)
        add(personal, "personal", "manual", 0.7)
        seeking = (f"students with {tech[0]} experience for {career[0]} roles" if role == "recruiter"
                   else f"collaborators on {tech[0]}; internship in {career[0]}")
        offering = (f"hiring for {career[0]} internships" if role == "recruiter"
                    else f"projects in {', '.join(tech[:3])}")
        out.append({"id": f"u{start_id + k:03d}", "name": f"{first} {last}", "role": role, "archetype": "booster",
                    "secondary": None, "raw_interests": raw, "seeking": seeking, "offering": offering,
                    "summary": {"technical": f"Works on {', '.join(tech[:3])}.", "career": f"Interested in {career[0]}.",
                                "personal": "", "academic": ""}})
    return out


def headline(p):
    tech = [r["name"] for r in p["raw_interests"] if r["facet"] == "technical"][:2]
    career = next((r["name"] for r in p["raw_interests"] if r["facet"] == "career"), "")
    if p["role"] == "recruiter":
        return f"Recruiting for {career}" if career else "Recruiter"
    return f"{' + '.join(tech)} | into {career}" if tech else "Georgia Tech student"


def vec_literal(v):
    return "[" + ",".join(f"{x:.6f}" for x in np.asarray(v, dtype=float)) + "]"


def build(n, seed):
    from ml.profiles import build_population
    people = make_population(n=n - len(BOOSTERS), seed=seed)
    people += booster_people(len(people))
    rng = np.random.default_rng(seed)
    for p in people:
        p["open_to_meet"] = bool(rng.random() < OPEN_TO_MEET_FRAC or p["archetype"] == "booster")
    index = build_population(people)
    from ml import embed as embed_mod
    backend = "hashed-fallback (NOT demo quality)" if embed_mod._fallback else "bge-small"
    return people, index, backend


def summarize(people, index, backend):
    c = Counter(p["archetype"] for p in people)
    roles = Counter(p["role"] for p in people)
    rl = [p["name"] for p in people if any(index.names[cid] == "reinforcement learning" for cid in p["interests"])]
    print(f"{len(people)} synthetic attendees | embeddings: {backend}")
    print(f"  roles: {dict(roles)} | open to meet: {sum(p['open_to_meet'] for p in people)}")
    print(f"  archetypes: {dict(c)}")
    print(f"  canonical interests: {len(index.names)} | 'reinforcement learning' holders: {len(rl)}")


def dump_json(people, index):
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    rows = [{"key": p["id"], "name": p["name"], "role": p["role"], "archetype": p["archetype"],
             "open_to_meet": p["open_to_meet"], "seeking": p["seeking"], "offering": p["offering"],
             "interests": sorted(({"name": index.names[cid], "facet": it["facet"], "weight": round(it["weight"], 3)}
                                  for cid, it in p["interests"].items()), key=lambda r: -r["weight"])}
            for p in people]
    with open(OUT_JSON, "w") as f:
        json.dump({"synthetic": True, "people": rows}, f, indent=1)
    print(f"  wrote {os.path.relpath(OUT_JSON)}")


# ---------------------------------------------------------------- Supabase writes
def _admin(method, path, body=None):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return supa._request(method, f"{base}/auth/v1/admin/{path}",
                         {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}, body)


def synthetic_users():
    users, page = {}, 1
    while True:
        out = _admin("GET", f"users?{urllib.parse.urlencode({'page': page, 'per_page': 1000})}") or {}
        batch = out.get("users", [])
        for u in batch:
            if (u.get("email") or "").startswith("synth-") and u["email"].endswith("@example.com"):
                users[u["email"]] = u["id"]
        if len(batch) < 1000:
            return users
        page += 1


def ensure_user(email, name, existing):
    if email in existing:
        return existing[email]
    u = _admin("POST", "users", {"email": email, "email_confirm": True,
                                 "user_metadata": {"name": name, "synthetic": True}})
    return u["id"]


def write(people, index):
    ev = supa.select("events", {"select": "id", "name": f"eq.{EVENT_NAME}"})
    if not ev:
        sys.exit(f"event '{EVENT_NAME}' not found (Adam's seed migration)")
    event_id = ev[0]["id"]
    existing = synthetic_users()

    # canonical interests with embeddings (shared with real users by canonical_name)
    rows = [{"canonical_name": index.names[i], "facet": index.facets[i], "embedding": vec_literal(index.vecs[i])}
            for i in range(len(index.names))]
    ids = {}
    for k in range(0, len(rows), 200):
        for r in supa.upsert("interests", rows[k:k + 200], on_conflict="canonical_name"):
            ids[r["canonical_name"]] = r["id"]

    for n, p in enumerate(people):
        uid = ensure_user(EMAIL.format(n), p["name"], existing)
        p["user_id"] = uid
        supa.upsert("profiles", [{"id": uid, "name": p["name"], "photo_url": None, "role": p["role"],
                                  "headline": headline(p), "seeking": p["seeking"], "offering": p["offering"],
                                  "open_to_meet": p["open_to_meet"], "is_synthetic": True}], on_conflict="id")
        supa.upsert("user_interests", [
            {"user_id": uid, "interest_id": ids[index.names[cid]], "weight": round(it["weight"], 4),
             "source": "synthetic", "evidence": it["evidence"]} for cid, it in p["interests"].items()],
            on_conflict="user_id,interest_id")
        vecs = [{"user_id": uid, "facet": f, "vector": vec_literal(p["vec"][f])} for f in FACETS if p["vec"][f].any()]
        vecs += [{"user_id": uid, "facet": f, "vector": vec_literal(p[k])}
                 for f, k in (("combined", "combined"), ("seeking", "seek_vec"), ("offering", "offer_vec")) if p[k].any()]
        supa.upsert("profile_vectors", vecs, on_conflict="user_id,facet")
        supa.upsert("event_registrations", [{"event_id": event_id, "user_id": uid}], on_conflict="event_id,user_id")
        supa.upsert("attendance", [{"event_id": event_id, "user_id": uid}], on_conflict="event_id,user_id")
        if n % 10 == 9:
            print(f"  {n + 1}/{len(people)}")
    print(f"done: {len(people)} synthetic attendees registered + checked in to {EVENT_NAME} (event {event_id})")


def delete_all():
    users = synthetic_users()
    for email, uid in users.items():
        _admin("DELETE", f"users/{uid}")   # profiles and everything below cascade
    print(f"deleted {len(users)} synthetic users")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=80)
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delete", action="store_true")
    a = ap.parse_args()
    if a.delete:
        return delete_all()
    people, index, backend = build(a.n, a.seed)
    summarize(people, index, backend)
    dump_json(people, index)
    if a.dry_run:
        return
    if "fallback" in backend and os.getenv("ALLOW_FALLBACK_EMBEDDINGS") != "1":
        sys.exit("refusing to write hashed-fallback vectors; install sentence-transformers (or set ALLOW_FALLBACK_EMBEDDINGS=1)")
    write(people, index)


if __name__ == "__main__":
    main()
