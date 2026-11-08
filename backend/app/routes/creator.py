"""Creator routes — storefronts, seller onboarding, earnings, public profiles.

Stable endpoints under ``/api/creator``::

    POST /api/creator/become-creator    upgrade the account to teacher/seller
    GET  /api/creator/dashboard         the caller's catalog + earnings summary
    GET  /api/creator/earnings          per-item earnings breakdown

Stable endpoints under ``/api/stores``::

    GET  /api/stores                    public storefront list
    GET  /api/stores/<slug>             storefront detail with its catalog
    POST /api/stores                    create a storefront
    PUT  /api/stores/<int:store_id>     update a storefront

Stable endpoints under ``/api/profiles``::

    GET  /api/profiles/<int:user_id>    public creator profile
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Final, List, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.book import Book
from app.models.course import Course
from app.models.order import Order, OrderItem
from app.models.store import Category, Product, Store
from app.models.user import User
from app.services.commerce import DEFAULT_COMMISSION_PERCENT, seller_earnings
from app.utils.decorators import get_current_user, roles_required
from app.utils.tokens import issue_tokens
from app.utils.slugify import unique_slug
from app.utils.validators import parse_pagination

creator_bp = Blueprint("creator", __name__)
stores_bp = Blueprint("stores", __name__)
profiles_bp = Blueprint("profiles", __name__)
logger = logging.getLogger("cronyzo.routes.creator")

_MAX_NAME: Final[int] = 150
_MAX_SHORT: Final[int] = 255
_MAX_DESC: Final[int] = 20000
_MAX_URL: Final[int] = 512
_MAX_CITY: Final[int] = 120

_VALID_CREATOR_TYPES = ("teacher", "seller", "both")


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _clean(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------
@creator_bp.post("/become-creator")
@jwt_required()
def become_creator():
    """
    Upgrade the caller's account to a teacher, a seller, or both.

    Idempotent — calling it twice does not downgrade an existing teacher.
    """
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    data = _json_body()
    creator_type = (str(data.get("creator_type") or "seller").strip().lower())[:32]
    if creator_type not in _VALID_CREATOR_TYPES:
        creator_type = "seller"

    # Never downgrade an admin or an existing creator's other capability
    if user.role == "admin":
        user.creator_type = user.creator_type or creator_type
    elif user.role in ("teacher", "seller"):
        if user.creator_type != creator_type:
            user.creator_type = "both"
        # role stays as-is; a seller keeps the seller role
    else:
        user.role = "teacher" if creator_type == "teacher" else "seller"
        user.creator_type = creator_type

    if "headline" in data:
        user.headline = _clean(data.get("headline"), _MAX_SHORT)
    if "bio" in data:
        user.bio = _clean(data.get("bio"), _MAX_DESC)
    if "city" in data:
        user.city = _clean(data.get("city"), _MAX_CITY)
    if "expertise" in data:
        raw = data.get("expertise")
        if isinstance(raw, list):
            user.expertise = ", ".join(str(e)[:60] for e in raw[:10])
        else:
            user.expertise = _clean(raw, _MAX_SHORT)
    if "qualifications" in data:
        user.qualifications = _clean(data.get("qualifications"), _MAX_SHORT)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("become_creator failed user=%s", user.id)
        return jsonify({"error": "Could not update profile"}), 500

    # Re-issue the session so the client's token carries the new role.
    # (Authorisation itself resolves the live role, but a stale claim would
    # still make the UI show the wrong capabilities until the next login.)
    access, refresh = issue_tokens(user)
    return jsonify({
        "message": "Creator profile updated",
        "user": user.to_dict(),
        "access_token": access,
        "refresh_token": refresh,
    })


# ---------------------------------------------------------------------------
# Seller dashboard
# ---------------------------------------------------------------------------
@creator_bp.get("/dashboard")
@jwt_required()
def creator_dashboard():
    """
    Everything the signed-in creator needs in one shot: their catalog counts,
    revenue split, recent sales and top performers.
    """
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    courses = Course.query.filter_by(teacher_id=user.id).all()
    books = Book.query.filter_by(seller_id=user.id).all()
    products = Product.query.filter_by(seller_id=user.id, is_active=True).all()

    # --- revenue ----------------------------------------------------------
    try:
        rows = (
            db.session.query(OrderItem, Order)
            .join(Order, OrderItem.order_id == Order.id)
            .filter(
                OrderItem.seller_id == user.id,
                Order.payment_status == "paid",
                Order.status != "cancelled",
            )
            .all()
        )
    except Exception:  # noqa: BLE001
        logger.exception("creator_dashboard: revenue query failed")
        rows = []

    gross = 0.0
    unit_count = 0
    order_numbers = set()
    per_item: Dict[str, Dict[str, Any]] = {}

    for item, order in rows:
        line_total = float(item.line_total or 0.0)
        gross += line_total
        unit_count += int(item.qty or 0)
        order_numbers.add(order.order_number)

        key = f"{item.item_type}:{item.item_id}"
        slot = per_item.setdefault(
            key,
            {
                "item_type": item.item_type,
                "item_id": item.item_id,
                "title": item.title,
                "units": 0,
                "revenue": 0.0,
            },
        )
        slot["units"] += int(item.qty or 0)
        slot["revenue"] = round(slot["revenue"] + line_total, 2)

    split = seller_earnings(gross, DEFAULT_COMMISSION_PERCENT)
    top_items = sorted(per_item.values(), key=lambda i: i["revenue"], reverse=True)[:8]

    recent = [
        {
            "order_number": order.order_number,
            "title": item.title,
            "item_type": item.item_type,
            "qty": int(item.qty or 0),
            "line_total": float(item.line_total or 0.0),
            "status": order.status,
            "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        }
        for item, order in sorted(
            rows, key=lambda r: (r[1].placed_at or r[1].created_at), reverse=True
        )[:10]
    ]

    return jsonify(
        {
            "role": user.role,
            "creator_type": user.creator_type,
            "profile": user.to_dict(),
            "counts": {
                "courses": len(courses),
                "books": len(books),
                "products": len(products),
                "published_courses": len([c for c in courses if c.status == "published"]),
                "students": sum(int(c.student_count or 0) for c in courses),
            },
            "earnings": {
                **split,
                "orders": len(order_numbers),
                "units": unit_count,
                "currency": "INR",
            },
            "top_items": top_items,
            "recent_sales": recent,
        }
    )


@creator_bp.get("/earnings")
@jwt_required()
def creator_earnings():
    """Detailed earnings breakdown for the signed-in creator."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    try:
        rows = (
            db.session.query(OrderItem, Order)
            .join(Order, OrderItem.order_id == Order.id)
            .filter(
                OrderItem.seller_id == user.id,
                Order.payment_status == "paid",
                Order.status != "cancelled",
            )
            .order_by(Order.placed_at.desc())
            .limit(200)
            .all()
        )
    except Exception:  # noqa: BLE001
        logger.exception("creator_earnings query failed")
        rows = []

    total_gross = 0.0
    commission = 0.0
    entries: List[Dict[str, Any]] = []
    for item, order in rows:
        line_total = float(item.line_total or 0.0)
        total_gross += line_total
        split = seller_earnings(line_total, DEFAULT_COMMISSION_PERCENT)
        commission += split["commission"]
        entries.append(
            {
                "order_number": order.order_number,
                "title": item.title,
                "item_type": item.item_type,
                "qty": int(item.qty or 0),
                "gross": line_total,
                "commission": split["commission"],
                "payout": split["payout"],
                "status": order.status,
                "placed_at": order.placed_at.isoformat() if order.placed_at else None,
            }
        )

    payout = round(total_gross - commission, 2)
    return jsonify(
        {
            "gross": round(total_gross, 2),
            "commission": round(commission, 2),
            "payout": payout,
            "commission_percent": DEFAULT_COMMISSION_PERCENT,
            "currency": "INR",
            "entries": entries,
            "total": len(entries),
        }
    )


# ---------------------------------------------------------------------------
# Stores
# ---------------------------------------------------------------------------
@stores_bp.get("")
def list_stores():
    """Public list of storefronts."""
    page, per_page = parse_pagination(request.args)
    q = Store.query.filter_by(is_active=True, status="approved")

    search = (request.args.get("search") or "").strip()[:120]
    if search:
        like = f"%{_escape_like(search)}%"
        q = q.filter(
            db.or_(
                Store.name.ilike(like, escape="\\"),
                Store.tagline.ilike(like, escape="\\"),
            )
        )

    total = q.count()
    rows = q.order_by(Store.rating_avg.desc(), Store.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return jsonify(
        {
            "items": [s.to_dict() for s in rows],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page else 1,
        }
    )


@stores_bp.get("/<slug>")
def get_store(slug):
    """Storefront detail plus a sample of its catalog."""
    store = Store.query.filter_by(slug=slug).first()
    if store is None or not store.is_active:
        return jsonify({"error": "Store not found"}), 404

    data = store.to_dict()
    try:
        products = (
            Product.query.filter_by(store_id=store.id, is_active=True)
            .order_by(Product.sold_count.desc())
            .limit(12)
            .all()
        )
        data["products"] = [p.to_dict(include_seller=False) for p in products]
    except Exception:  # noqa: BLE001
        data["products"] = []

    if store.owner is not None:
        data["owner"] = {
            "id": store.owner.id,
            "full_name": store.owner.full_name,
            "avatar_url": store.owner.avatar_url,
            "headline": store.owner.headline,
        }
    return jsonify(data)


@stores_bp.post("")
@jwt_required()
def create_store():
    """Create a storefront for the signed-in seller."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if user.role not in ("seller", "teacher", "admin"):
        return jsonify({"error": "Become a seller first to open a storefront"}), 403

    data = _json_body()
    name = _clean(data.get("name"), _MAX_NAME)
    if not name:
        return jsonify({"error": "name is required"}), 400

    store = Store(
        owner_id=user.id,
        name=name,
        slug=unique_slug(Store, name),
        tagline=_clean(data.get("tagline"), _MAX_SHORT),
        description=_clean(data.get("description"), _MAX_DESC),
        logo_url=_clean(data.get("logo_url"), _MAX_URL),
        banner_url=_clean(data.get("banner_url"), _MAX_URL),
        city=_clean(data.get("city"), _MAX_CITY),
        phone=_clean(data.get("phone"), 32),
        email=_clean(data.get("email"), 255),
        status="approved",
    )
    db.session.add(store)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_store failed user=%s", user.id)
        return jsonify({"error": "Could not create storefront"}), 500

    return jsonify({"message": "Storefront created", "item": store.to_dict()}), 201


@stores_bp.put("/<int:store_id>")
@jwt_required()
def update_store(store_id):
    """Update a storefront — owner or admin only."""
    store = Store.query.get_or_404(store_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if store.owner_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own storefront"}), 403

    data = _json_body()
    if "name" in data:
        name = _clean(data.get("name"), _MAX_NAME)
        if name:
            store.name = name
    for field, limit in (
        ("tagline", _MAX_SHORT),
        ("description", _MAX_DESC),
        ("logo_url", _MAX_URL),
        ("banner_url", _MAX_URL),
        ("city", _MAX_CITY),
        ("phone", 32),
        ("email", 255),
    ):
        if field in data:
            setattr(store, field, _clean(data.get(field), limit))
    if "status" in data and user.role == "admin":
        status = str(data.get("status") or "").strip().lower()[:32]
        if status in ("pending", "approved", "rejected"):
            store.status = status
    if "is_active" in data and user.role == "admin":
        store.is_active = bool(data.get("is_active"))

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_store id=%s failed", store_id)
        return jsonify({"error": "Could not update storefront"}), 500

    return jsonify({"message": "Storefront updated", "item": store.to_dict()})


# ---------------------------------------------------------------------------
# Public creator profile
# ---------------------------------------------------------------------------
@profiles_bp.get("/<int:user_id>")
def public_profile(user_id):
    """Public profile for a teacher or seller, with their published work."""
    user = User.query.get(user_id)
    if user is None:
        return jsonify({"error": "Profile not found"}), 404

    courses = (
        Course.query.filter_by(teacher_id=user.id, status="published", is_active=True)
        .order_by(Course.student_count.desc())
        .all()
    )
    books = (
        Book.query.filter_by(seller_id=user.id, status="published", is_active=True)
        .order_by(Book.sold_count.desc())
        .all()
    )
    products = (
        Product.query.filter_by(seller_id=user.id, is_active=True)
        .order_by(Product.sold_count.desc())
        .limit(12)
        .all()
    )

    total_students = sum(int(c.student_count or 0) for c in courses)
    total_sold = sum(int(b.sold_count or 0) for b in books) + sum(
        int(p.sold_count or 0) for p in products
    )

    return jsonify(
        {
            "user": {
                "id": user.id,
                "full_name": user.full_name,
                "avatar_url": user.avatar_url,
                "headline": user.headline,
                "bio": user.bio,
                "city": user.city,
                "expertise": user.expertise_list(),
                "qualifications": user.qualifications,
                "creator_type": user.creator_type,
                "is_verified": bool(user.is_verified),
                "role": user.role,
                "joined_at": user.created_at.isoformat() if user.created_at else None,
            },
            "stats": {
                "courses": len(courses),
                "books": len(books),
                "products": len(products),
                "students": total_students,
                "sold": total_sold,
            },
            "courses": [c.to_dict() for c in courses],
            "books": [b.to_dict() for b in books],
            "products": [p.to_dict(include_seller=False) for p in products],
        }
    )


__all__ = ["creator_bp", "stores_bp", "profiles_bp"]
