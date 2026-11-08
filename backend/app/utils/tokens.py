"""
Token issuing for Cronyzo.

One place that knows how to mint a session for a user, so every route that
changes an account (register, login, guest, claim, become-creator) hands back
a token whose claims match the row it just wrote. A stale claim is what makes
"one account" feel like two.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

from flask_jwt_extended import create_access_token, create_refresh_token

from app.models.user import User

__all__ = ["issue_tokens", "session_payload"]


def issue_tokens(user: User) -> Tuple[str, str]:
    """
    Mint an (access, refresh) token pair for ``user``.

    The role claim is a convenience for the client only — server-side
    authorisation always resolves the live role from the ``users`` row
    (see :func:`app.utils.decorators.roles_required`).
    """
    identity = str(user.id)
    provider = getattr(user, "auth_provider", None) or "password"
    is_guest = (user.role or "") == "guest" or provider == "guest"
    additional = {
        "role": user.role,
        "email": user.email if not is_guest else None,
        "full_name": user.full_name,
        "is_guest": is_guest,
        "auth_provider": provider,
    }
    access = create_access_token(identity=identity, additional_claims=additional)
    refresh = create_refresh_token(identity=identity, additional_claims=additional)
    return access, refresh


def session_payload(user: User) -> Dict[str, Any]:
    """
    The single authoritative description of the current identity.

    The frontend renders navigation, guards and "Sell" affordances from this
    one object instead of re-deriving capabilities from scattered role checks.
    """
    role = user.role or "student"
    creator_type = getattr(user, "creator_type", None)
    is_guest = role == "guest" or (getattr(user, "auth_provider", None) == "guest")
    can_publish = role in ("teacher", "seller", "admin")
    return {
        "user": user.to_dict(),
        "role": role,
        "creator_type": creator_type,
        "is_guest": is_guest,
        "is_authenticated": True,
        "capabilities": {
            "can_publish_courses": can_publish,
            "can_publish_books": can_publish,
            "can_sell_products": can_publish,
            "can_take_exams": True,
            "can_manage_exams": role == "admin",
            "can_administer": role == "admin",
        },
    }
