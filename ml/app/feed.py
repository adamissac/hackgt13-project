"""Connections feed (MASTER_SPEC 3.8, 6.11).

Visibility: my own items plus items by my connections, and only kinds the author allows in feed_prefs
(github / post / update, default on). Nobody else's items, ever.

score = 0.6 * cos(embed(item), my combined vector) + 0.3 * exp(-hours / 48) + 0.1 * (item mentions a topic I
        checked as discussed with that author)
Bursts: an author with >= 3 items in 24 h is shown as one summary line (Haiku) instead of the separate items.
"""
import hashlib
import logging
import math
import threading
from datetime import datetime, timezone

import numpy as np

from ml.embed import embed

from . import db, population

log = logging.getLogger("feed")

WINDOW_DAYS = 14
PAGE = 20
BURST_N = 3
_summary_cache: dict[str, str] = {}
_lock = threading.Lock()


def details_of(r: dict) -> dict | None:
    """The public shape of a GitHub item's brief (github_activity.refresh_briefs), or None."""
    d = (r.get("payload") or {}).get("details") if r.get("kind") == "github" else None
    if not isinstance(d, dict) or not d.get("summary"):
        return None
    return {"summary": d["summary"], "highlights": [h for h in d.get("highlights") or [] if h][:4],
            "ask": d.get("ask") or None, "stack": [x for x in d.get("stack") or [] if x][:6],
            "ai": d.get("source") == "ai"}


def item_text(r: dict) -> str:
    d = details_of(r) or {}
    parts = (r.get("title"), r.get("body"), d.get("summary"), *d.get("highlights", []))
    return " ".join(x for x in parts if x).strip()


def visible_items(viewer: str, days: int = WINDOW_DAYS, include_own: bool = True) -> list[dict]:
    return db.fetchall(
        "with mine as (select case when user_a = %(v)s then user_b else user_a end as id from connections "
        "              where user_a = %(v)s or user_b = %(v)s) "
        "select fi.id, fi.author_id::text as author_id, fi.kind, fi.title, fi.body, fi.url, fi.payload, "
        "fi.embedding, fi.created_at, p.name, p.photo_url "
        "from feed_items fi join profiles p on p.id = fi.author_id "
        "left join feed_prefs fp on fp.user_id = fi.author_id "
        "where fi.created_at > now() - make_interval(days => %(d)s) and ("
        "  (%(own)s and fi.author_id = %(v)s) or "
        "  (fi.author_id in (select id from mine) and case fi.kind "
        "     when 'github' then coalesce(fp.show_github, true) when 'post' then coalesce(fp.show_posts, true) "
        "     when 'update' then coalesce(fp.show_updates, true) else false end)) "
        "order by fi.created_at desc limit 500", {"v": viewer, "d": days, "own": include_own})


def ensure_embeddings(rows: list[dict]) -> None:
    missing = [r for r in rows if r["embedding"] is None and item_text(r)]
    if not missing:
        return
    vecs = embed([item_text(r) for r in missing])
    with db.conn() as c:
        for r, v in zip(missing, vecs):
            c.execute("update feed_items set embedding = %s where id = %s", (v, r["id"]))
            r["embedding"] = v


def viewer_vector(viewer: str) -> np.ndarray:
    row = db.fetchone("select vector from profile_vectors where user_id = %s and facet = 'combined'", (viewer,))
    if row and row["vector"] is not None:
        v = row["vector"]
        return np.asarray(v.to_numpy() if hasattr(v, "to_numpy") else v, dtype=np.float32)
    people, _ = population.build([viewer])
    return people[0]["combined"] if people else np.zeros(384, np.float32)


def talked_topics(viewer: str) -> dict[str, list[str]]:
    """author id -> topics the VIEWER checked (or typed) as discussed with them."""
    rows = db.fetchall(
        "select case when c.user_a = %(v)s then c.user_b else c.user_a end::text as other, "
        "coalesce((select array_agg(i.canonical_name) from interests i where i.id = any(f.talked_about)), '{}') as names, "
        "f.other_topic from conversations c join feedback f on f.conversation_id = c.id and f.rater_id = %(v)s "
        "where c.user_a = %(v)s or c.user_b = %(v)s", {"v": viewer})
    out: dict[str, list[str]] = {}
    for r in rows:
        topics = list(r["names"] or []) + ([r["other_topic"].strip().lower()] if (r["other_topic"] or "").strip() else [])
        out.setdefault(r["other"], []).extend(topics)
    return out


def _vec(v) -> np.ndarray:
    return np.asarray(v.to_numpy() if hasattr(v, "to_numpy") else v, dtype=np.float32)


def score_items(viewer: str, rows: list[dict], now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    me = viewer_vector(viewer)
    talked = talked_topics(viewer)
    out = []
    for r in rows:
        emb = _vec(r["embedding"]) if r["embedding"] is not None else np.zeros(384, np.float32)
        rel = float(emb @ me) if emb.any() and me.any() else 0.0
        hours = max(0.0, (now - r["created_at"]).total_seconds() / 3600)
        text = item_text(r).lower()
        mentions = [t for t in talked.get(r["author_id"], []) if t and t in text]
        s = 0.6 * rel + 0.3 * math.exp(-hours / 48) + 0.1 * (1.0 if mentions else 0.0)
        out.append({**r, "score": s, "mentions": mentions})
    return sorted(out, key=lambda r: -r["score"])


def _first(name: str | None) -> str:
    return (name or "").split(" ")[0] or "Someone"


def _summary(author_first: str, items: list[dict]) -> str:
    from ml import generation
    key = hashlib.sha1((author_first + "|" + ",".join(str(i["id"]) for i in items)).encode()).hexdigest()
    with _lock:
        if key in _summary_cache:
            return _summary_cache[key]
    try:
        text = generation.feed_summary(author_first, [{**i, "body": (details_of(i) or {}).get("summary") or i["body"]}
                                                      for i in items])
    except Exception as e:
        log.warning("feed summary fell back to template: %s", e)
        return generation.template_summary(author_first, items)
    with _lock:
        _summary_cache[key] = text
    return text


def author_card(r: dict) -> dict:
    return {"user_id": r["author_id"], "name": r["name"], "photo_url": r["photo_url"]}


def shape_item(r: dict) -> dict:
    return {"type": "item", "item_id": r["id"], "author": author_card(r), "kind": r["kind"], "title": r["title"],
            "body": r["body"], "url": r["url"], "created_at": r["created_at"].isoformat(),
            "score": round(r["score"], 4), "talked_about": r["mentions"], "details": details_of(r)}


def build_feed(viewer: str, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    rows = visible_items(viewer)
    ensure_embeddings(rows)
    scored = score_items(viewer, rows, now)
    recent: dict[str, list[dict]] = {}
    for r in scored:
        if r["author_id"] != viewer and (now - r["created_at"]).total_seconds() < 24 * 3600:
            recent.setdefault(r["author_id"], []).append(r)
    bursts = {a: items for a, items in recent.items() if len(items) >= BURST_N}
    burst_ids = {i["id"] for items in bursts.values() for i in items}
    out, done = [], set()
    for r in scored:
        a = r["author_id"]
        if r["id"] in burst_ids:
            if a in done:
                continue
            done.add(a)
            items = sorted(bursts[a], key=lambda x: x["created_at"])
            out.append({"type": "summary", "author": author_card(r), "summary": _summary(_first(r["name"]), items),
                        "item_ids": [i["id"] for i in items], "created_at": items[-1]["created_at"].isoformat(),
                        "score": round(r["score"], 4), "items": [shape_item(i) for i in reversed(items)]})
        else:
            out.append(shape_item(r))
    return out


def insights(viewer: str, days: int = 7) -> dict:
    """Trending topics and activity across MY network (connections only; aggregate)."""
    rows = visible_items(viewer, days=days, include_own=False)
    authors = sorted({r["author_id"] for r in rows})
    held = db.fetchall(
        "select ui.user_id::text as u, i.canonical_name as name from user_interests ui join interests i "
        "on i.id = ui.interest_id where ui.user_id = any(%s::uuid[]) and not ui.hidden", (authors,)) if authors else []
    by_author: dict[str, set] = {}
    for h in held:
        by_author.setdefault(h["u"], set()).add(h["name"])
    topics: dict[str, int] = {}
    for r in rows:
        text = item_text(r).lower() + " " + " ".join((r["payload"] or {}).get("topics", []) or [])
        for name in by_author.get(r["author_id"], ()):
            if name in text:
                topics[name] = topics.get(name, 0) + 1
    today = datetime.now(timezone.utc).date()
    per_day = {(today.toordinal() - d): 0 for d in range(days)}
    kinds = {"github": 0, "post": 0, "update": 0}
    for r in rows:
        k = r["created_at"].date().toordinal()
        if k in per_day:
            per_day[k] += 1
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    return {"days": days,
            "trending_topics": [{"name": n, "count": c} for n, c in sorted(topics.items(), key=lambda t: (-t[1], t[0]))[:10]],
            "activity": [{"date": datetime.fromordinal(o).date().isoformat(), "count": per_day[o]}
                         for o in sorted(per_day)],
            "by_kind": kinds}
