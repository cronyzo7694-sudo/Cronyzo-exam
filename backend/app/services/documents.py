"""Store and serve uploaded documents (e-book PDFs, free samples).

The book routes used to hand uploads to :mod:`app.services.storage`, which
falls back to local disk when Cloudinary is not configured. On Render's free
tier that disk is **ephemeral** — a seller's PDF vanished on the next deploy,
which is unacceptable for a shop. Documents are therefore stored in Postgres
next to the rest of the data and streamed back through a gated route.
"""

from __future__ import annotations

import logging
from pathlib import PurePath
from typing import Optional, Tuple

from app.extensions import db
from app.models.upload import StoredFile, new_image_id

logger = logging.getLogger("cronyzo.documents")

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB — big enough for a real e-book
MARKER = "cronyzo://file/"


def internal_url(file_id: str) -> str:
    """The stored reference a book row keeps instead of a public URL."""
    return MARKER + file_id


def file_id_from_url(url: Optional[str]) -> Optional[str]:
    if not url or not url.startswith(MARKER):
        return None
    return url[len(MARKER) :] or None


def store_pdf(file_storage, *, kind: str, book_id: Optional[int], owner_id: Optional[int]) -> Tuple[Optional[StoredFile], Optional[str]]:
    """Validate and keep one PDF. Returns ``(stored_file, error)``."""
    if file_storage is None or not getattr(file_storage, "filename", ""):
        return None, "No file supplied"

    name = file_storage.filename or "book.pdf"
    mime = (getattr(file_storage, "mimetype", "") or "").lower()
    ext = PurePath(name).suffix.lower().lstrip(".")
    if not (mime == "application/pdf" or ext == "pdf"):
        return None, "That is not a PDF — please upload a .pdf file"

    data = file_storage.read(MAX_PDF_BYTES + 1)
    if not data:
        return None, "The file looks empty"
    if len(data) > MAX_PDF_BYTES:
        return None, "PDF is larger than 20 MB — compress it, or list it with a Drive link instead"
    if not data.lstrip()[:5].startswith(b"%PDF"):
        return None, "That file is not a valid PDF"

    stored = StoredFile(
        id=new_image_id(),
        owner_id=owner_id,
        kind=kind,
        book_id=book_id,
        filename=name[:200],
        mime="application/pdf",
        size_bytes=len(data),
        data=data,
    )
    try:
        db.session.add(stored)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("store_pdf commit failed book=%s kind=%s", book_id, kind)
        return None, "Could not save the file — please try again"

    logger.info("stored %s pdf book=%s %sB", kind, book_id, len(data))
    return stored, None


def load_pdf(file_id: str) -> Optional[StoredFile]:
    return db.session.get(StoredFile, file_id)
