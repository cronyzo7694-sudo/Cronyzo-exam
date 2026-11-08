"""Media helpers — deterministic placeholder artwork for catalog entries.

Cronyzo will eventually store real photography on Cloudinary. Until then the
catalog needs *something* that looks intentional rather than a broken image,
so this module renders a self-contained SVG data-URI per item:

    * a soft two-stop gradient derived from the item's slug (stable per item)
    * a large translucent glyph
    * the item's short label

Because the artwork is an inline ``data:`` URI it needs no network, no
hosting and no external CDN — it renders identically in the sandbox preview,
on a dev box and in production.

Public contract (stable)::

    artwork(label, seed=None, glyph="book", width=800, height=600) -> str
    cover_artwork(label, seed=None) -> str

Later, replacing a placeholder with a Cloudinary URL is a data change only —
no code path depends on the placeholder format.
"""

from __future__ import annotations

import base64
import hashlib
import re
from typing import Final, Optional, Sequence, Tuple

# Brand-aligned gradient pairs (indigo → violet → teal → amber family)
_PALETTES: Final[Tuple[Tuple[str, str], ...]] = (
    ("#4f46e5", "#7c3aed"),
    ("#0ea5e9", "#2563eb"),
    ("#0891b2", "#0f766e"),
    ("#f59e0b", "#ea580c"),
    ("#db2777", "#9333ea"),
    ("#16a34a", "#0d9488"),
    ("#e11d48", "#f97316"),
    ("#6366f1", "#06b6d4"),
)

# Simple, readable line glyphs drawn as SVG paths (24x24 viewBox)
_GLYPHS: Final[dict] = {
    "book": "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 19.5z",
    "course": "M12 3 2 8l10 5 10-5zM2 16l10 5 10-5M2 12l10 5 10-5",
    "phone": "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
    "laptop": "M4 5h16v10H4zM2 19h20",
    "shirt": "M8 3 4 6l2 4h2v11h8V10h2l2-4-4-3a4 4 0 0 1-8 0z",
    "home": "M3 11 12 3l9 8v10h-6v-6H9v6H3z",
    "bag": "M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2",
    "headphones": "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z",
    "camera": "M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "watch": "M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM9 2h6l-.5 4h-5zM9 22h6l-.5-4h-5z",
    "pen": "M4 20l1-4L16 5l3 3L8 19zM14 7l3 3",
    "sports": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z",
    "coffee": "M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a3 3 0 0 1 0 6h-2M6 2v3M10 2v3",
    "food": "M6 2v8a3 3 0 0 0 6 0V2M9 10v12M17 2c-2 2-2 6 0 8v12",
    "toy": "M12 3l3 3 4-1-1 4 3 3-4 1-1 4-4-2-4 2-1-4-4-1 3-3-1-4 4 1z",
    "chart": "M4 20V9M10 20V4M16 20v-7M22 20H2",
    "rocket": "M12 3c4 3 6 7 6 11l-4 4H10l-4-4c0-4 2-8 6-11zM9 14a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
    "code": "M8 6 2 12l6 6M16 6l6 6-6 6",
    "math": "M5 4h14M5 20h14M12 4v16M7 9l10 6M17 9 7 15",
    "mic": "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4",
    "globe": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    "music": "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    "lamp": "M12 3v4M8 7h8l3 8H5zM12 15v6",
}

_TEXT_SAFE_RE: Final = re.compile(r"[^A-Za-z0-9 &]+")


def _hash_int(seed: str) -> int:
    """Stable 31-bit hash — same seed always yields the same artwork."""
    digest = hashlib.sha256((seed or "cronyzo").encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _escape(text: str) -> str:
    """Minimal XML escaping for text placed inside the SVG."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _short_label(label: str, max_words: int = 3, max_chars: int = 26) -> str:
    """Trim a title down to a readable two/three-word artwork label."""
    cleaned = _TEXT_SAFE_RE.sub("", str(label or "")).strip()
    if not cleaned:
        return "Cronyzo"
    words = cleaned.split()
    if len(words) > max_words:
        words = words[:max_words]
    out = " ".join(words)
    if len(out) > max_chars:
        out = out[:max_chars].rstrip()
    return out.upper() or "CRONYZO"


def _fit_text(text: str, width: int, margin: int = 56) -> tuple[int, int]:
    """
    Pick a font size + letter-spacing so ``text`` fits inside ``width``.

    SVG has no ``text-wrap``, so a long title would otherwise spill past the
    canvas edge and get clipped by ``object-cover`` on the card. We estimate
    the rendered width (bold uppercase sans ≈ 0.62em per glyph, plus the
    tracking) and scale both metrics down until the label fits.

    Returns
    -------
    tuple[int, int]
        ``(font_size, letter_spacing)``
    """
    font_size = 34
    tracking = 2
    if not text:
        return font_size, tracking

    usable = max(80, width - 2 * margin)
    estimate = len(text) * (0.62 * font_size + tracking)
    if estimate > usable:
        scale = usable / estimate
        font_size = max(13, int(font_size * scale))
        tracking = max(0, int(tracking * scale))
        # Integer rounding can leave a couple of pixels over — trim once more.
        while (
            font_size > 13
            and len(text) * (0.62 * font_size + tracking) > usable
        ):
            font_size -= 1
    return font_size, tracking


def artwork(
    label: str,
    seed: Optional[str] = None,
    glyph: str = "book",
    width: int = 800,
    height: int = 600,
) -> str:
    """
    Build an SVG data URI for a catalog item.

    Parameters
    ----------
    label:
        Human title shown on the artwork.
    seed:
        Stable seed (usually the slug). Controls the gradient and rotation.
    glyph:
        Key from :data:`_GLYPHS` — unknown keys fall back to ``"book"``.
    width, height:
        Intrinsic size of the generated SVG.

    Returns
    -------
    str
        A ``data:image/svg+xml;base64,...`` URI.
    """
    seed_value = seed or label or "cronyzo"
    h = _hash_int(seed_value)
    start, end = _PALETTES[h % len(_PALETTES)]

    # Slight angle variation keeps a grid of covers from looking flat
    angle = 20 + (h % 60)
    radius = 26 + (h % 18)

    path = _GLYPHS.get(glyph, _GLYPHS["book"])
    text = _escape(_short_label(label))
    font_size, tracking = _fit_text(text, width)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{text}">
<defs>
<linearGradient id="g" gradientTransform="rotate({angle})">
<stop offset="0%" stop-color="{start}"/>
<stop offset="100%" stop-color="{end}"/>
</linearGradient>
</defs>
<rect width="{width}" height="{height}" fill="url(#g)"/>
<circle cx="{width * 0.78:.0f}" cy="{height * 0.2:.0f}" r="{height * 0.42:.0f}" fill="#ffffff" opacity="0.10"/>
<circle cx="{width * 0.18:.0f}" cy="{height * 0.85:.0f}" r="{height * 0.32:.0f}" fill="#000000" opacity="0.08"/>
<g transform="translate({width / 2 - 96:.0f},{height / 2 - 132:.0f}) scale(8)" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<path d="{path}"/>
</g>
<text x="{width / 2:.0f}" y="{height - 62:.0f}" font-family="Segoe UI, Inter, system-ui, sans-serif" font-size="{font_size}" font-weight="700" fill="#ffffff" fill-opacity="0.96" text-anchor="middle" letter-spacing="{tracking}">{text}</text>
</svg>"""

    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def cover_artwork(label: str, seed: Optional[str] = None, glyph: str = "book") -> str:
    """Book cover art (3:4) — matches the aspect ratio of the book card."""
    return artwork(label, seed=seed, glyph=glyph, width=600, height=800)


def course_artwork(label: str, seed: Optional[str] = None, glyph: str = "course") -> str:
    """Course thumbnail art (16:10) — matches the aspect ratio of the course card."""
    return artwork(label, seed=seed, glyph=glyph, width=800, height=500)


def product_artwork(label: str, seed: Optional[str] = None, glyph: str = "bag") -> str:
    """Product image art (1:1) — matches the square product card."""
    return artwork(label, seed=seed, glyph=glyph, width=800, height=800)


def avatar_artwork(label: str, seed: Optional[str] = None) -> str:
    """Square avatar artwork for teachers and vendors."""
    return artwork(label, seed=seed, glyph="globe", width=256, height=256)


__all__ = [
    "artwork",
    "cover_artwork",
    "course_artwork",
    "product_artwork",
    "avatar_artwork",
]
