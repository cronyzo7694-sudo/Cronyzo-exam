"""Book routes — catalog browsing and seller listings.

Stable endpoints under ``/api/books``::

    GET    /api/books                     public catalog (filters + paging)
    GET    /api/books/meta/categories      distinct book categories
    GET    /api/books/meta/stats           headline counters
    GET    /api/books/<slug>               book detail (with chapters)
    POST   /api/books                      seller lists a new book
    PUT    /api/books/<int:book_id>        seller updates own book
    DELETE /api/books/<int:book_id>        seller removes own book
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Final, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.book import Book, BookChapter
from app.models.user import User
from app.services.media import cover_artwork
from app.utils.decorators import get_current_user, roles_required
from app.utils.slugify import unique_slug
from app.utils.validators import parse_pagination

books_bp = Blueprint("books", __name__)
logger = logging.getLogger("cronyzo.routes.books")

_MAX_TITLE: Final[int] = 240
_MAX_AUTHOR: Final[int] = 180
_MAX_PUBLISHER: Final[int] = 180
_MAX_ISBN: Final[int] = 32
_MAX_EDITION: Final[int] = 60
_MAX_CATEGORY: Final[int] = 120
_MAX_URL: Final[int] = 512
_MAX_DESC: Final[int] = 20000
_MAX_SEARCH: Final[int] = 120

_VALID_FORMATS = ("paperback", "hardcover", "ebook", "pdf")


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clean(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


# ---------------------------------------------------------------------------
# Public catalog
# ---------------------------------------------------------------------------
# ── External book files (link-based listings) ───────────────────────────────
# Not everybody wants to upload a 40 MB PDF: many sellers already keep the file
# on Google Drive, Dropbox or their own site. A listing may therefore point at
# an external URL, and the download endpoint hands that URL to the buyer after
# the same purchase check. Only http(s) is accepted — never `javascript:` or a
# `data:` blob, which is how a "link" turns into an XSS hole.
_ALLOWED_FILE_SCHEMES: Final = ("http://", "https://")

_DRIVE_FILE_ID = re.compile(
    r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{10,})",
    re.IGNORECASE,
)
_DROPBOX_SHARE = re.compile(r"www\.dropbox\.com/", re.IGNORECASE)


def _normalise_file_url(value: Any, limit: int = _MAX_URL) -> Optional[str]:
    """Turn any *shared* file link into something that actually downloads.

    Google Drive's `/file/d/<id>/view?usp=sharing` opens a web page, not a file,
    so it is rewritten to the `uc?export=download` endpoint. Dropbox's `?dl=0`
    becomes `?raw=1`. Everything else is passed through untouched.
    """
    url = _clean(value, limit)
    if not url:
        return None
    if not url.lower().startswith(_ALLOWED_FILE_SCHEMES):
        return None

    drive = _DRIVE_FILE_ID.search(url)
    if drive:
        return f"https://drive.google.com/uc?export=download&id={drive.group(1)}"

    if _DROPBOX_SHARE.search(url):
        if "dl=0" in url:
            return url.replace("dl=0", "raw=1")
        if "dl=1" in url and "raw=1" not in url:
            return url.replace("dl=1", "raw=1")
    return url


@books_bp.get("")
def list_books():
    """Public book catalog — no auth required."""
    page, per_page = parse_pagination(request.args)
    q = Book.query.filter(Book.status == "published", Book.is_active.is_(True))

    # "mine=true" → the signed-in seller's own catalogue (Seller Studio).
    # Drafts are included so a seller can see work in progress, but
    # soft-deleted books stay hidden.
    if (request.args.get("mine") or "").lower() in ("1", "true", "yes"):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        q = Book.query.filter(
            Book.seller_id == user.id,
            Book.is_active.is_(True),
        )

    search = (request.args.get("search") or "").strip()[:_MAX_SEARCH]
    if search:
        like = f"%{_escape_like(search)}%"
        q = q.filter(
            db.or_(
                Book.title.ilike(like, escape="\\"),
                Book.author.ilike(like, escape="\\"),
                Book.publisher.ilike(like, escape="\\"),
            )
        )

    category = (request.args.get("category") or "").strip()[:_MAX_CATEGORY]
    if category and category.lower() != "all":
        q = q.filter(Book.category == category)

    author = (request.args.get("author") or "").strip()[:_MAX_AUTHOR]
    if author:
        q = q.filter(Book.author.ilike(f"%{_escape_like(author)}%", escape="\\"))

    fmt = (request.args.get("format") or "").strip().lower()[:32]
    if fmt and fmt != "all":
        q = q.filter(Book.format == fmt)

    if request.args.get("featured", "").lower() == "true":
        q = q.filter(Book.is_featured.is_(True))

    seller_id = request.args.get("seller_id")
    if seller_id:
        sid = _safe_int(seller_id, 0)
        if sid > 0:
            q = q.filter(Book.seller_id == sid)

    max_price = request.args.get("max_price")
    if max_price not in (None, ""):
        cap = _safe_float(max_price, -1.0)
        if cap >= 0:
            q = q.filter(Book.price <= cap)

    sort = (request.args.get("sort") or "popular").strip().lower()
    if sort == "price_low":
        q = q.order_by(Book.price.asc())
    elif sort == "price_high":
        q = q.order_by(Book.price.desc())
    elif sort == "rating":
        q = q.order_by(Book.rating_avg.desc())
    elif sort == "newest":
        q = q.order_by(Book.created_at.desc())
    else:
        q = q.order_by(Book.sold_count.desc(), Book.rating_avg.desc())

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify(
        {
            "items": [b.to_dict() for b in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page else 1,
        }
    )


@books_bp.get("/meta/categories")
def book_categories():
    rows = (
        db.session.query(Book.category)
        .filter(Book.status == "published", Book.is_active.is_(True))
        .distinct()
        .order_by(Book.category)
        .all()
    )
    categories = [r[0] for r in rows if r and r[0]]
    return jsonify({"items": categories, "total": len(categories)})


@books_bp.get("/meta/stats")
def book_stats():
    try:
        books = Book.query.filter(
            Book.status == "published", Book.is_active.is_(True)
        ).count()
        sold = db.session.query(db.func.coalesce(db.func.sum(Book.sold_count), 0)).scalar() or 0
    except Exception:  # noqa: BLE001
        logger.exception("book_stats failed")
        books = sold = 0
    return jsonify({"books": int(books), "sold": int(sold)})


@books_bp.get("/<slug>")
def get_book(slug):
    """Book detail with its table of contents."""
    book = Book.query.filter_by(slug=slug).first()
    if book is None or not book.is_active:
        return jsonify({"error": "Book not found"}), 404
    return jsonify(book.to_dict(include_chapters=True))


# ---------------------------------------------------------------------------
# Seller publishing
# ---------------------------------------------------------------------------
@books_bp.post("")
@jwt_required()
def create_book():
    """List a new book on the marketplace.

    Publishing books is gated: the account must be an **approved shopkeeper**
    (Admin → Sellers) or an admin. A teacher can teach, but cannot list a book
    without going through the shop application — that is the operator's rule.
    """
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    from app.models.seller import is_approved_seller

    if not is_approved_seller(user):
        return (
            jsonify(
                {
                    "error": "You need an approved shopkeeper account to list books.",
                    "code": "seller_application_required",
                    "next": "/sell/apply",
                }
            ),
            403,
        )

    data = _json_body()
    title = _clean(data.get("title"), _MAX_TITLE)
    if not title:
        return jsonify({"error": "title is required"}), 400

    fmt = (str(data.get("format") or "paperback").strip().lower())[:32]
    if fmt not in _VALID_FORMATS:
        fmt = "paperback"

    price = max(0.0, _safe_float(data.get("price"), 0.0))
    mrp = max(0.0, _safe_float(data.get("mrp"), price))

    highlights = data.get("highlights")
    if isinstance(highlights, list):
        highlights = "\n".join(str(h)[:200] for h in highlights[:12])
    elif highlights is not None:
        highlights = str(highlights)[:3000]

    book_slug = unique_slug(Book, title)
    cover_url = _clean(data.get("cover_url"), _MAX_URL)
    if not cover_url:
        # No upload yet — deterministic placeholder so the card is never blank.
        cover_url = cover_artwork(title, seed=book_slug, glyph="book")

    # ── Optional external file (Google Drive / Dropbox / any https URL) ──
    file_url = _normalise_file_url(data.get("file_url") or data.get("pdf_url"))
    preview_url = _normalise_file_url(
        data.get("preview_url") or data.get("preview_pdf_url")
    )

    book = Book(
        seller_id=user.id,
        title=title,
        slug=book_slug,
        author=_clean(data.get("author"), _MAX_AUTHOR),
        publisher=_clean(data.get("publisher"), _MAX_PUBLISHER),
        isbn=_clean(data.get("isbn"), _MAX_ISBN),
        edition=_clean(data.get("edition"), _MAX_EDITION),
        language=(_clean(data.get("language"), 40) or "Hindi"),
        category=(_clean(data.get("category"), _MAX_CATEGORY) or "General"),
        pages=max(0, _safe_int(data.get("pages"), 0)),
        cover_url=cover_url,
        description=_clean(data.get("description"), _MAX_DESC),
        highlights=highlights,
        price=price,
        mrp=mrp,
        format=fmt,
        stock=max(0, _safe_int(data.get("stock"), 0)),
        status="published",
        pdf_url=file_url,
        pdf_name=_clean(data.get("file_name"), 255)
        or (f"{book_slug}.pdf" if file_url else None),
        preview_pdf_url=preview_url,
        is_free_download=bool(data.get("is_free_download")),
        preview_pages=max(0, _safe_int(data.get("preview_pages"), 0)),
    )
    db.session.add(book)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_book failed")
        return jsonify({"error": "Could not create book"}), 500

    return jsonify({"message": "Book listed", "item": book.to_dict()}), 201


@books_bp.put("/<int:book_id>")
@roles_required("teacher", "seller", "admin")
def update_book(book_id):
    """Update a book listing — owning seller or admin only."""
    book = Book.query.get_or_404(book_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if book.seller_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own listings"}), 403

    data = _json_body()
    if "title" in data:
        title = _clean(data.get("title"), _MAX_TITLE)
        if title:
            book.title = title
    for field, limit in (
        ("author", _MAX_AUTHOR),
        ("publisher", _MAX_PUBLISHER),
        ("isbn", _MAX_ISBN),
        ("edition", _MAX_EDITION),
        ("language", 40),
        ("category", _MAX_CATEGORY),
        ("cover_url", _MAX_URL),
        ("description", _MAX_DESC),
    ):
        if field in data:
            setattr(book, field, _clean(data.get(field), limit))
    if "format" in data:
        fmt = str(data.get("format") or "").strip().lower()[:32]
        if fmt in _VALID_FORMATS:
            book.format = fmt
    if "price" in data:
        book.price = max(0.0, _safe_float(data.get("price"), book.price))
    if "mrp" in data:
        book.mrp = max(0.0, _safe_float(data.get("mrp"), book.mrp))
    if "pages" in data:
        book.pages = max(0, _safe_int(data.get("pages"), book.pages))
    if "stock" in data:
        book.stock = max(0, _safe_int(data.get("stock"), book.stock))
    if "highlights" in data:
        highlights = data.get("highlights")
        if isinstance(highlights, list):
            highlights = "\n".join(str(h)[:200] for h in highlights[:12])
        elif highlights is not None:
            highlights = str(highlights)[:3000]
        else:
            highlights = None
        book.highlights = highlights
    if "is_active" in data:
        book.is_active = bool(data.get("is_active"))
    if "is_featured" in data and user.role == "admin":
        book.is_featured = bool(data.get("is_featured"))
    if "status" in data and user.role == "admin":
        status = str(data.get("status") or "").strip().lower()[:32]
        if status in ("draft", "published", "rejected", "pending"):
            book.status = status

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_book id=%s failed", book_id)
        return jsonify({"error": "Could not update book"}), 500

    return jsonify({"message": "Book updated", "item": book.to_dict()})


@books_bp.delete("/<int:book_id>")
@roles_required("teacher", "seller", "admin")
def delete_book(book_id):
    book = Book.query.get_or_404(book_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if book.seller_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only delete your own listings"}), 403

    db.session.delete(book)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("delete_book id=%s failed", book_id)
        return jsonify({"error": "Could not delete book"}), 500
    return jsonify({"message": "Book removed"})


@books_bp.post("/<int:book_id>/chapters")
@roles_required("teacher", "seller", "admin")
def create_book_chapter(book_id):
    """Append an entry to a book's table of contents."""
    book = Book.query.get_or_404(book_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if book.seller_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own listings"}), 403

    data = _json_body()
    title = _clean(data.get("title"), _MAX_TITLE)
    if not title:
        return jsonify({"error": "title is required"}), 400

    last = (
        BookChapter.query.filter_by(book_id=book.id)
        .order_by(BookChapter.sort_order.desc())
        .first()
    )
    chapter = BookChapter(
        book_id=book.id,
        title=title,
        page_start=_safe_int(data.get("page_start"), 0) or None,
        page_end=_safe_int(data.get("page_end"), 0) or None,
        preview_text=_clean(data.get("preview_text"), 4000),
        sort_order=(last.sort_order + 1) if last else 1,
    )
    db.session.add(chapter)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_book_chapter failed book=%s", book_id)
        return jsonify({"error": "Could not add chapter"}), 500

    return jsonify({"message": "Chapter added", "item": chapter.to_dict()}), 201


__all__ = ["books_bp"]


# ===========================================================================
# Digital edition — PDF upload, free sample, paid download
# ===========================================================================
@books_bp.post("/<int:book_id>/pdf")
@roles_required("teacher", "seller", "admin")
def upload_book_pdf(book_id: int):
    """Attach the e-book PDF to a listing (owning seller / teacher / admin only).

    Multipart: ``file`` (the PDF) plus optional form fields
    ``is_free_download=true`` and ``price=…``.
    """
    from app.services.storage import save_upload

    book = db.session.get(Book, book_id)
    if book is None or not book.is_active:
        return jsonify({"error": "Book not found"}), 404

    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if (user.role or "") != "admin" and int(book.seller_id) != int(user.id):
        return jsonify({"error": "You can only add files to your own listing"}), 403

    # Multipart form, but tolerate a JSON body carrying an already-uploaded URL
    body = _json_body()
    file = request.files.get("file")
    if file is not None and file.filename:
        info, error = save_upload(file, kind="pdf", folder="books")
        if error:
            return jsonify({"error": error}), 400
        book.pdf_url = info["url"]
        book.pdf_name = info["file_name"]
        book.pdf_size_bytes = int(info["size_bytes"])
    else:
        url = _normalise_file_url(body.get("pdf_url") or body.get("file_url"))
        if not url:
            return (
                jsonify(
                    {
                        "error": "Upload a PDF file or supply a valid https file link",
                        "code": "invalid_file_url",
                    }
                ),
                400,
            )
        book.pdf_url = url
        book.pdf_name = _clean(body.get("pdf_name"), 255) or "book.pdf"

    # A PDF-only listing is an e-book by definition
    if (book.format or "") not in ("ebook", "pdf"):
        book.format = "pdf"

    if "is_free_download" in request.form:
        book.is_free_download = str(request.form.get("is_free_download")).lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
    elif "is_free_download" in body:
        book.is_free_download = bool(body.get("is_free_download"))

    if "price" in request.form:
        try:
            book.price = max(0.0, float(request.form.get("price") or 0))
        except (TypeError, ValueError):
            pass
    elif "price" in body:
        book.price = max(0.0, _safe_float(body.get("price"), book.price))

    db.session.commit()
    return jsonify(
        {
            "message": "PDF attached" + (" — free to download" if book.is_free_download else ""),
            "item": book.to_dict(),
        }
    ), 201


@books_bp.post("/<int:book_id>/preview-pdf")
@roles_required("teacher", "seller", "admin")
def upload_book_preview_pdf(book_id: int):
    """Attach a free sample PDF (the seller's marketing hook)."""
    from app.services.storage import save_upload

    book = db.session.get(Book, book_id)
    if book is None or not book.is_active:
        return jsonify({"error": "Book not found"}), 404

    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if (user.role or "") != "admin" and int(book.seller_id) != int(user.id):
        return jsonify({"error": "You can only add files to your own listing"}), 403

    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "A sample PDF file is required"}), 400

    info, error = save_upload(file, kind="pdf", folder="previews")
    if error:
        return jsonify({"error": error}), 400

    book.preview_pdf_url = info["url"]
    try:
        book.preview_pages = max(0, int(request.form.get("preview_pages") or 0))
    except (TypeError, ValueError):
        book.preview_pages = 0

    db.session.commit()
    return jsonify({"message": "Sample PDF attached", "item": book.to_dict()}), 201


@books_bp.get("/<int:book_id>/download")
def download_book_pdf(book_id: int):
    """Hand out the e-book PDF.

    Three ways in:
      * the book is marked free to download — anybody may take it,
      * the caller owns the listing (or is an admin) — always allowed,
      * the caller has a paid order for this book.

    Everything else is a 402 so the frontend can show "Buy to read".
    """
    book = db.session.get(Book, book_id)
    if book is None or not book.is_active:
        return jsonify({"error": "Book not found"}), 404
    if not book.pdf_url:
        return jsonify({"error": "This listing has no digital edition"}), 404

    user = get_current_user()
    is_owner = user is not None and (
        (user.role or "") == "admin" or int(book.seller_id) == int(user.id)
    )

    from app.models.order import Order, OrderItem

    has_purchased = False
    if user is not None:
        has_purchased = (
            db.session.query(OrderItem.id)
            .join(Order, Order.id == OrderItem.order_id)
            .filter(
                OrderItem.item_type == "book",
                OrderItem.item_id == book.id,
                Order.user_id == user.id,
                Order.status.in_(("paid", "completed", "shipped", "delivered")),
            )
            .first()
            is not None
        )

    if not (book.is_free_download or is_owner or has_purchased):
        return (
            jsonify(
                {
                    "error": "Purchase this e-book to download the PDF",
                    "code": "payment_required",
                    "preview_available": bool(book.preview_pdf_url),
                }
            ),
            402,
        )

    book.download_count = int(book.download_count or 0) + 1
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()

    return jsonify(
        {
            "message": "Here is your download",
            "url": book.pdf_url,
            "file_name": book.pdf_name or f"{book.slug}.pdf",
            "title": book.title,
            "free": bool(book.is_free_download),
        }
    )


@books_bp.get("/<int:book_id>/preview")
def preview_book_pdf(book_id: int):
    """Free sample PDF — public, no purchase required."""
    book = db.session.get(Book, book_id)
    if book is None or not book.is_active:
        return jsonify({"error": "Book not found"}), 404
    if not book.preview_pdf_url:
        return jsonify({"error": "No free sample for this title", "code": "no_preview"}), 404

    return jsonify(
        {
            "url": book.preview_pdf_url,
            "pages": int(book.preview_pages or 0),
            "title": book.title,
        }
    )
