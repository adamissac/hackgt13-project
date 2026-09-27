"""Grounded text generation: icebreakers / "why you matched" (MASTER_SPEC 6.9).

Only data both people can see on each other's quick profile goes into the prompt: first names,
shared interests with evidence lines, and the seeking/offering text. Output is schema-validated;
one retry, then GenerationError (callers fall back to a deterministic template).
"""
import logging
import re

import pydantic
from pydantic import BaseModel, field_validator

from .config import LLM_FAST, LLM_SMART
from .llm import client

log = logging.getLogger("generation")


class GenerationError(RuntimeError):
    pass


class Starters(BaseModel):
    why: str
    openers: list[str]

    @field_validator("openers")
    @classmethod
    def _two(cls, v: list[str]) -> list[str]:
        v = [o.strip() for o in v if o and o.strip()]
        if len(v) < 2:
            raise ValueError("need 2 openers")
        return v[:2]


STARTER_SYSTEM = """You help two people who were matched at a networking event start a real conversation.
You write for the VIEWER, addressing them as "you", about the OTHER person by first name.

Use ONLY the facts given: shared interests with each person's evidence line, and what each is seeking
and offering. Never invent projects, employers, schools, or details that are not in the input.
No flattery, no emojis, no exclamation marks.

Return:
- why: one sentence (under 25 words) on why these two should talk, naming the most specific shared
  interest or a seeking/offering fit.
- openers: exactly 2 questions or openers the viewer could say, each under 20 words, each grounded in
  a specific fact from the input."""


def _starter_input(viewer: dict, other: dict, shared: list[dict]) -> str:
    lines = [f"VIEWER: {viewer['first_name']}", f"OTHER: {other['first_name']}", "", "Shared interests:"]
    for s in shared[:3]:
        lines.append(f"- {s['name']}: {viewer['first_name']}: {s['evidence_a'] or 'n/a'} | "
                     f"{other['first_name']}: {s['evidence_b'] or 'n/a'}")
    if not shared:
        lines.append("- (none)")
    lines += ["", f"{viewer['first_name']} is seeking: {viewer.get('seeking') or 'n/a'}",
              f"{viewer['first_name']} can offer: {viewer.get('offering') or 'n/a'}",
              f"{other['first_name']} is seeking: {other.get('seeking') or 'n/a'}",
              f"{other['first_name']} can offer: {other.get('offering') or 'n/a'}"]
    return "\n".join(lines)


def _starters_once(prompt: str) -> Starters:
    resp = client().messages.parse(
        model=LLM_SMART, max_tokens=1000,
        system=[{"type": "text", "text": STARTER_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
        output_format=Starters,
    )
    u = resp.usage
    log.info("starters model=%s in=%s out=%s stop=%s", LLM_SMART, u.input_tokens, u.output_tokens, resp.stop_reason)
    if resp.stop_reason in ("refusal", "max_tokens") or resp.parsed_output is None:
        raise GenerationError(f"no usable output (stop={resp.stop_reason})")
    return resp.parsed_output


def starters(viewer: dict, other: dict, shared: list[dict]) -> dict:
    """viewer/other: {first_name, seeking, offering}; shared: [{name, evidence_a, evidence_b}] (a = viewer)."""
    prompt = _starter_input(viewer, other, shared)
    last = None
    for attempt in (1, 2):
        try:
            return _starters_once(prompt).model_dump()
        except (GenerationError, pydantic.ValidationError, ValueError) as e:
            last = e
            log.warning("starters attempt %d failed: %s", attempt, e)
    raise GenerationError(f"starters failed after retry: {last}")


def template_starters(other_first: str, shared: list[dict]) -> dict:
    """Deterministic fallback when the LLM is unavailable. Grounded in shared topic names only."""
    if shared:
        top = [s["name"] for s in shared[:2]]
        why = f"You and {other_first} both list {' and '.join(top)}."
        openers = [f"What got you into {top[0]}?",
                   f"What are you working on in {top[-1]} right now?"]
    else:
        why = f"You and {other_first} could complement each other's goals."
        openers = ["What are you hoping to find at this event?", "What are you working on right now?"]
    return {"why": why, "openers": openers}


# ------------------------------------------------------------------ varied "why you matched" summaries
class VariedSummary(BaseModel):
    id: str
    summary: str


class VariedSummaries(BaseModel):
    summaries: list[VariedSummary]


VARY_SYSTEM = """You rewrite one-sentence explanations of why two people at a networking event were
matched. You are given, for each match: the shared interests, which signals scored highest, and a
plain template sentence that is already correct.

Your only job is to say the SAME THING in more natural, varied words. The template sentences repeat
across dozens of matches and that repetition is the problem you are solving.

Hard rules:
- Use ONLY the shared interests listed for that match. Never name an interest, project, employer,
  school, or detail that is not in that match's input. If a match lists no shared interests, do not
  name any.
- Never invent numbers, percentages, or match scores.
- Keep the meaning: if the input says they are in different circles, or that one is hiring, say so.
- Address the reader as "you". One or two sentences, under 30 words. No emojis, no exclamation
  marks, no flattery.
- Vary sentence structure between matches. Do not start every summary the same way.
- Return one entry per input id, with the same id."""


def _vary_input(items: list[dict]) -> str:
    lines = []
    for it in items:
        lines.append(f"id: {it['id']}")
        lines.append(f"  shared interests: {', '.join(it['topics']) if it['topics'] else '(none)'}")
        lines.append(f"  strongest signals: {', '.join(it['factors']) if it['factors'] else '(none)'}")
        if it.get("bridge"):
            lines.append("  note: these two are in different communities at this event")
        if it.get("recruiter"):
            lines.append("  note: one is recruiting, the other is looking")
        lines.append(f"  template: {it['template']}")
        lines.append("")
    return "\n".join(lines)


def _grounded(sentence: str, allowed: set[str], vocabulary: set[str]) -> bool:
    """Reject a rewrite that names an interest this pair does not actually share.

    The vocabulary is every canonical interest in the population, so this catches the failure that
    matters: attributing someone else's interest to this pair. It cannot catch every possible
    fabrication, which is why the template stays the fallback.
    """
    low = sentence.lower()
    for name in vocabulary:
        if name in allowed or len(name) < 4:
            continue
        if re.search(rf"\b{re.escape(name)}\b", low):
            return False
    return True


def vary_why(items: list[dict], vocabulary: set[str] | None = None) -> dict[str, str]:
    """Rewrite template summaries in varied prose. One batched call for the whole screen.

    items: [{id, template, topics: [names], factors: [labels], bridge: bool, recruiter: bool}]
    Returns {id: sentence} for entries that came back valid AND grounded. Anything missing or
    ungrounded is simply absent, and the caller keeps its template — this never raises.
    """
    if not items:
        return {}
    vocabulary = vocabulary or set()
    try:
        resp = client().messages.parse(
            model=LLM_FAST, max_tokens=120 * len(items) + 200,
            system=[{"type": "text", "text": VARY_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": _vary_input(items)}],
            output_format=VariedSummaries,
        )
    except Exception as e:                      # no key, no network, API error: keep the templates
        log.warning("vary_why unavailable (%s: %s); keeping template summaries", type(e).__name__, e)
        return {}
    u = resp.usage
    log.info("vary_why model=%s n=%d in=%s out=%s stop=%s", LLM_FAST, len(items),
             u.input_tokens, u.output_tokens, resp.stop_reason)
    if resp.stop_reason in ("refusal", "max_tokens") or resp.parsed_output is None:
        log.warning("vary_why gave no usable output (stop=%s); keeping template summaries", resp.stop_reason)
        return {}

    allowed_by_id = {it["id"]: {t.lower() for t in it["topics"]} for it in items}
    out = {}
    for row in resp.parsed_output.summaries:
        s = row.summary.strip()
        if row.id not in allowed_by_id or not s or len(s) > 240:
            continue
        if not _grounded(s, allowed_by_id[row.id], vocabulary):
            log.warning("vary_why dropped an ungrounded summary for %s", row.id)
            continue
        out[row.id] = s
    return out


# ------------------------------------------------------------------ follow-up notes (MASTER_SPEC 6.10)
class Draft(BaseModel):
    draft: str


FOLLOWUP_SYSTEM = """You draft a short follow-up message one person sends to someone they just met in person
and connected with. 2 to 3 sentences, warm but plain, no emojis, no exclamation marks, no subject line,
no sign-off name. Use ONLY the topics given (what the sender says they talked about, extra topics the sender
typed, and their shared interests). Never invent details, places, companies, or promises."""


def followup_draft(sender_first: str, other_first: str, talked_about: list[str], extra: str,
                   shared: list[str]) -> str:
    prompt = (f"Sender: {sender_first}\nRecipient: {other_first}\n"
              f"Topics the sender checked as discussed: {', '.join(talked_about) or 'none'}\n"
              f"Extra topics the sender typed: {extra or 'none'}\n"
              f"Shared interests: {', '.join(shared) or 'none'}")
    last = None
    for attempt in (1, 2):
        try:
            resp = client().messages.parse(
                model=LLM_FAST, max_tokens=600,
                system=[{"type": "text", "text": FOLLOWUP_SYSTEM, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": prompt}], output_format=Draft)
            log.info("followup model=%s in=%s out=%s", LLM_FAST, resp.usage.input_tokens, resp.usage.output_tokens)
            if resp.stop_reason in ("refusal", "max_tokens") or resp.parsed_output is None:
                raise GenerationError(f"no usable output (stop={resp.stop_reason})")
            text = resp.parsed_output.draft.strip()
            if not text:
                raise GenerationError("empty draft")
            return text
        except (GenerationError, pydantic.ValidationError, ValueError) as e:
            last = e
            log.warning("followup attempt %d failed: %s", attempt, e)
    raise GenerationError(f"follow-up draft failed after retry: {last}")


def template_followup(other_first: str, topics: list[str]) -> str:
    if topics:
        t = " and ".join(topics[:2])
        return f"Hi {other_first}, great talking with you about {t}. I'd like to keep the conversation going."
    return f"Hi {other_first}, great meeting you today. I'd like to keep in touch."


# ------------------------------------------------------------------ feed AI (MASTER_SPEC 6.11)
class OneLine(BaseModel):
    text: str


def _one_line(system: str, prompt: str, what: str, max_tokens: int = 400) -> str:
    last = None
    for attempt in (1, 2):
        try:
            resp = client().messages.parse(
                model=LLM_FAST, max_tokens=max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": prompt}], output_format=OneLine)
            log.info("%s model=%s in=%s out=%s", what, LLM_FAST, resp.usage.input_tokens, resp.usage.output_tokens)
            if resp.stop_reason in ("refusal", "max_tokens") or resp.parsed_output is None:
                raise GenerationError(f"no usable output (stop={resp.stop_reason})")
            text = resp.parsed_output.text.strip()
            if not text:
                raise GenerationError("empty output")
            return text
        except (GenerationError, pydantic.ValidationError, ValueError) as e:
            last = e
            log.warning("%s attempt %d failed: %s", what, attempt, e)
    raise GenerationError(f"{what} failed after retry: {last}")


SUMMARY_SYSTEM = """Summarize a burst of one person's recent activity into ONE sentence under 25 words for their
connections' feed, e.g. "Priya launched a new app and is hiring a frontend intern." Use only the items given.
Refer to the person by first name. No emojis, no hype."""

REPLY_SYSTEM = """Draft a short, specific reply (1-2 sentences) the viewer could send about a connection's feed item.
Ground it in the item and, if given, the topics the two discussed when they met. No emojis, no flattery,
no invented facts."""


def feed_summary(first_name: str, items: list[dict]) -> str:
    lines = "\n".join(f"- [{i['kind']}] {i.get('title') or ''} {i.get('body') or ''}".strip()[:300] for i in items[:10])
    return _one_line(SUMMARY_SYSTEM, f"Person: {first_name}\nItems:\n{lines}", "feed_summary")


def reply_suggestion(viewer_first: str, author_first: str, item: dict, talked: list[str]) -> str:
    prompt = (f"Viewer: {viewer_first}\nAuthor: {author_first}\n"
              f"Item [{item['kind']}]: {(item.get('title') or '')} {(item.get('body') or '')}"[:1200]
              + f"\nTopics they discussed when they met: {', '.join(talked) or 'none recorded'}")
    return _one_line(REPLY_SYSTEM, prompt, "reply_suggestion")


def template_summary(first_name: str, items: list[dict]) -> str:
    kinds = sorted({i["kind"] for i in items})
    return f"{first_name} shared {len(items)} updates ({', '.join(kinds)})."


def template_reply(author_first: str, item: dict, talked: list[str]) -> str:
    if talked:
        return f"Nice one, {author_first}. Does this connect to the {talked[0]} work we talked about?"
    return f"Nice one, {author_first}. How did it go?"
