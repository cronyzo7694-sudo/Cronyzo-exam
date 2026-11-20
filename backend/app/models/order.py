"""Order models — checkout payloads spanning courses, books and products.

Cronyzo sells three kinds of thing (a course, a book, a physical product), so
an order line is polymorphic via ``item_type`` + ``item_id``. Keeping one
order table (instead of three) lets the admin panel, the seller's earnings
view and the buyer's order history share a single audit trail.

Public exports (stable)::

    Order, OrderItem
"""

from __future__ import annotations

import secrets
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


def _loads(raw: Any) -> Optional[Dict[str, Any]]:
    import json

    if not raw:
        return None
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else None
    except Exception:  # noqa: BLE001
        return None


def generate_order_number() -> str:
    """Human-friendly, collision-resistant order id (``CZ-8F3K2M``)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
    tail = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"CZ-{tail}"


class Order(db.Model):
    """A placed order (mixed basket of courses / books / products)."""

    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(24), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    # "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded"
    status = db.Column(db.String(32), default="pending", nullable=False, index=True)
    # "unpaid" | "paid" | "refunded" | "failed"
    payment_status = db.Column(db.String(32), default="unpaid", nullable=False, index=True)
    payment_method = db.Column(db.String(32), default="cod", nullable=False)

    subtotal = db.Column(db.Float, default=0.0, nullable=False)
    discount = db.Column(db.Float, default=0.0, nullable=False)
    shipping_fee = db.Column(db.Float, default=0.0, nullable=False)
    tax = db.Column(db.Float, default=0.0, nullable=False)
    total = db.Column(db.Float, default=0.0, nullable=False)
    currency = db.Column(db.String(8), default="INR", nullable=False)

    address_json = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    tracking_id = db.Column(db.String(120), nullable=True)
    courier = db.Column(db.String(120), nullable=True)

    placed_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = db.relationship("User", foreign_keys=[user_id])
    events = db.relationship(
        "OrderEvent",
        back_populates="order",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    items = db.relationship(
        "OrderItem",
        back_populates="order",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "order_number": self.order_number,
            "user_id": self.user_id,
            "status": self.status,
            "payment_status": self.payment_status,
            "payment_method": self.payment_method,
            "subtotal": _money(self.subtotal),
            "discount": _money(self.discount),
            "shipping_fee": _money(self.shipping_fee),
            "tax": _money(self.tax),
            "total": _money(self.total),
            "currency": self.currency,
            "notes": self.notes,
            "tracking_id": self.tracking_id,
            "courier": self.courier,
            "address": _loads(self.address_json),
            "placed_at": _iso(self.placed_at),
            "updated_at": _iso(self.updated_at),
            "items": [i.to_dict() for i in self.items],
            "events": [
                e.to_dict() for e in sorted(self.events, key=lambda e: (e.created_at, e.id))
            ],
        }


class OrderItem(db.Model):
    """A single line inside an :class:`Order`."""

    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    # "course" | "book" | "product"
    item_type = db.Column(db.String(32), nullable=False)
    item_id = db.Column(db.Integer, nullable=False, index=True)
    title = db.Column(db.String(240), nullable=False)
    image_url = db.Column(db.Text, nullable=True)
    unit_price = db.Column(db.Float, default=0.0, nullable=False)
    qty = db.Column(db.Integer, default=1, nullable=False)
    line_total = db.Column(db.Float, default=0.0, nullable=False)
    seller_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)

    order = db.relationship("Order", back_populates="items")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "order_id": self.order_id,
            "item_type": self.item_type,
            "item_id": self.item_id,
            "title": self.title,
            "image_url": self.image_url,
            "unit_price": _money(self.unit_price),
            "qty": int(self.qty or 0),
            "line_total": _money(self.line_total),
            "seller_id": self.seller_id,
        }


class OrderEvent(db.Model):
    """One step in an order's life — the delivery timeline the buyer sees.

    Every status change (and every tracking update) appends a row instead of
    overwriting, so "kahan pahuncha" has an answer even after five moves, and
    the seller/admin panel keeps an honest audit trail.
    """

    __tablename__ = "order_events"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(
        db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status = db.Column(db.String(32), nullable=False)
    note = db.Column(db.String(255), nullable=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    actor_role = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    order = db.relationship("Order", back_populates="events")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "note": self.note,
            "actor_role": self.actor_role,
            "at": _iso(self.created_at),
        }


__all__ = [
    "Order",
    "OrderItem",
    "OrderEvent",
    "generate_order_number",
    "utcnow",
    "_iso",
    "_money",
]
