"""Background jobs (registered with workers.every; started by the lifespan in main.py).

- clusters: HDBSCAN communities per active event, every 5 minutes (MASTER_SPEC 6.13)
- global_vectors: global IDF into interests.idf and every profile's vectors into profile_vectors, every 5 minutes
- retention: MASTER_SPEC 7.7 cleanup, hourly
"""
import logging

from ml.config import FACETS

from . import db, matching, population
from .workers import every

log = logging.getLogger("tasks")


@every(300, "clusters")
def refresh_clusters() -> None:
    for event_id in population.active_event_ids():
        labels = population.recompute_clusters(event_id)
        log.info("event %s clusters: %d people, %d clusters", event_id, len(labels),
                 len({v for v in labels.values() if v >= 0}))


def write_global_vectors() -> int:
    """Global IDF (over everyone with interests) and profile vectors for pgvector retrieval."""
    ids = [r["id"] for r in db.fetchall("select distinct user_id::text as id from user_interests")]
    people, index = population.build(ids)
    with db.conn() as c:
        with c.cursor() as cur:
            cur.executemany("update interests set idf = %s where id = %s",
                            [(float(v), i) for i, v in index.idf.items()])
            rows = []
            for p in people:
                vecs = {**p["vec"], "combined": p["combined"], "seeking": p["seek_vec"], "offering": p["offer_vec"]}
                for facet in FACETS + ["combined", "seeking", "offering"]:
                    v = vecs[facet]
                    if v.any():
                        rows.append((p["id"], facet, v))
            cur.executemany(
                "insert into profile_vectors (user_id, facet, vector, updated_at) values (%s, %s, %s, now()) "
                "on conflict (user_id, facet) do update set vector = excluded.vector, updated_at = now()", rows)
    return len(people)


@every(300, "global_vectors")
def refresh_global_vectors() -> None:
    n = write_global_vectors()
    log.info("profile vectors written for %d people", n)


def run_retention() -> dict:
    """Sightings > 24h, ended/expired location shares, presence past its expiry (45 minutes)."""
    out = {}
    with db.conn() as c:
        out["sightings"] = c.execute("delete from sightings where ts < now() - interval '24 hours'").rowcount
        out["presence"] = c.execute("delete from presence where expires_at < now()").rowcount
        if matching.table_exists("location_shares"):
            out["location_shares"] = c.execute("delete from location_shares where expires_at < now()").rowcount
    return out


@every(3600, "retention")
def retention() -> None:
    log.info("retention deleted %s", run_retention())


@every(30, "suggestions")
def suggestions_tick() -> None:
    from . import suggestions
    suggestions.expire()
    suggestions.generate()


@every(30, "encounters")
def encounters_tick() -> None:
    from . import encounters
    encounters.process()


@every(5, "push")
def push_tick() -> None:
    from . import push
    push.tick()


@every(300, "skill_profile_backfill")
def skill_profile_backfill() -> None:
    """Anyone with extracted sources but no active skill profile (e.g. imported while an older build was
    deployed) gets one. Cheap when there's nothing to do; the builder itself is idempotent."""
    from . import skill_profile
    rows = db.fetchall(
        "select distinct d.user_id::text as id from raw_documents d "
        "where d.meta ? 'extraction' and d.source = any(%s) and not exists "
        "(select 1 from user_skill_profiles p where p.user_id = d.user_id and p.is_active) limit 50",
        (list(skill_profile.PROFILE_SOURCES),))
    for r in rows:
        skill_profile.build_safely(r["id"], "rebuild")
    if rows:
        log.info("skill profiles backfilled for %d people", len(rows))


@every(5, "synthetic")
def synthetic_tick() -> None:
    """Seeded demo attendees answer suggestions, chat, and connect (app/synthetic.py)."""
    from . import synthetic
    out = synthetic.tick()
    if any(out.values()):
        log.info("synthetic attendees: %s", out)
