"""Reviews: read, write, and moderate.

Public
    ``GET  /api/reviews/site``          landing-page wall (hidden excluded)
    ``GET  /api/reviews/book/<id>``     a book's reviews + its average
Product/course reviews keep their existing routes in ``shop``/``courses``;
this blueprint adds books and the site itself, plus one moderation surface for
all three.

Signed in
    ``POST /api/reviews/site``          write / update your own site review
    ``POST /api/reviews/book/<id>``     write / update your book review
    ``GET  /api/reviews/mine``          what you already wrote

Admin
    ``GET    /api/reviews/admin``              every review, hidden ones too
    ``PATCH  /api/reviews/admin/<id>``         hide / unhide
    ``DELETE /api/reviews/admin/<id>``         delete
    ``PATCH  /api/reviews/admin/product/<id>`` hide/unhide a product review
    ``DELETE /api/reviews/admin/product/<id>`` delete a product review
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.book import Book
from app.models.review import Review
from app.models.store import ProductReview
from app.utils.decorators import get_current_user, roles_required

logger = logging.getLogger("cronyzo.reviews")

reviews_bp = Blueprint("reviews", __name__)

MAX_BODY = 3000
MAX_TITLE = 120


def _body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _clean(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] or None


def _rating(value: Any) -> int:
    try:
        return max(1, min(5, int(value)))
    except (TypeError, ValueError):
        return 5


def _recompute_book(book: Book) -> None:
    """Average only the reviews the public can actually see."""
    row = (
        db.session.query(db.func.avg(Review.rating), db.func.count(Review.id))
        .filter(
            Review.target_type == "book",
            Review.target_id == book.id,
            Review.is_hidden.is_(False),
        )
        .one()
    )
    book.rating_avg = round(float(row[0] or 0.0), 2)
    book.rating_count = int(row[1] or 0)


def _summary(items) -> Dict[str, Any]:
    ratings = [i.rating for i in items if i.rating]
    total = len(ratings)
    average = round(sum(ratings) / total, 2) if total else 0.0
    buckets = {star: 0 for star in range(1, 6)}
    for value in ratings:
        buckets[max(1, min(5, int(value)))] += 1
    return {"average": average, "count": total, "buckets": buckets}


# ══════════════════════════════════════════════════════════════════════
# Public reads
# ══════════════════════════════════════════════════════════════════════


@reviews_bp.get("/site")
def site_reviews():
    """Real testimonials for the landing page — empty stays empty."""
    limit = min(24, max(1, int(request.args.get("limit", 9) or 9)))
    rows = (
        Review.query.filter_by(target_type="site", is_hidden=False)
        .order_by(Review.created_at.desc())
        .limit(limit)
        .all()
    )
    counts = (
        db.session.query(db.func.avg(Review.rating), db.func.count(Review.id))
        .filter(Review.target_type == "site", Review.is_hidden.is_(False))
        .one()
    )
    return jsonify(
        {
            "items": [r.to_dict() for r in rows],
            "total": int(counts[1] or 0),
            "average": round(float(counts[0] or 0), 2),
        }
    )


@reviews_bp.get("/book/<int:book_id>")
def book_reviews(book_id: int):
    book = db.session.get(Book, book_id)
    if book is None:
        return jsonify({"error": "Book not found"}), 404
    rows = (
        Review.query.filter_by(target_type="book", target_id=book_id, is_hidden=False)
        .order_by(Review.created_at.desc())
        .limit(100)
        .all()
    )
    return jsonify(
        {
            "items": [r.to_dict() for r in rows],
            "summary": _summary(rows),
            "total": len(rows),
        }
    )


@reviews_bp.get("/mine")
@jwt_required()
def my_reviews():
    user = get_current_user()
    if user is None:
        return jsonify({"items": []})
    target_type = (request.args.get("target_type") or "").strip()
    query = Review.query.filter_by(user_id=user.id)
    if target_type:
        query = query.filter_by(target_type=target_type)
    if request.args.get("target_id"):
        try:
            query = query.filter_by(target_id=int(request.args["target_id"]))
        except ValueError:
            pass
    rows = query.order_by(Review.created_at.desc()).limit(50).all()
    return jsonify({"items": [r.to_dict() for r in rows]})


# ══════════════════════════════════════════════════════════════════════
# Writes
# ══════════════════════════════════════════════════════════════════════


def _upsert(target_type: str, target_id: Optional[int]) -> Tuple[Optional[Dict[str, Any]], int]:
    user = get_current_user()
    if user is None:
        return {"error": "Sign in to write a review"}, 401

    data = _body()
    if not (_clean(data.get("body"), MAX_BODY) or "").strip():
        return {"error": "Please write something — your words are what people read"}, 400

    review = Review.query.filter_by(
        user_id=user.id, target_type=target_type, target_id=target_id
    ).first()
    created = review is None
    if review is None:
        review = Review(user_id=user.id, target_type=target_type, target_id=target_id)
        db.session.add(review)

    review.rating = _rating(data.get("rating"))
    review.title = _clean(data.get("title"), MAX_TITLE)
    review.body = _clean(data.get("body"), MAX_BODY)
    review.is_verified = True
    # A person editing their own review clears any earlier moderation flag.
    review.is_hidden = False

    book = None
    if target_type == "book" and target_id:
        book = db.session.get(Book, target_id)
        if book is None:
            db.session.rollback()
            return {"error": "Book not found"}, 404

    try:
        db.session.flush()
        if book is not None:
            _recompute_book(book)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("review save failed %s:%s", target_type, target_id)
        return {"error": "Could not save your review"}, 500

    logger.info("review %s %s:%s user=%s", "created" if created else "updated", target_type, target_id, user.id)
    return (
        {
            "message": "Thanks — your review is live" if created else "Your review is updated",
            "item": review.to_dict(),
            "created": created,
        },
        201 if created else 200,
    )


@reviews_bp.post("/site")
@jwt_required()
def create_site_review():
    payload, status = _upsert("site", None)
    return jsonify(payload), status


@reviews_bp.post("/book/<int:book_id>")
@jwt_required()
def create_book_review(book_id: int):
    payload, status = _upsert("book", book_id)
    if status in (200, 201):
        book = db.session.get(Book, book_id)
        if book is not None:
            payload["book"] = {
                "rating_avg": round(float(book.rating_avg or 0), 2),
                "rating_count": int(book.rating_count or 0),
            }
    return jsonify(payload), status


# ══════════════════════════════════════════════════════════════════════
# Admin moderation
# ══════════════════════════════════════════════════════════════════════


@reviews_bp.get("/admin")
@roles_required("admin")
def admin_list_reviews():
    target = (request.args.get("target_type") or "").strip()
    query = Review.query.order_by(Review.created_at.desc())
    if target:
        query = query.filter_by(target_type=target)
    rows = query.limit(200).all()
    book_ids = {r.target_id for r in rows if r.target_type == "book" and r.target_id}
    titles = {
        b.id: b.title for b in Book.query.filter(Book.id.in_(book_ids)).all()
    } if book_ids else {}
    items = []
    for review in rows:
        data = review.to_dict(include_moderation=True)
        if review.target_type == "book":
            data["book_title"] = titles.get(review.target_id)
        items.append(data)
    hidden = sum(1 for r in rows if r.is_hidden)
    return jsonify({"items": items, "total": len(rows), "hidden": hidden})


@reviews_bp.patch("/admin/<int:review_id>")
@roles_required("admin")
def admin_update_review(review_id: int):
    review = db.session.get(Review, review_id)
    if review is None:
        return jsonify({"error": "Not found"}), 404

    data = _body()
    if "is_hidden" in data:
        review.is_hidden = bool(data["is_hidden"])
    if "body" in data:
        review.body = _clean(data.get("body"), MAX_BODY)
    if "rating" in data:
        review.rating = _rating(data.get("rating"))

    if review.target_type == "book" and review.target_id:
        book = db.session.get(Book, review.target_id)
        if book is not None:
            try:
                db.session.flush()
                _recompute_book(book)
            except Exception:  # noqa: BLE001
                db.session.rollback()
                return jsonify({"error": "Could not update"}), 500

    db.session.commit()
    return jsonify({"message": "Review updated", "item": review.to_dict(include_moderation=True)})


@reviews_bp.delete("/admin/<int:review_id>")
@roles_required("admin")
def admin_delete_review(review_id: int):
    review = db.session.get(Review, review_id)
    if review is None:
        return jsonify({"error": "Not found"}), 404

    book = None
    if review.target_type == "book" and review.target_id:
        book = db.session.get(Book, review.target_id)

    db.session.delete(review)
    try:
        db.session.flush()
        if book is not None:
            _recompute_book(book)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        return jsonify({"error": "Could not delete"}), 500
    return jsonify({"deleted": True, "id": review_id})


@reviews_bp.get("/admin/product")
@roles_required("admin")
def admin_list_product_reviews():
    rows = ProductReview.query.order_by(ProductReview.created_at.desc()).limit(200).all()
    return jsonify({"items": [r.to_dict() | {"is_hidden": False} for r in rows], "total": len(rows)})


@reviews_bp.delete("/admin/product/<int:review_id>")
@roles_required("admin")
def admin_delete_product_review(review_id: int):
    review = db.session.get(ProductReview, review_id)
    if review is None:
        return jsonify({"error": "Not found"}), 404
    product = review.product
    db.session.delete(review)
    db.session.flush()
    if product is not None:
        from app.routes.shop import _recompute_product_rating

        _recompute_product_rating(product)
    db.session.commit()
    return jsonify({"deleted": True, "id": review_id})
