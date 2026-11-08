"""Admin API for the operator-editable site.

Every endpoint here is admin-only. The surface is a plain CRUD over the content
models plus a bulk settings writer, so the admin UI can save the whole landing
page from a single form.

Routes
------
GET    /api/admin/site/content              full payload incl. inactive rows
PUT    /api/admin/site/settings             bulk {key: value} upsert
POST   /api/admin/site/hero                 create a hero slide
PUT    /api/admin/site/hero/<id>            update a hero slide
DELETE /api/admin/site/hero/<id>            delete a hero slide
POST   /api/admin/site/pillars              create a pillar card
PUT    /api/admin/site/pillars/<id>         update a pillar card
DELETE /api/admin/site/pillars/<id>         delete a pillar card
POST   /api/admin/site/testimonials         create a testimonial
PUT    /api/admin/site/testimonials/<id>    update a testimonial
DELETE /api/admin/site/testimonials/<id>    delete a testimonial
GET    /api/admin/site/status               telegram + integration status

Public exports (stable)::

    admin_site_bp
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.site import HeroSlide, PillarCard, SiteSetting, Testimonial
from app.services.site_content import (
    DEFAULT_SETTINGS,
    get_content,
    set_setting,
    settings_map,
)
from app.services.telegram import telegram_status
from app.utils.decorators import roles_required

admin_site_bp = Blueprint("admin_site", __name__)
logger = logging.getLogger("cronyzo.routes.admin_site")


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


def _bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
@admin_site_bp.get("/content")
@roles_required("admin")
def admin_get_content():
    """Everything, including inactive rows and unset setting definitions."""
    payload = get_content()
    payload["all_slides"] = [
        s.to_dict()
        for s in HeroSlide.query.order_by(HeroSlide.sort_order.asc(), HeroSlide.id.asc())
    ]
    payload["all_pillars"] = [
        p.to_dict()
        for p in PillarCard.query.order_by(PillarCard.sort_order.asc(), PillarCard.id.asc())
    ]
    payload["all_testimonials"] = [
        t.to_dict()
        for t in Testimonial.query.order_by(Testimonial.sort_order.asc(), Testimonial.id.asc())
    ]
    payload["definitions"] = [
        {
            "key": d["key"],
            "value_type": d["value_type"],
            "group": d["group"],
            "label": d.get("label"),
            "default": d["default"],
        }
        for d in DEFAULT_SETTINGS
    ]
    return jsonify(payload)


@admin_site_bp.post("/telegram/test")
@roles_required("admin")
def admin_telegram_test():
    """Send a test message to the operator chat so the wiring can be proven."""
    from app.services.telegram import send_message, telegram_configured

    if not telegram_configured():
        return (
            jsonify(
                {
                    "ok": False,
                    "detail": (
                        "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the backend "
                        "environment, then restart the API."
                    ),
                }
            ),
            400,
        )

    ok, detail = send_message(
        "✅ <b>Cronyzo</b>\nThis is a test message — support messages will arrive here."
    )
    return jsonify({"ok": ok, "detail": detail}), (200 if ok else 502)


@admin_site_bp.get("/status")
@roles_required("admin")
def admin_site_status():
    return jsonify({"telegram": telegram_status()})


@admin_site_bp.get("/integrations")
@roles_required("admin")
def admin_site_integrations():
    """Live health of every external service — the operator's proof screen.

    Each row says exactly what happened, so "is Google real yet?" is answered by
    the server, not by a guess.
    """
    from app.services.integrations import collect

    return jsonify(collect())


@admin_site_bp.post("/integrations/test")
@roles_required("admin")
def admin_site_integration_test():
    """Re-run one probe (or all of them) on demand."""
    from app.services.integrations import collect, probe_google, probe_storage, probe_telegram

    body = _json_body()
    key = str(body.get("key") or "").strip().lower()
    probes = {
        "google": probe_google,
        "telegram": probe_telegram,
        "storage": probe_storage,
    }
    if not key or key == "all":
        return jsonify(collect())
    probe = probes.get(key)
    if probe is None:
        return jsonify(collect())
    return jsonify({"summary": None, "items": [probe()]})


# ---------------------------------------------------------------------------
# Settings (bulk)
# ---------------------------------------------------------------------------
@admin_site_bp.put("/settings")
@roles_required("admin")
def admin_update_settings():
    """Bulk upsert. Body: ``{"settings": {"hero.title": "…"}}`` or a flat map."""
    body = _json_body()
    incoming = body.get("settings")
    if not isinstance(incoming, dict):
        incoming = {k: v for k, v in body.items() if k != "settings"}

    if not incoming:
        return jsonify({"error": "No settings supplied"}), 400

    known = {d["key"] for d in DEFAULT_SETTINGS}
    saved: List[str] = []
    try:
        for key, value in incoming.items():
            if not isinstance(key, str) or not key.strip():
                continue
            key = key.strip()[:120]
            # Ignore unknown keys unless the operator explicitly opts in — a
            # typo should not silently create a junk row.
            if key not in known and not body.get("allow_custom_keys"):
                continue
            set_setting(key, value)
            saved.append(key)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("admin_update_settings failed")
        return jsonify({"error": "Could not save settings"}), 500

    return jsonify(
        {
            "message": f"{len(saved)} setting(s) saved",
            "saved": saved,
            "settings": settings_map(),
        }
    )


# ---------------------------------------------------------------------------
# Hero slides
# ---------------------------------------------------------------------------
@admin_site_bp.post("/hero")
@roles_required("admin")
def admin_create_slide():
    body = _json_body()
    title = _clip(body.get("title"), 220)
    if not title:
        return jsonify({"error": "Title is required"}), 400

    slide = HeroSlide(
        title=title,
        eyebrow=_clip(body.get("eyebrow"), 120),
        subtitle=_clip(body.get("subtitle"), 2000),
        image_url=_clip(body.get("image_url"), 2048),
        image_alt=_clip(body.get("image_alt"), 220),
        cta_label=_clip(body.get("cta_label"), 80),
        cta_url=_clip(body.get("cta_url"), 512),
        accent=_clip(body.get("accent"), 32) or "indigo",
        sort_order=_int(body.get("sort_order"), 0),
        is_active=_bool(body.get("is_active"), True),
    )
    db.session.add(slide)
    db.session.commit()
    return jsonify({"message": "Slide created", "slide": slide.to_dict()}), 201


@admin_site_bp.put("/hero/<int:slide_id>")
@roles_required("admin")
def admin_update_slide(slide_id: int):
    slide = db.session.get(HeroSlide, slide_id)
    if slide is None:
        return jsonify({"error": "Slide not found"}), 404

    body = _json_body()
    for field, limit in (
        ("title", 220),
        ("eyebrow", 120),
        ("subtitle", 2000),
        ("image_url", 2048),
        ("image_alt", 220),
        ("cta_label", 80),
        ("cta_url", 512),
        ("accent", 32),
    ):
        if field in body:
            setattr(slide, field, _clip(body.get(field), limit))
    if "sort_order" in body:
        slide.sort_order = _int(body.get("sort_order"), slide.sort_order)
    if "is_active" in body:
        slide.is_active = _bool(body.get("is_active"), slide.is_active)

    if not (slide.title or "").strip():
        return jsonify({"error": "Title is required"}), 400

    db.session.commit()
    return jsonify({"message": "Slide updated", "slide": slide.to_dict()})


@admin_site_bp.delete("/hero/<int:slide_id>")
@roles_required("admin")
def admin_delete_slide(slide_id: int):
    slide = db.session.get(HeroSlide, slide_id)
    if slide is None:
        return jsonify({"error": "Slide not found"}), 404
    db.session.delete(slide)
    db.session.commit()
    return jsonify({"message": "Slide removed"})


# ---------------------------------------------------------------------------
# Pillar cards
# ---------------------------------------------------------------------------
@admin_site_bp.post("/pillars")
@roles_required("admin")
def admin_create_pillar():
    body = _json_body()
    title = _clip(body.get("title"), 180)
    if not title:
        return jsonify({"error": "Title is required"}), 400

    bullets = body.get("bullets")
    if isinstance(bullets, list):
        bullets = "\n".join(str(b) for b in bullets if str(b).strip())

    pillar = PillarCard(
        title=title,
        icon=_clip(body.get("icon"), 48) or "Sparkles",
        description=_clip(body.get("description"), 2000),
        bullets=_clip(bullets, 2000),
        link_url=_clip(body.get("link_url"), 512) or "/",
        link_label=_clip(body.get("link_label"), 80) or "Explore",
        accent=_clip(body.get("accent"), 32) or "indigo",
        sort_order=_int(body.get("sort_order"), 0),
        is_active=_bool(body.get("is_active"), True),
    )
    db.session.add(pillar)
    db.session.commit()
    return jsonify({"message": "Pillar created", "pillar": pillar.to_dict()}), 201


@admin_site_bp.put("/pillars/<int:pillar_id>")
@roles_required("admin")
def admin_update_pillar(pillar_id: int):
    pillar = db.session.get(PillarCard, pillar_id)
    if pillar is None:
        return jsonify({"error": "Pillar not found"}), 404

    body = _json_body()
    if "bullets" in body:
        bullets = body.get("bullets")
        if isinstance(bullets, list):
            bullets = "\n".join(str(b) for b in bullets if str(b).strip())
        body["bullets"] = bullets

    for field, limit in (
        ("title", 180),
        ("icon", 48),
        ("description", 2000),
        ("bullets", 2000),
        ("link_url", 512),
        ("link_label", 80),
        ("accent", 32),
    ):
        if field in body:
            setattr(pillar, field, _clip(body.get(field), limit))
    if "sort_order" in body:
        pillar.sort_order = _int(body.get("sort_order"), pillar.sort_order)
    if "is_active" in body:
        pillar.is_active = _bool(body.get("is_active"), pillar.is_active)

    if not (pillar.title or "").strip():
        return jsonify({"error": "Title is required"}), 400

    db.session.commit()
    return jsonify({"message": "Pillar updated", "pillar": pillar.to_dict()})


@admin_site_bp.delete("/pillars/<int:pillar_id>")
@roles_required("admin")
def admin_delete_pillar(pillar_id: int):
    pillar = db.session.get(PillarCard, pillar_id)
    if pillar is None:
        return jsonify({"error": "Pillar not found"}), 404
    db.session.delete(pillar)
    db.session.commit()
    return jsonify({"message": "Pillar removed"})


# ---------------------------------------------------------------------------
# Testimonials
# ---------------------------------------------------------------------------
@admin_site_bp.post("/testimonials")
@roles_required("admin")
def admin_create_testimonial():
    body = _json_body()
    name = _clip(body.get("author_name"), 120)
    quote = _clip(body.get("quote"), 2000)
    if not name or not quote:
        return jsonify({"error": "Author name and quote are required"}), 400

    row = Testimonial(
        author_name=name,
        author_role=_clip(body.get("author_role"), 180),
        quote=quote,
        avatar_url=_clip(body.get("avatar_url"), 2048),
        accent=_clip(body.get("accent"), 32) or "indigo",
        sort_order=_int(body.get("sort_order"), 0),
        is_active=_bool(body.get("is_active"), True),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"message": "Testimonial created", "testimonial": row.to_dict()}), 201


@admin_site_bp.put("/testimonials/<int:item_id>")
@roles_required("admin")
def admin_update_testimonial(item_id: int):
    row = db.session.get(Testimonial, item_id)
    if row is None:
        return jsonify({"error": "Testimonial not found"}), 404

    body = _json_body()
    for field, limit in (
        ("author_name", 120),
        ("author_role", 180),
        ("quote", 2000),
        ("avatar_url", 2048),
        ("accent", 32),
    ):
        if field in body:
            setattr(row, field, _clip(body.get(field), limit))
    if "sort_order" in body:
        row.sort_order = _int(body.get("sort_order"), row.sort_order)
    if "is_active" in body:
        row.is_active = _bool(body.get("is_active"), row.is_active)

    if not (row.author_name or "").strip() or not (row.quote or "").strip():
        return jsonify({"error": "Author name and quote are required"}), 400

    db.session.commit()
    return jsonify({"message": "Testimonial updated", "testimonial": row.to_dict()})


@admin_site_bp.delete("/testimonials/<int:item_id>")
@roles_required("admin")
def admin_delete_testimonial(item_id: int):
    row = db.session.get(Testimonial, item_id)
    if row is None:
        return jsonify({"error": "Testimonial not found"}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({"message": "Testimonial removed"})
