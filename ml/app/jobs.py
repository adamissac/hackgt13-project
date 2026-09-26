"""In-memory background job registry for /profile/ingest (docs/api.md 1-2).

Jobs live in this process only (a restart forgets them; the extracted data itself is in Postgres).
Each job belongs to one user, and only that user can read its status.
"""
import logging
import secrets
import threading
import time
from typing import Callable

log = logging.getLogger("jobs")
_lock = threading.Lock()
_jobs: dict[str, dict] = {}
_TTL_S = 24 * 3600


def create(user_id: str) -> str:
    job_id = secrets.token_urlsafe(9)
    with _lock:
        now = time.time()
        for k in [k for k, v in _jobs.items() if now - v["created"] > _TTL_S]:
            del _jobs[k]
        _jobs[job_id] = {"user_id": user_id, "status": "queued", "error": None, "created": now}
    return job_id


def _set(job_id: str, **fields) -> None:
    with _lock:
        _jobs[job_id].update(fields)


def get(job_id: str, user_id: str) -> dict | None:
    with _lock:
        j = _jobs.get(job_id)
        if not j or j["user_id"] != user_id:
            return None
        return {"job_id": job_id, "status": j["status"], "error": j["error"]}


def run(job_id: str, fn: Callable[[], object]) -> None:
    """Run fn as the job body. Error messages are safe to show the user (no stack traces)."""
    _set(job_id, status="running")
    try:
        fn()
        _set(job_id, status="done")
    except Exception as e:
        log.exception("job %s failed", job_id)
        # Parse/extraction failure: onboarding becomes 'partial' (never blocks the user).
        from .skill_profile import mark_partial
        with _lock:
            owner = _jobs.get(job_id, {}).get("user_id")
        if owner:
            mark_partial(owner)
        from ml.extraction import ExtractionError
        msg = str(e) if isinstance(e, (ExtractionError, ValueError)) else "extraction failed"
        _set(job_id, status="error", error=msg)
