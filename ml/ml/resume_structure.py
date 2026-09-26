"""Resume structure for the skill profile (docs/ONBOARDING.md).

- docx_to_text(bytes): Word (.docx) resumes -> text (python-docx). PDFs use ml.resume_text / pdfplumber.
- parse_structure(text): {experience[], education[], skills[], certifications[], sections{}} via Claude
  (Haiku, schema-constrained) when ANTHROPIC_API_KEY is set; otherwise, or on any failure, the
  heuristic parser below. Never raises: the profile builder must not fail because of this step.
- years_of_experience(experience): merged date ranges in years (overlapping jobs count once).
"""
import io
import logging
import os
import re
from datetime import date

from pydantic import BaseModel, Field

log = logging.getLogger("resume_structure")

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
SECTION_NAMES = {
    "experience": ("experience", "work experience", "professional experience", "employment", "work history"),
    "education": ("education", "academics"),
    "skills": ("skills", "technical skills", "technologies", "tools"),
    "certifications": ("certifications", "certificates", "licenses"),
    "projects": ("projects", "personal projects", "selected projects"),
}


class Job(BaseModel):
    title: str = ""
    organization: str = ""
    start: str = ""            # "2023-06" / "2023" / ""
    end: str = ""              # "present" allowed
    summary: str = ""


class School(BaseModel):
    institution: str = ""
    degree: str = ""
    field: str = ""
    end: str = ""


class ResumeStructure(BaseModel):
    experience: list[Job] = Field(default_factory=list)
    education: list[School] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    sections: dict[str, str] = Field(default_factory=dict)   # free-text sections by heading


def docx_to_text(data: bytes) -> str:
    """Paragraphs and table cells of a .docx, in order."""
    import docx  # python-docx
    doc = docx.Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts).strip()


def is_docx(data: bytes, filename: str = "") -> bool:
    return data[:2] == b"PK" and (filename.lower().endswith(".docx") or b"word/" in data[:4000])


# ---------------------------------------------------------------- dates
def _parse_date(s: str, today: date) -> date | None:
    s = s.strip().lower()
    if not s:
        return None
    if s in ("present", "current", "now", "today", "ongoing"):
        return today
    m = re.match(r"(\d{4})-(\d{1,2})", s)
    if m:
        return date(int(m.group(1)), max(1, min(12, int(m.group(2)))), 1)
    m = re.match(r"([a-z]{3})[a-z]*\.?\s+(\d{4})", s)
    if m and m.group(1) in MONTHS:
        return date(int(m.group(2)), MONTHS[m.group(1)], 1)
    m = re.match(r"(\d{1,2})/(\d{4})", s)
    if m:
        return date(int(m.group(2)), max(1, min(12, int(m.group(1)))), 1)
    m = re.search(r"(\d{4})", s)
    if m:
        return date(int(m.group(1)), 1, 1)
    return None


def years_of_experience(experience: list[Job], today: date | None = None) -> float | None:
    """Total span covered by jobs, overlaps merged, rounded to 0.5. None if no dated jobs."""
    today = today or date.today()
    spans = []
    for j in experience:
        a, b = _parse_date(j.start, today), _parse_date(j.end or "present", today)
        if a and b and b >= a:
            spans.append((a, b))
    if not spans:
        return None
    spans.sort()
    total, (cur_a, cur_b) = 0, spans[0]
    for a, b in spans[1:]:
        if a <= cur_b:
            cur_b = max(cur_b, b)
        else:
            total += (cur_b - cur_a).days
            cur_a, cur_b = a, b
    total += (cur_b - cur_a).days
    return round(total / 365.25 * 2) / 2


# ---------------------------------------------------------------- heuristic parser
_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_WHEN = rf"(?:{_MONTH}\s+)?\d{{4}}|\d{{1,2}}/\d{{4}}"
_RANGE = re.compile(rf"\b({_WHEN})\s*(?:-|–|—|to)\s*({_WHEN}|present|current|now)\b", re.I)


def _split_sections(text: str) -> dict[str, str]:
    lines = text.splitlines()
    out, current = {}, "summary"
    for line in lines:
        head = line.strip().lower().rstrip(":")
        hit = next((k for k, names in SECTION_NAMES.items() if head in names), None)
        if hit:
            current = hit
            continue
        out.setdefault(current, "")
        out[current] += line + "\n"
    return {k: v.strip() for k, v in out.items() if v.strip()}


def heuristic_structure(text: str) -> ResumeStructure:
    sections = _split_sections(text)
    jobs = []
    for line in sections.get("experience", "").splitlines():
        m = _RANGE.search(line)
        if m:
            head = line[: m.start()].strip(" ,|-–—")
            title, _, org = head.partition(" at ") if " at " in head else (head.partition(",")[0], "", head.partition(",")[2])
            jobs.append(Job(title=title.strip(), organization=org.strip(), start=m.group(1), end=m.group(2)))
    skills = []
    for line in sections.get("skills", "").splitlines():
        line = re.sub(r"^[A-Za-z &/]+:\s*", "", line)  # "Languages: Python, Go"
        skills += [s.strip(" •-*·") for s in re.split(r"[,;|•·]", line) if s.strip(" •-*·")]
    certs = [l.strip(" •-*") for l in sections.get("certifications", "").splitlines() if l.strip(" •-*")]
    schools = [School(institution=l.strip(" •-*")) for l in sections.get("education", "").splitlines()[:3] if l.strip(" •-*")]
    return ResumeStructure(experience=jobs, education=schools, skills=skills[:60], certifications=certs[:20],
                           sections={k: v[:2000] for k, v in sections.items()})


# ---------------------------------------------------------------- LLM parser
SYSTEM = (
    "You extract the structure of a resume. Return only what the document states: work experience "
    "(title, organization, start and end as YYYY-MM or YYYY or 'present'), education, a flat list of named "
    "skills/technologies/tools exactly as written, and certifications. Never infer age, gender, ethnicity, "
    "religion, health, or other sensitive attributes."
)


def parse_structure(text: str) -> ResumeStructure:
    base = heuristic_structure(text)
    if not os.getenv("ANTHROPIC_API_KEY"):
        return base
    try:
        from .config import LLM_FAST
        from .llm import client
        resp = client().messages.parse(
            model=LLM_FAST,
            max_tokens=3000,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"RESUME:\n{text[:15000]}"}],
            output_format=ResumeStructure,
        )
        got = resp.parsed_output
        if got is None:
            return base
        got.sections = base.sections  # keep the raw free-text sections from the document itself
        return got
    except Exception as e:  # best effort: the heuristic result is still useful
        log.warning("resume structure via LLM failed, using heuristics: %s", e)
        return base
