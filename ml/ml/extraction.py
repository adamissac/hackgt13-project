"""Validated interest extraction (MASTER_SPEC 6.2) on top of llm.EXTRACT_SYSTEM.

- Schema-constrained output via the SDK's messages.parse + a pydantic model.
- One retry on a parse/validation failure or refusal, then ExtractionError (fail loudly).
- Post-filter drops sensitive attributes even if the model returns them.
- Logs token use per call.

Entry point: extract(text, source) -> ExtractResult.
"""
import logging
import re
from typing import Literal

import pydantic
from pydantic import BaseModel, Field, field_validator

from .config import LLM_FAST, LLM_SMART
from .llm import EXTRACT_SYSTEM, client

log = logging.getLogger("extraction")

MAX_INTERESTS = 20
MAX_DOC_CHARS = 15000
Facet = Literal["technical", "career", "personal", "academic"]


class ExtractedInterest(BaseModel):
    name: str
    facet: Facet
    strength: float
    evidence: str

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.strip().lower().split())
        if not v:
            raise ValueError("empty interest name")
        return v[:80]

    @field_validator("strength")
    @classmethod
    def _strength(cls, v: float) -> float:
        return min(1.0, max(0.0, float(v)))


class FacetSummary(BaseModel):
    technical: str = ""
    career: str = ""
    personal: str = ""
    academic: str = ""


class ExtractResult(BaseModel):
    interests: list[ExtractedInterest] = Field(default_factory=list)
    seeking: str = ""
    offering: str = ""
    summary: FacetSummary = Field(default_factory=FacetSummary)


class ExtractionError(RuntimeError):
    pass


# Sensitive attributes (MASTER_SPEC 6.2, 11): never stored even if the model extracts them.
_SENSITIVE = re.compile(r"\b(" + "|".join([
    r"relig\w*", r"church", r"mosque", r"synagogue", r"bible", r"quran|koran", r"torah",
    r"christian\w*", r"muslim|islam\w*", r"jew\w*|judaism", r"hindu\w*", r"buddhis\w*", r"atheis\w*",
    r"catholic\w*", r"evangelical", r"sikh\w*", r"mormon\w*",
    r"democrat\w*", r"republican\w*", r"politic(?!al science)\w*", r"maga", r"socialis\w*",
    r"election campaign\w*", r"partisan",
    r"lgbt\w*", r"gay", r"lesbian", r"bisexual", r"transgender", r"queer", r"sexual\w*",
    r"disabilit\w*", r"disabled", r"adhd", r"autis\w*", r"depressi\w*", r"anxiety", r"bipolar",
    r"diabet\w*", r"cancer survivor", r"hiv", r"pregnan\w*", r"mental health condition",
    r"ethnic\w*", r"race", r"racial", r"immigration status", r"undocumented", r"citizenship",
]) + r")\b", re.IGNORECASE)


def is_sensitive(item: ExtractedInterest) -> bool:
    return bool(_SENSITIVE.search(item.name) or _SENSITIVE.search(item.evidence))


def _clean(result: ExtractResult) -> ExtractResult:
    seen, kept = set(), []
    for it in sorted(result.interests, key=lambda i: -i.strength):
        if it.name in seen or is_sensitive(it):
            continue
        seen.add(it.name)
        kept.append(it)
    result.interests = kept[:MAX_INTERESTS]
    return result


def model_for(source: str) -> str:
    return LLM_SMART if source in ("resume", "linkedin") else LLM_FAST


def _call_once(text: str, source: str) -> ExtractResult:
    model = model_for(source)
    resp = client().messages.parse(
        model=model,
        max_tokens=4000,
        # Static prompt first with a cache breakpoint (only takes effect once the prompt is long
        # enough for the model's minimum cacheable prefix; harmless below it).
        system=[{"type": "text", "text": EXTRACT_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"SOURCE: {source}\n\nDOCUMENT:\n{text[:MAX_DOC_CHARS]}"}],
        output_format=ExtractResult,
    )
    u = resp.usage
    log.info("extract source=%s model=%s in=%s out=%s cache_read=%s cache_write=%s stop=%s",
             source, model, u.input_tokens, u.output_tokens,
             getattr(u, "cache_read_input_tokens", 0), getattr(u, "cache_creation_input_tokens", 0),
             resp.stop_reason)
    if resp.stop_reason == "refusal":
        raise ExtractionError("the model declined to process this document")
    if resp.stop_reason == "max_tokens":
        raise ExtractionError("extraction output was cut off")
    if resp.parsed_output is None:
        raise ExtractionError("no structured output returned")
    return resp.parsed_output


def extract(text: str, source: str) -> ExtractResult:
    """Extract interests from one document. Retries once, then raises ExtractionError."""
    if not text or not text.strip():
        raise ExtractionError("document is empty")
    import anthropic
    last: Exception | None = None
    for attempt in (1, 2):
        try:
            return _clean(_call_once(text, source))
        except (ExtractionError, pydantic.ValidationError, ValueError) as e:
            last = e
            log.warning("extraction attempt %d failed: %s", attempt, e)
        except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as e:
            last = e  # SDK already retried transport errors; one more attempt at our level
            log.warning("extraction attempt %d transport error: %s", attempt, e)
    raise ExtractionError(f"extraction failed after retry: {last}")
