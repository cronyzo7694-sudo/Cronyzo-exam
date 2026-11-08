"""Payment gateway — one interface, two implementations.

The operator's requirement, in their words: *"Rakho Razorpay ka jagah, tab tak
dummy — aur aisa banao ki key daalte hi real payment chalu ho jaye, dobara
coding na karni pade."*

So this module exposes the same four calls in both modes:

    mode              = "dummy"    → everything succeeds locally, no money moves
    mode              = "razorpay" → the identical calls hit Razorpay's live API

Switching is **one environment variable** (or nothing at all: paste the keys and
`PAYMENTS_MODE=auto` flips it). No route, component or schema changes.

    PAYMENTS_MODE          auto | dummy | razorpay     (default: auto)
    RAZORPAY_KEY_ID        rzp_live_… / rzp_test_…
    RAZORPAY_KEY_SECRET    never leaves the server
    RAZORPAY_WEBHOOK_SECRET  optional, for /api/payments/webhook

Money is always handled in paise (integers) to keep floats out of the ledger.

Public exports
--------------
    payments_status, create_order, verify_signature, verify_webhook, gateway_mode
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import uuid
from typing import Any, Dict, Optional, Tuple

import requests

logger = logging.getLogger("cronyzo.payments")

_RAZORPAY_API = "https://api.razorpay.com/v1"
_TIMEOUT = 12


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def _key_id() -> str:
    return (os.getenv("RAZORPAY_KEY_ID") or "").strip()


def _key_secret() -> str:
    return (os.getenv("RAZORPAY_KEY_SECRET") or "").strip()


def _webhook_secret() -> str:
    return (os.getenv("RAZORPAY_WEBHOOK_SECRET") or "").strip()


def _requested_mode() -> str:
    return (os.getenv("PAYMENTS_MODE") or "auto").strip().lower()


def gateway_mode() -> str:
    """``"razorpay"`` when the gateway is usable, otherwise ``"dummy"``.

    ``PAYMENTS_MODE=dummy`` forces the sandbox even when keys exist, so a live
    deployment can be demoed without charging anyone.
    """
    requested = _requested_mode()
    if requested == "dummy":
        return "dummy"
    if _key_id() and _key_secret():
        return "razorpay"
    if requested == "razorpay":
        # Asked for live but the keys are missing — stay safe, say so loudly.
        logger.warning("PAYMENTS_MODE=razorpay but keys are missing; using dummy mode")
    return "dummy"


def payments_status() -> Dict[str, Any]:
    """Non-secret summary. `key_id` is public (Razorpay's own checkout needs it)."""
    mode = gateway_mode()
    return {
        "mode": mode,
        "configured": mode == "razorpay",
        "key_id": _key_id() if mode == "razorpay" else "",
        "currency": "INR",
        "test_keys": _key_id().startswith("rzp_test_") if _key_id() else False,
        "dummy_reason": "" if mode == "razorpay" else (
            "Razorpay keys are not set — the UI charges nothing and marks the order "
            "as a demo payment."
        ),
    }


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


def create_order(
    amount_paise: int,
    receipt: Optional[str] = None,
    notes: Optional[Dict[str, str]] = None,
) -> Tuple[bool, str, Dict[str, Any]]:
    """Create a payment order. Returns ``(ok, detail, payload)``.

    In ``razorpay`` mode this is a real POST to Razorpay. In ``dummy`` mode it
    returns a locally-generated order so the frontend flow is identical.
    """
    amount = max(0, int(amount_paise))
    receipt = (receipt or f"cz_{uuid.uuid4().hex[:12]}")[:40]

    if gateway_mode() == "dummy":
        return True, "dummy order", {
            "id": f"order_dummy_{uuid.uuid4().hex[:14]}",
            "amount": amount,
            "currency": "INR",
            "receipt": receipt,
            "mode": "dummy",
            "key_id": "",
        }

    try:
        resp = requests.post(
            f"{_RAZORPAY_API}/orders",
            auth=(_key_id(), _key_secret()),
            json={
                "amount": amount,
                "currency": "INR",
                "receipt": receipt,
                "notes": notes or {},
                "payment_capture": 1,
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.warning("razorpay order failed: %s", type(exc).__name__)
        return False, f"network error ({type(exc).__name__})", {}

    if resp.status_code not in (200, 201):
        try:
            desc = (resp.json() or {}).get("error", {}).get("description", "")
        except ValueError:
            desc = ""
        logger.warning("razorpay order rejected: %s", desc[:120])
        return False, desc or f"razorpay http {resp.status_code}", {}

    data = resp.json() or {}
    return True, "order created", {
        "id": data.get("id"),
        "amount": data.get("amount"),
        "currency": data.get("currency", "INR"),
        "receipt": data.get("receipt"),
        "mode": "razorpay",
        "key_id": _key_id(),
    }


# ---------------------------------------------------------------------------
# Signatures
# ---------------------------------------------------------------------------


def verify_signature(
    razorpay_order_id: str, razorpay_payment_id: str, signature: str
) -> Tuple[bool, str]:
    """Verify Razorpay's ``order|payment`` HMAC. Dummy mode trusts the client."""
    if gateway_mode() == "dummy":
        return True, "dummy mode — signature check skipped"

    if not (_key_id() and _key_secret()):
        return False, "razorpay keys missing"
    if not (razorpay_order_id and razorpay_payment_id and signature):
        return False, "incomplete payment payload"

    expected = hmac.new(
        _key_secret().encode(),
        f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if hmac.compare_digest(expected, signature):
        return True, "signature verified"
    return False, "signature mismatch — payment not trusted"


def verify_webhook(body: bytes, signature: str) -> Tuple[bool, str]:
    """Verify the ``X-Razorpay-Signature`` header of a webhook call."""
    secret = _webhook_secret()
    if not secret:
        return False, "webhook secret not configured"
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, signature or ""):
        return True, "webhook verified"
    return False, "invalid webhook signature"


def rupees_to_paise(amount: Any) -> int:
    """Safe money conversion — never let a float touch the ledger."""
    try:
        return int(round(float(amount) * 100))
    except (TypeError, ValueError):
        return 0
