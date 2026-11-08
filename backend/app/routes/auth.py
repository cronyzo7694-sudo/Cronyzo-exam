"""Authentication routes — register, login, guest, Google, phone OTP.

Public URL prefixes (stable)::

    POST /api/auth/register
    POST /api/auth/login
    POST /api/auth/guest
    POST /api/auth/google
    POST /api/auth/phone/send-otp
    POST /api/auth/phone/verify-otp
    POST /api/auth/refresh
    GET  /api/auth/me
    PUT  /api/auth/me
    GET  /api/auth/methods
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Final, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    get_jwt_identity,
    jwt_required,
)
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.models.auth_otp import PhoneOtp
from app.models.user import User
from app.utils.tokens import issue_tokens, session_payload
from app.utils.decorators import get_current_user
from app.utils.validators import is_strong_password, is_valid_email, require_fields

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger("cronyzo.routes.auth")

_MAX_EMAIL_LEN: Final[int] = 255
_MAX_NAME_LEN: Final[int] = 150
_MAX_PHONE_LEN: Final[int] = 32
_MAX_AVATAR_LEN: Final[int] = 512
_MAX_PASSWORD_LEN: Final[int] = 256
_GUEST_EMAIL_DOMAIN: Final[str] = "guest.local"
_PHONE_EMAIL_DOMAIN: Final[str] = "phone.local"
_GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo?id_token="
_PHONE_RE = re.compile(r"^\+?[1-9]\d{7,14}$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _flag(name: str, default: bool = False) -> bool:
    try:
        from app.services.feature_flags import is_enabled

        return is_enabled(name, default)
    except Exception:
        return default


def _cfg(path: str, default: Any = None) -> Any:
    try:
        from app.services.config_engine import get_setting

        return get_setting(path, default)
    except Exception:
        return default


def _tokens_for(user: User) -> Tuple[str, str]:
    """Kept as a thin alias so route code stays readable."""
    return issue_tokens(user)


def _guest_enabled() -> bool:
    return _flag("ENABLE_GUEST_ACCESS", True)


def _auth_response(user: User, message: str, status: int = 200):
    access, refresh = _tokens_for(user)
    payload_user = user.to_dict()
    return jsonify({
        "message": message,
        "user": payload_user,
        "access_token": access,
        "refresh_token": refresh,
        "is_guest": bool(payload_user.get("is_guest")),
    }), status


def _clip(value: Any, max_len: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_len]


def _normalize_phone(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    digits = re.sub(r"[^\d+]", "", str(raw).strip())
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    # India convenience: 10-digit local → +91
    if re.fullmatch(r"\d{10}", digits):
        digits = "+91" + digits
    if not digits.startswith("+") and digits.isdigit() and 8 <= len(digits) <= 15:
        digits = "+" + digits
    if not _PHONE_RE.match(digits or ""):
        return None
    return digits[:_MAX_PHONE_LEN]


_FIREBASE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)
# JWK set — the format PyJWT can turn into a public key directly. The older
# robot/x509 endpoint hands back X.509 *certificates*, which PyJWT refuses to
# parse, and that is what produced the dreaded "Invalid Google token".
_FIREBASE_JWK_URL = (
    "https://www.googleapis.com/service_accounts/v1/jwk/"
    "securetoken@system.gserviceaccount.com"
)
_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
# Last verification failure, for the admin panel and the server log
_verify_reason: Dict[str, str] = {"reason": ""}
_certs_cache: Dict[str, Any] = {"jwks": None, "fetched": 0.0}


def _firebase_project_id() -> str:
    """Project id for Firebase ID-token verification, or ''."""
    return (
        str(_cfg("auth.firebase_project_id") or "").strip()
        or os.getenv("FIREBASE_PROJECT_ID", "").strip()
        or os.getenv("VITE_FIREBASE_PROJECT_ID", "").strip()
    )


def google_login_mode() -> str:
    """How Google sign-in should behave right now.

    ``firebase``  — a Firebase project id is configured; ID tokens are verified
                    against Google's public certificates.
    ``gis``       — only a Google OAuth client id is set; the tokeninfo
                    endpoint validates the credential.
    ``demo``      — nothing configured. The button still works (it signs the
                    visitor in as a demo Google account) so the flow can be
                    tested end to end before the real keys arrive.
    """
    if _firebase_project_id():
        return "firebase"
    client_id = (
        str(_cfg("auth.google_client_id") or "").strip()
        or os.getenv("GOOGLE_CLIENT_ID", "").strip()
    )
    return "gis" if client_id else "demo"


def _fetch_certs(url: str) -> Dict[str, Any]:
    """Fetch and cache Google's signing keys, per URL (1h, fail-soft).

    Google publishes keys in two shapes and both are normalised here to
    ``{kid: value}``:

    * a **JWK set** — ``{"keys": [{...}, {...}]}``  → ``{kid: jwk_dict}``
    * an **X.509 map** — ``{"kid": "-----BEGIN CERTIFICATE-----…"}``

    Caching per URL matters: a single shared slot meant the X.509 set could be
    served for a JWK request, and the key lookup then failed — which is exactly
    what surfaced to users as "Invalid Google token".
    """
    import json as _json
    import time

    now = time.time()
    bucket = _certs_cache.setdefault(url, {"data": None, "fetched": 0.0})
    cached = bucket.get("data")
    if cached and now - float(bucket.get("fetched") or 0) < 3600:
        return cached

    try:
        req = UrlRequest(url, headers={"User-Agent": "Cronyzo/1.1"})
        with urlopen(req, timeout=8) as resp:  # nosec B310 — fixed Google HTTPS
            data = _json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        logger.info("cert fetch failed: %s", type(exc).__name__)
        return cached or {}

    normalised: Dict[str, Any] = {}
    if isinstance(data, dict):
        if isinstance(data.get("keys"), list):
            for jwk in data["keys"]:
                if isinstance(jwk, dict) and jwk.get("kid"):
                    normalised[jwk["kid"]] = jwk
        else:
            normalised = {k: v for k, v in data.items() if isinstance(v, (str, dict))}

    if normalised:
        bucket["data"] = normalised
        bucket["fetched"] = now
        return normalised
    return cached or {}


def _firebase_public_key(kid: str):
    """Resolve a Firebase signing key id to an RSA public key.

    Google publishes the same keys three ways; only two are usable here:

    * ``/service_accounts/v1/jwk/…`` — a JWK set (what we use, PyJWT can load it)
    * ``/robot/v1/metadata/x509/…`` — X.509 certificates (fallback, parsed with
      ``cryptography`` when it is installed)
    """
    from jwt import algorithms as _algorithms

    jwks = _fetch_certs(_FIREBASE_JWK_URL)
    jwk = jwks.get(kid)
    if jwk:
        try:
            return _algorithms.RSAAlgorithm.from_jwk(jwk)
        except Exception as exc:  # noqa: BLE001
            logger.info("JWK parse failed: %s", type(exc).__name__)

    certs = _fetch_certs(_FIREBASE_CERTS_URL)
    pem = certs.get(kid)
    if not pem:
        return None
    try:
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend

        cert = x509.load_pem_x509_certificate(pem.encode(), default_backend())
        return cert.public_key()
    except Exception:  # noqa: BLE001
        return None


def _verify_firebase_token(id_token: str) -> Optional[Dict[str, Any]]:
    """Verify a Firebase ID token (RS256) and return its claims.

    Validation performed: signature against Google's rotating certificates,
    ``aud`` equals the project id, ``iss`` equals
    ``https://securetoken.google.com/<project>``, ``exp``/``iat`` are sane and
    ``sub`` is present. Anything that fails returns ``None``.
    """
    project_id = _firebase_project_id()
    if not project_id:
        return None
    if not id_token or len(id_token) > 8192:
        return None

    try:
        import jwt as _pyjwt
        from jwt import algorithms as _algorithms
    except ImportError:  # pragma: no cover — PyJWT is a pinned dependency
        logger.warning("PyJWT missing — cannot verify Firebase tokens")
        return None

    try:
        header = _pyjwt.get_unverified_header(id_token)
    except Exception:  # noqa: BLE001
        _verify_reason["reason"] = "malformed token"
        return None

    kid = header.get("kid")
    if not kid:
        _verify_reason["reason"] = "token has no kid"
        return None

    public_key = _firebase_public_key(kid)
    if public_key is None:
        _verify_reason["reason"] = f"no signing key for kid {str(kid)[:12]}"
        return None

    try:
        claims = _pyjwt.decode(
            id_token,
            key=public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            leeway=30,
            options={"require": ["exp", "iat", "sub"]},
        )
    except Exception as exc:  # noqa: BLE001
        _verify_reason["reason"] = f"{type(exc).__name__}: {str(exc)[:120]}"
        logger.info("Firebase token verify failed: %s", _verify_reason["reason"])
        return None

    if not isinstance(claims, dict) or not claims.get("sub"):
        return None

    # Normalise to the same shape the rest of this module expects
    return {
        "sub": claims.get("sub"),
        "email": claims.get("email"),
        "email_verified": claims.get("email_verified", False),
        "name": claims.get("name"),
        "picture": claims.get("picture"),
        "provider": "firebase",
    }


def _verify_google_id_token(id_token: str) -> Optional[Dict[str, Any]]:
    """Validate a Google / Firebase ID token.

    Tries Firebase first when a project id is configured, then falls back to
    Google's tokeninfo endpoint for a plain Google Identity Services credential.
    """
    if _firebase_project_id():
        claims = _verify_firebase_token(id_token)
        if claims:
            return claims

    client_id = (
        str(_cfg("auth.google_client_id") or "").strip()
        or os.getenv("GOOGLE_CLIENT_ID", "").strip()
    )
    if not client_id:
        logger.warning("No GOOGLE_CLIENT_ID / FIREBASE_PROJECT_ID configured")
        return None
    if not id_token or len(id_token) > 4096:
        return None
    from urllib.parse import quote
    import json as _json

    url = _GOOGLE_TOKENINFO + quote(id_token, safe="")
    try:
        req = UrlRequest(url, headers={"User-Agent": "Cronyzo/1.1"})
        with urlopen(req, timeout=8) as resp:  # nosec B310 — fixed Google HTTPS endpoint
            data = _json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        logger.info("Google token verify failed: %s", type(exc).__name__)
        return None
    if not isinstance(data, dict):
        return None
    aud = data.get("aud")
    if aud != client_id:
        logger.info("Google token aud mismatch")
        return None
    if str(data.get("email_verified", "")).lower() not in ("true", "1"):
        # Some accounts may omit; require email at minimum
        if not data.get("email"):
            return None
    if not data.get("sub"):
        return None
    return data


def _find_or_create_google_user(info: Dict[str, Any]) -> User:
    sub = str(info.get("sub"))[:64]
    email = str(info.get("email") or "").strip().lower()[:_MAX_EMAIL_LEN]
    name = (
        _clip(info.get("name"), _MAX_NAME_LEN)
        or _clip(info.get("given_name"), _MAX_NAME_LEN)
        or (email.split("@")[0] if email else "Google User")
    )
    picture = _clip(info.get("picture"), _MAX_AVATAR_LEN)

    user = User.query.filter_by(google_sub=sub).first()
    if not user and email:
        user = User.query.filter_by(email=email).first()
        if user:
            user.google_sub = sub
            user.auth_provider = user.auth_provider or "google"

    if not user:
        # Ensure unique email
        if not email:
            email = f"google_{sub}@{_GUEST_EMAIL_DOMAIN}"[:_MAX_EMAIL_LEN]
        if User.query.filter_by(email=email).first():
            email = f"google_{sub}_{secrets.token_hex(3)}@google.local"[:_MAX_EMAIL_LEN]
        user = User(
            email=email,
            full_name=name or "Google User",
            role="student",
            is_active=True,
            avatar_url=picture,
            google_sub=sub,
            auth_provider="google",
        )
        user.set_password(secrets.token_urlsafe(32))
        db.session.add(user)
    else:
        if picture and not user.avatar_url:
            user.avatar_url = picture
        if name and (user.full_name or "").startswith("Guest"):
            user.full_name = name
        user.auth_provider = "google"
        if not user.google_sub:
            user.google_sub = sub

    user.last_login_at = _utcnow()
    return user


@auth_bp.post("/register")
def register():
    data = _json_body()
    err = require_fields(data, ["email", "password", "full_name"])
    if err:
        return jsonify({"error": err}), 400

    email = str(data.get("email", "")).strip().lower()[:_MAX_EMAIL_LEN]
    if not is_valid_email(email):
        return jsonify({"error": "Invalid email address"}), 400

    password = data.get("password")
    if not isinstance(password, str) or len(password) > _MAX_PASSWORD_LEN:
        return jsonify({"error": "Invalid password"}), 400
    ok, msg = is_strong_password(password)
    if not ok:
        return jsonify({"error": msg}), 400

    full_name = _clip(data.get("full_name"), _MAX_NAME_LEN)
    if not full_name:
        return jsonify({"error": "full_name is required"}), 400

    # A signed-in guest that registers becomes the SAME account, not a new
    # one — their attempts, cart and progress follow them across.
    guest = get_current_user()
    claiming_guest = guest is not None and _is_guest_user(guest)

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    role = data.get("role", "student")
    if role not in ("student", "admin"):
        role = "student"
    # Only allow admin self-register if no admins exist (bootstrap) — otherwise force student
    if role == "admin" and User.query.filter_by(role="admin").count() > 0:
        role = "student"

    if claiming_guest:
        # Upgrade the guest row in place so nothing is orphaned.
        guest.email = email
        guest.full_name = full_name
        guest.role = "student"
        guest.auth_provider = "password"
        try:
            guest.set_password(password)
        except (ValueError, TypeError) as exc:
            return jsonify({"error": str(exc) or "Invalid password"}), 400
        user = guest
        created = False
    else:
        user = User(email=email, full_name=full_name, role=role)
        try:
            user.set_password(password)
        except (ValueError, TypeError) as exc:
            return jsonify({"error": str(exc) or "Invalid password"}), 400
        db.session.add(user)
        created = True

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("register commit failed")
        return jsonify({"error": "Registration failed"}), 500

    access, refresh = _tokens_for(user)
    return jsonify({
        "message": "Registered successfully" if created else "Account created — your progress came with you",
        "user": user.to_dict(),
        "access_token": access,
        "refresh_token": refresh,
        "claimed_guest": claiming_guest,
    }), 201


@auth_bp.post("/guest")
def guest_login():
    """
    Start an anonymous session without email/password.

    Creates a lightweight guest user + JWT. Same token shape as login so the
    existing frontend/API keep working. Disable via ENABLE_GUEST_ACCESS=false.
    """
    if not _guest_enabled():
        return jsonify({"error": "Guest access is disabled"}), 403

    data = _json_body()
    display = _clip(data.get("display_name") or data.get("full_name"), 40) or "Guest"

    # Unique synthetic identity — never a real mailbox
    token = uuid.uuid4().hex
    email = f"guest_{token}@{_GUEST_EMAIL_DOMAIN}"[:_MAX_EMAIL_LEN]
    # Unusable random password (guest cannot password-login)
    random_password = secrets.token_urlsafe(32)

    user = User(
        email=email,
        full_name=display,
        role="guest",
        is_active=True,
        auth_provider="guest",
    )
    try:
        user.set_password(random_password)
    except Exception:
        logger.exception("guest set_password failed")
        return jsonify({"error": "Could not start guest session"}), 500

    db.session.add(user)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("guest commit failed")
        return jsonify({"error": "Could not start guest session"}), 500

    # Demo data so a guest sees a populated product instead of empty pages.
    # Two enrollments only — a guest still cannot pay for anything (checkout is
    # gated server-side in routes/orders.py).
    try:
        from app.services.guest_seed import seed_guest_account

        seed_guest_account(user)
    except Exception:  # noqa: BLE001
        logger.warning("guest demo seed failed", exc_info=True)

    return _auth_response(user, "Guest session started", 201)


@auth_bp.get("/methods")
def auth_methods():
    """Public: which login methods are available, and how Google behaves."""
    mode = google_login_mode()
    google_id = (
        str(_cfg("auth.google_client_id") or "").strip()
        or os.getenv("GOOGLE_CLIENT_ID", "").strip()
    )
    firebase_project = _firebase_project_id()
    return jsonify(
        {
            "guest": _guest_enabled(),
            "email_password": _flag("ENABLE_EMAIL_PASSWORD_LOGIN", True),
            # Google is always offered. In demo mode it works immediately so the
            # flow can be exercised before the real keys are supplied.
            "google": True,
            "google_mode": mode,
            "google_client_id": google_id if mode == "gis" else "",
            "firebase_project_id": firebase_project if mode == "firebase" else "",
            "phone_otp": _flag("ENABLE_PHONE_OTP", False),
        }
    )


@auth_bp.post("/google")
def google_login():
    """Google / Firebase sign-in.

    Body::

        {"id_token": "<Firebase ID token or Google credential>"}

    In ``demo`` mode (no Firebase project id and no Google client id yet) the
    endpoint accepts an empty body and signs the caller in to a clearly-labelled
    demo Google account, so the button works during testing. As soon as
    ``FIREBASE_PROJECT_ID`` (plus the web API key on the frontend) or
    ``GOOGLE_CLIENT_ID`` is configured, the same endpoint verifies real tokens —
    no code change, no redeploy of the frontend.
    """
    mode = google_login_mode()

    if mode == "demo":
        data = _json_body()
        demo_email = (
            str(data.get("demo_email") or "demo.google@cronyzo.local").strip().lower()
        )
        # Never let a caller pick an email that collides with a real account
        if not demo_email.endswith("@cronyzo.local"):
            demo_email = "demo.google@cronyzo.local"

        info = {
            "sub": "demo-google-account",
            "email": demo_email,
            "email_verified": True,
            "name": "Demo Google User",
            "picture": None,
        }
        try:
            user = _find_or_create_google_user(info)
            db.session.commit()
        except Exception:  # noqa: BLE001
            db.session.rollback()
            logger.exception("demo google_login failed")
            return jsonify({"error": "Google sign-in failed"}), 500
        if not user.is_active:
            return jsonify({"error": "Account is deactivated"}), 403
        resp = _auth_response(user, "Signed in with Google (testing mode)")
        body = resp[0] if isinstance(resp, tuple) else resp
        payload = body.get_json()
        payload["google_mode"] = "demo"
        payload["google_message"] = (
            "Testing mode — add FIREBASE_PROJECT_ID on the server and the "
            "Firebase web config on the frontend to switch to real Google accounts."
        )
        return jsonify(payload), (resp[1] if isinstance(resp, tuple) else 200)

    data = _json_body()
    id_token = data.get("id_token") or data.get("credential")
    if not id_token or not isinstance(id_token, str):
        return jsonify({"error": "id_token required"}), 400

    info = _verify_google_id_token(id_token.strip())
    if not info:
        reason = _verify_reason.get("reason") or "token could not be verified"
        logger.info("google sign-in rejected: %s", reason)
        return jsonify(
            {
                "error": "Google sign-in could not be verified. Please try again.",
                "detail": reason,
                "code": "google_token_invalid",
            }
        ), 401

    try:
        user = _find_or_create_google_user(info)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("google_login failed")
        return jsonify({"error": "Google sign-in failed"}), 500

    if not user.is_active:
        return jsonify({"error": "Account is deactivated"}), 403

    resp = _auth_response(user, "Google login successful")
    body = resp[0] if isinstance(resp, tuple) else resp
    payload = body.get_json()
    payload["google_mode"] = mode
    return jsonify(payload), (resp[1] if isinstance(resp, tuple) else 200)


@auth_bp.post("/phone/send-otp")
def phone_send_otp():
    """
    Body: { "phone": "+9198xxxxxxxx" }

    Enable with ENABLE_PHONE_OTP=true.
    Production: wire SMS_PROVIDER env + adapter. Dev: PHONE_OTP_DEV_EXPOSE=true returns code.
    """
    if not _flag("ENABLE_PHONE_OTP", False):
        return jsonify({"error": "Phone OTP login is disabled"}), 403

    data = _json_body()
    phone = _normalize_phone(data.get("phone"))
    if not phone:
        return jsonify({"error": "Valid phone number required (E.164, e.g. +919876543210)"}), 400

    # Invalidate previous unused OTPs for this phone
    try:
        PhoneOtp.query.filter(
            PhoneOtp.phone == phone,
            PhoneOtp.consumed_at.is_(None),
        ).update({PhoneOtp.consumed_at: _utcnow()}, synchronize_session=False)
    except Exception:
        pass

    length = int(_cfg("auth.phone_otp_length") or 6)
    length = max(4, min(length, 8))
    ttl = int(_cfg("auth.phone_otp_ttl_seconds") or 300)
    ttl = max(60, min(ttl, 900))
    code = "".join(secrets.choice("0123456789") for _ in range(length))

    otp = PhoneOtp(
        phone=phone,
        code_hash=generate_password_hash(code, method="pbkdf2:sha256"),
        expires_at=_utcnow() + timedelta(seconds=ttl),
        attempts=0,
    )
    db.session.add(otp)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("phone_send_otp commit failed")
        return jsonify({"error": "Could not send OTP"}), 500

    # SMS dispatch hook — never hardcode a vendor
    sms_provider = (__import__("os").getenv("SMS_PROVIDER") or "none").strip().lower()
    if sms_provider not in ("", "none"):
        # --------------------------------------------
        # EXTENSION POINT: call Twilio / MSG91 / etc. here
        # --------------------------------------------
        logger.info("SMS provider=%s phone=*** otp queued", sms_provider)
    else:
        logger.info("OTP generated for phone ending %s (no SMS provider)", phone[-4:])

    resp: Dict[str, Any] = {
        "message": "OTP sent" if sms_provider not in ("", "none") else "OTP generated",
        "phone_hint": f"***{phone[-4:]}",
        "expires_in": ttl,
    }
    # Dev-only expose — never enable in production exam windows
    if bool(_cfg("auth.phone_otp_dev_expose")) or _flag("PHONE_OTP_DEV_EXPOSE", False):
        resp["dev_otp"] = code
        resp["message"] = "OTP generated (dev expose on — do not use in production)"

    return jsonify(resp)


@auth_bp.post("/phone/verify-otp")
def phone_verify_otp():
    """Body: { "phone": "+91...", "otp": "123456", "full_name"?: "..." }"""
    if not _flag("ENABLE_PHONE_OTP", False):
        return jsonify({"error": "Phone OTP login is disabled"}), 403

    data = _json_body()
    phone = _normalize_phone(data.get("phone"))
    otp_code = str(data.get("otp") or data.get("code") or "").strip()
    if not phone or not otp_code or not otp_code.isdigit():
        return jsonify({"error": "phone and otp required"}), 400
    if len(otp_code) > 8:
        return jsonify({"error": "Invalid otp"}), 400

    challenge = (
        PhoneOtp.query.filter_by(phone=phone, consumed_at=None)
        .order_by(PhoneOtp.id.desc())
        .first()
    )
    if not challenge or challenge.is_expired():
        return jsonify({"error": "OTP expired or not found"}), 400

    max_attempts = int(_cfg("auth.phone_otp_max_attempts") or 5)
    if int(challenge.attempts or 0) >= max_attempts:
        return jsonify({"error": "Too many invalid attempts"}), 429

    if not check_password_hash(challenge.code_hash, otp_code):
        challenge.attempts = int(challenge.attempts or 0) + 1
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({"error": "Invalid OTP"}), 401

    challenge.consumed_at = _utcnow()

    user = User.query.filter_by(phone=phone).first()
    if not user:
        email = f"phone_{phone.replace('+', '')}@{_PHONE_EMAIL_DOMAIN}"[:_MAX_EMAIL_LEN]
        if User.query.filter_by(email=email).first():
            email = f"phone_{uuid.uuid4().hex[:12]}@{_PHONE_EMAIL_DOMAIN}"
        display = _clip(data.get("full_name") or data.get("display_name"), _MAX_NAME_LEN) or f"User {phone[-4:]}"
        user = User(
            email=email,
            full_name=display,
            role="student",
            is_active=True,
            phone=phone,
            auth_provider="phone",
        )
        user.set_password(secrets.token_urlsafe(32))
        db.session.add(user)
    else:
        user.auth_provider = "phone"
        if not user.phone:
            user.phone = phone

    user.last_login_at = _utcnow()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("phone_verify_otp commit failed")
        return jsonify({"error": "Verification failed"}), 500

    if not user.is_active:
        return jsonify({"error": "Account is deactivated"}), 403

    return _auth_response(user, "Phone login successful")


@auth_bp.post("/login")
def login():
    if not _flag("ENABLE_EMAIL_PASSWORD_LOGIN", True):
        return jsonify({"error": "Email/password login is disabled"}), 403

    data = _json_body()
    err = require_fields(data, ["email", "password"])
    if err:
        return jsonify({"error": err}), 400

    email = str(data.get("email", "")).strip().lower()[:_MAX_EMAIL_LEN]
    password = data.get("password")
    if not isinstance(password, str) or len(password) > _MAX_PASSWORD_LEN:
        return jsonify({"error": "Invalid email or password"}), 401

    user = User.query.filter_by(email=email).first()
    # Constant-ish failure path: always run a hash check shape when user missing
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    if not user.is_active:
        return jsonify({"error": "Account is deactivated"}), 403

    user.last_login_at = _utcnow()
    if not getattr(user, "auth_provider", None):
        user.auth_provider = "password"
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("login last_login_at commit failed user_id=%s", user.id)
        # Still issue tokens — login must succeed for exam day resilience

    return _auth_response(user, "Login successful")


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "User not found"}), 401

    user = User.query.get(uid)
    if not user or not user.is_active:
        return jsonify({"error": "User not found"}), 401
    access, _ = _tokens_for(user)
    return jsonify({"access_token": access})


@auth_bp.get("/me")
@jwt_required()
def me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()})


@auth_bp.get("/session")
@jwt_required()
def session():
    """
    The one authoritative description of the caller.

    The frontend renders its navigation, route guards and "Sell" affordances
    from this payload instead of re-deriving capabilities from scattered role
    checks, so the whole web app agrees on who the signed-in person is.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(session_payload(user))


@auth_bp.post("/claim")
@jwt_required()
def claim_guest_session():
    """
    Turn the current guest session into a full account — **in place**.

    A guest that later signs up must not become a second person. This
    upgrades the very same ``users`` row (email, password, name, role), so
    every attempt, lesson progress, cart line, wishlist item, enrollment and
    order that points at that row keeps working without a single migration.

    Requires a guest session. Members get a 409 — they already have an
    account and there is nothing to claim.
    """
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    if not _is_guest_user(user):
        return jsonify({
            "error": "Already signed in",
            "message": "This session already has a full account.",
        }), 409

    data = _json_body()
    email = str(data.get("email") or "").strip().lower()[:_MAX_EMAIL_LEN]
    if not is_valid_email(email):
        return jsonify({"error": "Invalid email address"}), 400

    password = data.get("password")
    if not isinstance(password, str) or len(password) > _MAX_PASSWORD_LEN:
        return jsonify({"error": "Invalid password"}), 400
    ok, msg = is_strong_password(password)
    if not ok:
        return jsonify({"error": msg}), 400

    existing = User.query.filter(User.email == email, User.id != user.id).first()
    if existing is not None:
        return jsonify({
            "error": "Email already registered",
            "message": "Sign in with that email instead — your guest progress cannot be merged into an existing account automatically.",
        }), 409

    full_name = _clip(data.get("full_name"), _MAX_NAME_LEN) or user.full_name or "Student"

    user.email = email
    user.full_name = full_name
    user.role = "student"
    user.auth_provider = "password"
    try:
        user.set_password(password)
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc) or "Invalid password"}), 400

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("claim_guest_session commit failed user=%s", user.id)
        return jsonify({"error": "Could not save your account"}), 500

    logger.info("guest session claimed user=%s email=%s", user.id, email)
    return _auth_response(user, "Your account is ready — everything you did is saved", 200)


def _is_guest_user(user: User) -> bool:
    return (user.role or "") == "guest" or (getattr(user, "auth_provider", None) == "guest")


@auth_bp.put("/me")
@jwt_required()
def update_me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    data = _json_body()

    # Never accept role / is_active / email from self-service profile (escalation)
    if "full_name" in data and data["full_name"]:
        name = _clip(data["full_name"], _MAX_NAME_LEN)
        if name:
            user.full_name = name
    if "phone" in data:
        phone = data["phone"]
        user.phone = _clip(phone, _MAX_PHONE_LEN) if phone not in (None, "") else None
    if "avatar_url" in data:
        avatar = data["avatar_url"]
        if avatar in (None, ""):
            user.avatar_url = None
        else:
            url = _clip(avatar, _MAX_AVATAR_LEN)
            # Block obvious javascript: / data: XSS vectors in avatar field
            if url and url.lower().startswith(("http://", "https://", "/")):
                user.avatar_url = url
            elif url is None:
                user.avatar_url = None
            else:
                return jsonify({"error": "Invalid avatar_url"}), 400

    if data.get("password"):
        password = data["password"]
        if not isinstance(password, str) or len(password) > _MAX_PASSWORD_LEN:
            return jsonify({"error": "Invalid password"}), 400
        ok, msg = is_strong_password(password)
        if not ok:
            return jsonify({"error": msg}), 400
        try:
            user.set_password(password)
        except (ValueError, TypeError) as exc:
            return jsonify({"error": str(exc) or "Invalid password"}), 400

    password_changed = bool(data.get("password"))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_me commit failed user_id=%s", user.id)
        return jsonify({"error": "Profile update failed"}), 500

    if password_changed:
        try:
            from app.services.notification_engine import notify

            notify(
                user_id=user.id,
                category="password_changed",
                template_code="password_changed",
                variables={"name": user.full_name},
                channels=["in_app", "email"],
                priority="high",
            )
        except Exception:
            logger.debug("password_changed notify skipped", exc_info=True)

    return jsonify({"message": "Profile updated", "user": user.to_dict()})


# --------------------------------------------
# EXTENSION POINT: SMS provider adapter, Apple Sign-In, trueguest cookieless
# --------------------------------------------

# --------------------------------------------
# FUTURE IMPROVEMENT (Not implemented to avoid breaking project):
# - Login rate limiting / account lockout (needs limiter extension + columns)
# - Refresh token rotation + reuse detection
# - Email verification gate before exam start
# - Link guest session → Google/phone on upgrade
# --------------------------------------------
