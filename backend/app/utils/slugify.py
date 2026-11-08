"""Slug helpers shared by the course / book / product routes.

Public contract (stable)::

    slugify(text) -> str
    unique_slug(model, text, field="slug", exclude_id=None) -> str

``unique_slug`` appends a numeric suffix (``-2``, ``-3``, …) until it finds a
free value, so two teachers can publish "Python Basics" without colliding.
"""

from __future__ import annotations

import re
from typing import Any, Optional

_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")
_MAX_BASE = 80


def slugify(text: Any) -> str:
    """
    Convert arbitrary text into a URL-safe slug.

    Returns ``"item"`` for input that contains no usable characters so the
    caller always gets a non-empty string.
    """
    raw = str(text or "").strip().lower()
    # Keep Devanagari / non-latin letters as-is? No — slugs must stay ASCII
    # safe for URLs. Transliteration is out of scope, so strip them out.
    cleaned = _SLUG_STRIP_RE.sub("-", raw)
    cleaned = cleaned.strip("-")
    if not cleaned:
        return "item"
    return cleaned[:_MAX_BASE].strip("-") or "item"


def unique_slug(
    model: Any,
    text: Any,
    field: str = "slug",
    exclude_id: Optional[int] = None,
) -> str:
    """
    Build a slug for ``model`` that is unique across its table.

    ``exclude_id`` lets an update keep its own slug instead of colliding
    with itself.
    """
    base = slugify(text)
    column = getattr(model, field)

    candidate = base
    counter = 2
    # Bounded loop — a pathological table should not hang the request
    while counter < 500:
        query = model.query.filter(column == candidate)
        if exclude_id is not None:
            query = query.filter(model.id != exclude_id)
        if query.first() is None:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1
    # Extremely unlikely fallback: random suffix keeps the write going
    import secrets

    return f"{base}-{secrets.token_hex(3)}"


__all__ = ["slugify", "unique_slug"]
