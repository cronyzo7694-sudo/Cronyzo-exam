"""Search — the map of the site.

The bar in the header is not a filter: it is how a student finds *anything*.
So this endpoint is built like a small search engine, not one `ILIKE`:

1. **Normalise the query** — lowercase, strip accents/Hindi punctuation, split
   into tokens, drop filler words ("test", "ka", "ke", "for").
2. **Expand synonyms** — a student types "airforce", "iaf", "vayu", "maths",
   "phy", "pyq", "गणित"; the catalogue says "Agniveer Vayu / Indian Air Force",
   "Mathematics", "Physics". Without this the right answer is invisible.
3. **Match against an in-memory index.** Titles, subtitles and blurbs of every
   exam, test, book, course, product, store and topic are loaded once into a
   flat document list (lightweight columns only) and searched in Python. That
   is what makes this fast: a keystroke costs a few milliseconds, not a dozen
   round-trips to Postgres.
4. **AND every token**, so "physics test 12" is not satisfied by a book that
   merely says "test" somewhere.
5. **Typo tolerance** — if a token matches nothing, it is repaired against the
   vocabulary of real titles ("phisics" → "physics") and the search reruns; the
   client is told what was assumed.
6. **Rank** — exact title, then title prefix, then title word, then the rest;
   series numbers ("test 12") and app pages get their own weights.
7. **Return everything grouped** — exams, tests (series), books, courses,
   products, stores, topics and app pages — so the UI can show one honest list.

Endpoints
    GET /api/search?q=…&limit=6      grouped results + spelling hint
    GET /api/search/suggest?q=…      lightweight list for autocomplete
    GET /api/search/stats            index size (debug/health)
"""

from __future__ import annotations

import difflib
import re
import threading
import time
import unicodedata
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models.book import Book
from app.models.chapter import Chapter
from app.models.course import Course
from app.models.exam import Exam
from app.models.question import Question
from app.models.store import Product, Store
from app.models.subject import Subject

search_bp = Blueprint("search", __name__)

_MAX_QUERY = 80
_MAX_PER_TYPE = 20
_INDEX_TTL = 30.0  # seconds — new listings show up in search within a minute

# Words that carry no meaning for matching ("english test 12" → ["english","12"]).
_STOPWORDS = {
    "a", "an", "the", "of", "for", "in", "on", "to", "and", "or", "with",
    "test", "tests", "mock", "series", "ka", "ke", "ki", "ko", "me", "mein",
    "se", "hai", "ho", "kar", "karo", "chahiye", "bhai", "please", "plz",
}

# What people type → what the catalogue actually says.
_SYNONYMS: Dict[str, List[str]] = {
    "airforce": ["air force", "agniveer", "vayu"],
    "agniveer": ["agniveer vayu", "air force"],
    "iaf": ["air force", "agniveer"],
    "vayu": ["agniveer vayu"],
    "afcat": ["afcat", "air force"],
    "army": ["army", "agniveer"],
    "math": ["mathematics"],
    "maths": ["mathematics"],
    "ganit": ["mathematics"],
    "phy": ["physics"],
    "physic": ["physics"],
    "phisics": ["physics"],
    "chem": ["chemistry"],
    "bio": ["biology"],
    "eng": ["english"],
    "reasoning": ["reasoning", "raga"],
    "raga": ["raga", "reasoning"],
    "gk": ["general awareness", "general knowledge", "raga"],
    "ga": ["general awareness"],
    "gs": ["general studies", "general awareness"],
    "quant": ["quantitative aptitude", "mathematics"],
    "aptitude": ["aptitude", "quantitative aptitude"],
    "pyq": ["previous year", "pyq"],
    "paper": ["paper", "previous year"],
    "book": ["book"],
    "kitab": ["book"],
    "ebook": ["book", "pdf"],
    "pdf": ["pdf", "book"],
    "course": ["course"],
    "video": ["course", "lesson"],
    "shop": ["product", "store"],
    "store": ["store", "seller"],
    "seller": ["seller", "store"],
    "free": ["free"],
    "ssc": ["ssc", "cgl", "chsl", "cpo", "mts", "gd"],
    "cgl": ["cgl", "ssc"],
    "chsl": ["chsl", "ssc"],
    "cpo": ["cpo", "ssc"],
    "mts": ["mts", "ssc"],
    "gd": ["gd", "ssc"],
    "bank": ["bank", "ibps", "sbi"],
    "ibps": ["ibps", "bank"],
    "railway": ["railway", "rrb"],
    "rrb": ["rrb", "railway"],
    # Hindi / Hinglish — students type in Devanagari too.
    "किताब": ["book"],
    "किताबें": ["book"],
    "पुस्तक": ["book"],
    "बुक": ["book"],
    "कोर्स": ["course"],
    "क्लास": ["course"],
    "वीडियो": ["course", "lesson"],
    "टेस्ट": ["test"],
    "परीक्षा": ["exam", "test"],
    "मॉक": ["test"],
    "प्रश्न": ["question"],
    "सवाल": ["question"],
    "गणित": ["mathematics", "maths"],
    "भौतिकी": ["physics"],
    "अंग्रेजी": ["english"],
    "तर्क": ["reasoning", "raga"],
    "सामान्य": ["general"],
    "अध्ययन": ["studies", "awareness"],
    "नोट्स": ["notes", "pdf"],
    "पीडीएफ": ["pdf"],
    "मुफ्त": ["free"],
    "फ्री": ["free"],
    "दुकान": ["shop", "store"],
}

# Static pages, so "attempts" or "dashboard" typed in the bar goes somewhere.
_PAGES: List[Dict[str, str]] = [
    {"title": "Dashboard", "url": "/dashboard", "keywords": "home dashboard account overview progress"},
    {"title": "Exams", "url": "/exams", "keywords": "exams mock tests practice series test paper paper exam"},
    {"title": "My attempts", "url": "/attempts", "keywords": "attempts results history resume unfinished score"},
    {"title": "Analytics", "url": "/analytics", "keywords": "analytics score progress report accuracy graph"},
    {"title": "Books", "url": "/books", "keywords": "books library read pdf ebook kitab pustak"},
    {"title": "Courses", "url": "/courses", "keywords": "courses classes lessons video learn course"},
    {"title": "Shop", "url": "/shop", "keywords": "shop products gear stationery buy order"},
    {"title": "Stores", "url": "/stores", "keywords": "stores sellers shops brands dukaan"},
    {"title": "My courses", "url": "/my-courses", "keywords": "my courses enrolled learning purchased"},
    {"title": "Orders", "url": "/orders", "keywords": "orders purchases invoices delivery tracking"},
    {"title": "Cart", "url": "/cart", "keywords": "cart basket checkout buy payment"},
    {"title": "Account", "url": "/account", "keywords": "account profile password email name settings"},
    {"title": "Sell on Cronyzo", "url": "/sell", "keywords": "sell seller apply shopkeeper vendor partner earn"},
    {"title": "Help & support", "url": "/help", "keywords": "help support contact problem complaint email"},
]

# Type weight — a named thing beats a blurb, a page beats everything else.
_TYPE_BONUS = {
    "page": 30,
    "exam": 8,
    "book": 6,
    "course": 6,
    "product": 5,
    "store": 4,
    "test": 0,
    "subject": 3,
    "chapter": 0,
}


# --------------------------------------------------------------------------- #
# Text helpers
# --------------------------------------------------------------------------- #
def _norm(text: Optional[str]) -> str:
    """Lowercase, accent-free, whitespace-collapsed (Devanagari preserved)."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = stripped.lower()
    cleaned = re.sub(r"[^\w\u0900-\u097F]+", " ", lowered, flags=re.UNICODE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _tokens(query: str) -> List[str]:
    raw = [t for t in _norm(query).split(" ") if t]
    meaningful = [t for t in raw if t not in _STOPWORDS]
    return meaningful or raw


def _variants(token: str) -> List[str]:
    """Every spelling of this token worth trying."""
    base = [token]
    if token in _SYNONYMS:
        base.extend(_SYNONYMS[token])
    if len(token) > 3 and token.endswith("s"):
        base.append(token[:-1])
    elif len(token) > 3:
        base.append(f"{token}s")
    seen: List[str] = []
    for item in base:
        if item and item not in seen:
            seen.append(item)
    return seen


def _money(value: Any) -> Optional[str]:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return "Free"
    return f"₹{int(round(amount))}"


def _first_line(text: Optional[str], limit: int = 120) -> Optional[str]:
    if not text:
        return None
    line = str(text).strip().split("\n")[0].strip()
    return line[:limit] or None


# --------------------------------------------------------------------------- #
# The index
# --------------------------------------------------------------------------- #
_INDEX: Dict[str, Any] = {}
_INDEX_TS = 0.0
_INDEX_LOCK = threading.Lock()
_REBUILDING = threading.Event()


def _doc(
    doc_type: str,
    doc_id: Any,
    title: Optional[str],
    url: str,
    *,
    subtitle: Optional[str] = None,
    body: Optional[str] = None,
    image: Optional[str] = None,
    meta: Optional[str] = None,
    series_no: Any = None,
    minutes: Any = None,
    questions: Any = None,
    marks: Any = None,
    extra: Optional[str] = None,
) -> Dict[str, Any]:
    title_n = _norm(title)
    sub_n = _norm(subtitle)
    body_n = _norm(body)
    extra_n = _norm(extra)
    words = [w for w in f"{title_n} {sub_n} {extra_n}".split(" ") if len(w) >= 3]
    return {
        "type": doc_type,
        "id": doc_id,
        "title": title or "(untitled)",
        "subtitle": subtitle,
        "url": url,
        "image": image,
        "meta": meta,
        "series_no": series_no,
        "minutes": minutes,
        "questions": questions,
        "marks": marks,
        "title_n": title_n,
        "sub_n": sub_n,
        "body_n": body_n,
        "extra_n": extra_n,
        "words": words,
        "hay": f"{title_n} {sub_n} {extra_n} {body_n}".strip(),
    }


def _load_exams(docs: List[Dict[str, Any]]) -> None:
    try:
        rows = (
            db.session.query(
                Exam.id,
                Exam.title,
                Exam.description,
                Exam.parent_exam_id,
                Exam.total_questions,
                Exam.duration_seconds,
                Exam.total_marks,
                Exam.rules_json,
                Exam.status,
            )
            .all()
        )
    except Exception:  # noqa: BLE001 — search must never 500
        return

    parent_titles = {r.id: r.title for r in rows if r.parent_exam_id is None}
    for row in rows:
        status = (row.status or "").lower()
        if status in ("draft", "archived"):
            continue
        series_no = None
        subject = None
        try:
            import json as _json

            rules = _json.loads(row.rules_json or "{}")
            series = rules.get("series") if isinstance(rules, dict) else None
            if isinstance(series, dict):
                series_no = series.get("no")
                subject = series.get("subject")
        except Exception:  # noqa: BLE001
            pass
        is_test = row.parent_exam_id is not None
        minutes = int(round((row.duration_seconds or 0) / 60)) or None
        parts = []
        if row.total_questions:
            parts.append(f"{int(row.total_questions)} Q")
        if minutes:
            parts.append(f"{minutes} min")
        if row.total_marks:
            parts.append(f"{int(round(float(row.total_marks)))} marks")
        if is_test:
            parts.append(f"Series #{series_no}" if series_no else "Test")
        docs.append(
            _doc(
                "test" if is_test else "exam",
                row.id,
                row.title,
                f"/exams/{row.parent_exam_id if is_test else row.id}",
                subtitle=(
                    f"Series #{series_no} · {subject}" if series_no and subject
                    else ("Series test" if is_test else _first_line(row.description))
                ),
                body=row.description,
                meta=" · ".join(parts) or None,
                series_no=series_no,
                minutes=minutes,
                questions=int(row.total_questions or 0) or None,
                marks=float(row.total_marks or 0) or None,
                extra=(
                    f"series {series_no} {subject or ''} "
                    f"{parent_titles.get(row.parent_exam_id) or ''}"
                ),
            )
        )


def _load_books(docs: List[Dict[str, Any]]) -> None:
    try:
        rows = (
            db.session.query(
                Book.id, Book.title, Book.slug, Book.author, Book.category,
                Book.description, Book.cover_url, Book.price, Book.is_free_download,
                Book.status, Book.is_active, Book.rating_avg, Book.rating_count,
            ).all()
        )
    except Exception:  # noqa: BLE001
        return
    for row in rows:
        if (row.status or "published").lower() not in ("published", "active"):
            continue
        if row.is_active is False:
            continue
        docs.append(
            _doc(
                "book",
                row.id,
                row.title,
                f"/books/{row.slug}",
                subtitle=row.author or row.category,
                body=row.description,
                image=row.cover_url,
                meta="Free" if row.is_free_download else _money(row.price),
                extra=f"{row.category or ''} book pdf ebook",
            )
        )


def _load_courses(docs: List[Dict[str, Any]]) -> None:
    try:
        rows = (
            db.session.query(
                Course.id, Course.title, Course.slug, Course.subtitle, Course.category,
                Course.description, Course.thumbnail_url, Course.price, Course.status,
                Course.lesson_count, Course.is_active,
            ).all()
        )
    except Exception:  # noqa: BLE001
        return
    for row in rows:
        if (row.status or "published").lower() not in ("published", "active"):
            continue
        if row.is_active is False:
            continue
        docs.append(
            _doc(
                "course",
                row.id,
                row.title,
                f"/courses/{row.slug}",
                subtitle=row.subtitle or row.category,
                body=row.description,
                image=row.thumbnail_url,
                meta=(
                    f"{row.lesson_count} lessons · {_money(row.price)}"
                    if row.lesson_count else _money(row.price)
                ),
                extra=f"{row.category or ''} course class",
            )
        )


def _load_products(docs: List[Dict[str, Any]]) -> None:
    try:
        rows = (
            db.session.query(
                Product.id, Product.title, Product.slug, Product.brand, Product.description,
                Product.image_url, Product.price, Product.is_active, Product.is_published,
            ).all()
        )
    except Exception:  # noqa: BLE001
        return
    for row in rows:
        if row.is_active is False or row.is_published is False:
            continue
        docs.append(
            _doc(
                "product",
                row.id,
                row.title,
                f"/shop/{row.slug}",
                subtitle=row.brand,
                body=row.description,
                image=row.image_url,
                meta=_money(row.price),
                extra="product shop buy",
            )
        )


def _load_stores(docs: List[Dict[str, Any]]) -> None:
    try:
        rows = (
            db.session.query(
                Store.id, Store.name, Store.slug, Store.tagline, Store.description,
                Store.logo_url, Store.banner_url, Store.status, Store.is_active,
            ).all()
        )
    except Exception:  # noqa: BLE001
        return
    for row in rows:
        if row.is_active is False:
            continue
        if (row.status or "approved").lower() not in ("approved", "active", "published"):
            continue
        docs.append(
            _doc(
                "store",
                row.id,
                row.name,
                f"/stores/{row.slug}",
                subtitle=row.tagline or _first_line(row.description) or "Store",
                body=row.description,
                image=row.logo_url or row.banner_url,
                meta="Store",
                extra="store seller shop",
            )
        )


def _load_topics(docs: List[Dict[str, Any]]) -> None:
    try:
        subject_counts = dict(
            db.session.query(Question.subject_id, func.count(Question.id))
            .group_by(Question.subject_id)
            .all()
        )
    except Exception:  # noqa: BLE001
        subject_counts = {}
    try:
        chapter_counts = dict(
            db.session.query(Question.chapter_id, func.count(Question.id))
            .group_by(Question.chapter_id)
            .all()
        )
    except Exception:  # noqa: BLE001
        chapter_counts = {}

    try:
        for row in db.session.query(Subject.id, Subject.name).all():
            count = int(subject_counts.get(row.id) or 0)
            if count <= 0:
                continue
            docs.append(
                _doc(
                    "subject",
                    row.id,
                    row.name,
                    f"/exams?subject={row.name}",
                    subtitle=f"{count} questions in the bank",
                    meta=f"{count} Q",
                    extra="subject topic",
                )
            )
    except Exception:  # noqa: BLE001
        pass

    try:
        for row in (
            db.session.query(Chapter.id, Chapter.name, Subject.name)
            .outerjoin(Subject, Subject.id == Chapter.subject_id)
            .all()
        ):
            count = int(chapter_counts.get(row[0]) or 0)
            if count <= 0:
                continue
            docs.append(
                _doc(
                    "chapter",
                    row[0],
                    row[1],
                    f"/exams?subject={row[2] or ''}",
                    subtitle=f"{count} questions · {row[2] or 'chapter'}",
                    meta=f"{count} Q",
                    extra=f"chapter {row[2] or ''}",
                )
            )
    except Exception:  # noqa: BLE001
        pass


def _load_pages(docs: List[Dict[str, Any]]) -> None:
    for page in _PAGES:
        docs.append(
            _doc(
                "page",
                None,
                page["title"],
                page["url"],
                subtitle="Go to page",
                extra=page["keywords"],
            )
        )


def _build_index() -> Dict[str, Any]:
    docs: List[Dict[str, Any]] = []
    _load_pages(docs)  # pages first: they always exist
    _load_exams(docs)
    _load_books(docs)
    _load_courses(docs)
    _load_products(docs)
    _load_stores(docs)
    _load_topics(docs)

    vocab: set = set()
    for doc in docs:
        for word in doc["title_n"].split(" "):
            if len(word) >= 3:
                vocab.add(word)
        for word in doc["sub_n"].split(" "):
            if len(word) >= 3:
                vocab.add(word)
    return {"docs": docs, "vocab": sorted(vocab), "vocab_set": vocab}


def _rebuild(app: Any = None) -> None:
    """Replace the snapshot. Safe to call from a background thread."""
    global _INDEX, _INDEX_TS
    with _INDEX_LOCK:
        context = None
        try:
            if app is not None:
                context = app.app_context()
                context.push()
            built = _build_index()
            _INDEX = built
            _INDEX_TS = time.time()
        except Exception:  # noqa: BLE001 — keep serving the old snapshot
            _INDEX_TS = time.time()
        finally:
            if context is not None:
                context.pop()
        _REBUILDING.clear()


def _refresh_in_background() -> None:
    """Stale-while-revalidate: nobody waits for an index rebuild mid-keystroke."""
    if _REBUILDING.is_set():
        return
    _REBUILDING.set()
    try:
        from flask import current_app

        app = current_app._get_current_object()
    except Exception:  # noqa: BLE001
        app = None
    threading.Thread(target=_rebuild, args=(app,), name="search-index-refresh", daemon=True).start()


def _index() -> Dict[str, Any]:
    """Current snapshot of the catalogue (rebuilds in the background when old)."""
    global _INDEX
    snapshot = _INDEX
    if snapshot is None:
        _rebuild()
        return _INDEX
    if (time.time() - _INDEX_TS) >= _INDEX_TTL:
        _refresh_in_background()
    return snapshot


def invalidate() -> None:
    """Force the next search to see fresh rows (call after publishing)."""
    global _INDEX_TS
    _INDEX_TS = 0.0


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #
def _fuzzy_word(token: str, words: List[str]) -> bool:
    """Is `token` a near-miss of any word in `words`? ("phisics" → physics)"""
    if not token:
        return False
    for word in words:
        if word == token:
            return True
        if abs(len(word) - len(token)) > 2:
            continue
        if word[:1] != token[:1]:
            continue
        if difflib.SequenceMatcher(None, token, word).ratio() >= 0.82:
            return True
    return False


def _group_hit(doc: Dict[str, Any], group: List[str]) -> int:
    """How well one query token (all its spellings) hits this doc. 0 = no hit."""
    best = 0
    # A bare number is almost always a series number ("english 25"), so it must
    # beat the "25 questions" that every auto-written description contains.
    for variant in group:
        if variant.isdigit() and doc.get("series_no") is not None and str(doc["series_no"]) == variant:
            best = max(best, 96)
    for variant in group:
        if variant in doc["title_n"]:
            if doc["title_n"] == variant:
                best = max(best, 90)
            elif doc["title_n"].startswith(variant):
                best = max(best, 76)
            elif re.search(rf"\b{re.escape(variant)}", doc["title_n"]):
                best = max(best, 62)
            else:
                best = max(best, 48)
        elif variant in doc["extra_n"]:
            best = max(best, 42)
        elif variant in doc["sub_n"]:
            best = max(best, 34)
        elif variant in doc["body_n"]:
            best = max(best, 14)
        elif variant.isdigit() and doc.get("series_no") is not None and str(doc["series_no"]) == variant:
            best = max(best, 56)
    if best:
        return best
    # near-miss on any spelling of this token
    for variant in group:
        if _fuzzy_word(variant, doc["words"]):
            return 18
    return 0


def _score_doc(doc: Dict[str, Any], phrase: str, groups: List[List[str]]) -> int:
    score = 0
    for group in groups:
        hit = _group_hit(doc, group)
        if not hit:
            return 0  # every token must land somewhere (AND semantics)
        score += hit
    title = doc["title_n"]
    if phrase and title:
        if title == phrase:
            score += 120
        elif title.startswith(phrase):
            score += 70
        elif phrase in title:
            score += 45
    if all(_group_hit(doc, [t]) for t in phrase.split(" ") if t) and phrase:
        score += 20
    if doc.get("series_no") and str(doc["series_no"]) in groups_strings(groups):
        score += 40
    score += _TYPE_BONUS.get(doc["type"], 0)
    return score


def groups_strings(groups: List[List[str]]) -> set:
    out = set()
    for group in groups:
        out.update(group)
    return out


# --------------------------------------------------------------------------- #
# The engine
# --------------------------------------------------------------------------- #
_GROUP_KEYS = ("exams", "tests", "books", "courses", "products", "stores", "topics", "pages")
_TYPE_TO_GROUP = {
    "exam": "exams",
    "test": "tests",
    "book": "books",
    "course": "courses",
    "product": "products",
    "store": "stores",
    "subject": "topics",
    "chapter": "topics",
    "page": "pages",
}


def _repair_tokens(tokens: List[str], vocab: List[str], vocab_set: set) -> List[str]:
    repaired: List[str] = []
    for token in tokens:
        if token in vocab_set or any(v in vocab_set for v in _variants(token)):
            repaired.append(token)
            continue
        match = difflib.get_close_matches(token, vocab, n=1, cutoff=0.74)
        repaired.append(match[0] if match else token)
    return repaired


def _run(tokens: List[str], phrase: str) -> List[Dict[str, Any]]:
    snapshot = _index()
    groups = [_variants(token) for token in tokens]
    hits: List[Dict[str, Any]] = []
    for doc in snapshot["docs"]:
        score = _score_doc(doc, phrase, groups)
        if score > 0:
            hits.append({**doc, "score": score})
    return hits


def _public(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc.get("id"),
        "type": doc["type"],
        "title": doc["title"],
        "subtitle": doc.get("subtitle"),
        "url": doc["url"],
        "image": doc.get("image"),
        "meta": doc.get("meta"),
        "series_no": doc.get("series_no"),
        "minutes": doc.get("minutes"),
        "questions": doc.get("questions"),
        "marks": doc.get("marks"),
        "score": doc.get("score", 0),
    }


def run_search(raw_query: str, per_type: int = 6) -> Dict[str, Any]:
    """The whole engine, reusable by /search and /search/suggest."""
    query = (raw_query or "").strip()[:_MAX_QUERY]
    tokens = _tokens(query)
    if not tokens:
        return {
            "query": query, "tokens": [], "groups": {}, "counts": {},
            "total": 0, "corrected": None, "suggestions": [], "took_ms": 0,
        }

    started = time.perf_counter()
    phrase = _norm(query)
    hits = _run(tokens, phrase)
    corrected: Optional[str] = None
    suggestions: List[str] = []

    if not hits:
        # Nothing at all → assume a typo, repair against real titles, retry.
        snapshot = _index()
        repaired = _repair_tokens(tokens, snapshot["vocab"], snapshot["vocab_set"])
        if repaired != tokens:
            retry = _run(repaired, _norm(" ".join(repaired)))
            if retry:
                hits = retry
                tokens = repaired
                corrected = " ".join(repaired)

    if not hits:
        snapshot = _index()
        near = difflib.get_close_matches(_norm(query), snapshot["vocab"], n=4, cutoff=0.55)
        suggestions = near or ["physics", "english", "mathematics", "air force"]

    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for hit in sorted(hits, key=lambda row: row["score"], reverse=True):
        key = _TYPE_TO_GROUP.get(hit["type"])
        if not key:
            continue
        buckets.setdefault(key, []).append(hit)

    groups_out = {key: [_public(row) for row in values[:per_type]] for key, values in buckets.items()}
    counts = {key: len(values) for key, values in buckets.items()}
    return {
        "query": query,
        "tokens": tokens,
        "groups": groups_out,
        "counts": counts,
        "total": sum(counts.values()),
        "corrected": corrected,
        "suggestions": suggestions,
        "took_ms": round((time.perf_counter() - started) * 1000, 1),
    }


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@search_bp.get("")
def search():
    """Grouped results across every section of the site."""
    try:
        per_type = int(request.args.get("limit") or 6)
    except (TypeError, ValueError):
        per_type = 6
    per_type = max(1, min(_MAX_PER_TYPE, per_type))
    return jsonify(run_search(request.args.get("q") or "", per_type=per_type))


@search_bp.get("/suggest")
def suggest():
    """Fast, small payload for the dropdown under the search box."""
    payload = run_search(request.args.get("q") or "", per_type=4)
    flat: List[Dict[str, Any]] = []
    for key in _GROUP_KEYS:
        flat.extend(payload["groups"].get(key, []))
    flat.sort(key=lambda row: row.get("score", 0), reverse=True)
    return jsonify(
        {
            "query": payload["query"],
            "items": flat[:10],
            "total": payload["total"],
            "corrected": payload["corrected"],
            "suggestions": payload["suggestions"],
            "counts": payload["counts"],
            "took_ms": payload["took_ms"],
        }
    )


@search_bp.get("/stats")
def stats():
    """Small health probe: how big is the index, how old is it."""
    snapshot = _index()
    by_type: Dict[str, int] = {}
    for doc in snapshot["docs"]:
        by_type[doc["type"]] = by_type.get(doc["type"], 0) + 1
    return jsonify(
        {
            "documents": len(snapshot["docs"]),
            "vocabulary": len(snapshot["vocab"]),
            "by_type": by_type,
            "age_seconds": round(time.time() - _INDEX_TS, 1) if _INDEX_TS else None,
            "ttl_seconds": _INDEX_TTL,
        }
    )
