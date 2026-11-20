"""Turn an e-book PDF into protected page images.

Why this module exists
----------------------
A PDF that reaches the browser can be saved, re-shared and re-sold — even when
the button says "read only".  So the raw file **never leaves the server** once
a book is a paid e-book.  Instead:

* the PDF (uploaded, or a public link on Drive / Dropbox / anywhere) is pulled
  once into our own storage,
* every page is rendered to a JPEG with PyMuPDF and cached on disk,
* each served page carries a watermark with the reader's own identity
  (email + phone + order id), so a leaked screenshot points back to whoever
  took it.

The reader UI only ever receives images, never the document.  Copying text,
saving the file or hot-linking it is therefore impossible; a screenshot still
is (no browser can block a hardware screenshot key), which is exactly why the
watermark matters.

Links
-----
Sellers may paste any public link (Google Drive, Dropbox, their own host).  The
first read imports the bytes into ``StoredFile`` and rewrites ``book.pdf_url``
to the internal reference, so later reads are fast and the outside link can
even be revoked by the seller without breaking the book.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import re
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("cronyzo.reader")

# 110 dpi is legible on a phone and keeps a page around 80–150 KB.
DEFAULT_DPI = 110
MAX_DPI = 200
MAX_PAGES = 4000
FETCH_TIMEOUT = 25
FETCH_MAX_BYTES = 45 * 1024 * 1024

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_DRIVE_ID = re.compile(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?id=|uc\?export=download&id=)([\w-]{10,})")


def normalise_link(url: str) -> str:
    """Turn a *share* link into a *download* link where we know the pattern."""
    url = (url or "").strip()
    if not url:
        return url
    match = _DRIVE_ID.search(url)
    if match:
        return f"https://drive.google.com/uc?export=download&id={match.group(1)}"
    if "dropbox.com" in url and "dl=0" in url:
        return url.replace("dl=0", "raw=1")
    return url


def cache_root() -> Path:
    base = os.getenv("CRONYZO_PAGE_CACHE") or str(
        Path(__file__).resolve().parents[2] / "var" / "page_cache"
    )
    path = Path(base)
    path.mkdir(parents=True, exist_ok=True)
    return path


# ── getting the bytes onto our side ────────────────────────────────────────


def _fetch_external(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    import requests

    target = normalise_link(url)
    try:
        with requests.get(
            target,
            timeout=FETCH_TIMEOUT,
            stream=True,
            allow_redirects=True,
            headers={"User-Agent": _UA, "Accept": "application/pdf,*/*"},
        ) as res:
            if res.status_code >= 400:
                return None, (
                    f"Link se file nahi khuli (HTTP {res.status_code}). "
                    "File ko 'Anyone with the link' par share karein."
                )
            chunks, total = [], 0
            for chunk in res.iter_content(64 * 1024):
                total += len(chunk)
                if total > FETCH_MAX_BYTES:
                    return None, "File 45 MB se badi hai — chhoti file upload karein"
                chunks.append(chunk)
        data = b"".join(chunks)
    except Exception as exc:  # noqa: BLE001
        logger.warning("fetch failed %s: %s", target, exc)
        return None, "Link tak nahi pahunch paye — internet ya sharing setting check karein"

    if not data:
        return None, "Link se khaali file aayi"
    if b"%PDF" not in data[:1024]:
        return None, (
            "Ye link PDF nahi de raha (Drive par 'Download anyway' wala page aaya ho "
            "to file ko public karein ya seedha upload karein)"
        )
    return data, None


def ensure_stored(book, *, sample: bool = False) -> Tuple[Optional[str], Optional[str]]:
    """Return the ``StoredFile`` id for this book's PDF, importing links once."""
    from app.extensions import db
    from app.models.upload import StoredFile, new_image_id
    from app.services.documents import file_id_from_url, internal_url

    url = book.preview_pdf_url if sample else book.pdf_url
    if not url:
        return None, "no_file"

    existing = file_id_from_url(url)
    if existing:
        if db.session.get(StoredFile, existing) is None:
            return None, "file_missing"
        return existing, None

    data, error = _fetch_external(url)
    if error:
        return None, error

    stored = StoredFile(
        id=new_image_id(),
        owner_id=book.seller_id,
        kind="preview" if sample else "book",
        book_id=book.id,
        filename=(Path(url.split("?")[0]).name or f"{book.slug}.pdf")[:200],
        mime="application/pdf",
        size_bytes=len(data),
        data=data,
    )
    db.session.add(stored)
    if sample:
        book.preview_pdf_url = internal_url(stored.id)
    else:
        book.pdf_url = internal_url(stored.id)
        book.pdf_size_bytes = len(data)
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("import failed book=%s", book.id)
        return None, "File save nahi ho payi — dobara koshish karein"

    logger.info("imported %s pdf for book=%s (%sB)", "preview" if sample else "book", book.id, len(data))
    return stored.id, None


# ── rendering ──────────────────────────────────────────────────────────────


def _stored_bytes(stored_id: str) -> Optional[bytes]:
    from app.services.documents import load_pdf

    stored = load_pdf(stored_id)
    return bytes(stored.data) if stored and stored.data else None


def _open_doc(data: bytes):
    import pymupdf

    return pymupdf.open(stream=data, filetype="pdf")


def page_count(stored_id: Optional[str]) -> int:
    if not stored_id:
        return 0
    data = _stored_bytes(stored_id)
    if not data:
        return 0
    try:
        with _open_doc(data) as doc:
            return min(int(doc.page_count), MAX_PAGES)
    except Exception:  # noqa: BLE001
        logger.exception("page_count failed %s", stored_id)
        return 0


def _cached_page_path(stored_id: str, page_no: int, dpi: int) -> Path:
    folder = cache_root() / stored_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"p{page_no:05d}-d{dpi}.jpg"


def render_page(stored_id: str, page_no: int, *, dpi: int = DEFAULT_DPI) -> Optional[bytes]:
    """Render one page (1-based) to JPEG bytes, cached on disk."""
    dpi = max(60, min(MAX_DPI, int(dpi or DEFAULT_DPI)))
    path = _cached_page_path(stored_id, page_no, dpi)
    if path.exists():
        try:
            return path.read_bytes()
        except OSError:
            pass

    data = _stored_bytes(stored_id)
    if not data:
        return None
    try:
        import pymupdf
        from PIL import Image

        with _open_doc(data) as doc:
            if page_no < 1 or page_no > doc.page_count:
                return None
            page = doc.load_page(page_no - 1)
            zoom = dpi / 72.0
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            buffer = io.BytesIO()
            image.save(buffer, "JPEG", quality=80, optimize=True)
            jpeg = buffer.getvalue()
    except Exception:  # noqa: BLE001
        logger.exception("render failed %s page %s", stored_id, page_no)
        return None

    try:
        path.write_bytes(jpeg)
        _trim_cache(stored_id)
    except OSError:
        pass  # serving matters more than caching
    return jpeg


def _trim_cache(stored_id: str, keep: int = 60) -> None:
    """Keep disk usage sane on small hosts: newest ``keep`` pages only."""
    try:
        folder = cache_root() / stored_id
        files = sorted(folder.glob("*.jpg"), key=lambda p: p.stat().st_mtime)
        for old in files[:-keep]:
            old.unlink(missing_ok=True)
    except OSError:
        pass


# ── watermark ──────────────────────────────────────────────────────────────


def watermark(jpeg: bytes, text: str, *, footer: str = "") -> bytes:
    """Stamp the reader's identity across the page."""
    if not text:
        return jpeg
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:  # noqa: BLE001
        return jpeg

    try:
        image = Image.open(io.BytesIO(jpeg)).convert("RGBA")
        layer = Image.new("RGBA", image.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(layer)
        font_size = max(13, int(image.width / 46))
        try:
            font = ImageFont.load_default(size=font_size)
        except TypeError:  # Pillow < 10.1
            font = ImageFont.load_default()

        tile = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
        stamp = Image.new("RGBA", (int(image.width * 0.9), font_size * 2), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(stamp)
        sdraw.text((4, 4), text, fill=(70, 70, 95, 84), font=font)
        rotated = stamp.rotate(28, expand=True)
        # one soft band every ~half page — readable as a watermark, never in the
        # way of the text a student is reading
        step_x, step_y = int(rotated.width * 0.75), int(rotated.height * 0.9)
        for y in range(-rotated.height, image.height + rotated.height, max(120, step_y)):
            for x in range(-rotated.width, image.width + rotated.width, max(160, step_x)):
                layer.alpha_composite(rotated, (x, y))

        if footer:
            draw.rectangle(
                [(0, image.height - font_size * 2), (image.width, image.height)],
                fill=(255, 255, 255, 190),
            )
            draw.text((10, image.height - font_size * 1.8), footer, fill=(60, 60, 80, 230), font=font)

        merged = Image.alpha_composite(image, layer).convert("RGB")
        out = io.BytesIO()
        merged.save(out, "JPEG", quality=82, optimize=True)
        return out.getvalue()
    except Exception:  # noqa: BLE001
        logger.exception("watermark failed")
        return jpeg


def fingerprint(text: str) -> str:
    return hashlib.sha256((text or "").encode()).hexdigest()[:8]


# ── free sample, generated from the book itself ────────────────────────────


def build_sample_pdf(data: bytes, pages: int) -> Tuple[Optional[bytes], Optional[str]]:
    """Cut the first ``pages`` pages out of a PDF."""
    try:
        import pymupdf
    except Exception:  # noqa: BLE001
        return None, "PDF engine load nahi hua"

    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            total = int(doc.page_count)
            if total <= 0:
                return None, "Is PDF me koi page nahi mila"
            take = max(1, min(int(pages or 20), total))
            with pymupdf.open() as out:
                out.insert_pdf(doc, from_page=0, to_page=take - 1)
                blob = out.tobytes(garbage=3, deflate=True)
        return blob, None
    except Exception as exc:  # noqa: BLE001
        logger.exception("build_sample_pdf failed")
        return None, f"Sample nahi ban paya ({exc.__class__.__name__})"


DEFAULT_SAMPLE_PAGES = 20


def auto_sample(book, *, pages: Optional[int] = None, force: bool = False) -> Tuple[Optional[int], Optional[str]]:
    """Create the free sample out of the full PDF (first N pages).

    Sellers should not have to make a second file by hand: upload the book (or
    paste a link) and the first :data:`DEFAULT_SAMPLE_PAGES` pages become the
    sample. Returns ``(pages_in_sample, error)``.
    """
    from app.extensions import db
    from app.models.upload import StoredFile, new_image_id
    from app.services.documents import internal_url

    if book.preview_pdf_url and not force:
        return int(book.preview_pages or 0) or None, None

    stored_id, error = ensure_stored(book)
    if error:
        return None, error
    data = _stored_bytes(stored_id)
    if not data:
        return None, "Book ki PDF nahi mili"

    wanted = int(pages or book.preview_pages or DEFAULT_SAMPLE_PAGES)
    blob, error = build_sample_pdf(data, wanted)
    if error:
        return None, error

    count = 0
    try:
        with _open_doc(blob) as doc:
            count = int(doc.page_count)
    except Exception:  # noqa: BLE001
        count = min(wanted, DEFAULT_SAMPLE_PAGES)

    # A PDF knows its own length — no reason to leave "pages" at 0.
    if not int(book.pages or 0):
        try:
            with _open_doc(data) as full_doc:
                book.pages = int(full_doc.page_count)
        except Exception:  # noqa: BLE001
            pass

    stored = StoredFile(
        id=new_image_id(),
        owner_id=book.seller_id,
        kind="preview",
        book_id=book.id,
        filename=f"{(book.slug or 'book')[:80]}-sample.pdf",
        mime="application/pdf",
        size_bytes=len(blob or b""),
        data=blob,
    )
    db.session.add(stored)
    book.preview_pdf_url = internal_url(stored.id)
    book.preview_pages = count
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("auto_sample commit failed book=%s", book.id)
        return None, "Sample save nahi hua"

    logger.info("auto sample for book=%s pages=%s", book.id, count)
    return count, None
