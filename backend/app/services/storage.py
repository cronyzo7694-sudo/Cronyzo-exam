"""Pluggable file storage.

The project must run today on local disk and later on Cloudinary without
touching a single route, so every upload/download goes through this module.

Backends
--------
``local``
    Files land in ``UPLOAD_FOLDER`` and are served by ``GET /api/files/<name>``.
``cloudinary``
    Selected automatically when ``CLOUDINARY_URL`` (or the three
    ``CLOUDINARY_*`` variables) are present and the SDK is installed. Falls back
    to ``local`` with a warning if the SDK is missing, so a half-configured
    deploy still boots.

Public exports (stable)::

    save_upload, resolve_url, storage_backend, ALLOWED_PDF_TYPES
"""

from __future__ import annotations

import io
import logging
import os
import re
import secrets
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("cronyzo.storage")

# PDFs for books/notes, plus the image types a slide or cover can use.
ALLOWED_PDF_TYPES = {
    "application/pdf": "pdf",
}
ALLOWED_IMAGE_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}

MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MiB — generous for a scanned book
MAX_IMAGE_BYTES = 8 * 1024 * 1024

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _upload_root() -> Path:
    from flask import current_app

    try:
        root = Path(current_app.config.get("UPLOAD_FOLDER") or "uploads")
    except RuntimeError:  # outside an app context
        root = Path(__file__).resolve().parents[2] / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _cloudinary_ready() -> bool:
    if not (os.getenv("CLOUDINARY_URL") or (
        os.getenv("CLOUDINARY_CLOUD_NAME") and os.getenv("CLOUDINARY_API_KEY")
    )):
        return False
    try:
        import cloudinary  # noqa: F401
    except Exception:  # noqa: BLE001
        logger.warning(
            "Cloudinary env vars are set but the SDK is not installed — "
            "falling back to local storage. Install with: pip install cloudinary"
        )
        return False
    return True


def storage_backend() -> str:
    """``"cloudinary"`` when fully configured, otherwise ``"local"``."""
    return "cloudinary" if _cloudinary_ready() else "local"


def _safe_filename(original: Optional[str], suffix: str) -> str:
    """Random, filesystem-safe name — never trust a client-supplied path."""
    stem = ""
    if original:
        stem = _SAFE_NAME.sub("", Path(original).stem)[:40].strip("._-")
    token = secrets.token_hex(12)
    return f"{stem + '-' if stem else ''}{token}.{suffix}"


def save_upload(
    file_storage,
    *,
    kind: str = "pdf",
    folder: str = "documents",
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Persist an uploaded file.

    Returns ``(info, error)``. ``info`` looks like::

        {"url": "…", "file_name": "notes.pdf", "size_bytes": 1234,
         "mime_type": "application/pdf", "backend": "local"}

    ``error`` is a short human-readable string when the upload is rejected —
    wrong type, too large, or empty — so the route can answer with a 400.
    """
    if file_storage is None or not getattr(file_storage, "filename", ""):
        return None, "No file supplied"

    allowed = ALLOWED_PDF_TYPES if kind == "pdf" else ALLOWED_IMAGE_TYPES
    limit = MAX_PDF_BYTES if kind == "pdf" else MAX_IMAGE_BYTES

    mime = (getattr(file_storage, "mimetype", "") or "").lower()
    original = file_storage.filename or ""
    ext = Path(original).suffix.lower().lstrip(".")

    suffix = allowed.get(mime)
    if suffix is None:
        # Some browsers send application/octet-stream for a PDF. Accept it only
        # when the extension is unambiguous.
        if kind == "pdf" and ext == "pdf":
            suffix = "pdf"
            mime = "application/pdf"
        elif kind != "pdf" and ext in ALLOWED_IMAGE_TYPES.values():
            suffix = ext
            mime = next(
                (m for m, e in ALLOWED_IMAGE_TYPES.items() if e == ext), "image/png"
            )
        else:
            expected = "PDF" if kind == "pdf" else "PNG, JPG, WEBP or SVG"
            return None, f"Unsupported file type — please upload a {expected} file"

    # Size check without loading the whole file twice: seek to the end.
    try:
        stream = file_storage.stream
        stream.seek(0, os.SEEK_END)
        size = int(stream.tell())
        stream.seek(0)
    except Exception:  # noqa: BLE001
        size = 0

    if size <= 0:
        return None, "The file looks empty"
    if size > limit:
        return (
            None,
            f"File is too large — the limit is {limit // (1024 * 1024)} MB",
        )

    display_name = _SAFE_NAME.sub("", Path(original).name)[:180] or f"file.{suffix}"

    if _cloudinary_ready():
        try:
            import cloudinary.uploader

            result = cloudinary.uploader.upload(
                file_storage.stream,
                folder=f"cronyzo/{folder}",
                resource_type="raw" if kind == "pdf" else "image",
                use_filename=True,
                unique_filename=True,
            )
            return (
                {
                    "url": result.get("secure_url") or result.get("url"),
                    "file_name": display_name,
                    "size_bytes": int(result.get("bytes") or size),
                    "mime_type": mime,
                    "backend": "cloudinary",
                },
                None,
            )
        except Exception:  # noqa: BLE001
            logger.exception("cloudinary upload failed — falling back to local disk")

    try:
        root = _upload_root() / folder
        root.mkdir(parents=True, exist_ok=True)
        name = _safe_filename(original, suffix)
        target = root / name
        file_storage.stream.seek(0)
        file_storage.save(target)
    except Exception:  # noqa: BLE001
        logger.exception("local upload failed")
        return None, "Could not save the file — please try again"

    return (
        {
            "url": f"/api/files/{folder}/{name}",
            "file_name": display_name,
            "size_bytes": size,
            "mime_type": mime,
            "backend": "local",
        },
        None,
    )


def resolve_url(info: Optional[Dict[str, Any]]) -> Optional[str]:
    """Return the public URL from a :func:`save_upload` result."""
    if not info:
        return None
    return info.get("url")


def public_dir() -> Path:
    """Directory the ``/api/files`` route serves from (local backend only)."""
    return _upload_root()
