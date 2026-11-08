"""Auth / role decorators for Cronyzo CBT API routes.

Public contract (stable — used across ``app.routes.*``)::

    @roles_required("admin")
    @roles_required("admin", "student")

    user = get_current_user()  # Optional[User]

Security:
    * JWT must be present and valid before role checks run.
    * Role is resolved from the **live** ``users`` row, not the token claim.
      The claim is only a snapshot taken when the token was issued, so it
      goes stale the moment an account changes (student -> teacher through
      ``/api/creator/become-creator``, admin -> student from the admin
      panel, guest -> member on claim). Resolving live means one account
      behaves identically on every route without forcing a re-login.
    * ``get_current_user`` refuses inactive accounts and invalid identities.
    * Never leaks stack traces or internal claim dumps to clients.
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, cast

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.models.user import User

logger = logging.getLogger("cronyzo.utils.decorators")

F = TypeVar("F", bound=Callable[..., Any])

# Known Cronyzo roles — keep aligned with User.role vocabulary
_KNOWN_ROLES = frozenset({"admin", "student", "guest", "teacher", "seller"})


def _forbidden_response():
    return (
        jsonify({
            "error": "Forbidden",
            "message": "Insufficient permissions",
        }),
        403,
    )


def _unauthorized_response(message: str = "Authentication required"):
    return (
        jsonify({
            "error": "Unauthorized",
            "message": message,
        }),
        401,
    )


def roles_required(*roles: str) -> Callable[[F], F]:
    """
    Require a valid JWT whose ``role`` claim is one of ``roles``.

    Usage::

        @roles_required("admin")
        def create_exam(): ...

    Empty ``roles`` is treated as deny-all (misconfiguration fail-closed).
    """

    allowed = tuple(r for r in roles if isinstance(r, str) and r)
    allowed_set = frozenset(allowed)

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            # Raises / aborts via flask-jwt-extended on missing/invalid token
            verify_jwt_in_request()

            if not allowed_set:
                logger.error(
                    "roles_required used with no roles on %s — denying",
                    getattr(fn, "__name__", "?"),
                )
                return _forbidden_response()

            role = _live_role()
            if role is None:
                # Account missing, deactivated, or identity unusable.
                return _unauthorized_response()
            if role not in allowed_set:
                return _forbidden_response()

            return fn(*args, **kwargs)

        return cast(F, wrapper)

    return decorator


def _live_role() -> Optional[str]:
    """
    Resolve the caller's *current* role from the database.

    Returns
    -------
    str or None
        The role string, or ``None`` when the principal cannot be resolved
        (unknown / deactivated account) — callers must treat that as 401.
    """
    user = get_current_user()
    if user is not None:
        return user.role

    # get_current_user() returned None. Distinguish "row is gone or
    # deactivated" (must deny) from "the lookup itself failed" (fall back
    # to the claim so a transient DB blip does not log everyone out).
    try:
        uid = int(get_jwt_identity())  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if uid < 1:
        return None

    try:
        row = User.query.get(uid)
    except Exception:  # noqa: BLE001
        logger.exception("_live_role: user lookup failed id=%s", uid)
        # Transient failure — trust the (signed, verified) claim rather than
        # locking the user out of their own site.
        try:
            claims = get_jwt() or {}
        except Exception:  # noqa: BLE001
            logger.exception("get_jwt failed in _live_role")
            return None
        role = claims.get("role")
        return role if isinstance(role, str) else None

    if row is None or not getattr(row, "is_active", True):
        return None
    return row.role


def get_current_user() -> Optional[User]:
    """
    Load the ``User`` row for the current JWT identity.

    Returns
    -------
    User or None
        ``None`` when the token identity is malformed, the user is missing,
        or the account is deactivated. Callers should return 401/404.
    """
    try:
        verify_jwt_in_request()
    except Exception:  # noqa: BLE001 — caller decides response shape
        return None

    user_id = get_jwt_identity()
    try:
        uid = int(user_id)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        logger.info("get_current_user: non-integer identity %r", user_id)
        return None

    if uid < 1:
        return None

    try:
        user = User.query.get(uid)
    except Exception:  # noqa: BLE001
        logger.exception("get_current_user query failed id=%s", uid)
        return None

    if user is None:
        return None

    # Deactivated accounts must not act as authenticated principals mid-exam
    if not getattr(user, "is_active", True):
        return None

    return user


# --------------------------------------------
# FUTURE IMPROVEMENT (Not implemented to avoid breaking project):
# - roles_required(fresh=True) / permission bitmasks beyond role string
# - Optional DB role revalidation + short-lived claim cache
# - get_current_user_id() helper to avoid full row load on hot paths
# --------------------------------------------
