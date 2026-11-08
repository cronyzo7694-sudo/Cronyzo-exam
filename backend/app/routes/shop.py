"""Shop routes — product catalog, categories, cart, wishlist, addresses.

Stable endpoints under ``/api/shop``::

    GET    /api/shop/products              public catalog
    GET    /api/shop/products/<slug>       product detail
    GET    /api/shop/categories            category list
    GET    /api/shop/stats                 marketplace counters
    POST   /api/shop/products              seller lists a product
    PUT    /api/shop/products/<int:id>     seller updates own product
    DELETE /api/shop/products/<int:id>     seller removes own product
    POST   /api/shop/products/<int:id>/reviews     buyer review
    GET    /api/shop/products/<int:id>/reviews     reviews list
    POST   /api/shop/products/<int:id>/like        wishlist toggle

Buyer-scoped endpoints under ``/api/cart`` and ``/api/account``::

    GET    /api/cart                    current cart
    POST   /api/cart                    add item
    PATCH  /api/cart/<int:item_id>      update quantity
    DELETE /api/cart/<int:item_id>      remove item
    DELETE /api/cart                    empty cart
    GET    /api/account/addresses       saved addresses
    POST   /api/account/addresses       add address
    DELETE /api/account/addresses/<int:id>  delete address
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Final, List, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.store import (
    Address,
    CartItem,
    Category,
    Product,
    ProductReview,
    Store,
    WishlistItem,
)
from app.models.user import User
from app.services.media import product_artwork
from app.utils.decorators import get_current_user, roles_required
from app.utils.slugify import unique_slug
from app.utils.validators import parse_pagination

shop_bp = Blueprint("shop", __name__)
cart_bp = Blueprint("cart", __name__)
account_bp = Blueprint("account", __name__)
logger = logging.getLogger("cronyzo.routes.shop")

_MAX_TITLE: Final[int] = 220
_MAX_DESC: Final[int] = 20000
_MAX_BRAND: Final[int] = 120
_MAX_SKU: Final[int] = 80
_MAX_URL: Final[int] = 512
_MAX_SEARCH: Final[int] = 120
_MAX_CATEGORY: Final[int] = 120
_MAX_QTY: Final[int] = 99

_VALID_CONDITIONS = ("new", "like_new", "used", "refurbished")
_VALID_FULFILLMENT = ("physical", "digital")


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


def _gallery(data: Dict[str, Any]) -> Optional[str]:
    """Normalise a gallery payload into a JSON array string."""
    raw = data.get("gallery")
    if isinstance(raw, list):
        images = [str(i)[:_MAX_URL] for i in raw if isinstance(i, str) and i.strip()][:12]
        return json.dumps(images) if images else None
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except Exception:  # noqa: BLE001
            return None
        if isinstance(parsed, list):
            images = [str(i)[:_MAX_URL] for i in parsed if isinstance(i, str)][:12]
            return json.dumps(images) if images else None
    return None


def _recompute_product_rating(product: Product) -> None:
    agg = (
        db.session.query(
            db.func.avg(ProductReview.rating), db.func.count(ProductReview.id)
        )
        .filter(ProductReview.product_id == product.id)
        .one()
    )
    product.rating_avg = round(float(agg[0] or 0.0), 2)
    product.rating_count = int(agg[1] or 0)


# ---------------------------------------------------------------------------
# Public catalog
# ---------------------------------------------------------------------------
@shop_bp.get("/products")
def list_products():
    """Public product catalog — no auth required."""
    page, per_page = parse_pagination(request.args)
    q = Product.query.filter(Product.is_active.is_(True), Product.is_published.is_(True))

    # "mine=true" → the signed-in seller's own catalogue (Seller Studio).
    # Keeps is_active so soft-deleted listings stay hidden, but drops the
    # published-only filter so unpublished drafts remain visible to their owner.
    if (request.args.get("mine") or "").lower() in ("1", "true", "yes"):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        q = Product.query.filter(
            Product.seller_id == user.id,
            Product.is_active.is_(True),
        )

    search = (request.args.get("search") or "").strip()[:_MAX_SEARCH]
    if search:
        like = f"%{_escape_like(search)}%"
        q = q.filter(
            db.or_(
                Product.title.ilike(like, escape="\\"),
                Product.brand.ilike(like, escape="\\"),
                Product.description.ilike(like, escape="\\"),
            )
        )

    category = request.args.get("category_id")
    if category:
        cid = _safe_int(category, 0)
        if cid > 0:
            q = q.filter(Product.category_id == cid)

    category_slug = (request.args.get("category") or "").strip()[:_MAX_CATEGORY]
    if category_slug and category_slug.lower() != "all":
        cat = Category.query.filter_by(slug=category_slug).first()
        if cat is not None:
            q = q.filter(Product.category_id == cat.id)

    store_id = request.args.get("store_id")
    if store_id:
        sid = _safe_int(store_id, 0)
        if sid > 0:
            q = q.filter(Product.store_id == sid)

    if request.args.get("featured", "").lower() == "true":
        q = q.filter(Product.is_featured.is_(True))

    in_stock = request.args.get("in_stock")
    if in_stock and in_stock.lower() == "true":
        q = q.filter(Product.stock > 0)

    max_price = request.args.get("max_price")
    if max_price not in (None, ""):
        cap = _safe_float(max_price, -1.0)
        if cap >= 0:
            q = q.filter(Product.price <= cap)

    min_price = request.args.get("min_price")
    if min_price not in (None, ""):
        floor = _safe_float(min_price, -1.0)
        if floor >= 0:
            q = q.filter(Product.price >= floor)

    sort = (request.args.get("sort") or "popular").strip().lower()
    if sort == "price_low":
        q = q.order_by(Product.price.asc())
    elif sort == "price_high":
        q = q.order_by(Product.price.desc())
    elif sort == "rating":
        q = q.order_by(Product.rating_avg.desc(), Product.rating_count.desc())
    elif sort == "newest":
        q = q.order_by(Product.created_at.desc())
    elif sort == "discount":
        q = q.order_by(Product.mrp.desc())
    else:
        q = q.order_by(Product.sold_count.desc(), Product.rating_avg.desc())

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify(
        {
            "items": [p.to_dict() for p in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page else 1,
        }
    )


@shop_bp.get("/products/<slug>")
def get_product(slug):
    """Product detail with reviews and sibling products from the same store."""
    product = Product.query.filter_by(slug=slug).first()
    if product is None or not product.is_active:
        return jsonify({"error": "Product not found"}), 404

    data = product.to_dict()
    try:
        reviews = (
            ProductReview.query.filter_by(product_id=product.id)
            .order_by(ProductReview.created_at.desc())
            .limit(20)
            .all()
        )
        data["reviews"] = [r.to_dict() for r in reviews]
    except Exception:  # noqa: BLE001
        data["reviews"] = []

    if product.store_id:
        try:
            related = (
                Product.query.filter(
                    Product.store_id == product.store_id,
                    Product.id != product.id,
                    Product.is_active.is_(True),
                )
                .limit(4)
                .all()
            )
            data["related"] = [p.to_dict(include_seller=False) for p in related]
        except Exception:  # noqa: BLE001
            data["related"] = []

    return jsonify(data)


@shop_bp.get("/categories")
def list_categories():
    """Active catalog categories with live product counts."""
    rows = Category.query.filter_by(is_active=True).order_by(Category.sort_order, Category.name).all()
    return jsonify({"items": [c.to_dict(include_counts=True) for c in rows], "total": len(rows)})


@shop_bp.get("/stats")
def shop_stats():
    """Marketplace counters for the landing page."""
    try:
        products = Product.query.filter(
            Product.is_active.is_(True), Product.is_published.is_(True)
        ).count()
        stores = Store.query.filter_by(is_active=True).count()
        sellers = (
            db.session.query(db.func.count(db.distinct(Product.seller_id)))
            .filter(Product.is_active.is_(True))
            .scalar()
            or 0
        )
    except Exception:  # noqa: BLE001
        logger.exception("shop_stats failed")
        products = stores = sellers = 0
    return jsonify(
        {"products": int(products), "stores": int(stores), "sellers": int(sellers)}
    )


# ---------------------------------------------------------------------------
# Seller product management
# ---------------------------------------------------------------------------
@shop_bp.post("/products")
@jwt_required()
def create_product():
    """List a new product on the marketplace.

    Gated the same way books are: an approved shopkeeper account (or an admin).
    """
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    from app.models.seller import is_approved_seller

    if not is_approved_seller(user):
        return (
            jsonify(
                {
                    "error": "You need an approved shopkeeper account to list products.",
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

    price = max(0.0, _safe_float(data.get("price"), 0.0))
    mrp = max(0.0, _safe_float(data.get("mrp"), price))

    condition = (str(data.get("condition") or "new").strip().lower())[:32]
    if condition not in _VALID_CONDITIONS:
        condition = "new"

    fulfillment = (str(data.get("fulfillment") or "physical").strip().lower())[:32]
    if fulfillment not in _VALID_FULFILLMENT:
        fulfillment = "physical"

    # Store: pick the seller's active store or create one on the fly
    store_id = _safe_int(data.get("store_id"), 0)
    store = None
    if store_id > 0:
        store = Store.query.get(store_id)
        if store is not None and store.owner_id != user.id and user.role != "admin":
            store = None
    if store is None:
        store = Store.query.filter_by(owner_id=user.id).order_by(Store.id).first()
    if store is None:
        base_name = f"{user.full_name or 'Cronyzo'} Store"
        store = Store(
            owner_id=user.id,
            name=base_name[:150],
            slug=unique_slug(Store, base_name),
            tagline=_clean(data.get("store_tagline"), 255),
        )
        db.session.add(store)
        try:
            db.session.flush()
        except Exception:  # noqa: BLE001
            db.session.rollback()
            logger.exception("create_product: could not create store")
            return jsonify({"error": "Could not create storefront"}), 500

    category_id = _safe_int(data.get("category_id"), 0)
    if category_id <= 0:
        category_id = None

    product_slug = unique_slug(Product, title)
    image_url = _clean(data.get("image_url"), _MAX_URL)
    if not image_url:
        # No upload yet — fall back to a deterministic placeholder so the
        # listing never shows an empty grey box in the catalogue.
        image_url = product_artwork(title, seed=product_slug, glyph="bag")

    product = Product(
        store_id=store.id,
        category_id=category_id,
        seller_id=user.id,
        title=title,
        slug=product_slug,
        description=_clean(data.get("description"), _MAX_DESC),
        brand=_clean(data.get("brand"), _MAX_BRAND),
        sku=_clean(data.get("sku"), _MAX_SKU),
        price=price,
        mrp=mrp,
        stock=max(0, _safe_int(data.get("stock"), 0)),
        condition=condition,
        fulfillment=fulfillment,
        image_url=image_url,
        gallery_json=_gallery(data),
        is_featured=bool(data.get("is_featured", False)) and user.role == "admin",
        is_active=True,
        is_published=True,
    )
    db.session.add(product)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_product failed")
        return jsonify({"error": "Could not create product"}), 500

    return jsonify({"message": "Product listed", "item": product.to_dict()}), 201


@shop_bp.put("/products/<int:product_id>")
@roles_required("teacher", "seller", "admin")
def update_product(product_id):
    """Update a product — owning seller or admin only."""
    product = Product.query.get_or_404(product_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if product.seller_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own products"}), 403

    data = _json_body()
    if "title" in data:
        title = _clean(data.get("title"), _MAX_TITLE)
        if title:
            product.title = title
    for field, limit in (
        ("description", _MAX_DESC),
        ("brand", _MAX_BRAND),
        ("sku", _MAX_SKU),
        ("image_url", _MAX_URL),
    ):
        if field in data:
            setattr(product, field, _clean(data.get(field), limit))
    if "price" in data:
        product.price = max(0.0, _safe_float(data.get("price"), product.price))
    if "mrp" in data:
        product.mrp = max(0.0, _safe_float(data.get("mrp"), product.mrp))
    if "stock" in data:
        product.stock = max(0, _safe_int(data.get("stock"), product.stock))
    if "condition" in data:
        cond = str(data.get("condition") or "").strip().lower()[:32]
        if cond in _VALID_CONDITIONS:
            product.condition = cond
    if "fulfillment" in data:
        ful = str(data.get("fulfillment") or "").strip().lower()[:32]
        if ful in _VALID_FULFILLMENT:
            product.fulfillment = ful
    if "category_id" in data:
        cid = _safe_int(data.get("category_id"), 0)
        product.category_id = cid if cid > 0 else None
    if "gallery" in data:
        product.gallery_json = _gallery(data)
    if "is_active" in data:
        product.is_active = bool(data.get("is_active"))
    if "is_featured" in data and user.role == "admin":
        product.is_featured = bool(data.get("is_featured"))

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_product id=%s failed", product_id)
        return jsonify({"error": "Could not update product"}), 500

    return jsonify({"message": "Product updated", "item": product.to_dict()})


@shop_bp.delete("/products/<int:product_id>")
@roles_required("teacher", "seller", "admin")
def delete_product(product_id):
    product = Product.query.get_or_404(product_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if product.seller_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only delete your own products"}), 403

    # Soft delete — keeps historical order lines intact
    product.is_active = False
    product.is_published = False
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("delete_product id=%s failed", product_id)
        return jsonify({"error": "Could not delete product"}), 500
    return jsonify({"message": "Product removed"})


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
@shop_bp.get("/products/<int:product_id>/reviews")
def list_product_reviews(product_id):
    product = Product.query.get_or_404(product_id)
    reviews = (
        ProductReview.query.filter_by(product_id=product.id)
        .order_by(ProductReview.created_at.desc())
        .all()
    )
    return jsonify({"items": [r.to_dict() for r in reviews], "total": len(reviews)})


@shop_bp.post("/products/<int:product_id>/reviews")
@jwt_required()
def create_product_review(product_id):
    """Leave a review for a product (one per buyer per product)."""
    product = Product.query.get_or_404(product_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    data = _json_body()
    rating = max(1, min(5, _safe_int(data.get("rating"), 5)))

    review = ProductReview.query.filter_by(product_id=product.id, user_id=user.id).first()
    if review is None:
        review = ProductReview(product_id=product.id, user_id=user.id)
        db.session.add(review)

    review.rating = rating
    review.title = _clean(data.get("title"), 200)
    review.body = _clean(data.get("body"), 4000)
    review.is_verified = True

    try:
        db.session.flush()
        _recompute_product_rating(product)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_product_review failed product=%s", product_id)
        return jsonify({"error": "Could not save review"}), 500

    return jsonify({"message": "Review saved", "item": review.to_dict()}), 201


# ---------------------------------------------------------------------------
# Cart
# ---------------------------------------------------------------------------
def _cart_payload(user_id: int) -> Dict[str, Any]:
    """Build the shared cart response payload."""
    from app.services.commerce import compute_cart_totals

    rows = (
        CartItem.query.filter_by(user_id=user_id)
        .order_by(CartItem.created_at.desc())
        .all()
    )
    items = [row.to_dict() for row in rows]
    line_inputs = [
        {"unit_price": row.product.price if row.product else 0, "qty": row.qty}
        for row in rows
    ]
    has_physical = any(
        (row.product.fulfillment or "physical") == "physical" for row in rows if row.product
    )
    totals = compute_cart_totals(line_inputs, has_physical_items=has_physical)
    return {"items": items, "total": len(items), **totals}


@cart_bp.get("")
@jwt_required()
def get_cart():
    """Return the caller's cart with live totals."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    return jsonify(_cart_payload(user.id))


@cart_bp.post("")
@jwt_required()
def add_to_cart():
    """Add a product to the cart (quantity is merged if already present)."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    data = _json_body()
    product_id = _safe_int(data.get("product_id"), 0)
    qty = max(1, min(_MAX_QTY, _safe_int(data.get("qty"), 1)))

    product = Product.query.get(product_id)
    if product is None or not product.is_active:
        return jsonify({"error": "Product not found"}), 404

    existing = CartItem.query.filter_by(user_id=user.id, product_id=product.id).first()
    if existing is not None:
        existing.qty = min(_MAX_QTY, int(existing.qty or 0) + qty)
    else:
        existing = CartItem(user_id=user.id, product_id=product.id, qty=qty)
        db.session.add(existing)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("add_to_cart failed product=%s", product_id)
        return jsonify({"error": "Could not update cart"}), 500

    return jsonify({"message": "Added to cart", **_cart_payload(user.id)}), 201


@cart_bp.patch("/<int:item_id>")
@jwt_required()
def update_cart_item(item_id):
    """Change the quantity of a cart line."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    item = CartItem.query.get_or_404(item_id)
    if item.user_id != user.id:
        return jsonify({"error": "Not your cart item"}), 403

    data = _json_body()
    qty = _safe_int(data.get("qty"), 0)
    if qty <= 0:
        db.session.delete(item)
    else:
        item.qty = min(_MAX_QTY, qty)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_cart_item failed item=%s", item_id)
        return jsonify({"error": "Could not update cart"}), 500

    return jsonify({"message": "Cart updated", **_cart_payload(user.id)})


@cart_bp.delete("/<int:item_id>")
@jwt_required()
def remove_cart_item(item_id):
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    item = CartItem.query.get_or_404(item_id)
    if item.user_id != user.id:
        return jsonify({"error": "Not your cart item"}), 403

    db.session.delete(item)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("remove_cart_item failed item=%s", item_id)
        return jsonify({"error": "Could not update cart"}), 500

    return jsonify({"message": "Removed from cart", **_cart_payload(user.id)})


@cart_bp.delete("")
@jwt_required()
def clear_cart():
    """Empty the cart."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    try:
        CartItem.query.filter_by(user_id=user.id).delete()
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("clear_cart failed user=%s", user.id)
        return jsonify({"error": "Could not clear cart"}), 500

    return jsonify({"message": "Cart cleared", **_cart_payload(user.id)})


# ---------------------------------------------------------------------------
# Wishlist
# ---------------------------------------------------------------------------
@shop_bp.post("/products/<int:product_id>/like")
@jwt_required()
def toggle_wishlist(product_id):
    """Toggle a product in the caller's wishlist."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    product = Product.query.get_or_404(product_id)
    existing = WishlistItem.query.filter_by(
        user_id=user.id, product_id=product.id
    ).first()

    if existing is not None:
        db.session.delete(existing)
        liked = False
    else:
        db.session.add(WishlistItem(user_id=user.id, product_id=product.id))
        liked = True

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("toggle_wishlist failed product=%s", product_id)
        return jsonify({"error": "Could not update wishlist"}), 500

    count = WishlistItem.query.filter_by(product_id=product.id).count()
    return jsonify({"message": "Wishlist updated", "liked": liked, "wishlist_count": count})


@shop_bp.get("/wishlist")
@jwt_required()
def get_wishlist():
    """Products the caller has saved for later."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    rows = (
        WishlistItem.query.filter_by(user_id=user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    return jsonify({"items": [r.to_dict() for r in rows], "total": len(rows)})


# ---------------------------------------------------------------------------
# Addresses
# ---------------------------------------------------------------------------
@account_bp.get("/addresses")
@jwt_required()
def list_addresses():
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    rows = Address.query.filter_by(user_id=user.id).order_by(
        Address.is_default.desc(), Address.id.desc()
    ).all()
    return jsonify({"items": [a.to_dict() for a in rows], "total": len(rows)})


@account_bp.post("/addresses")
@jwt_required()
def create_address():
    """Save a delivery address."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    data = _json_body()
    required = ["full_name", "phone", "line1", "city", "pincode"]
    missing = [f for f in required if not str(data.get(f) or "").strip()]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    is_default = bool(data.get("is_default", False))
    count = Address.query.filter_by(user_id=user.id).count()
    if count == 0:
        is_default = True

    address = Address(
        user_id=user.id,
        label=(_clean(data.get("label"), 40) or "Home"),
        full_name=_clean(data.get("full_name"), 150),
        phone=_clean(data.get("phone"), 32),
        line1=_clean(data.get("line1"), 255),
        line2=_clean(data.get("line2"), 255),
        city=_clean(data.get("city"), 120),
        state=_clean(data.get("state"), 120),
        pincode=_clean(data.get("pincode"), 16),
        landmark=_clean(data.get("landmark"), 200),
        is_default=is_default,
    )
    db.session.add(address)
    try:
        db.session.flush()
        if is_default:
            Address.query.filter(
                Address.user_id == user.id, Address.id != address.id
            ).update({"is_default": False})
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_address failed user=%s", user.id)
        return jsonify({"error": "Could not save address"}), 500

    return jsonify({"message": "Address saved", "item": address.to_dict()}), 201


@account_bp.delete("/addresses/<int:address_id>")
@jwt_required()
def delete_address(address_id):
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    address = Address.query.get_or_404(address_id)
    if address.user_id != user.id:
        return jsonify({"error": "Not your address"}), 403

    db.session.delete(address)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("delete_address failed id=%s", address_id)
        return jsonify({"error": "Could not delete address"}), 500
    return jsonify({"message": "Address deleted"})


__all__ = ["shop_bp", "cart_bp", "account_bp"]
