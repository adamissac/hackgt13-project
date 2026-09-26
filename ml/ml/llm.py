"""All LLM calls. Zero training: these are prompted, pretrained models.

Needs ANTHROPIC_API_KEY in the environment.
"""
import base64
import json
import re
from .config import LLM_SMART, LLM_FAST, FACETS

_client = None


def client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic()
    return _client


def _call(model, system, user_content, max_tokens=1500):
    msg = client().messages.create(
        model=model, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def _json(text):
    text = re.sub(r"```(?:json)?", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


# ---------------------------------------------------------------- extraction
EXTRACT_SYSTEM = f"""You extract a person's interests from one source document for a
networking app that matches students and recruiters. Output ONLY JSON, no prose.

Schema:
{{
  "interests": [
    {{"name": "<short canonical noun phrase, lowercase, 1-4 words>",
      "facet": one of {FACETS},
      "strength": <0.0-1.0, how central this is to the person based on evidence>,
      "evidence": "<one short factual line from the document>"}}
  ],
  "seeking": "<what they are looking for (roles, collaborators, topics) or empty>",
  "offering": "<what they could offer others (skills, hiring, mentorship) or empty>",
  "summary": {{"technical": "...", "career": "...", "personal": "...", "academic": "..."}}
}}

Rules:
- Prefer specific over generic ("reinforcement learning" beats "ai"; "rock climbing" beats "sports").
- Skip filler skills everyone has (microsoft office, communication, teamwork).
- Max 20 interests. Each summary is 1 sentence or empty string.
- Only use information present in the document. Never guess demographics, health,
  religion, politics, or anything sensitive; skip it even if present.
"""


def extract_interests(text, source):
    """source in {resume, linkedin, github, facebook, tiktok, manual}."""
    model = LLM_SMART if source in ("resume", "linkedin") else LLM_FAST
    raw = _call(model, EXTRACT_SYSTEM, f"SOURCE: {source}\n\nDOCUMENT:\n{text[:15000]}")
    return _json(raw)


def github_to_text(repos):
    """repos: list of dicts {name, description, languages{lang:bytes}, topics, readme, stars, fork, pushed_at}."""
    parts = []
    for r in repos:
        if r.get("fork"):
            continue
        langs = ", ".join(sorted(r.get("languages", {}), key=lambda k: -r["languages"][k])[:3])
        parts.append(f"REPO {r['name']} (stars {r.get('stars', 0)}, last push {r.get('pushed_at', '?')})\n"
                     f"langs: {langs}\ntopics: {', '.join(r.get('topics', []))}\n"
                     f"desc: {r.get('description') or ''}\nreadme: {(r.get('readme') or '')[:1200]}")
    return "\n\n".join(parts)


def likes_to_text(likes):
    """Facebook /me/likes rows: {name, category}."""
    return "\n".join(f"- {l['name']} ({l.get('category', '')})" for l in likes[:300])


# ---------------------------------------------------------------- vision (optional)
def extract_from_photos(image_paths):
    content = []
    for p in image_paths[:6]:
        ext = p.rsplit(".", 1)[-1].lower()
        media = "image/png" if ext == "png" else "image/jpeg"
        with open(p, "rb") as f:
            content.append({"type": "image", "source": {"type": "base64", "media_type": media,
                                                        "data": base64.b64encode(f.read()).decode()}})
    content.append({"type": "text", "text": "SOURCE: photos the user chose to share. "
                    "Extract hobbies and activities only (personal facet). Never describe the "
                    "person's appearance or identity."})
    return _json(_call(LLM_FAST, EXTRACT_SYSTEM, content))


# ---------------------------------------------------------------- canonicalization tie-break
def same_interest(a, b):
    raw = _call(LLM_FAST, "Answer ONLY JSON: {\"same\": true|false, \"canonical\": \"<better name>\"}",
                f"Are these the same interest for matching people? A: '{a}'  B: '{b}'", max_tokens=100)
    return _json(raw)


# ---------------------------------------------------------------- starters
STARTER_SYSTEM = """You write 2 short, specific conversation openers for two people who were
matched at an event. Use ONLY the shared interests and evidence given. No flattery, no
emojis, each under 20 words. Output ONLY JSON: {"why": "<1 sentence>", "openers": ["...", "..."]}"""


def conversation_starters(name_a, name_b, shared):
    """shared: list of {name, evidence_a, evidence_b}."""
    lines = "\n".join(f"- {s['name']}: {name_a}: {s['evidence_a']} | {name_b}: {s['evidence_b']}"
                      for s in shared[:3])
    return _json(_call(LLM_SMART, STARTER_SYSTEM, f"Shared interests:\n{lines}", max_tokens=300))
