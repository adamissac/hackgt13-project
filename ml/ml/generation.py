"""Grounded text generation: icebreakers / "why you matched" (MASTER_SPEC 6.9).

Only data both people can see on each other's quick profile goes into the prompt: first names,
shared interests with evidence lines, and the seeking/offering text. Output is schema-validated;
one retry, then GenerationError (callers fall back to a deterministic template).
"""
import logging

import pydantic
from pydantic import BaseModel, field_validator

from .config import LLM_SMART
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
