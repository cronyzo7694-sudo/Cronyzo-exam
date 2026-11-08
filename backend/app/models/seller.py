"""Wholesaler / shopkeeper applications.

The rule the operator wants enforced, in his words: *"koi bhi user bina
shopkeeper bane koi product ya book list nahi kar sakta."*

So publishing physical goods or books is **not** self-serve. A member applies,
an admin reviews the shop, and only an approved application unlocks:

    POST /api/shop/products   ← seller (approved) or admin
    POST /api/books           ← seller (approved) or admin

Courses stay open to teachers (they are the teaching product), while admins can
always add inventory directly — exactly how it worked before.

Public exports (stable)::

    SellerApplication, APPLICATION_STATES, is_approved_seller
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# pending | approved | rejected | suspended
APPLICATION_STATES = ("pending", "approved", "rejected", "suspended")


class SellerApplication(db.Model):
    """One shop application per member (re-applying reuses the row)."""

    __tablename__ = "seller_applications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True, index=True
    )

    # ── Shop identity ────────────────────────────────────────
    shop_name = db.Column(db.String(160), nullable=False)
    owner_name = db.Column(db.String(160), nullable=False)
    phone = db.Column(db.String(32), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(120), nullable=True)
    state = db.Column(db.String(120), nullable=True)
    pincode = db.Column(db.String(16), nullable=True)

    # What they intend to sell: products | books | both
    sells = db.Column(db.String(24), default="products", nullable=False)
    gstin = db.Column(db.String(24), nullable=True)
    about = db.Column(db.Text, nullable=True)
    # Optional proof: shop photo, GST certificate, etc. (URL from the uploader)
    document_url = db.Column(db.Text, nullable=True)

    # ── Decision ─────────────────────────────────────────────
    status = db.Column(db.String(16), default="pending", nullable=False, index=True)
    admin_note = db.Column(db.Text, nullable=True)
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = db.relationship("User", foreign_keys=[user_id])
    reviewer = db.relationship("User", foreign_keys=[reviewed_by])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "shop_name": self.shop_name,
            "owner_name": self.owner_name,
            "phone": self.phone,
            "email": self.email,
            "city": self.city,
            "state": self.state,
            "pincode": self.pincode,
            "sells": self.sells,
            "gstin": self.gstin,
            "about": self.about,
            "document_url": self.document_url,
            "status": self.status,
            "admin_note": self.admin_note,
            "reviewed_at": _iso(self.reviewed_at),
            "created_at": _iso(self.created_at),
            # Convenience for the UI
            "applicant": {
                "id": self.user.id,
                "full_name": self.user.full_name,
                "email": self.user.email,
                "role": self.user.role,
            }
            if self.user
            else None,
        }


def is_approved_seller(user) -> bool:
    """True when this member may publish products / books.

    Admins always may. Everyone else needs an approved application — a plain
    `role == "seller"` flag is not enough, because that flag is what a member
    *aspires* to, not what the operator has vetted.
    """
    if user is None:
        return False
    if getattr(user, "role", "") == "admin":
        return True
    app = SellerApplication.query.filter_by(user_id=user.id).first()
    return bool(app and app.status == "approved")
