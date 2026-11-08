"""Additive schema upgrades for existing SQLite/Postgres DBs.

``db.create_all()`` does not ALTER existing tables. This module adds new
nullable columns / tables required by the enterprise bank & analytics layer
without breaking older rows.
"""

from __future__ import annotations

import logging
from typing import Iterable, List, Sequence, Tuple

from sqlalchemy import inspect, text

from app.extensions import db

logger = logging.getLogger("cronyzo.services.schema_upgrade")

# (table, column, DDL type fragment) — only ADD COLUMN IF missing
_USER_COLUMNS: Sequence[Tuple[str, str]] = (
    ("google_sub", "VARCHAR(64)"),
    ("auth_provider", "VARCHAR(32) DEFAULT 'password'"),
)

_QUESTION_COLUMNS: Sequence[Tuple[str, str]] = (
    ("bank_id", "INTEGER"),
    ("topic_id", "INTEGER"),
    ("parent_question_id", "INTEGER"),
    ("content_hash", "VARCHAR(64)"),
    ("version", "INTEGER DEFAULT 1"),
    ("question_markdown", "TEXT"),
    ("explanation_markdown", "TEXT"),
    ("status", "VARCHAR(32) DEFAULT 'active'"),
    ("year", "INTEGER"),
    ("shift", "VARCHAR(64)"),
    ("tier", "VARCHAR(64)"),
    ("source", "VARCHAR(255)"),
    ("is_pyq", "BOOLEAN DEFAULT 0"),
    ("is_book", "BOOLEAN DEFAULT 0"),
    ("is_practice", "BOOLEAN DEFAULT 1"),
    ("is_favorite", "BOOLEAN DEFAULT 0"),
    # Knowledge Engine additive columns - permanent intelligence layer
    ("raw_text", "TEXT"),
    ("normalized_question", "TEXT"),
    ("semantic_hash", "VARCHAR(64)"),
    ("source_hash", "VARCHAR(64)"),
    ("qid", "VARCHAR(64)"),
    ("semantic_summary", "TEXT"),
    ("classification_json", "TEXT"),
    ("metadata_json", "TEXT"),
    ("confidence_score", "FLOAT DEFAULT 0.85"),
    ("needs_review", "BOOLEAN DEFAULT 0"),
    ("review_reason", "VARCHAR(255)"),
    ("search_tokens", "TEXT"),
    ("embeddings_text", "TEXT"),
    ("appearance_count", "INTEGER DEFAULT 0"),
    ("language_detected", "VARCHAR(16) DEFAULT 'en'"),
    ("question_family", "VARCHAR(128)"),
    ("pattern", "VARCHAR(128)"),
    ("bloom_taxonomy", "VARCHAR(32)"),
    ("expected_time_seconds", "INTEGER"),
    ("memory_level", "INTEGER DEFAULT 3"),
    ("logic_level", "INTEGER DEFAULT 3"),
    ("calculation_level", "INTEGER DEFAULT 2"),
    # Bilingual support (Hindi). Filled from file if present, else AI-translated
    # on demand and cached here so we never re-translate (saves tokens).
    ("question_text_hi", "TEXT"),
    ("explanation_hi", "TEXT"),
    ("paragraph_text_hi", "TEXT"),
)

_OPTION_COLUMNS: Sequence[Tuple[str, str]] = (
    ("option_text_hi", "TEXT"),
)

_EXAM_COLUMNS: Sequence[Tuple[str, str]] = (
    ("parent_exam_id", "INTEGER"),
)

# --- Cronyzo commerce / teaching additions --------------------------------
# Digital editions for books: a seller uploads a PDF, optionally offers a free
# sample, and can mark the whole title free to download.
_BOOK_COLUMNS: Sequence[Tuple[str, str]] = (
    ("pdf_url", "VARCHAR(2048)"),
    ("pdf_name", "VARCHAR(255)"),
    ("pdf_size_bytes", "INTEGER DEFAULT 0"),
    ("preview_pdf_url", "VARCHAR(2048)"),
    ("preview_pages", "INTEGER DEFAULT 0"),
    ("is_free_download", "BOOLEAN DEFAULT 0"),
    ("download_count", "INTEGER DEFAULT 0"),
)

# Lessons can carry a PDF and/or a YouTube link, and may be a live session.
_LESSON_COLUMNS: Sequence[Tuple[str, str]] = (
    ("file_url", "VARCHAR(2048)"),
    ("youtube_url", "VARCHAR(1024)"),
    ("is_live", "BOOLEAN DEFAULT 0"),
)

# Course-level teaching metadata surfaced in the catalogue.
_COURSE_COLUMNS: Sequence[Tuple[str, str]] = (
    ("level", "VARCHAR(32) DEFAULT 'beginner'"),
    ("has_live_classes", "BOOLEAN DEFAULT 0"),
    ("language", "VARCHAR(40) DEFAULT 'Hindi'"),
)


# Two-way Telegram support: which message the operator should reply to, and
# where each reply was typed.
_TICKET_COLUMNS: Sequence[Tuple[str, str]] = (
    ("telegram_message_id", "VARCHAR(64)"),
)

_REPLY_COLUMNS: Sequence[Tuple[str, str]] = (
    ("channel", "VARCHAR(16) DEFAULT 'panel'"),
)


def _existing_columns(table: str) -> set:
    try:
        bind = db.session.get_bind()
        insp = inspect(bind)
        return {c["name"] for c in insp.get_columns(table)}
    except Exception:
        logger.exception("inspect columns failed for %s", table)
        return set()


def _table_exists(table: str) -> bool:
    try:
        bind = db.session.get_bind()
        insp = inspect(bind)
        return table in insp.get_table_names()
    except Exception:
        return False


def ensure_additive_schema() -> None:
    """Create new tables via metadata and patch legacy questions table."""
    # New model tables - include knowledge engine tables
    try:
        from app.models import bank as _bank  # noqa: F401
        from app.models import knowledge as _knowledge  # noqa: F401 - Knowledge Engine tables
        db.create_all()
    except Exception:
        logger.exception("create_all during schema_upgrade failed")

    dialect = ""
    try:
        dialect = db.session.get_bind().dialect.name
    except Exception:
        dialect = "sqlite"

    def _add_columns(table: str, columns: Sequence[Tuple[str, str]]) -> None:
        if not _table_exists(table):
            return
        existing = _existing_columns(table)
        for col, col_type in columns:
            if col in existing:
                continue
            # `BOOLEAN DEFAULT 0` is SQLite-friendly but invalid in Postgres.
            # Normalise the dialect-neutral spelling before writing the DDL.
            if dialect.startswith("postgres"):
                col_type = (
                    col_type.replace("BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE")
                    .replace("BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE")
                    .replace("DATETIME", "TIMESTAMP")
                )
            ddl = f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
            try:
                db.session.execute(text(ddl))
                db.session.commit()
                logger.info("Added column %s.%s", table, col)
            except Exception:
                db.session.rollback()
                logger.warning("Could not add column %s.%s (may already exist)", table, col)

    _add_columns("users", _USER_COLUMNS)
    _add_columns("questions", _QUESTION_COLUMNS)
    _add_columns("exams", _EXAM_COLUMNS)
    _add_columns("question_options", _OPTION_COLUMNS)
    _add_columns("books", _BOOK_COLUMNS)
    _add_columns("lessons", _LESSON_COLUMNS)
    _add_columns("courses", _COURSE_COLUMNS)
    _add_columns("contact_tickets", _TICKET_COLUMNS)
    _add_columns("contact_replies", _REPLY_COLUMNS)

    # ── Postgres: widen artwork/url columns to TEXT ────────────────────────
    # SQLite ignores VARCHAR lengths, Postgres does not: an inline SVG data URI
    # (~2 KB) overflowed avatar_url VARCHAR(512) and killed the seed. TEXT has
    # no ceiling, so this can never happen again regardless of artwork size.
    if dialect.startswith("postgres"):
        for table, col in (
            ("users", "avatar_url"),
            ("books", "cover_url"),
            ("courses", "thumbnail_url"),
            ("lessons", "video_url"),
            ("order_items", "image_url"),
            ("questions", "image_url"),
            ("products", "image_url"),
            ("stores", "banner_url"),
            ("stores", "logo_url"),
            ("courses", "trailer_url"),
            ("hero_slides", "image_url"),
            ("testimonials", "avatar_url"),
            ("chat_messages", "attachment_url"),
            ("lesson_files", "file_url"),
            ("books", "pdf_url"),
            ("books", "preview_pdf_url"),
        ):
            if not (_table_exists(table) and col in _existing_columns(table)):
                continue
            try:
                db.session.execute(
                    text(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE TEXT")
                )
                db.session.commit()
            except Exception:
                db.session.rollback()
                logger.warning("could not widen %s.%s to TEXT", table, col)

    # Helpful indexes (ignore failures) - including Knowledge Engine indexes
    index_ddls = [
        "CREATE INDEX IF NOT EXISTS ix_questions_content_hash ON questions (content_hash)",
        "CREATE INDEX IF NOT EXISTS ix_questions_bank_id ON questions (bank_id)",
        "CREATE INDEX IF NOT EXISTS ix_questions_status ON questions (status)",
        "CREATE INDEX IF NOT EXISTS ix_questions_year ON questions (year)",
        "CREATE INDEX IF NOT EXISTS ix_questions_semantic_hash ON questions (semantic_hash)",
        "CREATE INDEX IF NOT EXISTS ix_questions_qid ON questions (qid)",
        "CREATE INDEX IF NOT EXISTS ix_questions_needs_review ON questions (needs_review)",
        "CREATE INDEX IF NOT EXISTS ix_questions_subject_id ON questions (subject_id)",
        "CREATE INDEX IF NOT EXISTS ix_books_free_download ON books (is_free_download)",
        "CREATE INDEX IF NOT EXISTS ix_lessons_module_id ON lessons (module_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_thread_id ON chat_messages (thread_id)",
        "CREATE INDEX IF NOT EXISTS ix_contact_tickets_status ON contact_tickets (status)",
        "CREATE INDEX IF NOT EXISTS ix_contact_tickets_tg_msg ON contact_tickets (telegram_message_id)",
        "CREATE INDEX IF NOT EXISTS ix_questions_chapter_id ON questions (chapter_id)",
        "CREATE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)",
        "CREATE INDEX IF NOT EXISTS ix_users_phone ON users (phone)",
        "CREATE INDEX IF NOT EXISTS ix_question_appearances_question_id ON question_appearances (question_id)",
        "CREATE INDEX IF NOT EXISTS ix_question_appearances_exam_name ON question_appearances (exam_name)",
        "CREATE INDEX IF NOT EXISTS ix_question_appearances_source_book ON question_appearances (source_book)",
    ]
    if dialect in ("sqlite", "postgresql"):
        for ddl in index_ddls:
            try:
                db.session.execute(text(ddl))
                db.session.commit()
            except Exception:
                db.session.rollback()
