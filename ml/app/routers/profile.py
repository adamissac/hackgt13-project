"""AL2: profile ingestion and the interest review screen (docs/api.md 1-4, MASTER_SPEC 6.2)."""
import io
import json
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from pydantic import BaseModel, Field, ValidationError

from .. import db, jobs, profile_store
from ..auth import User, current_user
from ..errors import ApiError
from ..users import ensure_profile

router = APIRouter(prefix="/profile")

MAX_PDF_BYTES = 10 * 1024 * 1024
Facet = Literal["technical", "career", "personal", "academic"]


class IngestBody(BaseModel):
    source: Literal["github", "facebook", "manual", "web", "resume"]
    text: str = Field(default="", max_length=20000)
    seeking: str | None = Field(default=None, max_length=2000)
    offering: str | None = Field(default=None, max_length=2000)


def pdf_to_text(data: bytes) -> str:
    """Resume PDF -> text with pdfplumber (MASTER_SPEC 6.2)."""
    import pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n".join((p.extract_text() or "") for p in pdf.pages[:10]).strip()
    except Exception:
        raise ApiError(400, "could not read that PDF")


def _previous_interests_text(user_id: str) -> str:
    doc = profile_store.latest_document(user_id, "manual")
    return ((doc or {}).get("meta") or {}).get("interests_text", "") if doc else ""


def _manual_document(user_id: str, text: str | None = None, seeking: str | None = None,
                     offering: str | None = None) -> str:
    """Everything the user typed, as one document. Missing fields fall back to what's already saved,
    so editing one field never drops the others from the next extraction."""
    prof = db.fetchone("select headline, experience, seeking, offering from profiles where id = %s",
                       (user_id,)) or {}
    parts = [
        ("Headline", prof.get("headline")),
        ("Experience", prof.get("experience")),
        ("Interests and background", text if text is not None else _previous_interests_text(user_id)),
        ("Looking for", seeking if seeking is not None else prof.get("seeking")),
        ("Can offer", offering if offering is not None else prof.get("offering")),
    ]
    return "\n".join(f"{k}: {v}" for k, v in parts if v and str(v).strip())


def _queue_manual(background: BackgroundTasks, user_id: str, doc: str, interests_text: str) -> str:
    job_id = jobs.create(user_id)
    background.add_task(jobs.run, job_id,
                        lambda: profile_store.ingest_text(user_id, "manual", doc, {"interests_text": interests_text}))
    return job_id


@router.post("/ingest", status_code=202)
async def ingest(request: Request, background: BackgroundTasks, user: User = Depends(current_user)):
    ensure_profile(user.id)
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("multipart/form-data"):
        form = await request.form()
        if (form.get("source") or "resume") not in ("resume", "linkedin"):
            raise ApiError(400, "file uploads must use source=resume")
        source = form.get("source") or "resume"
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise ApiError(400, "missing file")
        data = await upload.read()
        if len(data) > MAX_PDF_BYTES:
            raise ApiError(413, "PDF is larger than 10 MB")
        if not data.startswith(b"%PDF"):
            raise ApiError(400, "file must be a PDF")
        text = pdf_to_text(data)
        if not text:
            raise ApiError(400, "no text found in that PDF (is it a scanned image?)")
        job_id = jobs.create(user.id)
        background.add_task(jobs.run, job_id,
                            lambda: profile_store.ingest_text(user.id, source, text,
                                                              {"filename": getattr(upload, "filename", "")}))
        return {"job_id": job_id, "status": "queued"}

    try:
        body = IngestBody.model_validate(json.loads(await request.body() or b"{}"))
    except (ValueError, ValidationError):
        raise ApiError(422, "invalid request: expected {source: github | facebook | manual} or a resume upload")

    if body.source == "resume":
        raise ApiError(400, "upload the resume as multipart/form-data with a file field")
    if body.source == "web":
        raise ApiError(400, "web mention search is not available yet")

    if body.source == "manual":
        if body.seeking is not None or body.offering is not None:
            db.execute("update profiles set seeking = coalesce(%s, seeking), offering = coalesce(%s, offering) "
                       "where id = %s", (body.seeking, body.offering, user.id))
        text = _manual_document(user.id, body.text or None, body.seeking, body.offering)
        if not text:
            raise ApiError(400, "nothing to extract: add some text, seeking, or offering")
        interests_text = body.text or _previous_interests_text(user.id)
        return {"job_id": _queue_manual(background, user.id, text, interests_text), "status": "queued"}

    # github / facebook: the connect flow (Arjun, AR1) stores a digest in raw_documents; extract the newest.
    doc = profile_store.latest_document(user.id, body.source)
    if not doc or not (doc["text"] or "").strip():
        raise ApiError(400, f"connect {body.source} first")
    job_id = jobs.create(user.id)
    background.add_task(jobs.run, job_id,
                        lambda: profile_store.extract_existing(user.id, doc["id"], body.source, doc["text"]))
    return {"job_id": job_id, "status": "queued"}


@router.get("/status")
def status(job_id: str = Query(...), user: User = Depends(current_user)):
    j = jobs.get(job_id, user.id)
    if j is None:
        raise ApiError(404, "job not found")
    return j


@router.get("/interests")
def get_interests(user: User = Depends(current_user)):
    ensure_profile(user.id)
    return profile_store.get_interests(user.id)


class AddInterest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    facet: Facet


class PatchInterests(BaseModel):
    confirm: list[int] = Field(default_factory=list, max_length=200)
    hide: list[int] = Field(default_factory=list, max_length=200)
    add: list[AddInterest] = Field(default_factory=list, max_length=50)


@router.patch("/interests")
def patch_interests(body: PatchInterests, user: User = Depends(current_user)):
    ensure_profile(user.id)
    from ml.extraction import ExtractedInterest, is_sensitive
    for a in body.add:
        if is_sensitive(ExtractedInterest(name=a.name, facet=a.facet, strength=1, evidence="")):
            raise ApiError(400, f"'{a.name}' can't be added: sensitive topics are not used for matching")
    return profile_store.patch_interests(user.id, body.confirm, body.hide,
                                         [a.model_dump() for a in body.add])


class ManualBody(BaseModel):
    """MASTER_SPEC 9: PATCH /profile/manual. Every field optional; only the ones sent change."""
    headline: str | None = Field(default=None, max_length=200)
    experience: str | None = Field(default=None, max_length=8000)
    interests_text: str | None = Field(default=None, max_length=4000)
    seeking: str | None = Field(default=None, max_length=2000)
    offering: str | None = Field(default=None, max_length=2000)


@router.patch("/manual")
def patch_manual(body: ManualBody, background: BackgroundTasks, user: User = Depends(current_user)):
    """Save the LinkedIn-style fields the user types (LinkedIn itself is sign-in only, MASTER_SPEC 5.1), then
    re-run manual extraction over everything they've typed so interests stay in sync."""
    ensure_profile(user.id)
    cols = {k: v.strip() for k, v in body.model_dump().items() if v is not None and k != "interests_text"}
    if cols:
        db.execute(f"update profiles set {', '.join(f'{k} = %s' for k in cols)} where id = %s",
                   [*cols.values(), user.id])
    interests_text = body.interests_text.strip() if body.interests_text is not None else _previous_interests_text(user.id)
    doc = _manual_document(user.id, interests_text)
    job_id = _queue_manual(background, user.id, doc, interests_text) if doc else None
    prof = db.fetchone("select headline, experience, seeking, offering from profiles where id = %s", (user.id,))
    return {"profile": {**{k: prof[k] or "" for k in ("headline", "experience", "seeking", "offering")},
                        "interests_text": interests_text},
            "job_id": job_id, "status": "queued" if job_id else "nothing_to_extract"}
