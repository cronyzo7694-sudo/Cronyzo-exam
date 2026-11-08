"""Book models — sellable titles plus their table of contents.

This module implements the "Read" vertical of Cronyzo. A :class:`Book` may be
listed by a teacher or by a vendor (both are simply ``users`` rows), priced
either as a physical copy or an ebook, and carries a lightweight
:class:`BookChapter` list used for the preview table of contents.

Public exports (stable)::

    Book, BookChapter
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.extensions import db


def utcnow() -> datetime:
    """Naive UTC timestamp (matches the rest of the schema)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    try:
        return dt.isoformat()
    except Exception:  # noqa: BLE001
        return None


def _money(value: Any) -> float:
    try:
        return round(float(value or 0.0), 2)
    except (TypeError, ValueError):
        return 0.0


class Book(db.Model):
    """A book listed for sale on the Cronyzo marketplace."""

    __tablename__ = "books"

    id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(240), nullable=False)
    slug = db.Column(db.String(260), unique=True, nullable=False, index=True)
    author = db.Column(db.String(180), nullable=True, index=True)
    publisher = db.Column(db.String(180), nullable=True)
    isbn = db.Column(db.String(32), nullable=True, index=True)
    edition = db.Column(db.String(60), nullable=True)
    language = db.Column(db.String(40), default="Hindi", nullable=False)
    category = db.Column(db.String(120), default="General", nullable=False, index=True)
    pages = db.Column(db.Integer, default=0, nullable=False)

    # Text, not String(512): generated artwork is an inline SVG data URI
    cover_url = db.Column(db.Text, nullable=True)
    description = db.Column(db.Text, nullable=True)
    highlights = db.Column(db.Text, nullable=True)  # newline separated bullets

    price = db.Column(db.Float, default=0.0, nullable=False)
    mrp = db.Column(db.Float, default=0.0, nullable=False)
    # "paperback" | "hardcover" | "ebook" | "pdf"
    format = db.Column(db.String(32), default="paperback", nullable=False)
    stock = db.Column(db.Integer, default=0, nullable=False)

    # ── Digital edition (PDF) ──────────────────────────────────────────
    # The seller uploads a PDF. ``is_free_download`` publishes it as a free
    # e-book; otherwise it is delivered only after purchase.
    pdf_url = db.Column(db.String(2048), nullable=True)
    pdf_name = db.Column(db.String(255), nullable=True)
    pdf_size_bytes = db.Column(db.Integer, default=0, nullable=False)
    # A watermarked sample the seller may attach for anyone to read
    preview_pdf_url = db.Column(db.String(2048), nullable=True)
    preview_pages = db.Column(db.Integer, default=0, nullable=False)
    is_free_download = db.Column(db.Boolean, default=False, nullable=False)
    download_count = db.Column(db.Integer, default=0, nullable=False)

    status = db.Column(db.String(32), default="published", nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    is_featured = db.Column(db.Boolean, default=False, nullable=False, index=True)

    rating_avg = db.Column(db.Float, default=0.0, nullable=False)
    rating_count = db.Column(db.Integer, default=0, nullable=False)
    sold_count = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    seller = db.relationship("User", foreign_keys=[seller_id])
    chapters = db.relationship(
        "BookChapter",
        back_populates="book",
        lazy="selectin",
        order_by="BookChapter.sort_order",
        cascade="all, delete-orphan",
    )

    @property
    def discount_percent(self) -> int:
        mrp = _money(self.mrp)
        price = _money(self.price)
        if mrp <= 0 or price >= mrp:
            return 0
        return int(round((mrp - price) / mrp * 100))

    @property
    def in_stock(self) -> bool:
        return int(self.stock or 0) > 0

    def highlight_list(self) -> List[str]:
        raw = (self.highlights or "").strip()
        if not raw:
            return []
        return [line.strip() for line in raw.split("\n") if line.strip()]

    def to_dict(self, include_chapters: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "author": self.author,
            "publisher": self.publisher,
            "isbn": self.isbn,
            "edition": self.edition,
            "language": self.language,
            "category": self.category,
            "pages": int(self.pages or 0),
            "cover_url": self.cover_url,
            "description": self.description,
            "highlights": self.highlight_list(),
            "price": _money(self.price),
            "mrp": _money(self.mrp),
            "discount_percent": self.discount_percent,
            "format": self.format,
            "stock": int(self.stock or 0),
            "in_stock": self.in_stock,
            "status": self.status,
            "is_featured": bool(self.is_featured),
            "rating_avg": _money(self.rating_avg),
            "rating_count": self.rating_count,
            "sold_count": self.sold_count,
            # Digital edition — the PDF itself is gated by the API, never here
            "has_pdf": bool(self.pdf_url),
            "pdf_name": self.pdf_name,
            "pdf_size_bytes": int(self.pdf_size_bytes or 0),
            "has_preview": bool(self.preview_pdf_url),
            # Never expose an internal storage reference. Link-based samples are
            # public by design (that is the point of a free sample), so only
            # those are surfaced; a stored sample is read via the preview route.
            "preview_pdf_url": (
                self.preview_pdf_url
                if (self.preview_pdf_url or "").startswith(("http://", "https://"))
                else None
            ),
            "preview_hosted": bool(
                (self.preview_pdf_url or "").startswith("cronyzo://file/")
            ),
            "preview_pages": int(self.preview_pages or 0),
            "is_free_download": bool(self.is_free_download),
            "download_count": int(self.download_count or 0),
            "is_digital": (self.format or "") in ("ebook", "pdf") or bool(self.pdf_url),
            "created_at": _iso(self.created_at),
            "seller": {
                "id": self.seller_id,
                "full_name": self.seller.full_name if self.seller else None,
                "avatar_url": self.seller.avatar_url if self.seller else None,
            },
        }
        if include_chapters:
            data["chapters"] = [c.to_dict() for c in self.chapters]
        return data


class BookChapter(db.Model):
    """A single entry in a book's table of contents."""

    __tablename__ = "book_chapters"

    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey("books.id"), nullable=False, index=True)
    title = db.Column(db.String(240), nullable=False)
    page_start = db.Column(db.Integer, nullable=True)
    page_end = db.Column(db.Integer, nullable=True)
    preview_text = db.Column(db.Text, nullable=True)
    sort_order = db.Column(db.Integer, default=0, nullable=False)

    book = db.relationship("Book", back_populates="chapters")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "title": self.title,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "preview_text": self.preview_text,
            "sort_order": self.sort_order,
        }


__all__ = ["Book", "BookChapter", "utcnow", "_iso", "_money"]
