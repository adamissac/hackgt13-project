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

SYSTEM = """You are the AI networking assistant inside Formal Connection, a HackGT 13 app where people only connect
after they've actually talked in person. Your job: help the signed-in user decide who to meet, understand why they
match, and walk into each conversation with something specific to say.

How to answer:
- Ground everything in tool results. Call get_my_top_matches for "who should I meet" questions,
  search_event_attendees for topic questions ("who here does X"), get_match_profile for details on one person,
  get_conversation_starters for icebreakers, get_connections_activity for follow-ups.
- Be specific: name the shared topic AND the evidence ("Maya built a RAG eval harness; you built course-rag").
  Generic advice ("say hi!", "be yourself") is useless here.
- Recommend clearly. Lead with the one best person and why, then at most two alternatives.
- If someone is physically close (proximity "very close"/"nearby"), say so; it matters at an event.
- Write like a sharp friend texting: short paragraphs, "•" bullets for lists, **bold** only for names. No headings.
  Usually under 120 words unless asked for more.
- Use first names. Describe match strength in words relative to the user's other matches ("your strongest
  match", "a solid overlap") rather than quoting raw percentages; the scores are relative, not absolute.
- If the user isn't checked in, or a tool says something is not available, say what they can do instead
  (turn on Open to Meet / check in), without speculating about other people.

Privacy rules you always follow:
- Never reveal or estimate anyone's number of connections, or who they are connected to.
- Never say or hint whether someone declined, ignored, or said no.
- Only talk about people the tools return. No browsing strangers, no guessing facts."""

TOOLS = [
    {"name": "get_my_top_matches",
     "description": "The user's best matches at an event they're checked in to, ranked by the matching model: "
                    "user_id, name, role, match percentage, why they match, rough proximity, shared topics with evidence.",
     "strict": True,
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["event_id", "limit"],
                      "properties": {"event_id": {"type": "integer"},
                                     "limit": {"type": "integer", "description": "1 to 10"}}}},
    {"name": "get_conversation_starters",
     "description": "Grounded icebreakers for talking to one match: a one-line 'why you should talk' and 2-3 openers "
                    "based on real shared evidence.",
     "strict": True,
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["user_id"],
                      "properties": {"user_id": {"type": "string"}}}},
    {"name": "search_event_attendees",
     "description": "Find Open to Meet attendees at an event the user is checked in to whose interests match a "
                    "topic (semantic match, e.g. 'RAG' finds retrieval-augmented generation). Returns user_id, first "
                    "name, role, matching topics, and topics shared with the user.",
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
     "description": "Recent feed items (GitHub activity, posts, updates) from the user's own connections. "
                    "GitHub items may carry a brief: what the project is and what they built, useful for "
                    "catching up before meeting them.",
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
            if r["id"] not in open_ids:  # privacy rule (tests/test_assistant.py): search only Open to Meet attendees
                continue
            p = m.people[r["id"]]
            hits = [m.index.names[i] for i in p["interests"]
                    if topic.lower() in m.index.names[i] or float(m.index.vecs[i] @ q) >= TOPIC_SIM]
            if not hits:
                continue
            shared = [s["name"] for s in scoring.shared_interests(me, p, m.index, 5)]
            out.append({"user_id": p["id"], "first_name": (p.get("name") or "").split(" ")[0], "role": p.get("role"),
                        "matching_topics": hits[:5], "shared_topics_with_user": shared})
            if len(out) >= 8:
                break
        return {"event_id": int(event_id), "results": out}

    def get_my_top_matches(self, event_id: int, limit: int) -> dict:
        if not matching.is_checked_in(self.viewer, int(event_id)):
            return {"error": "the user is not checked in to that event"}
        ranked, m = matching.rank_for_viewer(self.viewer, int(event_id), explore_eps=0.0)
        top = ranked[: max(1, min(10, int(limit)))]
        bands = matching.proximity_bands(self.viewer, [r["id"] for r in top])
        label = {"immediate": "very close", "near": "nearby", "far": "farther away"}
        me = m.people[self.viewer]
        out = []
        for r in top:
            p = m.people[r["id"]]
            shared = scoring.shared_interests(me, p, m.index, 3)
            out.append({"user_id": p["id"], "name": p.get("name"), "role": p.get("role"),
                        "headline": p.get("headline") or "", "match_percent": round(100 * r["score"]),
                        "why": r["why"], "proximity": label.get(bands.get(r["id"]) or "", None),
                        "seeking": p.get("seeking") or "", "offering": p.get("offering") or "",
                        "shared_topics": [{"topic": s["name"], "their_evidence": s.get("evidence_b", ""),
                                           "user_evidence": s.get("evidence_a", "")} for s in shared]})
        return {"event_id": int(event_id), "matches": out}

    def get_conversation_starters(self, user_id: str) -> dict:
        from .auth import User
        from .errors import ApiError
        from .routers.matches import starters
        try:
            return starters(user_id, User(id=self.viewer))
        except ApiError:
            return NOT_AVAILABLE

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
        items = []
        for r in rows:
            d = feed.details_of(r)
            items.append({"author": (r["name"] or "").split(" ")[0], "kind": r["kind"], "title": r["title"],
                          "body": (r["body"] or "")[:400], "date": r["created_at"].date().isoformat(),
                          **({"brief": " ".join([d["summary"], *d["highlights"]])[:600]} if d else {})})
        return {"days": days, "items": items}

    def get_my_profile(self) -> dict:
        p = profile_store.get_interests(self.viewer)
        prof = db.fetchone("select name, headline, role from profiles where id = %s", (self.viewer,)) or {}
        return {"name": prof.get("name"), "headline": prof.get("headline") or "", "role": prof.get("role"),
                "seeking": p["seeking"], "offering": p["offering"],
                "interests": [{"name": i["name"], "facet": i["facet"]} for i in p["interests"] if not i["hidden"]][:25]}

    def run(self, name: str, args: dict) -> dict:
        fn = {"search_event_attendees": self.search_event_attendees, "get_match_profile": self.get_match_profile,
              "get_my_top_matches": self.get_my_top_matches, "get_conversation_starters": self.get_conversation_starters,
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


def _snapshot(tools: "Tools", event_id: int | None) -> str:
    """Who the user is, up front, so the first answer is already personal (saves a tool round trip)."""
    try:
        me = tools.get_my_profile()
        interests = ", ".join(i["name"] for i in me["interests"][:12])
        checked_in = event_id is not None and matching.is_checked_in(tools.viewer, int(event_id))
        return (f"\n\nAbout the user: {me.get('name') or 'unknown name'}; {me.get('headline') or 'no headline'}. "
                f"Interests: {interests or 'none yet (suggest adding GitHub or a resume)'}. "
                f"Looking for: {me.get('seeking') or 'not set'}. Can offer: {me.get('offering') or 'not set'}. "
                f"Checked in to event {event_id}: {'yes' if checked_in else 'no'}.")
    except Exception:
        log.exception("assistant snapshot failed")
        return ""


def run_loop(system: str, tools_spec: list, messages: list[dict], run_tool) -> str:
    convo = [{"role": m["role"], "content": m["content"]} for m in messages]
    for _ in range(MAX_TURNS):
        resp = _client().messages.create(
            model=LLM_SMART, max_tokens=1200,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            tools=tools_spec, messages=convo) if tools_spec else _client().messages.create(
            model=LLM_SMART, max_tokens=1200,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=convo)
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
            out = run_tool(b.name, dict(b.input or {}))
            results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out, default=str),
                            **({"is_error": True} if isinstance(out, dict) and "error" in out else {})})
        convo.append({"role": "user", "content": results})
    return "Sorry, I couldn't finish that. Try asking a narrower question."


def chat(viewer: str, messages: list[dict], event_id: int | None = None) -> str:
    tools = Tools(viewer)
    system = SYSTEM
    if event_id is not None:
        system += f"\n\nThe user is currently at event_id {int(event_id)}; use it for event tools."
    system += _snapshot(tools, event_id)
    return run_loop(system, TOOLS, messages, tools.run)


# ---------------------------------------------------------------- demo mode (no account, simulated people)
DEMO_SYSTEM = SYSTEM + """

This is the app's DEMO MODE. There are no tools: everything you know is in the DEMO DATA below (the user's own
profile and the people at the event, with match percentages, rough distance, shared topics with evidence, and
suggested openers). Answer only from it; if something isn't there, say you don't know. The people are fictional
demo attendees, so their data is fine to discuss; still never invent facts beyond the data."""


def demo_chat(messages: list[dict], context: dict) -> str:
    data = json.dumps(context, default=str)[:20000]
    return run_loop(f"{DEMO_SYSTEM}\n\nDEMO DATA:\n{data}", [], messages, lambda *_: {})
