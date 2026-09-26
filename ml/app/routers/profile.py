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


def _manual_document(user_id: str, body: IngestBody) -> str:
    prof = db.fetchone("select headline, experience, seeking, offering from profiles where id = %s",
                       (user_id,)) or {}
    parts = [
        ("Headline", prof.get("headline")),
        ("Experience", prof.get("experience")),
        ("Interests and background", body.text),
        ("Looking for", body.seeking if body.seeking is not None else prof.get("seeking")),
        ("Can offer", body.offering if body.offering is not None else prof.get("offering")),
    ]
    return "\n".join(f"{k}: {v}" for k, v in parts if v and str(v).strip())


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
        text = _manual_document(user.id, body)
        if not text:
            raise ApiError(400, "nothing to extract: add some text, seeking, or offering")
        job_id = jobs.create(user.id)
        background.add_task(jobs.run, job_id, lambda: profile_store.ingest_text(user.id, "manual", text))
        return {"job_id": job_id, "status": "queued"}

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
