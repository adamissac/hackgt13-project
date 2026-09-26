"""AR3: seed ~80 synthetic HackGT 13 attendees modeled on HackGT 12 (MLH) winning projects.

Same pipeline as real users (Alan's `seed_person` pattern): auth user -> profiles row (is_synthetic=true)
-> raw_documents + app.profile_store.store_extraction (canonicalize with embeddings, weights) -> checked in
to HackGT 13 (attendance + event_registrations), ~half Open to Meet. The ML workers then compute vectors,
IDF and clusters like for anyone else. Fictional names, initials avatars, @example.com emails.

    cd ml
    .venv/bin/python scripts/seed_hackathon_attendees.py --dry-run         # no DB: print who would be created
    DATABASE_URL=... .venv/bin/python scripts/seed_hackathon_attendees.py   # write (idempotent, re-run safe)
    DATABASE_URL=... .venv/bin/python scripts/seed_hackathon_attendees.py --delete

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
    key = os.environ["SUPABASE_SERVICE_KEY"]
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
    if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"):
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
        sys.exit("set DATABASE_URL (Supabase session pooler) first")
    from app import db
    db.open_pool(os.environ["DATABASE_URL"])
    try:
        delete_all(db) if a.delete else seed(db, n=a.n, seed_=a.seed)
    finally:
        db.close_pool()


if __name__ == "__main__":
    main()
