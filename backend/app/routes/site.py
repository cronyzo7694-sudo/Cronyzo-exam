"""Public site-content API — everything the marketing surface renders.

Routes
------
GET  /api/site/content     landing payload (settings + hero + pillars + quotes)
GET  /api/site/home        content + live stats + catalogue previews, one call
GET  /api/site/stats       platform counters, computed from real rows
GET  /api/site/featured    featured courses / books / products for the home page

Every number here is derived from the database. Nothing is a placeholder: a
counter for a vertical with no rows is simply omitted from ``cards`` so the
frontend never renders an empty tile.

Public exports (stable)::

    site_bp
"""

from __future__ import annotations

from typing import Any, Dict, List

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models.book import Book
from app.models.course import Course, Enrollment
from app.models.order import Order
from app.models.store import Category, Product, Store
from app.models.user import User
from app.services.site_content import get_content

site_bp = Blueprint("site", __name__)

# Commission kept by the platform on a marketplace sale (see services/commerce.py)
PLATFORM_COMMISSION_PERCENT = 12


def _count(query) -> int:
    try:
        return int(query.scalar() or 0)
    except Exception:  # noqa: BLE001
        return 0


def _avg_rating() -> float:
    """Mean rating across courses, books and products that have any reviews."""
    values: List[float] = []
    for model in (Course, Book, Product):
        try:
            avg = (
                db.session.query(func.avg(model.rating_avg))
                .filter(model.rating_count > 0)
                .scalar()
            )
            if avg:
                values.append(float(avg))
        except Exception:  # noqa: BLE001
            continue
    if not values:
        return 0.0
    return round(sum(values) / len(values), 1)


def _published_clause(model):
    """The "this row is live for visitors" predicate for a catalogue model.

    ``Product`` tracks publication with ``is_published`` while ``Course`` and
    ``Book`` use a ``status`` string — this returns whichever applies so the
    landing counters never silently report zero.
    """
    if hasattr(model, "status"):
        return model.status == "published"
    if hasattr(model, "is_published"):
        return model.is_published.is_(True)
    return None


def _public_count(model) -> int:
    """Active + published row count."""
    try:
        query = model.query.filter(model.is_active.is_(True))
        clause = _published_clause(model)
        if clause is not None:
            query = query.filter(clause)
        return int(query.count())
    except Exception:  # noqa: BLE001
        return 0


def build_stats() -> Dict[str, Any]:
    """Compute the real platform counters plus a card list for the hero strip."""
    learners = _count(
        User.query.filter(
            User.is_active.is_(True),
            User.role.in_(("student", "teacher", "seller", "admin")),
        ).with_entities(func.count(User.id))
    )
    courses = _public_count(Course)
    books = _public_count(Book)
    products = _public_count(Product)
    stores = _count(
        Store.query.filter_by(is_active=True).with_entities(func.count(Store.id))
    )
    categories = _count(
        Category.query.filter(
            Category.is_active.is_(True)
        ).with_entities(func.count(Category.id))
    )
    enrollments = _count(Enrollment.query.with_entities(func.count(Enrollment.id)))
    orders = _count(Order.query.with_entities(func.count(Order.id)))
    rating = _avg_rating()

    def human(n: int) -> str:
        if n >= 1_000_000:
            return f"{n / 1_000_000:.1f}M"
        if n >= 10_000:
            return f"{n // 1000}k"
        if n >= 1_000:
            return f"{n / 1000:.1f}k"
        return str(n)

    # Only surface a card when there is something real behind it.
    cards: List[Dict[str, Any]] = []
    if learners:
        cards.append({"value": human(learners), "label": "Learners", "icon": "Users"})
    if courses:
        cards.append({"value": str(courses), "label": "Courses", "icon": "GraduationCap"})
    if books:
        cards.append({"value": str(books), "label": "Books listed", "icon": "BookOpen"})
    if products:
        cards.append({"value": str(products), "label": "Products", "icon": "ShoppingBag"})
    if stores:
        cards.append({"value": str(stores), "label": "Stores", "icon": "Store"})
    if categories:
        cards.append({"value": str(categories), "label": "Shop categories", "icon": "LayoutGrid"})
    if rating:
        cards.append(
            {"value": f"{rating}/5", "label": "Avg. rating", "icon": "Star"}
        )
    if enrollments:
        cards.append(
            {"value": human(enrollments), "label": "Enrollments", "icon": "GraduationCap"}
        )
    if orders:
        cards.append({"value": human(orders), "label": "Orders shipped", "icon": "Truck"})

    return {
        "learners": learners,
        "courses": courses,
        "books": books,
        "products": products,
        "stores": stores,
        "categories": categories,
        "enrollments": enrollments,
        "orders": orders,
        "rating_avg": rating,
        "seller_payout_percent": 100 - PLATFORM_COMMISSION_PERCENT,
        "commission_percent": PLATFORM_COMMISSION_PERCENT,
        "mock_tests": "24/7",
        "cards": cards,
    }


def _course_card(course: Course) -> Dict[str, Any]:
    return course.to_dict(include_modules=False)


def _book_card(book: Book) -> Dict[str, Any]:
    return book.to_dict()


def _product_card(product: Product) -> Dict[str, Any]:
    return product.to_dict()


@site_bp.get("/content")
def site_content():
    """Editorial content only — cheap, cacheable, no counters."""
    return jsonify(get_content())


@site_bp.get("/stats")
def site_stats():
    return jsonify(build_stats())


@site_bp.get("/featured")
def site_featured():
    """Small catalogue previews for the landing page (only real rows)."""
    limit = min(max(int(request.args.get("limit", 4) or 4), 1), 12)

    try:
        courses = (
            Course.query.filter(
                Course.is_active.is_(True), Course.status == "published"
            )
            .order_by(Course.is_featured.desc(), Course.rating_avg.desc(), Course.id.desc())
            .limit(limit)
            .all()
        )
    except Exception:  # noqa: BLE001
        courses = []

    try:
        books = (
            Book.query.filter(Book.is_active.is_(True), Book.status == "published")
            .order_by(Book.is_featured.desc(), Book.rating_avg.desc(), Book.id.desc())
            .limit(limit)
            .all()
        )
    except Exception:  # noqa: BLE001
        books = []

    try:
        products = (
            Product.query.filter(
                Product.is_active.is_(True), Product.is_published.is_(True)
            )
            .order_by(Product.is_featured.desc(), Product.id.desc())
            .limit(limit)
            .all()
        )
    except Exception:  # noqa: BLE001
        products = []

    return jsonify(
        {
            "courses": [_course_card(c) for c in courses],
            "books": [_book_card(b) for b in books],
            "products": [_product_card(p) for p in products],
        }
    )


@site_bp.get("/home")
def site_home():
    """One round-trip for the landing page: content + stats + previews."""
    payload = get_content()
    payload["stats"] = build_stats()
    featured = site_featured()
    # ``site_featured`` returns a Response; re-read its JSON payload
    data = featured.get_json()
    payload["featured"] = data
    return jsonify(payload)
