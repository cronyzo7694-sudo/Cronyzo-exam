"""User-uploaded images, stored in the database.

Why the database and not a bucket
---------------------------------
Cronyzo runs on free infrastructure: the API sits on Render's free tier, whose
disk is **ephemeral** (every deploy wipes ``uploads/``), and Cloudinary keys are
optional.  A cover photo that disappears after a redeploy is worse than no
cover photo at all, so images are kept in Postgres next to the rest of the
data — durable, free, and served straight from the API with a long cache
header.

Every upload is normalised by Pillow to a single web-safe JPEG (max 1600 px,
~100–250 KB) before it is stored, so a 6 MB phone photo never slows a page
down.  Identical bytes are de-duplicated by SHA-256, so the same cover used on
two listings costs one row.

Table: ``uploaded_images``.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from app.extensions import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_image_id() -> str:
    """Opaque, unguessable id — also the public URL path segment."""
    return secrets.token_urlsafe(18).replace("-", "a").replace("_", "b")[:24]


class UploadedImage(db.Model):
    __tablename__ = "uploaded_images"

    id = db.Column(db.String(24), primary_key=True, default=new_image_id)
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Stored bytes are always JPEG after normalisation.
    mime = db.Column(db.String(40), nullable=False, default="image/jpeg")
    data = db.Column(db.LargeBinary, nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    width = db.Column(db.Integer, nullable=False, default=0)
    height = db.Column(db.Integer, nullable=False, default=0)

    # SHA-256 of the normalised bytes — lets a re-upload reuse the existing row.
    sha256 = db.Column(db.String(64), nullable=True, index=True)
    original_name = db.Column(db.String(180), nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=_utcnow)

    def to_dict(self, base_url: str = "") -> dict:
        """Public payload. Never leaks the bytes."""
        prefix = (base_url or "").rstrip("/")
        return {
            "id": self.id,
            "url": f"{prefix}/api/images/{self.id}" if prefix else f"/api/images/{self.id}",
            "mime": self.mime,
            "size_bytes": self.size_bytes,
            "width": self.width,
            "height": self.height,
        }

    def __repr__(self) -> str:
        return f"<UploadedImage {self.id} {self.width}x{self.height} {self.size_bytes}B>"


class StoredFile(db.Model):
    """A document (the e-book PDF, the free sample) kept with the data.

    Same reasoning as :class:`UploadedImage`: Render's free disk is wiped on
    every deploy and Cloudinary keys are optional, so a seller's uploaded PDF
    must not live on local disk. Bytes go to Postgres; delivery is gated by the
    book routes (paid buyers only), which is why the raw URL is never public.

    ``kind`` is ``"book"`` (the full e-book) or ``"preview"`` (free sample).
    """

    __tablename__ = "stored_files"

    id = db.Column(db.String(24), primary_key=True, default=new_image_id)
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    kind = db.Column(db.String(20), nullable=False, default="book", index=True)
    book_id = db.Column(db.Integer, nullable=True, index=True)
    filename = db.Column(db.String(200), nullable=True)
    mime = db.Column(db.String(60), nullable=False, default="application/pdf")
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    data = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
        }
