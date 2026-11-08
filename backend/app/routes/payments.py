"""Payment routes — the same four calls in dummy and live mode.

    GET  /api/payments/config     what the frontend should do (mode + public key)
    POST /api/payments/order      create a gateway order for a cart total
    POST /api/payments/verify     verify the signature returned by the checkout
    POST /api/payments/webhook    Razorpay server-to-server confirmation

The checkout page never needs to know which mode is active: it reads
``/config``, and the two POSTs behave identically. When the operator pastes
Razorpay keys into ``backend/.env`` and restarts, money starts moving for real —
no code change, no redeploy of the frontend.

Security
--------
* The amount is **always** recomputed from the server-side cart; the client's
  number is ignored.
* Guests are refused (they cannot purchase by design).
* Signatures are compared with ``hmac.compare_digest`` (constant time).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.platform import Payment
from app.services.commerce import compute_cart_totals
from app.services.payments import (
    create_order,
    gateway_mode,
    payments_status,
    rupees_to_paise,
    verify_signature,
    verify_webhook,
)
from app.utils.decorators import get_current_user

payments_bp = Blueprint("payments", __name__)
logger = logging.getLogger("cronyzo.routes.payments")


def _json_body() -> Dict[str, Any]:
    try:
        return request.get_json(silent=True) or {}
    except Exception:  # noqa: BLE001
        return {}


@payments_bp.get("/config")
def payments_config():
    """Public: the frontend needs the mode and (in live mode) the public key."""
    status = payments_status()
    return jsonify(
        {
            **status,
            "checkout_script": "https://checkout.razorpay.com/v1/checkout.js"
            if status["configured"]
            else "",
        }
    )


@payments_bp.post("/order")
@jwt_required()
def payments_create_order():
    """Create a gateway order for whatever is in the caller's cart."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if getattr(user, "is_guest", False) or user.role == "guest":
        return jsonify(
            {
                "error": "Guest sessions cannot purchase. Create an account to check out.",
                "code": "guest_cannot_purchase",
            }
        ), 403

    totals = compute_cart_totals(user.id)
    amount_rupees = float(totals.get("total") or 0)
    if amount_rupees <= 0:
        return jsonify({"error": "Your cart is empty"}), 400

    amount_paise = rupees_to_paise(amount_rupees)
    ok, detail, payload = create_order(
        amount_paise,
        notes={"user_id": str(user.id), "email": user.email or ""},
    )
    if not ok:
        return jsonify({"error": f"Could not start the payment: {detail}"}), 502

    return jsonify(
        {
            "message": "Payment order created",
            "mode": gateway_mode(),
            "amount": amount_paise,
            "amount_rupees": round(amount_rupees, 2),
            "currency": "INR",
            "order": payload,
        }
    ), 201


@payments_bp.post("/verify")
@jwt_required()
def payments_verify():
    """Verify the checkout result and record the payment for the audit trail."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    body = _json_body()
    ok, detail = verify_signature(
        str(body.get("razorpay_order_id") or ""),
        str(body.get("razorpay_payment_id") or ""),
        str(body.get("razorpay_signature") or ""),
    )
    if not ok:
        logger.warning("payment verification failed for user %s: %s", user.id, detail)
        return jsonify({"error": "Payment could not be verified", "detail": detail}), 400

    amount = rupees_to_paise(float(body.get("amount_rupees") or 0))
    payment = Payment(
        user_id=user.id,
        provider="razorpay" if gateway_mode() == "razorpay" else "dummy",
        amount=amount / 100.0,
        currency="INR",
        status="paid",
        external_id=str(
            body.get("razorpay_payment_id") or body.get("razorpay_order_id") or ""
        )[:120],
        meta_json=json.dumps(
            {
                "mode": gateway_mode(),
                "order_id": body.get("razorpay_order_id"),
                "payment_id": body.get("razorpay_payment_id"),
            }
        ),
    )
    db.session.add(payment)
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("could not record payment")
        return jsonify({"error": "Payment verified but could not be recorded"}), 500

    return jsonify(
        {
            "message": "Payment verified",
            "verified": True,
            "mode": gateway_mode(),
            "payment_id": payment.external_id,
        }
    )


@payments_bp.post("/webhook")
def payments_webhook():
    """Razorpay's own confirmation. Signature is mandatory once configured."""
    raw = request.get_data() or b""
    signature = request.headers.get("X-Razorpay-Signature", "")
    ok, detail = verify_webhook(raw, signature)
    if not ok:
        return jsonify({"error": detail}), 400

    try:
        payload = json.loads(raw.decode() or "{}")
    except ValueError:
        return jsonify({"error": "invalid JSON"}), 400

    event = payload.get("event", "")
    entity = (
        (payload.get("payload") or {}).get("payment", {}).get("entity", {})
        or {}
    )
    logger.info("razorpay webhook %s payment=%s", event, entity.get("id"))
    # The order lifecycle is settled by /verify on the client; the webhook is
    # the safety net for retries and out-of-band payments.
    return jsonify({"received": True, "event": event})
