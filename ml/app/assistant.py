"""AL11: the in-app assistant (MASTER_SPEC 3.10, 6.12).

Claude Sonnet with four tools. The caller's user id is bound here in Python; no tool takes a viewer id,
and every tool applies the same scope rules as the REST endpoints:
- search_event_attendees(event_id, topic): Open to Meet attendees of an event the caller is checked in to,
  minus blocks/declines/connections, returning first name, role and shared topics only.
- get_match_profile(user_id): only a current match, open suggestion, or connection (matching.relationship).
- get_connections_activity(days): the caller's own connections feed.
- get_my_profile(): the caller's own profile.
No tool can return anyone's connections or connection count, so the model has nothing to leak.
"""
import json
import logging


from ml import scoring
from ml.config import LLM_SMART
from ml.embed import embed

from . import db, feed, matching, profile_store

log = logging.getLogger("assistant")
MAX_TURNS = 6
TOPIC_SIM = 0.6

SYSTEM = """You are the assistant inside Formal Connection, a networking app where people only connect with people
they have actually talked to. You help the signed-in user prepare for and follow up on real conversations.

Use the tools to look things up; never guess facts about people. Tools only return what this user is allowed
to see. If a tool says something is not available, tell the user you can't share that, without speculating why.

Rules you always follow:
- Never reveal or estimate anyone's number of connections, or who they are connected to. Only the user may
  know their own connections.
- Never say or hint whether someone declined, ignored, or said no to the user.
- Never list or search people outside what the tools return (no browsing strangers).
- Keep answers short and practical. Use first names."""

TOOLS = [
    {"name": "search_event_attendees",
     "description": "Find Open to Meet attendees at an event the user is checked in to who share a topic. "
                    "Returns user_id, first name, role, and shared topics only.",
     "strict": True,
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["event_id", "topic"],
                      "properties": {"event_id": {"type": "integer"},
                                     "topic": {"type": "string", "description": "e.g. 'quant finance'"}}}},
    {"name": "get_match_profile",
     "description": "Quick profile of one person the user is currently matched with, has an open suggestion "
                    "with, or is connected to: headline, role, seeking/offering, shared topics with evidence.",
     "strict": True,
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["user_id"],
                      "properties": {"user_id": {"type": "string"}}}},
    {"name": "get_connections_activity",
     "description": "Recent feed items (GitHub activity, posts, updates) from the user's own connections.",
     "strict": True,
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["days"],
                      "properties": {"days": {"type": "integer", "description": "1 to 14"}}}},
    {"name": "get_my_profile",
     "description": "The user's own profile: interests, headline, what they seek and offer.",
     "strict": True,
     "input_schema": {"type": "object", "additionalProperties": False, "properties": {}, "required": []}},
]

NOT_AVAILABLE = {"error": "not available"}


class Tools:
    def __init__(self, viewer: str):
        self.viewer = viewer

    def search_event_attendees(self, event_id: int, topic: str) -> dict:
        if not matching.is_checked_in(self.viewer, int(event_id)):
            return {"error": "the user is not checked in to that event"}
        ranked, m = matching.rank_for_viewer(self.viewer, int(event_id), explore_eps=0.0)
        open_ids = {r["id"] for r in db.fetchall(
            "select id::text as id from profiles where open_to_meet and id = any(%s::uuid[])", ([r["id"] for r in ranked],))}
        q = embed([topic.strip().lower()[:100]])[0]
        me = m.people[self.viewer]
        out = []
        for r in ranked:
            if r["id"] not in open_ids:
                continue
            p = m.people[r["id"]]
            hits = [m.index.names[i] for i in p["interests"]
                    if topic.lower() in m.index.names[i] or float(m.index.vecs[i] @ q) >= TOPIC_SIM]
            if not hits:
                continue
            shared = [s["name"] for s in scoring.shared_interests(me, p, m.index, 5)]
            out.append({"user_id": p["id"], "first_name": (p.get("name") or "").split(" ")[0], "role": p.get("role"),
                        "matching_topics": hits[:5], "shared_topics_with_user": shared})
            if len(out) >= 10:
                break
        return {"event_id": int(event_id), "results": out}

    def get_match_profile(self, user_id: str) -> dict:
        from .auth import User
        from .errors import ApiError
        from .routers.matches import quick_profile
        try:
            qp = quick_profile(user_id, User(id=self.viewer))
        except ApiError:
            return NOT_AVAILABLE
        return {k: qp[k] for k in ("user_id", "name", "role", "headline", "seeking", "offering", "connected",
                                   "shared_topics")}

    def get_connections_activity(self, days: int) -> dict:
        days = max(1, min(14, int(days)))
        rows = feed.visible_items(self.viewer, days=days, include_own=False)[:30]
        return {"days": days, "items": [{"author": (r["name"] or "").split(" ")[0], "kind": r["kind"],
                                         "title": r["title"], "body": (r["body"] or "")[:400],
                                         "date": r["created_at"].date().isoformat()} for r in rows]}

    def get_my_profile(self) -> dict:
        p = profile_store.get_interests(self.viewer)
        prof = db.fetchone("select name, headline, role from profiles where id = %s", (self.viewer,)) or {}
        return {"name": prof.get("name"), "headline": prof.get("headline") or "", "role": prof.get("role"),
                "seeking": p["seeking"], "offering": p["offering"],
                "interests": [{"name": i["name"], "facet": i["facet"]} for i in p["interests"] if not i["hidden"]][:25]}

    def run(self, name: str, args: dict) -> dict:
        fn = {"search_event_attendees": self.search_event_attendees, "get_match_profile": self.get_match_profile,
              "get_connections_activity": self.get_connections_activity,
              "get_my_profile": self.get_my_profile}.get(name)
        if fn is None:
            return {"error": f"unknown tool {name}"}
        try:
            return fn(**args)
        except (TypeError, ValueError) as e:
            return {"error": f"bad arguments: {e}"}


def _client():
    from ml.llm import client
    return client()


def chat(viewer: str, messages: list[dict], event_id: int | None = None) -> str:
    tools = Tools(viewer)
    system = SYSTEM
    if event_id is not None:
        system += f"\n\nThe user is currently viewing event_id {int(event_id)}."
    convo = [{"role": m["role"], "content": m["content"]} for m in messages]
    for _ in range(MAX_TURNS):
        resp = _client().messages.create(
            model=LLM_SMART, max_tokens=2000,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            tools=TOOLS, messages=convo)
        log.info("assistant model=%s in=%s out=%s stop=%s", LLM_SMART, resp.usage.input_tokens,
                 resp.usage.output_tokens, resp.stop_reason)
        if resp.stop_reason == "refusal":
            return "I can't help with that."
        if resp.stop_reason != "tool_use":
            return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        convo.append({"role": "assistant", "content": resp.content})
        results = []
        for b in resp.content:
            if getattr(b, "type", "") != "tool_use":
                continue
            out = tools.run(b.name, dict(b.input or {}))
            results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out, default=str),
                            **({"is_error": True} if "error" in out else {})})
        convo.append({"role": "user", "content": results})
    return "Sorry, I couldn't finish that. Try asking a narrower question."
