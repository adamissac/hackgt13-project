import pytest

from ml import resume_text as rt


def _pdf(lines):
    """Minimal one-page PDF with a Helvetica text layer (no extra dependencies)."""
    ops = "BT /F1 11 Tf 50 750 Td 14 TL " + " ".join(f"({l}) '" for l in lines) + " ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R >> >> >>",
            f"<< /Length {len(ops)} >>\nstream\n{ops}\nendstream".encode(),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{off:010d} 00000 n \n".encode() for off in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return bytes(out)


def test_text_resume():
    pdf = _pdf(["Jordan Lee - Georgia Tech CS 2027",
                "Built an RL trading agent in PyTorch with custom reward shaping",
                "Research assistant, genomics lab: variant calling pipelines in Python",
                "Hobbies: rock climbing, film photography"])
    r = rt.pdf_to_text(pdf)
    assert r["pages"] == 1 and not r["scanned"]
    assert "RL trading agent" in r["text"] and "rock climbing" in r["text"]


def test_scanned_detection():
    r = rt.pdf_to_text(_pdf([]))
    assert r["scanned"] and r["text"] == ""


def test_rejects_non_pdf():
    with pytest.raises(ValueError):
        rt.pdf_to_text(b"<html>not a pdf</html>")


def test_document_block_shape():
    b = rt.pdf_document_block(b"%PDF-1.4 x")
    assert b["type"] == "document" and b["source"]["media_type"] == "application/pdf"
