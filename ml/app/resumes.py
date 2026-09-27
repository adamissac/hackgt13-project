"""Resume files (docs/ONBOARDING.md): object in the private `resumes` bucket + a `resumes` row.

record_upload() stores the file under <user_id>/<timestamp>-<name> with the service key and inserts the row
(status 'uploaded'). process() parses structure, runs the normal extraction (which then builds the skill
profile), and marks the row 'parsed' or 'failed'. Storage problems never stop the profile from being built.
"""
import logging
import os
import re
import time
import urllib.parse
import urllib.request

from ml import resume_structure

from . import db, profile_store

log = logging.getLogger("resumes")
BUCKET = "resumes"


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name)[-80:] or "resume"


def store_object(path: str, data: bytes, mime: str) -> bool:
    base, key = os.getenv("SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_SERVICE_KEY", "")
    if not base or not key:
        log.warning("resume not stored: SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
        return False
    req = urllib.request.Request(
        f"{base}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}", data=data, method="POST",
        headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": mime, "x-upsert": "true"})
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except Exception as e:
        log.warning("resume upload to storage failed: %s", e)
        return False


def record_upload(user_id: str, data: bytes, filename: str, mime: str) -> int:
    path = f"{user_id}/{int(time.time())}-{_safe_name(filename)}"
    stored = store_object(path, data, mime)
    row = db.fetchone(
        "insert into resumes (user_id, storage_path, filename, mime_type, size_bytes, status, error) "
        "values (%s, %s, %s, %s, %s, 'uploaded', %s) returning id",
        (user_id, path, filename[:200], mime, len(data), None if stored else "file not stored (storage unavailable)"))
    return row["id"]


def process(user_id: str, resume_id: int, source: str, text: str, filename: str) -> dict:
    try:
        # The section parse (fast model) and the interest extraction (smart model) don't depend on each other:
        # run them at the same time instead of one after the other.
        from concurrent.futures import ThreadPoolExecutor

        from ml import extraction
        with ThreadPoolExecutor(max_workers=2) as pool:
            structure_f = pool.submit(resume_structure.parse_structure, text)
            extracted_f = pool.submit(extraction.extract, text, source)
            structure, extracted = structure_f.result(), extracted_f.result()
        with db.conn() as c:
            doc_id = profile_store.save_document(c, user_id, source, text, {
                "filename": filename, "resume_id": resume_id, "structure": structure.model_dump()})
        result = profile_store.store_extraction(user_id, doc_id, source, extracted)
        doc = profile_store.latest_document(user_id, source)
        db.execute("update resumes set status = 'parsed', raw_document_id = %s, updated_at = now() where id = %s",
                   (doc["id"] if doc else None, resume_id))
        return result
    except Exception as e:
        db.execute("update resumes set status = 'failed', error = %s, updated_at = now() where id = %s",
                   (str(e)[:300], resume_id))
        raise
