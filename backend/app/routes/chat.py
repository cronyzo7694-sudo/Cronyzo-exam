"""Chat and support routes.

Two public-facing surfaces, both under ``/api``:

``/api/chat/*``
    Real 1:1 messaging between signed-in users. Delivered by polling so it works
    behind any proxy and needs no websocket server: the client asks
    ``GET /threads/<id>/messages?after=<id>`` and receives only new rows.

``/api/contact*``
    The help form. A message is stored, mirrored to Telegram (see
    :mod:`app.services.telegram`) and answered from the admin panel. The
    visitor can re-open their thread by ticket id + email, so no account is
    required.

Routes
------
GET    /api/chat/threads                     my conversations
POST   /api/chat/threads                     start / reuse a conversation with a user
GET    /api/chat/threads/<id>/messages       messages after a cursor
POST   /api/chat/threads/<id>/messages       send a message
POST   /api/chat/threads/<id>/read           mark the other side's messages read
GET    /api/chat/unread                      unread badge count
POST   /api/contact                          submit a help message
GET    /api/contact/mine                     my tickets (signed in)
POST   /api/contact/lookup                   look up a ticket by id + email
GET    /api/contact/config                   is Telegram wired up?

Public exports (stable)::

    chat_bp, contact_bp
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, or_

from app.extensions import db
from app.models.chat import (
    ChatMessage,
    ChatThread,
    ContactReply,
    ContactTicket,
    thread_key,
)
from app.models.user import User
from app.services.telegram import (
    notify_contact_ticket,
    telegram_configured,
    telegram_status,
)
from app.utils.decorators import get_current_user, roles_required

chat_bp = Blueprint("chat", __name__)
contact_bp = Blueprint("contact", __name__)
logger = logging.getLogger("cronyzo.routes.chat")

_MAX_BODY = 4000
_MAX_TOPIC = 64


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _clip(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def _require_member() -> Tuple[Optional[User], Any]:
    """Chat requires a real account — guests have no inbox identity."""
    user = get_current_user()
    if user is None:
        return None, (jsonify({"error": "Authentication required"}), 401)
    if (user.role or "") == "guest":
        return None, (
            jsonify(
                {
                    "error": "Save your account first",
                    "detail": "Guest sessions can browse, but chat needs a saved account.",
                    "code": "guest_cannot_chat",
                }
            ),
            403,
        )
    return user, None


def _thread_for(viewer: User, thread_id: int) -> Optional[ChatThread]:
    thread = db.session.get(ChatThread, thread_id)
    if thread is None:
        return None
    if int(viewer.id) not in (int(thread.user_a_id), int(thread.user_b_id)):
        return None
    return thread


# ═══════════════════════════════════════════════════════════════════════════
# Chat
# ═══════════════════════════════════════════════════════════════════════════
@chat_bp.get("/threads")
def list_threads():
    user, err = _require_member()
    if err:
        return err

    rows = (
        ChatThread.query.filter(
            or_(ChatThread.user_a_id == user.id, ChatThread.user_b_id == user.id)
        )
        .order_by(ChatThread.last_message_at.desc())
        .limit(100)
        .all()
    )

    # One query for unread counts across every thread instead of N+1
    unread: Dict[int, int] = {}
    if rows:
        ids = [t.id for t in rows]
        counts = (
            db.session.query(ChatMessage.thread_id, db.func.count(ChatMessage.id))
            .filter(
                ChatMessage.thread_id.in_(ids),
                ChatMessage.sender_id != user.id,
                ChatMessage.read_at.is_(None),
            )
            .group_by(ChatMessage.thread_id)
            .all()
        )
        unread = {int(tid): int(n) for tid, n in counts}

    return jsonify(
        {
            "threads": [
                {**t.to_dict(user.id), "unread": unread.get(t.id, 0)} for t in rows
            ]
        }
    )


@chat_bp.post("/threads")
def start_thread():
    """Start (or reuse) a conversation with ``peer_id``.

    ``peer_id`` is normally a teacher or seller the visitor is looking at. A
    thread is unique per pair, so clicking "Message seller" twice returns the
    same conversation rather than creating duplicates.
    """
    user, err = _require_member()
    if err:
        return err

    body = _json_body()
    try:
        peer_id = int(body.get("peer_id") or 0)
    except (TypeError, ValueError):
        peer_id = 0

    if not peer_id or peer_id == int(user.id):
        return jsonify({"error": "A valid peer_id is required"}), 400

    peer = db.session.get(User, peer_id)
    if peer is None or not peer.is_active:
        return jsonify({"error": "That person is not available"}), 404
    if (peer.role or "") == "guest":
        return jsonify({"error": "Guests cannot receive messages"}), 400

    low, high = sorted((int(user.id), int(peer.id)))
    thread = ChatThread.query.filter_by(user_a_id=low, user_b_id=high).first()
    created = False
    if thread is None:
        thread = ChatThread(user_a_id=low, user_b_id=high)
        db.session.add(thread)
        db.session.flush()
        created = True

    # An optional first message, so "Message seller" can post in one round trip
    first = _clip(body.get("message"), _MAX_BODY)
    if first:
        msg = ChatMessage(thread_id=thread.id, sender_id=user.id, body=first)
        db.session.add(msg)
        thread.last_message_at = _utcnow()
        thread.last_message_preview = first[:200]

    db.session.commit()
    return jsonify(
        {"message": "Thread ready", "created": created, "thread": thread.to_dict(user.id)}
    ), (201 if created else 200)


@chat_bp.get("/threads/<int:thread_id>/messages")
def list_messages(thread_id: int):
    user, err = _require_member()
    if err:
        return err

    thread = _thread_for(user, thread_id)
    if thread is None:
        return jsonify({"error": "Thread not found"}), 404

    after = request.args.get("after", type=int) or 0
    query = ChatMessage.query.filter(ChatMessage.thread_id == thread.id)
    if after:
        query = query.filter(ChatMessage.id > after)
    rows = query.order_by(ChatMessage.id.asc()).limit(200).all()

    return jsonify(
        {
            "thread": thread.to_dict(user.id),
            "messages": [m.to_dict(user.id) for m in rows],
            "cursor": rows[-1].id if rows else after,
        }
    )


@chat_bp.post("/threads/<int:thread_id>/messages")
def send_message(thread_id: int):
    user, err = _require_member()
    if err:
        return err

    thread = _thread_for(user, thread_id)
    if thread is None:
        return jsonify({"error": "Thread not found"}), 404

    body_text = _clip(_json_body().get("body"), _MAX_BODY)
    if not body_text:
        return jsonify({"error": "Message body is required"}), 400

    msg = ChatMessage(thread_id=thread.id, sender_id=user.id, body=body_text)
    db.session.add(msg)
    thread.last_message_at = _utcnow()
    thread.last_message_preview = body_text[:200]
    db.session.commit()

    return jsonify({"message": "Sent", "chat_message": msg.to_dict(user.id)}), 201


@chat_bp.post("/threads/<int:thread_id>/read")
def mark_read(thread_id: int):
    user, err = _require_member()
    if err:
        return err

    thread = _thread_for(user, thread_id)
    if thread is None:
        return jsonify({"error": "Thread not found"}), 404

    updated = (
        ChatMessage.query.filter(
            ChatMessage.thread_id == thread.id,
            ChatMessage.sender_id != user.id,
            ChatMessage.read_at.is_(None),
        ).update({ChatMessage.read_at: _utcnow()}, synchronize_session=False)
    )
    db.session.commit()
    return jsonify({"message": "Marked read", "updated": int(updated or 0)})


@chat_bp.get("/unread")
def unread_count():
    user, err = _require_member()
    if err:
        return err

    thread_ids = [
        row[0]
        for row in db.session.query(ChatThread.id)
        .filter(or_(ChatThread.user_a_id == user.id, ChatThread.user_b_id == user.id))
        .all()
    ]
    if not thread_ids:
        return jsonify({"unread": 0, "threads": 0})

    total = (
        db.session.query(db.func.count(ChatMessage.id))
        .filter(
            ChatMessage.thread_id.in_(thread_ids),
            ChatMessage.sender_id != user.id,
            ChatMessage.read_at.is_(None),
        )
        .scalar()
    )
    return jsonify({"unread": int(total or 0), "threads": len(thread_ids)})


# ═══════════════════════════════════════════════════════════════════════════
# Contact / helpdesk
# ═══════════════════════════════════════════════════════════════════════════
@contact_bp.get("/config")
def contact_config():
    """What the help form should tell the visitor (no secrets)."""
    status = telegram_status()
    return jsonify(
        {
            "telegram_configured": status["configured"],
            "telegram_two_way": status["configured"] and not status.get("poller_disabled"),
            "public_handle": status.get("public_handle") or "",
            "reply_window": "Usually within a few hours",
        }
    )


@contact_bp.post("")
def submit_contact():
    """Store a help message and mirror it to Telegram.

    Guests are allowed — asking for help should never require an account.
    """
    body = _json_body()
    message = _clip(body.get("message"), 5000)
    if not message or len(message) < 5:
        return jsonify({"error": "Please write a few words about your question"}), 400

    user = get_current_user()
    name = _clip(body.get("name"), 150) or (user.full_name if user else None)
    email = _clip(body.get("email"), 255) or (user.email if user else None)
    phone = _clip(body.get("phone"), 32) or (user.phone if user else None)
    topic = _clip(body.get("topic"), _MAX_TOPIC) or "general"

    if not name:
        return jsonify({"error": "Please tell us your name"}), 400
    if not email and not phone:
        return jsonify({"error": "Add an email or a phone number so we can reply"}), 400

    ticket = ContactTicket(
        user_id=user.id if user else None,
        name=name,
        email=email,
        phone=phone,
        topic=topic,
        message=message,
    )
    db.session.add(ticket)
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("submit_contact failed")
        return jsonify({"error": "Could not save your message"}), 500

    # Telegram is best-effort: the ticket is already persisted either way.
    ok, detail, telegram_message_id = notify_contact_ticket(ticket)
    ticket.telegram_sent = bool(ok)
    ticket.telegram_error = None if ok else detail[:255]
    # Keep the id so a swipe-reply on the notification routes back to this ticket
    ticket.telegram_message_id = telegram_message_id if ok else None
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()

    return (
        jsonify(
            {
                "message": "Thanks — we have your message and will reply soon.",
                "ticket_id": ticket.id,
                "telegram_sent": bool(ok),
            }
        ),
        201,
    )


@contact_bp.get("/mine")
def my_tickets():
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    rows = (
        ContactTicket.query.filter_by(user_id=user.id)
        .order_by(ContactTicket.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({"tickets": [t.to_dict() for t in rows]})


@contact_bp.post("/lookup")
def lookup_ticket():
    """Find a ticket by id + the email/phone it was filed with.

    Requiring both halves means a guessed ticket id leaks nothing.
    """
    body = _json_body()
    try:
        ticket_id = int(body.get("ticket_id") or 0)
    except (TypeError, ValueError):
        ticket_id = 0
    contact = (_clip(body.get("email"), 255) or _clip(body.get("phone"), 32) or "").lower()

    if not ticket_id or not contact:
        return jsonify({"error": "Ticket id and email (or phone) are required"}), 400

    ticket = db.session.get(ContactTicket, ticket_id)
    if ticket is None:
        return jsonify({"error": "No ticket matches those details"}), 404

    stored = [(ticket.email or "").lower(), (ticket.phone or "").lower()]
    if contact not in stored:
        return jsonify({"error": "No ticket matches those details"}), 404

    return jsonify({"ticket": ticket.to_dict()})


# ═══════════════════════════════════════════════════════════════════════════
# Admin inbox
# ═══════════════════════════════════════════════════════════════════════════
@contact_bp.get("/admin/tickets")
@roles_required("admin")
def admin_list_tickets():
    status = request.args.get("status")
    query = ContactTicket.query
    if status:
        query = query.filter(ContactTicket.status == status)
    rows = query.order_by(ContactTicket.created_at.desc()).limit(200).all()
    open_count = ContactTicket.query.filter(ContactTicket.status == "open").count()
    return jsonify(
        {"tickets": [t.to_dict() for t in rows], "open": int(open_count or 0)}
    )


@contact_bp.post("/admin/tickets/<int:ticket_id>/reply")
@roles_required("admin")
def admin_reply_ticket(ticket_id: int):
    ticket = db.session.get(ContactTicket, ticket_id)
    if ticket is None:
        return jsonify({"error": "Ticket not found"}), 404

    body_text = _clip(_json_body().get("body"), 5000)
    if not body_text:
        return jsonify({"error": "Reply body is required"}), 400

    admin = get_current_user()
    reply = ContactReply(
        ticket_id=ticket.id,
        author_id=admin.id if admin else None,
        body=body_text,
        channel="panel",
    )
    db.session.add(reply)
    ticket.status = "answered"
    db.session.commit()

    return jsonify({"message": "Reply sent", "ticket": ticket.to_dict()}), 201
