"""Marketplace models — stores, catalog, reviews, cart, wishlist, addresses.

This module implements the "Shop" vertical of Cronyzo: vendors open a
:class:`Store`, list :class:`Product` items under a :class:`Category`, and
buyers interact through :class:`CartItem` / :class:`WishlistItem` and saved
:class:`Address` rows.

Design notes
------------
* Every seller-facing table keeps a direct ``user_id`` FK as well as the
  ``store_id`` FK so that authorization checks stay cheap (single indexed
  lookup) even when a user owns several stores.
* Money is stored as ``Float`` for parity with the pre-existing platform
  billing models (``payments.amount``). Rounding to 2 decimals happens at the
  serialization boundary via :func:`_money`.
* Slugs are unique and human-readable; they are the public URL key for
  catalog pages (``/shop/product/<slug>``).

Public exports (stable)::

    Category, Store, Product, ProductReview, Address, CartItem, WishlistItem
"""

from __future__ import annotations

import json
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
    """Round to 2 decimals and coerce junk to 0.0 (never raises)."""
    try:
        return round(float(value or 0.0), 2)
    except (TypeError, ValueError):
        return 0.0


def _loads_list(raw: Optional[str]) -> List[Any]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        return []
    return data if isinstance(data, list) else []


def _slugify(value: str) -> str:
    """ASCII-ish slug helper used when the client did not supply one."""
    out = []
    prev_dash = False
    for ch in (value or "").strip().lower():
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    slug = "".join(out).strip("-")
    return slug or "item"


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
class Category(db.Model):
    """A catalog category (Electronics, Books, Fashion, …).

    Supports one level of nesting via ``parent_id`` so vendors can group
    sub-categories without a full tree implementation.
    """

    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(140), unique=True, nullable=False, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True, index=True)
    icon = db.Column(db.String(64), nullable=True)
    image_url = db.Column(db.Text, nullable=True)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    products = db.relationship(
        "Product",
        back_populates="category",
        lazy="dynamic",
        foreign_keys="Product.category_id",
    )

    def to_dict(self, include_counts: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "parent_id": self.parent_id,
            "icon": self.icon,
            "image_url": self.image_url,
            "description": self.description,
            "is_active": bool(self.is_active),
            "sort_order": self.sort_order,
        }
        if include_counts:
            try:
                data["product_count"] = self.products.filter_by(is_active=True).count()
            except Exception:  # noqa: BLE001
                data["product_count"] = 0
        return data


# ---------------------------------------------------------------------------
# Stores
# ---------------------------------------------------------------------------
class Store(db.Model):
    """A vendor storefront owned by one :class:`~app.models.user.User`."""

    __tablename__ = "stores"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    slug = db.Column(db.String(160), unique=True, nullable=False, index=True)
    tagline = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    logo_url = db.Column(db.Text, nullable=True)
    banner_url = db.Column(db.Text, nullable=True)
    city = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(32), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    # "pending" | "approved" | "rejected" — moderation gate for new vendors
    status = db.Column(db.String(32), default="approved", nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    rating_avg = db.Column(db.Float, default=0.0, nullable=False)
    rating_count = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    owner = db.relationship("User", foreign_keys=[owner_id])
    products = db.relationship("Product", back_populates="store", lazy="dynamic")

    def to_dict(self) -> Dict[str, Any]:
        try:
            product_count = self.products.filter_by(is_active=True).count()
        except Exception:  # noqa: BLE001
            product_count = 0
        return {
            "id": self.id,
            "owner_id": self.owner_id,
            "name": self.name,
            "slug": self.slug,
            "tagline": self.tagline,
            "description": self.description,
            "logo_url": self.logo_url,
            "banner_url": self.banner_url,
            "city": self.city,
            "phone": self.phone,
            "email": self.email,
            "status": self.status,
            "is_active": bool(self.is_active),
            "rating_avg": _money(self.rating_avg),
            "rating_count": self.rating_count,
            "product_count": product_count,
            "created_at": _iso(self.created_at),
        }


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class Product(db.Model):
    """A single sellable item in the Cronyzo catalog."""

    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=True, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True, index=True)
    seller_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(220), nullable=False)
    slug = db.Column(db.String(240), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    brand = db.Column(db.String(120), nullable=True)
    sku = db.Column(db.String(80), nullable=True, index=True)

    price = db.Column(db.Float, default=0.0, nullable=False)
    mrp = db.Column(db.Float, default=0.0, nullable=False)

    stock = db.Column(db.Integer, default=0, nullable=False)
    # "new" | "like_new" | "used" | "refurbished"
    condition = db.Column(db.String(32), default="new", nullable=False)
    # "physical" | "digital"
    fulfillment = db.Column(db.String(32), default="physical", nullable=False)

    image_url = db.Column(db.Text, nullable=True)
    gallery_json = db.Column(db.Text, nullable=True)

    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    is_featured = db.Column(db.Boolean, default=False, nullable=False, index=True)
    is_published = db.Column(db.Boolean, default=True, nullable=False)

    rating_avg = db.Column(db.Float, default=0.0, nullable=False)
    rating_count = db.Column(db.Integer, default=0, nullable=False)
    sold_count = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    store = db.relationship("Store", back_populates="products")
    category = db.relationship("Category", back_populates="products", foreign_keys=[category_id])
    seller = db.relationship("User", foreign_keys=[seller_id])
    reviews = db.relationship(
        "ProductReview",
        back_populates="product",
        lazy="dynamic",
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

    def gallery(self) -> List[str]:
        images = [img for img in _loads_list(self.gallery_json) if isinstance(img, str)]
        if self.image_url:
            images = [self.image_url] + [i for i in images if i != self.image_url]
        return images

    def to_dict(self, include_seller: bool = True) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "description": self.description,
            "brand": self.brand,
            "sku": self.sku,
            "price": _money(self.price),
            "mrp": _money(self.mrp),
            "discount_percent": self.discount_percent,
            "stock": int(self.stock or 0),
            "in_stock": self.in_stock,
            "condition": self.condition,
            "fulfillment": self.fulfillment,
            "image_url": self.image_url,
            "gallery": self.gallery(),
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "store_id": self.store_id,
            "store_name": self.store.name if self.store else None,
            "is_active": bool(self.is_active),
            "is_featured": bool(self.is_featured),
            "rating_avg": _money(self.rating_avg),
            "rating_count": self.rating_count,
            "sold_count": self.sold_count,
            "created_at": _iso(self.created_at),
        }
        if include_seller:
            data["seller"] = {
                "id": self.seller_id,
                "full_name": self.seller.full_name if self.seller else None,
                "avatar_url": self.seller.avatar_url if self.seller else None,
                "store_name": self.store.name if self.store else None,
            }
        return data


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
class ProductReview(db.Model):
    """A buyer review for a catalog product."""

    __tablename__ = "product_reviews"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    rating = db.Column(db.Integer, default=5, nullable=False)
    title = db.Column(db.String(200), nullable=True)
    body = db.Column(db.Text, nullable=True)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    product = db.relationship("Product", back_populates="reviews")
    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "rating": int(self.rating or 0),
            "title": self.title,
            "body": self.body,
            "is_verified": bool(self.is_verified),
            "user": {
                "id": self.user_id,
                "full_name": self.user.full_name if self.user else "Learner",
                "avatar_url": self.user.avatar_url if self.user else None,
            },
            "created_at": _iso(self.created_at),
        }


# ---------------------------------------------------------------------------
# Addresses
# ---------------------------------------------------------------------------
class Address(db.Model):
    """A saved delivery address belonging to a buyer."""

    __tablename__ = "addresses"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    label = db.Column(db.String(40), default="Home", nullable=False)
    full_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(32), nullable=False)
    line1 = db.Column(db.String(255), nullable=False)
    line2 = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(120), nullable=False)
    state = db.Column(db.String(120), nullable=True)
    pincode = db.Column(db.String(16), nullable=False)
    landmark = db.Column(db.String(200), nullable=True)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "full_name": self.full_name,
            "phone": self.phone,
            "line1": self.line1,
            "line2": self.line2,
            "city": self.city,
            "state": self.state,
            "pincode": self.pincode,
            "landmark": self.landmark,
            "is_default": bool(self.is_default),
        }


# ---------------------------------------------------------------------------
# Cart & wishlist
# ---------------------------------------------------------------------------
class CartItem(db.Model):
    """One line in a buyer's cart."""

    __tablename__ = "cart_items"
    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    qty = db.Column(db.Integer, default=1, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    product = db.relationship("Product")

    @property
    def line_total(self) -> float:
        return _money(_money(self.product.price if self.product else 0) * int(self.qty or 0))

    def to_dict(self) -> Dict[str, Any]:
        product = self.product
        return {
            "id": self.id,
            "product_id": self.product_id,
            "qty": int(self.qty or 0),
            "unit_price": _money(product.price if product else 0),
            "line_total": self.line_total,
            "product": product.to_dict() if product else None,
        }


class WishlistItem(db.Model):
    """A saved-for-later catalog item."""

    __tablename__ = "wishlist_items"
    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    product = db.relationship("Product")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product": self.product.to_dict() if self.product else None,
            "created_at": _iso(self.created_at),
        }


__all__ = [
    "Category",
    "Store",
    "Product",
    "ProductReview",
    "Address",
    "CartItem",
    "WishlistItem",
    "utcnow",
    "_iso",
    "_money",
    "_slugify",
]
