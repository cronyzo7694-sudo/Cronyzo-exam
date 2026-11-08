"""A question bank file the operator uploaded (PYQ papers, JSON packs, CSV).

The file itself is kept (bytes) so it can be re-imported or inspected later,
and the ids of the questions it produced are kept so an exam can be built from
exactly this file in one click — "select the file → auto test".

Table: ``question_files``.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any, List

from app.extensions import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _dump(values: List[Any]) -> str:
    try:
        return json.dumps(values, ensure_ascii=False)[:200_000]
    except (TypeError, ValueError):
        return "[]"


def _load(raw: str) -> List[Any]:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


class QuestionFile(db.Model):
    __tablename__ = "question_files"

    id = db.Column(db.String(24), primary_key=True, default=lambda: secrets.token_urlsafe(18)[:24])
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Pointer into stored_files (the raw upload, kind="question_file")
    stored_file_id = db.Column(db.String(24), nullable=True)

    filename = db.Column(db.String(220), nullable=False)
    source_type = db.Column(db.String(16), nullable=False, default="json")  # json|csv|text
    size_bytes = db.Column(db.Integer, nullable=False, default=0)

    total_rows = db.Column(db.Integer, nullable=False, default=0)
    imported_count = db.Column(db.Integer, nullable=False, default=0)
    duplicate_count = db.Column(db.Integer, nullable=False, default=0)
    error_count = db.Column(db.Integer, nullable=False, default=0)

    subjects_json = db.Column(db.Text, nullable=True)
    chapters_json = db.Column(db.Text, nullable=True)
    question_ids_json = db.Column(db.Text, nullable=True)
    errors_json = db.Column(db.Text, nullable=True)

    status = db.Column(db.String(24), nullable=False, default="imported")
    created_at = db.Column(db.DateTime, nullable=False, default=_utcnow)

    # ── helpers ────────────────────────────────────────────────────────
    @property
    def question_ids(self) -> List[int]:
        return [int(x) for x in _load(self.question_ids_json) if str(x).isdigit()]

    def set_question_ids(self, ids: List[int]) -> None:
        self.question_ids_json = _dump([int(i) for i in ids])

    @property
    def subjects(self) -> List[str]:
        return [str(x) for x in _load(self.subjects_json)]

    def set_subjects(self, names: List[str]) -> None:
        self.subjects_json = _dump(sorted({str(n) for n in names if n}))

    @property
    def chapters(self) -> List[str]:
        return [str(x) for x in _load(self.chapters_json)]

    def set_chapters(self, names: List[str]) -> None:
        self.chapters_json = _dump(sorted({str(n) for n in names if n})[:400])

    def set_errors(self, errors: List[dict]) -> None:
        self.errors_json = _dump(errors[:50])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "source_type": self.source_type,
            "size_bytes": self.size_bytes,
            "total_rows": self.total_rows,
            "imported_count": self.imported_count,
            "duplicate_count": self.duplicate_count,
            "error_count": self.error_count,
            "subjects": self.subjects,
            "chapters": self.chapters[:60],
            "chapter_count": len(self.chapters),
            "question_count": len(self.question_ids),
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<QuestionFile {self.filename} imported={self.imported_count}>"
