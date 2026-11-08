"""Chat and support models.

Two separate concerns live here on purpose:

``ChatThread`` / ``ChatMessage``
    A real conversation between two Cronyzo users (a learner asking a teacher
    about a course, a buyer asking a seller about stock). Delivered by polling
    against a cursor — no websocket dependency, which keeps deployment behind
    any proxy trivial.

``ContactTicket`` / ``ContactReply``
    The "Help" form. A visitor writes once; the message is mirrored to Telegram
    so the operator sees it instantly on their phone and can answer from the
    admin panel. Replies are stored so the visitor sees the thread in-app too.

Public exports (stable)::

    ChatThread, ChatMessage, ContactTicket, ContactReply
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

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


def thread_key(a_id: int, b_id: int) -> str:
    """Stable, order-independent key for a 1:1 conversation."""
    low, high = sorted((int(a_id), int(b_id)))
    return f"{low}-{high}"


class ChatThread(db.Model):
    """A 1:1 conversation between two users."""

    __tablename__ = "chat_threads"
    __table_args__ = (
        db.UniqueConstraint("user_a_id", "user_b_id", name="uq_chat_thread_pair"),
    )

    id = db.Column(db.Integer, primary_key=True)
    # Always stored low-id-first so the pair is unique regardless of who started
    user_a_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    user_b_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    last_message_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    last_message_preview = db.Column(db.String(200), nullable=True)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    user_a = db.relationship("User", foreign_keys=[user_a_id])
    user_b = db.relationship("User", foreign_keys=[user_b_id])

    def other_user(self, viewer_id: int):
        return self.user_b if int(viewer_id) == int(self.user_a_id) else self.user_a

    def to_dict(self, viewer_id: int) -> Dict[str, Any]:
        other = self.other_user(viewer_id)
        return {
            "id": self.id,
            "peer": {
                "id": other.id,
                "full_name": other.full_name,
                "avatar_url": other.avatar_url,
                "role": other.role,
                "is_verified": bool(getattr(other, "is_verified", False)),
            },
            "last_message_preview": self.last_message_preview,
            "last_message_at": _iso(self.last_message_at),
        }


class ChatMessage(db.Model):
    """One message inside a :class:`ChatThread`."""

    __tablename__ = "chat_messages"

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(
        db.Integer, db.ForeignKey("chat_threads.id"), nullable=False, index=True
    )
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    body = db.Column(db.Text, nullable=False)
    # Optional attachment (image / pdf) — kept short because it is a URL
    attachment_url = db.Column(db.String(2048), nullable=True)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    sender = db.relationship("User", foreign_keys=[sender_id])

    def to_dict(self, viewer_id: int) -> Dict[str, Any]:
        return {
            "id": self.id,
            "thread_id": self.thread_id,
            "sender_id": self.sender_id,
            "sender_name": self.sender.full_name if self.sender else "Cronyzo",
            "body": self.body,
            "attachment_url": self.attachment_url,
            "is_mine": int(self.sender_id) == int(viewer_id),
            "read_at": _iso(self.read_at),
            "created_at": _iso(self.created_at),
        }


class ContactTicket(db.Model):
    """A help / contact request from any visitor, mirrored to Telegram."""

    __tablename__ = "contact_tickets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(32), nullable=True)
    topic = db.Column(db.String(64), default="general", nullable=False)
    message = db.Column(db.Text, nullable=False)

    # open | answered | closed
    status = db.Column(db.String(24), default="open", nullable=False, index=True)
    # Whether the Telegram mirror succeeded — surfaced in the admin list
    telegram_sent = db.Column(db.Boolean, default=False, nullable=False)
    telegram_error = db.Column(db.String(255), nullable=True)
    # The message id Telegram assigned to our notification. The operator answers
    # by *replying* to that message, so this is the join key for the inbound
    # poller (see app.services.telegram.handle_update).
    telegram_message_id = db.Column(db.String(64), nullable=True, index=True)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = db.relationship("User", foreign_keys=[user_id])
    replies = db.relationship(
        "ContactReply",
        back_populates="ticket",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "topic": self.topic,
            "message": self.message,
            "status": self.status,
            "telegram_sent": bool(self.telegram_sent),
            "telegram_linked": bool(self.telegram_message_id),
            "created_at": _iso(self.created_at),
            "replies": [r.to_dict() for r in (self.replies or [])],
        }


class ContactReply(db.Model):
    """An operator reply attached to a :class:`ContactTicket`."""

    __tablename__ = "contact_replies"

    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(
        db.Integer, db.ForeignKey("contact_tickets.id"), nullable=False, index=True
    )
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    body = db.Column(db.Text, nullable=False)
    # Where the reply was typed: "panel" (admin inbox) or "telegram" (phone)
    channel = db.Column(db.String(16), default="panel", nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    ticket = db.relationship("ContactTicket", back_populates="replies")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "body": self.body,
            "channel": self.channel or "panel",
            "created_at": _iso(self.created_at),
        }
