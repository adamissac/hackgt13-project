"""AR3: seed ~80 synthetic HackGT 13 attendees modeled on HackGT 12 (MLH) winning projects.

Same pipeline as real users (Alan's `seed_person` pattern): auth user -> profiles row (is_synthetic=true)
-> raw_documents + app.profile_store.store_extraction (canonicalize with embeddings, weights) -> checked in
to HackGT 13 (attendance + event_registrations), ~half Open to Meet. The ML workers then compute vectors,
IDF and clusters like for anyone else. Fictional names, initials avatars, @example.com emails.

    cd ml
    .venv/bin/python scripts/seed_hackathon_attendees.py --dry-run         # no DB: print who would be created
    DATABASE_URL=... .venv/bin/python scripts/seed_hackathon_attendees.py   # write (idempotent, re-run safe)
    DATABASE_URL=... .venv/bin/python scripts/seed_hackathon_attendees.py --delete

No DATABASE_URL? With SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY) it seeds through Supabase's
REST + admin APIs instead (same resulting rows).
Users: with SUPABASE_URL + SUPABASE_SERVICE_KEY set, auth users are created through the Supabase admin API
(the supported way). Without them (local test DB), they're inserted into auth.users directly.
"""
import argparse
import json
import os
import sys
import urllib.request
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ml.hackathon_population import make_population  # noqa: E402

EVENT_NAME = "HackGT 13"
EMAIL = "{key}@example.com"


def _admin_create(email, name):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SECRET_KEY"]
    req = urllib.request.Request(
        f"{base}/auth/v1/admin/users", method="POST",
        data=json.dumps({"email": email, "email_confirm": True, "user_metadata": {"name": name, "synthetic": True}}).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())["id"]


def ensure_user(db, email, name):
    row = db.fetchone("select id::text as id from auth.users where email = %s", (email,))
    if row:
        return row["id"]
    if os.getenv("SUPABASE_URL") and (os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SECRET_KEY")):
        return _admin_create(email, name)
    uid = str(uuid.uuid4())
    db.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email))
    return uid


def headline(p):
    tech = [i["name"] for i in p["raw_interests"] if i["facet"] == "technical"][:2]
    career = next((i["name"] for i in p["raw_interests"] if i["facet"] == "career"), "")
    if p["role"] == "recruiter":
        return f"Recruiting for {career}" if career else "Recruiter"
    return f"{' + '.join(tech)} builder" + (f" · into {career}" if career else "")


def seed(db, n=80, seed_=13, log=print):
    from app import population, profile_store
    from ml.extraction import ExtractedInterest, ExtractResult

    ev = db.fetchone("select id from events where name = %s", (EVENT_NAME,))
    if not ev:
        ev = db.fetchone("insert into events (name, venue) values (%s, 'Georgia Tech') returning id", (EVENT_NAME,))
    event_id = ev["id"]
    people = make_population(n=n, seed=seed_)
    ids = []
    for i, p in enumerate(people):
        uid = ensure_user(db, EMAIL.format(key=p["key"]), p["name"])
        db.execute(
            "insert into profiles (id, name, role, headline, seeking, offering, open_to_meet, is_synthetic, photo_url) "
            "values (%s, %s, %s, %s, %s, %s, %s, true, null) on conflict (id) do update set name = excluded.name, "
            "role = excluded.role, headline = excluded.headline, seeking = excluded.seeking, offering = excluded.offering, "
            "open_to_meet = excluded.open_to_meet, is_synthetic = true, photo_url = null",
            (uid, p["name"], p["role"], headline(p), p["seeking"], p["offering"], p["open_to_meet"]))
        # replace this person's seeded document so re-runs don't stack duplicates
        db.execute("delete from raw_documents where user_id = %s and meta->>'synthetic' = 'true'", (uid,))
        result = ExtractResult(
            interests=[ExtractedInterest(name=r["name"], facet=r["facet"], strength=r["strength"], evidence=r["evidence"])
                       for r in p["raw_interests"]],
            seeking=p["seeking"], offering=p["offering"], summary=p["summary"])
        with db.conn() as c:
            doc_id = profile_store.save_document(c, uid, "manual", "seeded from HackGT 12 winners",
                                                 {"synthetic": True, "team": p["team"]})
        profile_store.store_extraction(uid, doc_id, "manual", result)
        db.execute("insert into attendance (event_id, user_id) values (%s, %s) on conflict do nothing", (event_id, uid))
        db.execute("insert into event_registrations (event_id, user_id) values (%s, %s) on conflict do nothing",
                   (event_id, uid))
        ids.append(uid)
        if (i + 1) % 10 == 0:
            log(f"  {i + 1}/{len(people)}")
    population.invalidate()
    log(f"done: {len(ids)} synthetic attendees checked in to {EVENT_NAME} (event {event_id}), "
        f"{sum(p['open_to_meet'] for p in people)} open to meet")
    return ids, event_id


# ---------------------------------------------------------------- API mode (no DB password needed)
def _rest_env():
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SECRET_KEY"]
    return base, key


def _rest(method, path, body=None, prefer=None):
    base, key = _rest_env()
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(f"{base}{path}", method=method, headers=h,
                                 data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def _synthetic_users():
    out, page = {}, 1
    while True:
        d = _rest("GET", f"/auth/v1/admin/users?page={page}&per_page=1000") or {}
        for u in d.get("users", []):
            if (u.get("email") or "").startswith("synth-") and u["email"].endswith("@example.com"):
                out[u["email"]] = u["id"]
        if len(d.get("users", [])) < 1000:
            return out
        page += 1


def seed_rest(n=80, seed_=13, log=print):
    """Same result as seed(), through Supabase's REST + admin APIs with the secret key.

    Mirrors app.profile_store: canonical interests (exact name, bge embedding for new ones), a raw_documents
    row whose meta.extraction carries interest ids (so Alan's rebuild_user_interests reproduces the weights),
    and user_interests weights = 1 - exp(-sum interest_weight) like rebuild_user_interests.
    """
    import math
    import urllib.parse

    from ml.embed import embed
    from ml.profiles import interest_weight

    ev = _rest("GET", "/rest/v1/events?select=id&name=eq." + urllib.parse.quote(EVENT_NAME))
    if not ev:
        sys.exit(f"event {EVENT_NAME!r} not found")
    event_id = ev[0]["id"]
    people = make_population(n=n, seed=seed_)

    # canonical interests: reuse existing rows, create missing ones with embeddings
    names = sorted({" ".join(r["name"].lower().split()) for p in people for r in p["raw_interests"]})
    facet_of = {" ".join(r["name"].lower().split()): r["facet"] for p in people for r in p["raw_interests"]}
    existing = {}
    for k in range(0, len(names), 80):
        chunk = names[k:k + 80]
        q = ",".join('"' + x.replace('"', '') + '"' for x in chunk)
        for r in _rest("GET", "/rest/v1/interests?select=id,canonical_name&canonical_name=in.(" + urllib.parse.quote(q) + ")") or []:
            existing[r["canonical_name"]] = r["id"]
    missing = [x for x in names if x not in existing]
    if missing:
        vecs = embed(missing)
        rows = [{"canonical_name": x, "facet": facet_of[x], "embedding": "[" + ",".join(f"{v:.6f}" for v in vec) + "]"}
                for x, vec in zip(missing, vecs)]
        for k in range(0, len(rows), 50):
            for r in _rest("POST", "/rest/v1/interests?on_conflict=canonical_name", rows[k:k + 50],
                           "resolution=merge-duplicates,return=representation") or []:
                existing[r["canonical_name"]] = r["id"]
    log(f"  interests: {len(names)} ({len(missing)} new)")

    users = _synthetic_users()
    ids = []
    for i, p in enumerate(people):
        email = EMAIL.format(key=p["key"])
        uid = users.get(email) or _admin_create(email, p["name"])
        _rest("POST", "/rest/v1/profiles?on_conflict=id", [{
            "id": uid, "name": p["name"], "role": p["role"], "headline": headline(p), "seeking": p["seeking"],
            "offering": p["offering"], "open_to_meet": p["open_to_meet"], "is_synthetic": True, "photo_url": None}],
            "resolution=merge-duplicates")
        items = []
        contrib = {}
        for r in p["raw_interests"]:
            iid = existing[" ".join(r["name"].lower().split())]
            items.append({**r, "interest_id": iid})
            w = interest_weight({"source": "manual", "strength": r["strength"], "confirmed": False})
            contrib.setdefault(iid, []).append((w, r["evidence"]))
        _rest("DELETE", f"/rest/v1/raw_documents?user_id=eq.{uid}&meta->>synthetic=eq.true")
        _rest("POST", "/rest/v1/raw_documents", [{
            "user_id": uid, "source": "manual", "text": "seeded from HackGT 12 winners",
            "meta": {"synthetic": True, "team": p["team"], "extraction": {
                "interests": items, "seeking": p["seeking"], "offering": p["offering"], "summary": p["summary"]}}}])
        _rest("DELETE", f"/rest/v1/user_interests?user_id=eq.{uid}")
        _rest("POST", "/rest/v1/user_interests", [{
            "user_id": uid, "interest_id": iid, "weight": round(1 - math.exp(-sum(w for w, _ in parts)), 4),
            "source": "manual", "evidence": max(parts)[1]} for iid, parts in contrib.items()])
        for table in ("attendance", "event_registrations"):
            _rest("POST", f"/rest/v1/{table}?on_conflict=event_id,user_id", [{"event_id": event_id, "user_id": uid}],
                  "resolution=ignore-duplicates")
        ids.append(uid)
        if (i + 1) % 10 == 0:
            log(f"  {i + 1}/{len(people)}")
    log(f"done: {len(ids)} synthetic attendees checked in to {EVENT_NAME} (event {event_id}), "
        f"{sum(p['open_to_meet'] for p in people)} open to meet")
    return ids, event_id


def delete_rest(log=print):
    users = _synthetic_users()
    for uid in users.values():
        _rest("DELETE", f"/auth/v1/admin/users/{uid}")  # profiles and everything below cascade
    log(f"deleted {len(users)} synthetic attendees")


def delete_all(db, log=print):
    rows = db.fetchall("select id::text as id from auth.users where email like 'synth-%%@example.com'")
    for r in rows:
        db.execute("delete from auth.users where id = %s", (r["id"],))  # profiles and everything below cascade
    log(f"deleted {len(rows)} synthetic attendees")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=80)
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delete", action="store_true")
    a = ap.parse_args()
    if a.dry_run:
        from collections import Counter
        people = make_population(n=a.n, seed=a.seed)
        print(f"{len(people)} people: {dict(Counter(p['role'] for p in people))}, "
              f"{sum(p['open_to_meet'] for p in people)} open to meet")
        for p in people[:8]:
            print(f"  {p['name']:<10} {p['role']:<9} {headline(p)}")
        return
    if not os.getenv("DATABASE_URL"):
        if os.getenv("SUPABASE_URL") and (os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SECRET_KEY")):
            return delete_rest() if a.delete else seed_rest(n=a.n, seed_=a.seed)
        sys.exit("set DATABASE_URL, or SUPABASE_URL + SUPABASE_SECRET_KEY")
    from app import db
    db.open_pool(os.environ["DATABASE_URL"])
    try:
        delete_all(db) if a.delete else seed(db, n=a.n, seed_=a.seed)
    finally:
        db.close_pool()


if __name__ == "__main__":
    main()
