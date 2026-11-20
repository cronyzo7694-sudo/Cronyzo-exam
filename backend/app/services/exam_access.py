"""Who may sit a paid test series.

One rule, one place:

* a **free** series (price 0) is open to anyone with an account,
* a **paid** series unlocks for its owner (the creator), for an admin, or for
  anyone holding a paid order line for that series,
* buying the series unlocks **every test inside it** — a test looks up its own
  row first, then its parent, so one purchase covers the whole series.
"""

from __future__ import annotations

from typing import Optional, Tuple

from app.extensions import db


def _paid_for(exam_id: int, user_id: int) -> bool:
    from app.models.order import Order, OrderItem

    return (
        db.session.query(OrderItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            OrderItem.item_type == "exam",
            OrderItem.item_id == exam_id,
            Order.user_id == user_id,
            Order.status.in_(("paid", "confirmed", "completed", "shipped", "delivered")),
        )
        .first()
        is not None
    )


def series_price(exam) -> float:
    """Price of the exam — or of the series it belongs to."""
    own = float(getattr(exam, "price", 0) or 0)
    if own > 0:
        return own
    parent = getattr(exam, "parent_exam", None)
    return float(getattr(parent, "price", 0) or 0) if parent is not None else 0.0


def series_of(exam):
    """The row that is actually sold: the parent series, else the exam."""
    parent = getattr(exam, "parent_exam", None)
    if parent is not None and series_price(parent) > 0:
        return parent
    return exam


def access(exam, user) -> Tuple[bool, float, Optional[int]]:
    """``(allowed, price, buy_exam_id)`` for this reader."""
    price = series_price(exam)
    if price <= 0:
        return True, 0.0, None
    if user is None:
        return False, price, int(series_of(exam).id)
    if (user.role or "") == "admin" or int(getattr(exam, "created_by", 0) or 0) == int(user.id):
        return True, price, None

    buy_target = series_of(exam)
    if int(buy_target.id) == int(exam.id):
        if _paid_for(exam.id, user.id):
            return True, price, None
        return False, price, int(exam.id)

    # A test inside a paid series: the series unlocks the whole set, and a
    # single-test purchase still lets that one test open.
    if _paid_for(int(buy_target.id), user.id) or _paid_for(int(exam.id), user.id):
        return True, price, None
    return False, price, int(buy_target.id)
