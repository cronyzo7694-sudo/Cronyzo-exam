"""Telegram delivery for support tickets and operator alerts.

The operator reads every "Help" message on Telegram and answers from their
phone. This module is the whole integration:

* ``send_message`` — posts Markdown-safe HTML to the configured chat.
* ``notify_contact_ticket`` — formats a ticket nicely and reports success.
* ``get_updates`` / ``handle_update`` — the **inbound** half: the operator
  replies to the notification on their phone and the answer lands back in the
  ticket thread, in the admin inbox and in the visitor's own view.
* ``start_poller`` — a daemon thread (started at boot) that long-polls Telegram
  and routes replies. Only runs when the bot is configured.

Configuration (environment, all optional)::

    TELEGRAM_BOT_TOKEN        students: courses, teaching, general help
    TELEGRAM_SHOP_BOT_TOKEN   shopping: orders, products, sellers, stores
    TELEGRAM_CHAT_ID          numeric chat id, or @channelusername (both bots)
    TELEGRAM_POLL_SECONDS     poll interval, default 8 (0 disables the poller)

Two bots, one inbox
-------------------
The operator asked for shopping traffic and study traffic to arrive in
separate chats. :func:`bot_for_topic` picks the bot from the ticket topic;
everything else (chat id, replies, formatting) is shared.

Both must be present for delivery to be attempted. When they are missing the
call returns ``(False, "telegram not configured")`` — the ticket is still saved,
so nothing is ever lost, and the admin panel shows the delivery state.

Security notes
--------------
* The bot token is never logged and never returned by any API.
* Message text is HTML-escaped before it reaches Telegram, so a user cannot
  inject markup into the operator's chat.
* Requests time out quickly so a slow Telegram never blocks a help submission.

Public exports (stable)::

    telegram_configured, send_message, notify_contact_ticket,
    notify_operator, telegram_status, get_updates, handle_update, start_poller
"""

from __future__ import annotations

import html
import logging
import os
from typing import Any, Dict, Optional, Tuple

import requests

logger = logging.getLogger("cronyzo.telegram")

_API_BASE = "https://api.telegram.org"
_TIMEOUT = 6  # seconds — never let a help submission hang on Telegram
_MAX_BODY = 3500  # Telegram hard limit is 4096; keep headroom for the wrapper


# Topics that belong to the shopping bot rather than the student bot.
SHOP_TOPICS = {"order", "product", "seller", "store", "shipping", "return", "refund", "payment"}


def _student_token() -> str:
    return (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()


def _shop_token() -> str:
    return (os.getenv("TELEGRAM_SHOP_BOT_TOKEN") or "").strip()


def _token(kind: str = "student") -> str:
    """Token for the given channel, falling back to the other bot if unset."""
    if kind == "shop":
        return _shop_token() or _student_token()
    return _student_token() or _shop_token()


def bot_for_topic(topic: Optional[str]) -> str:
    """Which bot should carry this ticket: ``"shop"`` or ``"student"``."""
    t = (topic or "").strip().lower()
    return "shop" if t in SHOP_TOPICS else "student"


def bot_username(kind: str = "student") -> str:
    """Cached @username for a channel, for display in the admin panel."""
    return _BOT_NAMES.get(kind, "")


_BOT_NAMES: Dict[str, str] = {}


def _chat_id() -> str:
    return (os.getenv("TELEGRAM_CHAT_ID") or "").strip()


def telegram_configured() -> bool:
    """True when at least one bot token and a target chat are present."""
    return bool((_student_token() or _shop_token()) and _chat_id())


def shop_bot_configured() -> bool:
    return bool(_shop_token())


def telegram_status() -> Dict[str, Any]:
    """Non-secret summary for the admin panel / health endpoint."""
    try:
        poll_seconds = int(os.getenv("TELEGRAM_POLL_SECONDS", "8"))
    except ValueError:
        poll_seconds = 8
    return {
        "configured": telegram_configured(),
        "has_token": bool(_student_token()),
        "has_shop_token": bool(_shop_token()),
        "has_chat_id": bool(_chat_id()),
        "student_bot": bot_username("student"),
        "shop_bot": bot_username("shop"),
        "poller_seconds": poll_seconds,
        "poller_disabled": poll_seconds <= 0,
        # Public handle the operator wants shown in the UI, if any
        "public_handle": (os.getenv("TELEGRAM_PUBLIC_HANDLE") or "").strip(),
    }


def _esc(value: Any, limit: int = _MAX_BODY) -> str:
    text = "" if value is None else str(value)
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return html.escape(text, quote=False)


def send_message(
    text: str, chat_id: Optional[str] = None, kind: str = "student"
) -> Tuple[bool, str]:
    """Post ``text`` (HTML) to Telegram.

    Returns ``(ok, detail)``. Never raises.
    """
    ok, detail, _ = send_message_ex(text, chat_id, kind)
    return ok, detail


def send_message_ex(
    text: str, chat_id: Optional[str] = None, kind: str = "student"
) -> Tuple[bool, str, Optional[str]]:
    """Same as :func:`send_message` but also returns Telegram's message id.

    The id is what makes a two-way conversation possible: we store it on the
    ticket, and when the operator swipes-to-reply on that message the inbound
    poller knows which ticket the answer belongs to.
    """
    if not telegram_configured():
        return False, "telegram not configured", None
    target = (chat_id or _chat_id()).strip()
    if not target:
        return False, "telegram chat id missing", None
    if not text or not text.strip():
        return False, "empty message", None

    token = _token(kind)
    url = f"{_API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": target,
        "text": text[:_MAX_BODY],
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        # Log the exception type only — the message may contain the token
        logger.warning("telegram send failed: %s", type(exc).__name__)
        return False, f"network error ({type(exc).__name__})", None

    if resp.status_code == 200:
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if body.get("ok"):
            result = body.get("result") or {}
            message_id = result.get("message_id")
            return True, "sent", str(message_id) if message_id else None
        return False, f"telegram rejected: {body.get('description', 'unknown')[:180]}", None

    return False, f"telegram http {resp.status_code}", None


def notify_contact_ticket(ticket) -> Tuple[bool, str]:
    """Format a :class:`ContactTicket` and push it to the operator chat."""
    from app.config import Config  # local import avoids a circular import at boot

    base = getattr(Config, "PUBLIC_SITE_URL", "") or ""
    lines = [
        "🆕 <b>New Cronyzo support message</b>",
        "",
        f"<b>From:</b> {_esc(ticket.name, 150)}",
    ]
    if ticket.email:
        lines.append(f"<b>Email:</b> {_esc(ticket.email, 200)}")
    if ticket.phone:
        lines.append(f"<b>Phone:</b> {_esc(ticket.phone, 40)}")
    lines.append(f"<b>Topic:</b> {_esc(ticket.topic, 60)}")
    lines.append(f"<b>Ticket:</b> #{ticket.id}")
    lines.append("")
    lines.append(_esc(ticket.message))
    lines.append("")
    lines.append("<i>Reply to this message and your answer lands in the ticket.</i>")
    if base:
        lines.append(f'<a href="{_esc(base.rstrip("/"))}/admin/support">Open in admin</a>')

    kind = bot_for_topic(getattr(ticket, "topic", None))
    head = "🛒 <b>New shop message</b>" if kind == "shop" else "🆕 <b>New support message</b>"
    lines[0] = head
    return send_message_ex("\n".join(lines), kind=kind)


# ─────────────────────────────────────────────────────────────
# Inbound: the operator answers from their phone
# ─────────────────────────────────────────────────────────────


def _api_get(method: str, params: Optional[Dict[str, Any]] = None,
             kind: str = "student") -> Tuple[bool, str, Any]:
    """Call a Bot API method. Returns ``(ok, detail, result)``. Never raises."""
    token = _token(kind)
    if not token:
        return False, "bot token missing", None
    try:
        resp = requests.get(
            f"{_API_BASE}/bot{token}/{method}",
            params=params or {},
            timeout=_TIMEOUT,
        )
        body = resp.json() if resp.content else {}
    except requests.RequestException as exc:
        return False, f"network error ({type(exc).__name__})", None
    except ValueError:
        return False, "telegram returned a non-JSON reply", None

    if body.get("ok"):
        return True, "ok", body.get("result")
    return False, str(body.get("description") or f"http {resp.status_code}")[:180], None


def get_me(kind: str = "student") -> Tuple[bool, str, Optional[str]]:
    """Verify a bot token. Returns ``(ok, detail, bot_username)``."""
    ok, detail, result = _api_get("getMe", kind=kind)
    if not ok:
        return False, detail, None
    username = (result or {}).get("username")
    if username:
        _BOT_NAMES[kind] = username
    return True, "ok", username


def get_chat(chat_id: Optional[str] = None) -> Tuple[bool, str]:
    """Check the target chat is reachable (the operator pressed Start)."""
    target = (chat_id or _chat_id()).strip()
    if not target:
        return False, "chat id missing"
    ok, detail, result = _api_get("getChat", {"chat_id": target})
    if not ok:
        return False, detail
    title = (result or {}).get("title") or (result or {}).get("username") or target
    return True, f"reachable: {title}"


def get_updates(offset: Optional[int] = None, timeout: int = 0,
                kind: str = "student") -> list:
    """Fetch pending updates for one bot. Returns ``[]`` on failure."""
    if not (_student_token() or _shop_token()):
        return []
    url = f"{_API_BASE}/bot{_token(kind)}/getUpdates"
    params: Dict[str, Any] = {
        "timeout": max(0, int(timeout)),
        "allowed_updates": '["message"]',
    }
    if offset is not None:
        params["offset"] = int(offset)
    try:
        resp = requests.get(url, params=params, timeout=_TIMEOUT + timeout)
        if resp.status_code != 200:
            return []
        body = resp.json()
        if not body.get("ok"):
            return []
        return body.get("result") or []
    except Exception as exc:  # noqa: BLE001 — a poller must never die
        logger.warning("telegram getUpdates failed: %s", type(exc).__name__)
        return []


def _ticket_message_ids(raw: str):
    """Pull every plausible id out of ``reply_to_message`` text/hint."""
    import re

    return [int(m) for m in re.findall(r"\d+", raw or "")]


def handle_update(update: Dict[str, Any], kind: str = "student") -> Optional[int]:
    """Route one Telegram update into a ticket reply.

    Returns the ticket id that was answered, or ``None`` if the update was not
    an operator reply (wrong chat, a command, a photo, ...).

    A message is treated as a ticket answer when it is **sent from the operator
    chat** and either

    * replies to the notification we sent (``reply_to_message.message_id``
      matches ``ContactTicket.telegram_message_id``), or
    * starts with ``#<ticket id>`` — a typed fallback that works even when the
      operator forwards the notification into another chat.
    """
    from app.extensions import db
    from app.models.chat import ContactReply, ContactTicket

    msg = (update or {}).get("message") or {}
    if not msg:
        return None

    chat = msg.get("chat") or {}
    expected = _chat_id()
    if expected:
        # Numeric chat ids come back as ints; @handles as usernames
        incoming = str(chat.get("id") or chat.get("username") or "")
        if expected.startswith("@"):
            if incoming.lstrip("@").lower() != expected.lstrip("@").lower():
                return None
        elif incoming != expected:
            return None

    text = (msg.get("text") or msg.get("caption") or "").strip()
    if not text:
        return None

    ticket = None
    replied_to = (msg.get("reply_to_message") or {}).get("message_id")
    if replied_to is not None:
        ticket = ContactTicket.query.filter_by(
            telegram_message_id=str(replied_to)
        ).first()

    if ticket is None:
        head = text.split()[0] if text.split() else ""
        if head.startswith("#") and head[1:].isdigit():
            ticket = db.session.get(ContactTicket, int(head[1:]))

    if ticket is None:
        logger.info("telegram update ignored (no ticket matched)")
        return None

    # Strip a leading "#12 " marker so the stored reply reads naturally
    body = text
    if body.startswith("#") and body.split()[0][1:].isdigit():
        body = body.split(" ", 1)[1] if " " in body else ""

    if not body:
        return None

    db.session.add(
        ContactReply(
            ticket_id=ticket.id,
            body=body,
            channel="telegram_shop" if kind == "shop" else "telegram",
            author_id=None,
        )
    )
    ticket.status = "answered"
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("could not store telegram reply for ticket %s", ticket.id)
        return None

    logger.info("telegram reply stored on ticket %s", ticket.id)
    return ticket.id


def _offset(kind: str = "student") -> int:
    """Remember how far we have read, so restarts do not replay old replies."""
    from app.extensions import db
    from app.models.site import SiteSetting

    key = "telegram.update_offset" if kind == "student" else f"telegram.update_offset.{kind}"
    try:
        row = SiteSetting.query.filter_by(key=key).first()
        return int(row.value) if row and str(row.value).isdigit() else 0
    except Exception:  # noqa: BLE001
        return 0


def _set_offset(value: int, kind: str = "student") -> None:
    from app.extensions import db
    from app.models.site import SiteSetting

    key = "telegram.update_offset" if kind == "student" else f"telegram.update_offset.{kind}"
    try:
        row = SiteSetting.query.filter_by(key=key).first()
        if row:
            row.value = str(value)
        else:
            db.session.add(SiteSetting(key=key, value=str(value)))
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()


def poll_once() -> int:
    """One polling pass across **both** bots.

    Replies from either phone chat land in the same ticket thread — the channel
    just tells you which bot the operator answered on.
    """
    processed = 0
    for kind in ("student", "shop"):
        if not _token(kind):
            continue
        processed += _poll_kind(kind)
    return processed


def _poll_kind(kind: str) -> int:
    processed = 0
    offset = _offset(kind)
    for update in get_updates(offset=offset or None, kind=kind):
        update_id = update.get("update_id")
        if isinstance(update_id, int):
            offset = max(offset, update_id + 1)
        try:
            if handle_update(update, kind=kind):
                processed += 1
        except Exception:  # noqa: BLE001
            logger.exception("telegram update handling crashed")
    if offset:
        _set_offset(offset, kind)
    return processed


def start_poller(app, interval: Optional[int] = None) -> Optional[Any]:
    """Start the inbound daemon thread. No-op unless the bot is configured.

    ``TELEGRAM_POLL_SECONDS=0`` switches it off. The thread is a daemon, uses
    its own app context per tick, and swallows every exception — a support bot
    must never be able to take the API down.
    """
    if not telegram_configured():
        logger.info("telegram inbound poller idle (bot not configured)")
        return None

    try:
        seconds = int(os.getenv("TELEGRAM_POLL_SECONDS", "8"))
    except ValueError:
        seconds = 8
    if interval is not None:
        seconds = interval
    if seconds <= 0:
        logger.info("telegram inbound poller disabled by configuration")
        return None

    import threading
    import time

    stop = threading.Event()

    def _loop() -> None:
        logger.info("telegram inbound poller started (every %ss)", seconds)
        while not stop.is_set():
            try:
                with app.app_context():
                    poll_once()
            except Exception:  # noqa: BLE001
                logger.exception("telegram poller tick failed")
            stop.wait(seconds)

    thread = threading.Thread(target=_loop, name="cronyzo-telegram", daemon=True)
    thread.start()
    thread.stop_event = stop  # type: ignore[attr-defined]  # lets callers shut it down
    return thread


def notify_operator(text: str) -> Tuple[bool, str]:
    """Free-form operator alert (new seller, payout, etc.)."""
    return send_message(f"🔔 <b>Cronyzo</b>\n{_esc(text)}")
