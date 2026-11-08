"""Site content models — everything the operator can edit from the admin panel.

The landing page is not hard-coded in the frontend. Headlines, the tagline strip,
hero slides, the four pillar cards, the testimonial carousel and the footer
copy all live in these tables and are served by ``GET /api/site/content``.

Design notes
------------
* ``SiteSetting`` is a tiny typed key/value store. Values are JSON encoded so a
  setting can hold a string, a number, a list or an object without schema churn.
* ``HeroSlide``, ``PillarCard`` and ``Testimonial`` are ordered, soft-deletable
  rows: an operator toggles ``is_active`` instead of destroying content.
* Nothing here is required for the marketplace to function — if every table is
  empty the API falls back to :mod:`app.services.site_content` defaults.

Public exports (stable)::

    SiteSetting, HeroSlide, PillarCard, Testimonial
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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


def _lines(raw: Optional[str]) -> List[str]:
    """Split a newline separated column into clean, non-empty lines."""
    if not raw:
        return []
    return [line.strip() for line in str(raw).splitlines() if line.strip()]


class SiteSetting(db.Model):
    """A single operator-editable value, JSON encoded in ``value``.

    ``key`` is unique and dotted by convention (``hero.title``, ``strip.tagline``)
    so the admin UI can group fields by prefix.
    """

    __tablename__ = "site_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(120), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=True)
    # "text" | "longtext" | "number" | "boolean" | "json" | "url" | "image"
    value_type = db.Column(db.String(24), default="text", nullable=False)
    group = db.Column(db.String(64), default="general", nullable=False, index=True)
    label = db.Column(db.String(180), nullable=True)
    hint = db.Column(db.String(255), nullable=True)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # -- typed access -------------------------------------------------------
    def decoded(self) -> Any:
        """Return the stored value decoded according to ``value_type``."""
        raw = self.value
        if raw is None:
            return None
        if self.value_type == "number":
            try:
                num = float(raw)
                return int(num) if num.is_integer() else num
            except (TypeError, ValueError):
                return 0
        if self.value_type == "boolean":
            return str(raw).strip().lower() in ("1", "true", "yes", "on")
        if self.value_type == "json":
            try:
                return json.loads(raw)
            except Exception:  # noqa: BLE001
                return None
        return raw

    def set_value(self, value: Any) -> None:
        """Encode ``value`` into the text column."""
        if value is None:
            self.value = None
        elif self.value_type == "json":
            self.value = json.dumps(value, ensure_ascii=False)
        elif self.value_type == "boolean":
            self.value = "true" if value else "false"
        else:
            self.value = str(value)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "value": self.decoded(),
            "value_type": self.value_type,
            "group": self.group,
            "label": self.label,
            "hint": self.hint,
            "sort_order": self.sort_order,
            "updated_at": _iso(self.updated_at),
        }


class HeroSlide(db.Model):
    """One frame of the landing-page hero carousel."""

    __tablename__ = "hero_slides"

    id = db.Column(db.Integer, primary_key=True)
    # Text shown beside the artwork
    eyebrow = db.Column(db.String(120), nullable=True)
    title = db.Column(db.String(220), nullable=False)
    subtitle = db.Column(db.Text, nullable=True)
    # Artwork — a PNG/JPG URL or an inline SVG data URI
    image_url = db.Column(db.Text, nullable=True)
    image_alt = db.Column(db.String(220), nullable=True)
    # Optional call to action
    cta_label = db.Column(db.String(80), nullable=True)
    cta_url = db.Column(db.String(512), nullable=True)
    accent = db.Column(db.String(32), default="indigo", nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "eyebrow": self.eyebrow,
            "title": self.title,
            "subtitle": self.subtitle,
            "image_url": self.image_url,
            "image_alt": self.image_alt or self.title,
            "cta_label": self.cta_label,
            "cta_url": self.cta_url,
            "accent": self.accent,
            "sort_order": self.sort_order,
            "is_active": bool(self.is_active),
        }


class PillarCard(db.Model):
    """One of the four "Everything a learner actually needs" cards."""

    __tablename__ = "pillar_cards"

    id = db.Column(db.Integer, primary_key=True)
    # lucide-react icon name, resolved by the frontend icon map
    icon = db.Column(db.String(48), default="Sparkles", nullable=False)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=True)
    # Ordered feature bullets, one per line
    bullets = db.Column(db.Text, nullable=True)
    link_url = db.Column(db.String(512), default="/", nullable=False)
    link_label = db.Column(db.String(80), default="Explore", nullable=False)
    accent = db.Column(db.String(32), default="indigo", nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "icon": self.icon,
            "title": self.title,
            "description": self.description,
            "bullets": _lines(self.bullets),
            "link_url": self.link_url,
            "link_label": self.link_label,
            "accent": self.accent,
            "sort_order": self.sort_order,
            "is_active": bool(self.is_active),
        }


class Testimonial(db.Model):
    """A quote shown in the "Loved by learners and sellers" strip."""

    __tablename__ = "testimonials"

    id = db.Column(db.Integer, primary_key=True)
    author_name = db.Column(db.String(120), nullable=False)
    author_role = db.Column(db.String(180), nullable=True)
    quote = db.Column(db.Text, nullable=False)
    avatar_url = db.Column(db.Text, nullable=True)
    accent = db.Column(db.String(32), default="indigo", nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def initials(self) -> str:
        parts = [p for p in (self.author_name or "").split() if p]
        if not parts:
            return "CZ"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[-1][0]).upper()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "author_name": self.author_name,
            "author_role": self.author_role,
            "quote": self.quote,
            "avatar_url": self.avatar_url,
            "initials": self.initials(),
            "accent": self.accent,
            "sort_order": self.sort_order,
            "is_active": bool(self.is_active),
        }
