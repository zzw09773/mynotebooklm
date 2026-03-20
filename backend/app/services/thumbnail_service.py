"""
Thumbnail generation pipeline for slides artifacts.

Pipeline: PPTX → soffice (PPTX→PDF) → fitz (PDF→JPEG)

Thumbnails are stored at:  /data/thumbnails/{artifact_id}/slide_NNN.jpg
Served at:                 /thumbnails/{artifact_id}/slide_NNN.jpg  (StaticFiles)
"""
import logging
import shutil
import tempfile
from pathlib import Path

import fitz  # PyMuPDF
import pikepdf

from app.scripts.soffice import run_soffice

log = logging.getLogger(__name__)

THUMBNAILS_DIR = Path("/data/thumbnails")
THUMB_WIDTH_PX = 1280  # rendered width in pixels
JPEG_QUALITY = 85


# ── Path helpers ──────────────────────────────────────────────

def _thumb_dir(artifact_id: int) -> Path:
    return THUMBNAILS_DIR / str(artifact_id)


def get_thumbnail_urls(artifact_id: int) -> list[str]:
    """Return sorted URL paths for all generated thumbnails of an artifact."""
    d = _thumb_dir(artifact_id)
    if not d.exists():
        return []
    paths = sorted(d.glob("slide_*.jpg"))
    return [f"/thumbnails/{artifact_id}/{p.name}" for p in paths]


def thumbnails_exist(artifact_id: int) -> bool:
    return bool(get_thumbnail_urls(artifact_id))


# ── Generation pipeline ───────────────────────────────────────

def generate_thumbnails(artifact_id: int, pptx_path: str | Path) -> list[str]:
    """
    Blocking pipeline: PPTX → PDF → JPEG thumbnails.

    Args:
        artifact_id: Studio artifact ID (used for output directory naming).
        pptx_path:   Path to an already-generated .pptx file.

    Returns list of thumbnail URL paths on success, empty list on failure.
    """
    out_dir = _thumb_dir(artifact_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # Copy the PPTX into the temp dir so soffice writes its PDF there
        pptx_src = Path(pptx_path)
        pptx_in_tmp = tmp_path / "slides.pptx"
        shutil.copy2(pptx_src, pptx_in_tmp)
        pptx_path = pptx_in_tmp

        # Step 1: Convert PPTX → PDF via LibreOffice
        result = run_soffice(
            ["--headless", "--convert-to", "pdf", "--outdir", str(tmp_path), str(pptx_path)],
            capture_output=True,
            timeout=120,
        )
        if result.returncode != 0:
            log.error(
                "soffice failed for artifact %d (rc=%d): %s",
                artifact_id, result.returncode,
                result.stderr.decode(errors="replace"),
            )
            return []

        pdf_path = tmp_path / "slides.pdf"
        if not pdf_path.exists():
            log.error("soffice produced no PDF for artifact %d", artifact_id)
            return []

        # Step 2b: Strip malformed structure tree from LibreOffice-generated PDF.
        # LibreOffice exports tagged PDFs whose /StructTreeRoot is often incomplete,
        # causing MuPDF to emit "No common ancestor in structure tree" warnings.
        # Removing /StructTreeRoot and /MarkInfo fixes the PDF before fitz opens it.
        try:
            clean_pdf_path = tmp_path / "slides_clean.pdf"
            with pikepdf.open(pdf_path) as _pdf:
                for key in ("/StructTreeRoot", "/MarkInfo"):
                    if key in _pdf.Root:
                        del _pdf.Root[key]
                _pdf.save(clean_pdf_path)
            pdf_path = clean_pdf_path
        except Exception:
            log.warning("Could not clean PDF structure for artifact %d, proceeding with original", artifact_id)

        # Step 3: Render PDF pages → JPEG via PyMuPDF
        try:
            doc = fitz.open(str(pdf_path))
            if doc.page_count == 0:
                log.warning("PDF has 0 pages for artifact %d", artifact_id)
                doc.close()
                return []

            first_page = doc[0]
            scale = THUMB_WIDTH_PX / first_page.rect.width
            matrix = fitz.Matrix(scale, scale)

            for page_num in range(doc.page_count):
                pixmap = doc[page_num].get_pixmap(matrix=matrix)
                out_img = out_dir / f"slide_{page_num:03d}.jpg"
                pixmap.save(str(out_img))

            page_count = doc.page_count
            doc.close()
            log.info("Generated %d thumbnails for artifact %d", page_count, artifact_id)
        except Exception:
            log.exception("fitz rendering failed for artifact %d", artifact_id)
            return []

    return get_thumbnail_urls(artifact_id)
