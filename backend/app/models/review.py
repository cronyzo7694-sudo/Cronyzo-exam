"""Real, moderated reviews — for books and for the site itself.

Everything shown publicly here was written by a signed-in person. Nothing is
seeded: an empty shelf stays empty and the UI says so, which is the honest
signal a new marketplace needs.

``target_type``
    ``book``  — a review of one listing (``target_id`` = book id)
    ``site``  — a review of Cronyzo itself, shown on the landing page
                (the old hard-coded testimonials are gone)

Moderation
    ``is_hidden`` hides a review from the public list without destroying it;
    the admin can hide/unhide or delete outright. Hidden reviews are excluded
    from every average, so hiding a 1-star spam post restores the real score.

Table: ``reviews``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from app.extensions import db

TARGET_TYPES = ("book", "site")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_type = db.Column(db.String(16), nullable=False, default="book", index=True)
    target_id = db.Column(db.Integer, nullable=True, index=True)

    rating = db.Column(db.Integer, nullable=False, default=5)
    title = db.Column(db.String(200), nullable=True)
    body = db.Column(db.Text, nullable=True)

    is_hidden = db.Column(db.Boolean, nullable=False, default=False, index=True)
    is_verified = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=_utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self, include_moderation: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "rating": int(self.rating or 0),
            "title": self.title,
            "body": self.body,
            "is_verified": bool(self.is_verified),
            "user": {
                "id": self.user_id,
                "full_name": (self.user.full_name if self.user else None) or "Cronyzo user",
                "avatar_url": self.user.avatar_url if self.user else None,
                "role": self.user.role if self.user else None,
            },
            "created_at": _iso(self.created_at),
        }
        if include_moderation:
            data["is_hidden"] = bool(self.is_hidden)
            data["user"]["email"] = self.user.email if self.user else None
        return data

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Review {self.target_type}:{self.target_id} {self.rating}★>"
