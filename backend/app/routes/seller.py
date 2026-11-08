"""Shopkeeper applications and the publishing gate.

    POST /api/seller/apply             submit (or re-submit) an application
    GET  /api/seller/application       my application + whether I may publish
    GET  /api/admin/seller/applications        admin queue
    POST /api/admin/seller/applications/<id>/review   approve | reject

Approving flips the account to `role="seller"` and `creator_type` to `seller`
(or `both` when the member also teaches), which is what every product/book route
checks before it accepts a listing.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.seller import SellerApplication, is_approved_seller
from app.services.telegram import notify_operator
from app.utils.decorators import get_current_user, roles_required

seller_bp = Blueprint("seller", __name__)
admin_seller_bp = Blueprint("admin_seller", __name__)
logger = logging.getLogger("cronyzo.routes.seller")

_REQUIRED = ("shop_name", "owner_name", "phone")


def _json_body() -> Dict[str, Any]:
    try:
        return request.get_json(silent=True) or {}
    except Exception:  # noqa: BLE001
        return {}


def _clean(value: Any, limit: int = 200) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] if text else None


@seller_bp.get("/application")
@jwt_required()
def my_application():
    """What the publishing forms ask before they let anyone through."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    app_row = SellerApplication.query.filter_by(user_id=user.id).first()
    approved = is_approved_seller(user)
    return jsonify(
        {
            "application": app_row.to_dict() if app_row else None,
            "is_seller": approved,
            "can_publish": approved,
            "is_admin": getattr(user, "role", "") == "admin",
            "role": user.role,
        }
    )


@seller_bp.post("/apply")
@jwt_required()
def apply_as_seller():
    """Create or update the caller's shop application."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if getattr(user, "role", "") == "admin":
        return jsonify({"error": "Admins can publish directly — no application needed"}), 400

    body = _json_body()
    missing = [f for f in _REQUIRED if not _clean(body.get(f))]
    if missing:
        return (
            jsonify(
                {
                    "error": "Please fill the required details",
                    "missing": missing,
                }
            ),
            400,
        )

    row = SellerApplication.query.filter_by(user_id=user.id).first()
    if row and row.status == "approved":
        return jsonify({"error": "You are already an approved seller", "application": row.to_dict()}), 400

    if row is None:
        row = SellerApplication(user_id=user.id)
        db.session.add(row)

    row.shop_name = _clean(body.get("shop_name"), 160) or ""
    row.owner_name = _clean(body.get("owner_name"), 160) or ""
    row.phone = _clean(body.get("phone"), 32) or ""
    row.email = _clean(body.get("email"), 255) or user.email
    row.city = _clean(body.get("city"), 120)
    row.state = _clean(body.get("state"), 120)
    row.pincode = _clean(body.get("pincode"), 16)
    sells = (_clean(body.get("sells"), 24) or "products").lower()
    row.sells = sells if sells in ("products", "books", "both") else "products"
    row.gstin = _clean(body.get("gstin"), 24)
    row.about = _clean(body.get("about"), 2000)
    row.document_url = _clean(body.get("document_url"), 2000)
    # Every (re)submission goes back into the queue
    row.status = "pending"
    row.admin_note = None
    row.reviewed_by = None
    row.reviewed_at = None

    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("seller application failed")
        return jsonify({"error": "Could not save your application"}), 500

    # The operator should hear about this on their phone.
    try:
        notify_operator(
            f"New shopkeeper application: {row.shop_name} "
            f"({row.owner_name}, {row.phone}) — review it in Admin → Sellers."
        )
    except Exception:  # noqa: BLE001
        logger.debug("telegram notify skipped", exc_info=True)

    return jsonify(
        {
            "message": "Application submitted — you'll be able to publish once it's approved.",
            "application": row.to_dict(),
        }
    ), 201


# ---------------------------------------------------------------------------
# Admin review
# ---------------------------------------------------------------------------


@admin_seller_bp.get("/applications")
@roles_required("admin")
def list_applications():
    status = (request.args.get("status") or "").strip().lower()
    q = SellerApplication.query
    if status in ("pending", "approved", "rejected", "suspended"):
        q = q.filter_by(status=status)
    items = q.order_by(SellerApplication.created_at.desc()).limit(200).all()
    return jsonify(
        {
            "items": [i.to_dict() for i in items],
            "total": len(items),
            "pending": SellerApplication.query.filter_by(status="pending").count(),
        }
    )


@admin_seller_bp.post("/applications/<int:app_id>/review")
@roles_required("admin")
def review_application(app_id: int):
    row = db.session.get(SellerApplication, app_id)
    if row is None:
        return jsonify({"error": "Application not found"}), 404

    body = _json_body()
    action = (body.get("action") or "").strip().lower()
    note = _clean(body.get("note"), 1000)
    if action not in ("approve", "reject", "suspend"):
        return jsonify({"error": "action must be approve, reject or suspend"}), 400

    admin = get_current_user()
    row.admin_note = note
    row.reviewed_by = admin.id if admin else None
    from app.models.seller import utcnow

    row.reviewed_at = utcnow()

    applicant = row.user
    if action == "approve":
        row.status = "approved"
        if applicant is not None:
            applicant.role = "seller"
            # A teacher who also sells keeps both capabilities
            applicant.creator_type = (
                "both" if getattr(applicant, "creator_type", "") == "teacher" else "seller"
            )
    elif action == "reject":
        row.status = "rejected"
    else:
        row.status = "suspended"

    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("seller review failed")
        return jsonify({"error": "Could not save the decision"}), 500

    if action == "approve":
        try:
            notify_operator(f"Shop approved: {row.shop_name} ({row.owner_name}).")
        except Exception:  # noqa: BLE001
            pass

    return jsonify({"message": f"Application {row.status}", "application": row.to_dict()})
