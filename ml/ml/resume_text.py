"""Resume PDF -> text (AR2).

    pdf = download_resume(storage_path)          # private `resumes` bucket, service key, server only
    result = pdf_to_text(pdf)                     # {"text", "pages", "scanned"}
    if result["scanned"]:
        extracted = extract_interests_from_pdf(pdf)   # Claude reads the PDF itself
    else:
        extracted = llm.extract_interests(result["text"], "resume")

A scanned PDF has almost no text layer, so instead of failing we hand the PDF to Claude as a
document block (it reads the page images).
"""
import base64
import io
import os
import re
import urllib.parse
import urllib.request

BUCKET = "resumes"
MIN_CHARS_PER_PAGE = 80     # below this on average, treat the PDF as scanned
MAX_PAGES = 6
MAX_BYTES = 10 * 1024 * 1024


def download_resume(path):
    """Download `path` from the private resumes bucket with the service key (ML service only)."""
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_KEY"]
    url = f"{base}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path.lstrip('/'))}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "apikey": key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("resume larger than 10 MB")
    return data


def _tidy(text):
    text = text.replace(" ", " ").replace("•", "-")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def pdf_to_text(pdf_bytes):
    import pdfplumber
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("not a PDF")
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        n = len(pdf.pages)
        for page in pdf.pages[:MAX_PAGES]:
            pages.append(page.extract_text(x_tolerance=1.5, y_tolerance=3) or "")
    text = _tidy("\n\n".join(pages))
    scanned = len(text) < MIN_CHARS_PER_PAGE * max(1, min(n, MAX_PAGES))
    return {"text": text, "pages": n, "scanned": scanned}


def pdf_document_block(pdf_bytes):
    """Claude API content block that passes the PDF itself."""
    return {"type": "document",
            "source": {"type": "base64", "media_type": "application/pdf",
                       "data": base64.standard_b64encode(pdf_bytes).decode()}}


def extract_interests_from_pdf(pdf_bytes):
    """Scanned-resume fallback through the shared LLM helper (same prompt and schema)."""
    from . import llm
    from .config import LLM_SMART
    content = [pdf_document_block(pdf_bytes),
               {"type": "text", "text": "SOURCE: resume\n\nThe document above is the person's resume."}]
    return llm._json(llm._call(LLM_SMART, llm.EXTRACT_SYSTEM, content))


if __name__ == "__main__":
    import sys
    with open(sys.argv[1], "rb") as f:
        r = pdf_to_text(f.read())
    print(f"pages={r['pages']} scanned={r['scanned']} chars={len(r['text'])}\n")
    print(r["text"][:2000])
