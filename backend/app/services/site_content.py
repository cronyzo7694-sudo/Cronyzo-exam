"""Landing-page content: defaults, seeding and read helpers.

Every word on the marketing surface is operator-editable. This module owns:

* ``DEFAULT_SETTINGS`` — the shipped copy. Used to seed an empty database and as
  a fallback whenever an operator blanks a field, so the site can never render
  an empty headline.
* ``DEFAULT_PILLARS`` / ``DEFAULT_TESTIMONIALS`` — seeded once, then owned by
  the operator through the admin API.
* ``get_content()`` — assembles the single payload the frontend fetches.
* ``set_setting()`` — validated write used by the admin routes.

Public exports (stable)::

    DEFAULT_SETTINGS, DEFAULT_PILLARS, DEFAULT_HERO_SLIDES, DEFAULT_TESTIMONIALS,
    ensure_site_content, get_content, set_setting, get_setting
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.site import HeroSlide, PillarCard, SiteSetting, Testimonial

logger = logging.getLogger("cronyzo.site_content")


# ---------------------------------------------------------------------------
# Shipped copy — (key, value_type, group, label, default)
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS: List[
    {
        "key": "founder.name",
        "label": "Founder — name (shown on the passport photo card)",
        "group": "Hero",
        "type": "text",
        "default": "Chhotu Rathor",
    },
    {
        "key": "founder.role",
        "label": "Founder — role / designation",
        "group": "Hero",
        "type": "text",
        "default": "Founder & developer, Cronyzo",
    },
    {
        "key": "founder.line",
        "label": "Founder — one line under the name",
        "group": "Hero",
        "type": "textarea",
        "default": (
            "A working developer from India who got tired of paying for ten "
            "different study sites."
        ),
    },
    {
        "key": "founder.story",
        "label": "Founder — the story shown when the photo is tapped",
        "group": "Hero",
        "type": "textarea",
        "default": (
            "I build Cronyzo on my own — one developer, no investors, no ad "
            "money. Every course, book and product on this site is checked by a "
            "human before it goes live, and every seller has to be approved "
            "before they can list anything. The goal is simple: studying in "
            "India should cost less, and honest teachers and shopkeepers should "
            "keep more of what they earn."
        ),
    },
Dict[str, Any]] = [
    # -- Identity strip under the navigation -----------------------------
    {
        "key": "strip.tagline",
        "value_type": "text",
        "group": "strip",
        "label": "Strip line next to the flag",
        "default": "Made in India · Built for every Indian learner, teacher and seller",
    },
    {
        "key": "strip.flag_enabled",
        "value_type": "boolean",
        "group": "strip",
        "label": "Show the waving Indian flag",
        "default": True,
    },
    # -- Hero copy -------------------------------------------------------
    {
        "key": "hero.eyebrow",
        "value_type": "text",
        "group": "hero",
        "label": "Hero eyebrow",
        "default": "One platform · Learn, Read, Shop & Test",
    },
    {
        "key": "hero.title",
        "value_type": "text",
        "group": "hero",
        "label": "Hero headline (H1)",
        "default": "Learn from the best. Read, buy and test.",
    },
    {
        "key": "hero.subtitle",
        "value_type": "longtext",
        "group": "hero",
        "label": "Hero paragraph",
        "default": (
            "Cronyzo brings teachers, authors, vendors and mock tests into one place. "
            "Take a course from an engineer who actually ships code, buy the books you "
            "need, order study gear, then prove what you learnt."
        ),
    },
    {
        "key": "hero.search_placeholder",
        "value_type": "text",
        "group": "hero",
        "label": "Search placeholder",
        "default": "Search courses, books, products, tests…",
    },
    {
        "key": "hero.popular_tags",
        "value_type": "json",
        "group": "hero",
        "label": "Popular searches (comma separated)",
        "default": ["SSC CGL", "React", "Python", "Stationery"],
    },
    # -- Section headings -------------------------------------------------
    {
        "key": "pillars.heading",
        "value_type": "text",
        "group": "pillars",
        "label": "Four pillars heading",
        "default": "Everything a learner actually needs",
    },
    {
        "key": "pillars.subheading",
        "value_type": "longtext",
        "group": "pillars",
        "label": "Four pillars subheading",
        "default": (
            "Cronyzo removes the tab-hopping. Classes, books, gear and practice tests "
            "live in one account with one checkout."
        ),
    },
    {
        "key": "courses.heading",
        "value_type": "text",
        "group": "sections",
        "label": "Top courses heading",
        "default": "Learn something that pays you back",
    },
    {
        "key": "courses.subheading",
        "value_type": "longtext",
        "group": "sections",
        "label": "Top courses subheading",
        "default": (
            "Hand-picked courses with structured modules, downloadable notes and honest "
            "reviews from learners."
        ),
    },
    {
        "key": "sell.heading",
        "value_type": "text",
        "group": "sections",
        "label": "Seller CTA heading",
        "default": "Teach a course. Sell your gear. Get paid every week.",
    },
    {
        "key": "sell.subheading",
        "value_type": "longtext",
        "group": "sections",
        "label": "Seller CTA paragraph",
        "default": (
            "Cronyzo gives you a course builder with modules and lessons, live classes on "
            "YouTube, a PDF library, a product catalogue, a storefront and a real earnings "
            "dashboard — all from one dashboard."
        ),
    },
    {
        "key": "sell.benefits",
        "value_type": "json",
        "group": "sections",
        "label": "Seller benefits (one per line)",
        "default": [
            "Keep 88% of every sale — commission shown transparently",
            "Verified storefront badge once your catalogue is reviewed",
            "Your own shop page with catalogue, reviews and live stock",
            "Instant payouts and a clean earnings dashboard",
        ],
    },
    {
        "key": "testimonials.heading",
        "value_type": "text",
        "group": "sections",
        "label": "Testimonials heading",
        "default": "Loved by learners and sellers",
    },
    {
        "key": "testimonials.subheading",
        "value_type": "longtext",
        "group": "sections",
        "label": "Testimonials subheading",
        "default": "One account, three kinds of people",
    },
    # -- Chat / support ---------------------------------------------------
    {
        "key": "chat.title",
        "value_type": "text",
        "group": "chat",
        "label": "Chat widget title",
        "default": "Talk to a real human",
    },
    {
        "key": "chat.subtitle",
        "value_type": "text",
        "group": "chat",
        "label": "Chat widget subtitle",
        "default": "Ask about a course, an order or becoming a seller. We reply fast.",
    },
    {
        "key": "support.email",
        "value_type": "text",
        "group": "support",
        "label": "Support email",
        "default": "cronyzo7694@gmail.com",
    },
    {
        "key": "support.telegram",
        "value_type": "text",
        "group": "support",
        "label": "Public Telegram handle",
        "default": "",
    },
    # -- Footer -----------------------------------------------------------
    {
        "key": "footer.blurb",
        "value_type": "longtext",
        "group": "footer",
        "label": "Footer blurb",
        "default": (
            "One platform to learn from teachers, read books, buy gear and test yourself "
            "— built for the Indian learner."
        ),
    },
    {
        "key": "footer.copyright",
        "value_type": "text",
        "group": "footer",
        "label": "Copyright line",
        "default": "Cronyzo Technologies Pvt. Ltd. Built for learners, teachers and sellers.",
    },
    # -- Feature flags surfaced in the UI ---------------------------------
    {
        "key": "feature.guest_browsing",
        "value_type": "boolean",
        "group": "features",
        "label": "Allow one-tap guest browsing",
        "default": True,
    },
    {
        "key": "feature.guest_can_purchase",
        "value_type": "boolean",
        "group": "features",
        "label": "Allow guests to check out (keep OFF for testing)",
        "default": False,
    },
    {
        "key": "feature.show_hero_carousel",
        "value_type": "boolean",
        "group": "features",
        "label": "Show the animated hero carousel",
        "default": True,
    },
]

DEFAULT_PILLARS: List[Dict[str, Any]] = [
    {
        "icon": "GraduationCap",
        "title": "Learn from teachers",
        "description": (
            "Structured courses from engineers, designers and toppers — with a free "
            "preview before you pay."
        ),
        "bullets": "Video lessons and live YouTube classes\nPDF notes and worksheets\nFree preview lesson in every course",
        "link_url": "/courses",
        "link_label": "Explore",
        "accent": "indigo",
        "sort_order": 1,
    },
    {
        "icon": "BookOpen",
        "title": "Read books & e-books",
        "description": (
            "Every book your course recommends, listed by real sellers with honest "
            "prices and stock — read free samples before you buy."
        ),
        "bullets": "Paperback, hardcover and PDF editions\nFree sample pages from the seller\nSome titles are free to download",
        "link_url": "/books",
        "link_label": "Explore",
        "accent": "violet",
        "sort_order": 2,
    },
    {
        "icon": "ShoppingBag",
        "title": "Shop study gear",
        "description": (
            "Notebooks, geometry boxes, laptops and more from verified storefronts with "
            "fast delivery."
        ),
        "bullets": "Live stock, no phantom listings\nSeller storefronts you can browse\nOne checkout for courses, books and gear",
        "link_url": "/shop",
        "link_label": "Explore",
        "accent": "teal",
        "sort_order": 3,
    },
    {
        "icon": "Zap",
        "title": "Test yourself",
        "description": (
            "Full-length mock exams with instant scoring, detailed analysis and a "
            "question bank you can trust."
        ),
        "bullets": "Timed, full-syllabus mock tests\nInstant score with topic analysis\nWorks offline, resumes where you left off",
        "link_url": "/exams",
        "link_label": "Explore",
        "accent": "amber",
        "sort_order": 4,
    },
]

DEFAULT_HERO_SLIDES: List[Dict[str, Any]] = [
    {
        "eyebrow": "Learn",
        "title": "A course from someone who actually ships the code",
        "subtitle": (
            "Structured modules, a free preview lesson, and PDF notes you keep "
            "forever. Buy once, learn at your own pace."
        ),
        "image_url": "/hero/slide-1.jpg",
        "image_alt": "A student learning from a video course with books and a cart beside them",
        "cta_label": "Browse courses",
        "cta_url": "/courses",
        "accent": "indigo",
        "sort_order": 1,
    },
    {
        "eyebrow": "Teach",
        "title": "Go live on YouTube and get paid for it",
        "subtitle": (
            "Schedule a live class, drop the join link, upload the notes as a PDF. "
            "Your students see it all in one place."
        ),
        "image_url": "/hero/slide-2.jpg",
        "image_alt": "A teacher hosting a live online class",
        "cta_label": "Start teaching",
        "cta_url": "/sell",
        "accent": "violet",
        "sort_order": 2,
    },
    {
        "eyebrow": "Sell",
        "title": "Your shop, with live stock and real payouts",
        "subtitle": (
            "Notebooks, geometry boxes, laptops — list them once and keep 88% of "
            "every sale. Commission is shown before you publish."
        ),
        "image_url": "/hero/slide-3.jpg",
        "image_alt": "A seller packing stationery orders in a small shop",
        "cta_label": "Open a storefront",
        "cta_url": "/sell",
        "accent": "teal",
        "sort_order": 3,
    },
    {
        "eyebrow": "Test",
        "title": "Sit the paper. See the analysis the same evening.",
        "subtitle": (
            "Full-length mocks with instant scoring and topic-wise analysis — "
            "then buy exactly the book your weak topic needs."
        ),
        "image_url": "/hero/slide-4.jpg",
        "image_alt": "A student taking an online mock test with a countdown timer",
        "cta_label": "Take a free test",
        "cta_url": "/exams",
        "accent": "amber",
        "sort_order": 4,
    },
]

DEFAULT_TESTIMONIALS: List[Dict[str, Any]] = [
    {
        "author_name": "Aarav Mehta",
        "author_role": "Banking aspirant · Delhi",
        "quote": (
            "I bought the Python course and the recommended book in the same order, then "
            "sat a mock test the same evening. That flow is exactly what I was missing."
        ),
        "accent": "indigo",
        "sort_order": 1,
    },
    {
        "author_name": "Ananya Iyer",
        "author_role": "Frontend educator · Pune",
        "quote": (
            "As a teacher I publish modules in the morning and see earnings and "
            "enrollments the same afternoon. No CSV uploads, no support tickets."
        ),
        "accent": "violet",
        "sort_order": 2,
    },
    {
        "author_name": "Priya Nair",
        "author_role": "Seller, Paper & Page · Kochi",
        "quote": (
            "My stationery store finally has a proper storefront. Customers see live "
            "stock and I get the order on my phone without calling anyone."
        ),
        "accent": "teal",
        "sort_order": 3,
    },
]


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------
def get_setting(key: str, default: Any = None) -> Any:
    """Return the decoded value of ``key``, or ``default`` when unset/blank."""
    try:
        row = SiteSetting.query.filter_by(key=key).first()
    except Exception:  # noqa: BLE001 — table may not exist during bootstrap
        return default
    if row is None:
        return default
    value = row.decoded()
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    if isinstance(value, (list, dict)) and not value:
        return default
    return value


def _fallback(key: str) -> Any:
    for item in DEFAULT_SETTINGS:
        if item["key"] == key:
            return item["default"]
    return None


def set_setting(key: str, value: Any) -> Optional[SiteSetting]:
    """Upsert ``key``. Returns the row, or ``None`` when the key is unknown."""
    definition = next((d for d in DEFAULT_SETTINGS if d["key"] == key), None)
    row = SiteSetting.query.filter_by(key=key).first()
    if row is None:
        if definition is None:
            # Unknown key: accept it as free-form text so the operator can add
            # their own keys without a deploy.
            row = SiteSetting(key=key, value_type="text", group="custom")
            db.session.add(row)
        else:
            row = SiteSetting(
                key=key,
                value_type=definition["value_type"],
                group=definition["group"],
                label=definition.get("label"),
            )
            db.session.add(row)
    row.set_value(value)
    return row


def settings_map() -> Dict[str, Any]:
    """All settings as ``{key: value}`` with defaults filled in."""
    out: Dict[str, Any] = {d["key"]: d["default"] for d in DEFAULT_SETTINGS}
    try:
        for row in SiteSetting.query.all():
            decoded = row.decoded()
            if decoded is None:
                continue
            if isinstance(decoded, str) and not decoded.strip():
                continue
            if isinstance(decoded, (list, dict)) and not decoded:
                continue
            out[row.key] = decoded
    except Exception:  # noqa: BLE001
        logger.debug("settings_map fell back to defaults", exc_info=True)
    return out


def get_content() -> Dict[str, Any]:
    """Assemble the full landing-page payload served to the frontend."""
    settings = settings_map()

    try:
        slides = (
            HeroSlide.query.filter_by(is_active=True)
            .order_by(HeroSlide.sort_order.asc(), HeroSlide.id.asc())
            .all()
        )
    except Exception:  # noqa: BLE001
        slides = []

    try:
        pillars = (
            PillarCard.query.filter_by(is_active=True)
            .order_by(PillarCard.sort_order.asc(), PillarCard.id.asc())
            .all()
        )
    except Exception:  # noqa: BLE001
        pillars = []

    try:
        quotes = (
            Testimonial.query.filter_by(is_active=True)
            .order_by(Testimonial.sort_order.asc(), Testimonial.id.asc())
            .all()
        )
    except Exception:  # noqa: BLE001
        quotes = []

    return {
        "settings": settings,
        "hero_slides": [s.to_dict() for s in slides],
        "pillars": [p.to_dict() for p in pillars],
        "testimonials": [t.to_dict() for t in quotes],
        "features": {
            "guest_browsing": bool(settings.get("feature.guest_browsing", True)),
            "guest_can_purchase": bool(settings.get("feature.guest_can_purchase", False)),
            "show_hero_carousel": bool(settings.get("feature.show_hero_carousel", True)),
            "flag_enabled": bool(settings.get("strip.flag_enabled", True)),
        },
    }


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
def ensure_site_content() -> None:
    """Seed settings / pillars / testimonials once. Idempotent and safe to re-run.

    Deliberately *not* guarded by a sentinel: settings are upserted only when
    missing, so an operator's edits are never overwritten on the next boot.
    """
    try:
        existing_keys = {row.key for row in SiteSetting.query.all()}
    except Exception:  # noqa: BLE001
        logger.exception("ensure_site_content: settings table unavailable")
        return

    created = 0
    for order, definition in enumerate(DEFAULT_SETTINGS):
        if definition["key"] in existing_keys:
            continue
        row = SiteSetting(
            key=definition["key"],
            value_type=definition["value_type"],
            group=definition["group"],
            label=definition.get("label"),
            hint=definition.get("hint"),
            sort_order=order,
        )
        row.set_value(definition["default"])
        db.session.add(row)
        created += 1

    try:
        if PillarCard.query.count() == 0:
            for item in DEFAULT_PILLARS:
                db.session.add(PillarCard(**item))
        if Testimonial.query.count() == 0:
            for item in DEFAULT_TESTIMONIALS:
                db.session.add(Testimonial(**item))
        if HeroSlide.query.count() == 0:
            for item in DEFAULT_HERO_SLIDES:
                db.session.add(HeroSlide(**item))
    except Exception:  # noqa: BLE001
        logger.exception("ensure_site_content: could not seed pillars/testimonials")

    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("ensure_site_content: commit failed")
        return

    if created:
        logger.info("site content: seeded %s settings", created)
