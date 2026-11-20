"""Order routes — checkout, order history, cancellation.

Stable endpoints under ``/api/orders``::

    POST /api/orders/checkout   place an order (mixed basket)
    GET  /api/orders/my         the caller's order history
    GET  /api/orders/<number>   a single order by its public number
    POST /api/orders/<int:id>/cancel  cancel an order

Checkout notes
--------------
* The basket may mix the three buyable kinds (course / book / product).
* Prices are **always** re-read from the database — the client never gets to
  tell the server what something costs.
* Payment is simulated (the platform has no gateway wired yet); the order is
  marked ``paid`` immediately and a :class:`~app.models.platform.Payment` row
  is written for the audit trail. Replacing this with Razorpay/Stripe later
  only touches the ``_settle_payment`` helper.
* Digital items (courses, ebooks) create an :class:`Enrollment` immediately;
  physical items decrement stock.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Final, List, Optional, Tuple

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.book import Book
from app.models.course import Course, Enrollment
from app.models.order import Order, OrderEvent, OrderItem, generate_order_number
from app.models.platform import Payment
from app.models.store import Address, CartItem, Product
from app.models.user import User
from app.services.commerce import compute_cart_totals
from app.utils.decorators import get_current_user

orders_bp = Blueprint("orders", __name__)
logger = logging.getLogger("cronyzo.routes.orders")

_MAX_NOTES: Final[int] = 1000
_MAX_ITEMS: Final[int] = 50
_MAX_QTY: Final[int] = 99
_VALID_PAYMENT = ("cod", "upi", "card", "wallet")


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


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


class _BasketLine:
    """One resolved line of a checkout basket."""

    __slots__ = ("item_type", "item_id", "title", "image_url", "unit_price", "qty", "seller_id", "obj")

    def __init__(self, item_type, item_id, title, image_url, unit_price, qty, seller_id, obj):
        self.item_type = item_type
        self.item_id = item_id
        self.title = title
        self.image_url = image_url
        self.unit_price = unit_price
        self.qty = qty
        self.seller_id = seller_id
        self.obj = obj


def _resolve_item(item_type: str, item_id: int) -> Optional[_BasketLine]:
    """Load a catalogue row and turn it into a basket line, or ``None``."""
    if item_type == "product":
        product = Product.query.get(item_id)
        if product is None or not product.is_active:
            return None
        return _BasketLine(
            "product",
            product.id,
            product.title,
            product.image_url,
            float(product.price or 0.0),
            1,
            product.seller_id,
            product,
        )
    if item_type == "book":
        book = Book.query.get(item_id)
        if book is None or not book.is_active:
            return None
        return _BasketLine(
            "book",
            book.id,
            book.title,
            book.cover_url,
            float(book.price or 0.0),
            1,
            book.seller_id,
            book,
        )
    if item_type == "exam":
        from app.models.exam import Exam

        exam = Exam.query.get(item_id)
        if exam is None:
            return None
        # A series is what gets sold; a standalone paid test can be too.
        price = float(getattr(exam, "price", 0) or 0.0)
        if price <= 0:
            parent = getattr(exam, "parent_exam", None)
            price = float(getattr(parent, "price", 0) or 0.0) if parent else 0.0
        if price <= 0:
            return None  # free test — nothing to buy
        return _BasketLine(
            "exam",
            exam.id,
            exam.title,
            getattr(exam, "image_url", None) or getattr(exam, "cover_url", None),
            price,
            1,
            getattr(exam, "created_by_id", None),
            exam,
        )
    if item_type == "course":
        course = Course.query.get(item_id)
        if course is None or course.status != "published":
            return None
        return _BasketLine(
            "course",
            course.id,
            course.title,
            course.thumbnail_url,
            float(course.price or 0.0),
            1,
            course.teacher_id,
            course,
        )
    return None


def _build_basket(payload: Dict[str, Any], user_id: int) -> Tuple[List[_BasketLine], List[str]]:
    """
    Turn the request payload into resolved basket lines.

    Returns ``(lines, errors)``. Missing / unavailable items land in
    ``errors`` so the client can tell the user exactly what went wrong.
    """
    errors: List[str] = []
    lines: List[_BasketLine] = []
    seen = set()

    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        # Fall back to the caller's cart
        cart_rows = CartItem.query.filter_by(user_id=user_id).all()
        for row in cart_rows:
            product = row.product
            if product is None or not product.is_active:
                errors.append("An item in your cart is no longer available")
                continue
            lines.append(
                _BasketLine(
                    "product",
                    product.id,
                    product.title,
                    product.image_url,
                    float(product.price or 0.0),
                    max(1, int(row.qty or 1)),
                    product.seller_id,
                    product,
                )
            )
            seen.add(("product", product.id))
        return lines, errors

    for raw in raw_items[:_MAX_ITEMS]:
        if not isinstance(raw, dict):
            continue
        item_type = str(raw.get("item_type") or "product").strip().lower()
        item_id = _safe_int(raw.get("item_id"), 0)
        if item_id <= 0:
            errors.append("Invalid item in basket")
            continue

        key = (item_type, item_id)
        if key in seen:
            continue
        seen.add(key)

        line = _resolve_item(item_type, item_id)
        if line is None:
            errors.append(f"'{item_type}' item is no longer available")
            continue

        qty = max(1, min(_MAX_QTY, _safe_int(raw.get("qty"), 1)))
        if item_type == "product":
            if line.obj.stock < qty:
                errors.append(f"Only {line.obj.stock} left of '{line.title}'")
                continue
        line.qty = qty
        lines.append(line)

    return lines, errors


def _settle_payment(order: Order, user_id: int, method: str) -> Payment:
    """Record the payment for an order (simulated gateway for now)."""
    payment = Payment(
        user_id=user_id,
        provider=method if method in ("upi", "card") else "simulated",
        amount=order.total,
        currency=order.currency,
        status="paid",
        external_id=order.order_number,
        meta_json=json.dumps({"order_id": order.id, "method": method}),
    )
    db.session.add(payment)
    return payment


def _apply_coupon(code: str, subtotal: float) -> Tuple[float, Optional[Dict[str, Any]]]:
    """
    Look up a coupon and return ``(discount, descriptor)``.

    The coupon table uses ``percent_off`` / ``amount_off`` (a coupon may set
    both — the larger discount wins) plus an optional redemption cap and
    expiry. An unusable coupon silently yields no discount so the checkout
    still succeeds; the client shows the "invalid code" message.
    """
    from app.models.platform import Coupon

    if not code:
        return 0.0, None

    coupon = Coupon.query.filter_by(code=code.strip().upper()).first()
    if coupon is None or not coupon.is_active:
        return 0.0, None

    if coupon.expires_at is not None:
        try:
            from app.models.platform import utcnow as _platform_utcnow

            if coupon.expires_at < _platform_utcnow():
                return 0.0, None
        except Exception:  # noqa: BLE001
            pass

    if coupon.max_redemptions and int(coupon.redeemed_count or 0) >= int(coupon.max_redemptions):
        return 0.0, None

    discount = 0.0
    if coupon.percent_off:
        discount = max(discount, subtotal * (float(coupon.percent_off) / 100.0))
    if coupon.amount_off:
        discount = max(discount, float(coupon.amount_off))
    discount = max(0.0, min(discount, subtotal))

    if discount <= 0:
        return 0.0, None

    coupon.redeemed_count = int(coupon.redeemed_count or 0) + 1

    return round(discount, 2), {
        "code": coupon.code,
        "percent_off": float(coupon.percent_off or 0.0),
        "amount_off": float(coupon.amount_off or 0.0),
    }


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------
@orders_bp.post("/checkout")
@jwt_required()
def checkout():
    """Place an order for the caller's basket."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    # A guest can browse, add to cart and sit a test — but money never moves on
    # an anonymous row. The operator can flip this during testing with the
    # "Allow guests to check out" setting; the default is off.
    if (user.role or "") == "guest":
        from app.services.site_content import get_setting

        if not bool(get_setting("feature.guest_can_purchase", False)):
            return (
                jsonify(
                    {
                        "error": "Save your account to place an order",
                        "detail": (
                            "Your cart and progress are safe — add an email and password "
                            "and checkout opens up instantly."
                        ),
                        "code": "guest_cannot_purchase",
                    }
                ),
                403,
            )

    payload = _json_body()
    lines, errors = _build_basket(payload, user.id)
    if not lines:
        return jsonify({"error": "Your cart is empty", "details": errors}), 400

    # --- totals -----------------------------------------------------------
    line_inputs = [{"unit_price": line.unit_price, "qty": line.qty} for line in lines]
    has_physical = any(
        (line.obj.fulfillment or "physical") == "physical"
        for line in lines
        if isinstance(line.obj, Product)
    )

    # Courier charge is per listing: the seller sets it on the product/book.
    # If nobody set anything we fall back to the flat platform rule.
    seller_shipping = 0.0
    for line in lines:
        obj = line.obj
        if isinstance(obj, Product) and (obj.fulfillment or "physical") == "physical":
            seller_shipping += float(getattr(obj, "shipping_fee", 0) or 0) * line.qty
        elif isinstance(obj, Book) and not (getattr(obj, "is_digital", False)):
            seller_shipping += float(getattr(obj, "shipping_fee", 0) or 0) * line.qty

    coupon_code = _clean(payload.get("coupon_code"), 40) or ""
    subtotal_only = compute_cart_totals(line_inputs, has_physical_items=has_physical)
    discount, coupon_desc = _apply_coupon(coupon_code, float(subtotal_only["subtotal"]))

    totals = compute_cart_totals(
        line_inputs,
        has_physical_items=has_physical,
        discount=discount,
        shipping_fee=round(seller_shipping, 2) if seller_shipping > 0 else None,
    )

    if float(totals["total"]) <= 0:
        return jsonify({"error": "Order total must be greater than zero"}), 400

    # --- delivery address --------------------------------------------------
    address_payload = payload.get("address")
    address_id = _safe_int(payload.get("address_id"), 0)
    address_row = None
    if address_id > 0:
        address_row = Address.query.filter_by(id=address_id, user_id=user.id).first()
        if address_row is None:
            return jsonify({"error": "Address not found"}), 404
    elif isinstance(address_payload, dict):
        required = ["full_name", "phone", "line1", "city", "pincode"]
        missing = [f for f in required if not str(address_payload.get(f) or "").strip()]
        if missing:
            return jsonify({"error": f"Missing address fields: {', '.join(missing)}"}), 400
        address_row = Address(
            user_id=user.id,
            label=(_clean(address_payload.get("label"), 40) or "Home"),
            full_name=_clean(address_payload.get("full_name"), 150),
            phone=_clean(address_payload.get("phone"), 32),
            line1=_clean(address_payload.get("line1"), 255),
            line2=_clean(address_payload.get("line2"), 255),
            city=_clean(address_payload.get("city"), 120),
            state=_clean(address_payload.get("state"), 120),
            pincode=_clean(address_payload.get("pincode"), 16),
            landmark=_clean(address_payload.get("landmark"), 200),
            is_default=True,
        )
        db.session.add(address_row)

    payment_method = (str(payload.get("payment_method") or "cod").strip().lower())[:32]
    if payment_method not in _VALID_PAYMENT:
        payment_method = "cod"

    # --- create the order --------------------------------------------------
    order = Order(
        order_number=generate_order_number(),
        user_id=user.id,
        status="paid" if payment_method != "cod" else "confirmed",
        payment_status="paid",
        payment_method=payment_method,
        subtotal=float(totals["subtotal"]),
        discount=float(totals["discount"]),
        shipping_fee=float(totals["shipping_fee"]),
        tax=float(totals["tax"]),
        total=float(totals["total"]),
        currency="INR",
        notes=_clean(payload.get("notes"), _MAX_NOTES),
        address_json=json.dumps(address_row.to_dict()) if address_row is not None else None,
    )
    db.session.add(order)

    try:
        db.session.flush()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("checkout: could not create order")
        return jsonify({"error": "Could not create order"}), 500

    for line in lines:
        db.session.add(
            OrderItem(
                order_id=order.id,
                item_type=line.item_type,
                item_id=line.item_id,
                title=line.title,
                image_url=line.image_url,
                unit_price=line.unit_price,
                qty=line.qty,
                line_total=round(line.unit_price * line.qty, 2),
                seller_id=line.seller_id,
            )
        )

        obj = line.obj
        if isinstance(obj, Product):
            obj.stock = max(0, int(obj.stock or 0) - line.qty)
            obj.sold_count = int(obj.sold_count or 0) + line.qty
        elif isinstance(obj, Book):
            obj.stock = max(0, int(obj.stock or 0) - line.qty)
            obj.sold_count = int(obj.sold_count or 0) + line.qty
        elif isinstance(obj, Course):
            obj.student_count = int(obj.student_count or 0) + line.qty
            existing = Enrollment.query.filter_by(
                user_id=user.id, course_id=obj.id
            ).first()
            if existing is None:
                db.session.add(Enrollment(user_id=user.id, course_id=obj.id))

    db.session.add(
        OrderEvent(
            order_id=order.id,
            status=order.status,
            note=(
                "Order placed — cash on delivery"
                if payment_method == "cod"
                else "Order placed — payment received"
            ),
            actor_id=user.id,
            actor_role=user.role,
        )
    )

    _settle_payment(order, user.id, payment_method)

    # Clear the cart for the items that were just purchased
    try:
        CartItem.query.filter(
            CartItem.user_id == user.id,
            CartItem.product_id.in_([l.item_id for l in lines if l.item_type == "product"]),
        ).delete(synchronize_session=False)
    except Exception:  # noqa: BLE001
        logger.warning("checkout: could not clear cart")

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("checkout failed user=%s", user.id)
        return jsonify({"error": "Could not place order"}), 500

    return jsonify(
        {
            "message": "Order placed successfully",
            "order": order.to_dict(),
            "coupon": coupon_desc,
            "warnings": errors,
        }
    ), 201


# ---------------------------------------------------------------------------
# Order history
# ---------------------------------------------------------------------------
@orders_bp.get("/my")
@jwt_required()
def my_orders():
    """Order history for the caller, newest first."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    q = Order.query.filter_by(user_id=user.id)
    status = (request.args.get("status") or "").strip().lower()[:32]
    if status and status != "all":
        q = q.filter(Order.status == status)

    rows = q.order_by(Order.placed_at.desc()).limit(100).all()
    return jsonify({"items": [o.to_dict() for o in rows], "total": len(rows)})


@orders_bp.get("/<order_number>")
@jwt_required()
def get_order(order_number):
    """Fetch one order by its public order number."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    order = Order.query.filter_by(order_number=order_number).first()
    if order is None:
        return jsonify({"error": "Order not found"}), 404
    if order.user_id != user.id and user.role != "admin":
        return jsonify({"error": "Order not found"}), 404

    return jsonify(order.to_dict())


@orders_bp.post("/<int:order_id>/cancel")
@jwt_required()
def cancel_order(order_id):
    """Cancel an order that has not shipped yet."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    order = Order.query.get_or_404(order_id)
    if order.user_id != user.id and user.role != "admin":
        return jsonify({"error": "Order not found"}), 404

    if order.status in ("shipped", "delivered", "cancelled", "refunded"):
        return jsonify({"error": f"Cannot cancel a {order.status} order"}), 409

    order.status = "cancelled"
    order.payment_status = "refunded"

    # Restock physical items
    for item in order.items:
        if item.item_type == "product":
            product = Product.query.get(item.item_id)
            if product is not None:
                product.stock = int(product.stock or 0) + int(item.qty or 0)
                product.sold_count = max(0, int(product.sold_count or 0) - int(item.qty or 0))
        elif item.item_type == "book":
            book = Book.query.get(item.item_id)
            if book is not None:
                book.stock = int(book.stock or 0) + int(item.qty or 0)
                book.sold_count = max(0, int(book.sold_count or 0) - int(item.qty or 0))

    db.session.add(
        OrderEvent(
            order_id=order.id,
            status="cancelled",
            note="Order cancelled",
            actor_id=user.id,
            actor_role=user.role,
        )
    )

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("cancel_order failed id=%s", order_id)
        return jsonify({"error": "Could not cancel order"}), 500

    return jsonify({"message": "Order cancelled", "item": order.to_dict()})


# ---------------------------------------------------------------------------
# Delivery: sellers fulfil, buyers follow
# ---------------------------------------------------------------------------
# The journey of a physical order. Each step is one tap in the seller panel and
# one line on the buyer's timeline.
ORDER_FLOW = (
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
)
_STEP_LABEL = {
    "pending": "Order placed",
    "confirmed": "Order confirm hua",
    "packed": "Pack ho gaya",
    "shipped": "Courier ko diya",
    "out_for_delivery": "Delivery ke liye nikla",
    "delivered": "Deliver ho gaya",
    "cancelled": "Cancel hua",
    "refunded": "Refund hua",
}


def _seller_can_touch(order: Order, user: User) -> bool:
    if (user.role or "") == "admin":
        return True
    return any(int(i.seller_id or 0) == int(user.id) for i in order.items)


@orders_bp.get("/seller")
@jwt_required()
def seller_orders():
    """Every order that contains one of the caller's listings."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    status = (request.args.get("status") or "").strip().lower()[:32]
    q = (
        Order.query.join(OrderItem, OrderItem.order_id == Order.id)
        .filter(OrderItem.seller_id == user.id)
        .distinct()
    )
    if status and status != "all":
        q = q.filter(Order.status == status)

    rows = q.order_by(Order.placed_at.desc()).limit(100).all()
    return jsonify({"items": [o.to_dict() for o in rows], "total": len(rows)})


@orders_bp.patch("/<int:order_id>/status")
@jwt_required()
def update_order_status(order_id: int):
    """Seller / admin moves a delivery forward (or cancels it)."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    order = Order.query.get_or_404(order_id)
    if not _seller_can_touch(order, user):
        return jsonify({"error": "Ye order aapka nahi hai"}), 403

    body = _json_body()
    status = (str(body.get("status") or "").strip().lower())[:32]
    if status not in ORDER_FLOW and status not in ("cancelled", "refunded"):
        return jsonify({"error": "Galat status", "allowed": list(ORDER_FLOW) + ["cancelled"]}), 400

    if order.status == "cancelled":
        return jsonify({"error": "Cancel ho chuka order badla nahi ja sakta"}), 409

    if status != "cancelled":
        current = ORDER_FLOW.index(order.status) if order.status in ORDER_FLOW else 0
        target = ORDER_FLOW.index(status)
        if target < current:
            return jsonify(
                {
                    "error": "Order peeche nahi jata — sirf aage badhayein",
                    "current": order.status,
                }
            ), 409

    order.status = status
    if status == "delivered":
        order.payment_status = "paid"  # COD cash collected on delivery
    note = _clean(body.get("note"), 255) or _STEP_LABEL.get(status, status)
    db.session.add(
        OrderEvent(
            order_id=order.id,
            status=status,
            note=note,
            actor_id=user.id,
            actor_role=user.role,
        )
    )

    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("update_order_status failed id=%s", order_id)
        return jsonify({"error": "Status save nahi hua"}), 500

    return jsonify(
        {
            "message": f"Order ab '{_STEP_LABEL.get(status, status)}' hai",
            "item": order.to_dict(),
            "next": (
                ORDER_FLOW[ORDER_FLOW.index(status) + 1]
                if status in ORDER_FLOW and ORDER_FLOW.index(status) + 1 < len(ORDER_FLOW)
                else None
            ),
        }
    )


@orders_bp.patch("/<int:order_id>/shipping")
@jwt_required()
def update_tracking(order_id: int):
    """Courier + tracking id — the buyer sees it on the order page instantly."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    order = Order.query.get_or_404(order_id)
    if not _seller_can_touch(order, user):
        return jsonify({"error": "Ye order aapka nahi hai"}), 403

    body = _json_body()
    order.tracking_id = _clean(body.get("tracking_id"), 120)
    order.courier = _clean(body.get("courier"), 120)

    db.session.add(
        OrderEvent(
            order_id=order.id,
            status=order.status,
            note="Tracking update"
            + (f": {order.courier}" if order.courier else "")
            + (f" {order.tracking_id}" if order.tracking_id else ""),
            actor_id=user.id,
            actor_role=user.role,
        )
    )

    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("update_tracking failed id=%s", order_id)
        return jsonify({"error": "Tracking save nahi hui"}), 500

    return jsonify({"message": "Tracking save ho gayi", "item": order.to_dict()})


__all__ = ["orders_bp"]
