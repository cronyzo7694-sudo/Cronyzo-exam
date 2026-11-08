"""Teaching delivery models — live classes and downloadable PDFs.

Concepts borrowed from the asoom school platform, reduced to what a
marketplace teacher actually needs:

``LiveClass``
    A scheduled session attached to a course. ``provider`` decides how the room
    is opened: ``youtube`` (an unlisted/live YouTube URL), ``zoom``/``meet``
    (an external meeting link) or ``internal`` (a Cronyzo room). The join URL is
    only handed out to enrolled students or the owning teacher.

``LessonFile``
    A PDF (notes, worksheet, past paper) attached to a lesson. Owners upload,
    everyone enrolled downloads.

``Announcement``
    A teacher-or-admin broadcast scoped to one course, or platform-wide when
    ``course_id`` is null.

Public exports (stable)::

    LiveClass, LessonFile, Announcement
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

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


LIVE_PROVIDERS = ("youtube", "zoom", "meet", "internal", "other")
LIVE_STATUSES = ("scheduled", "live", "ended", "cancelled")


class LiveClass(db.Model):
    """A scheduled live session for a course."""

    __tablename__ = "live_classes"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True
    )
    host_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(220), nullable=False)
    description = db.Column(db.Text, nullable=True)
    provider = db.Column(db.String(24), default="youtube", nullable=False)
    # Watch/join link. YouTube live URLs are normalised to a watch URL.
    join_url = db.Column(db.String(1024), nullable=True)
    # Public teaser link shown to non-enrolled visitors (optional)
    preview_url = db.Column(db.String(1024), nullable=True)

    starts_at = db.Column(db.DateTime, nullable=False, index=True)
    duration_minutes = db.Column(db.Integer, default=60, nullable=False)

    status = db.Column(db.String(24), default="scheduled", nullable=False, index=True)
    # Free sessions can be joined without an enrollment
    is_free = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    course = db.relationship("Course")
    host = db.relationship("User", foreign_keys=[host_id])

    def computed_status(self) -> str:
        """Status derived from the clock unless explicitly ended/cancelled."""
        if (self.status or "") in ("ended", "cancelled"):
            return self.status
        now = utcnow()
        if not self.starts_at:
            return "scheduled"
        ends_at = self.starts_at + timedelta(minutes=int(self.duration_minutes or 60))
        if self.starts_at <= now <= ends_at:
            return "live"
        return "scheduled"

    def to_dict(self, include_join: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "course_id": self.course_id,
            "course_title": self.course.title if self.course else None,
            "course_slug": self.course.slug if self.course else None,
            "host_id": self.host_id,
            "host_name": self.host.full_name if self.host else None,
            "title": self.title,
            "description": self.description,
            "provider": self.provider,
            "preview_url": self.preview_url,
            "starts_at": _iso(self.starts_at),
            "duration_minutes": int(self.duration_minutes or 0),
            "status": self.computed_status(),
            "is_free": bool(self.is_free),
            "is_upcoming": bool(self.starts_at and self.starts_at > utcnow()),
        }
        # The join link is the paid asset — never leak it to non-enrolled callers
        if include_join:
            data["join_url"] = self.join_url
        return data


class LessonFile(db.Model):
    """A downloadable PDF attached to a lesson (notes, worksheet, paper)."""

    __tablename__ = "lesson_files"

    id = db.Column(db.Integer, primary_key=True)
    lesson_id = db.Column(
        db.Integer, db.ForeignKey("lessons.id"), nullable=True, index=True
    )
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id"), nullable=True, index=True
    )
    uploader_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(220), nullable=False)
    file_url = db.Column(db.String(2048), nullable=False)
    file_name = db.Column(db.String(255), nullable=True)
    mime_type = db.Column(db.String(120), default="application/pdf", nullable=False)
    size_bytes = db.Column(db.Integer, default=0, nullable=False)

    is_preview = db.Column(db.Boolean, default=False, nullable=False)
    download_count = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    lesson = db.relationship("Lesson")
    course = db.relationship("Course")
    uploader = db.relationship("User", foreign_keys=[uploader_id])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "lesson_id": self.lesson_id,
            "course_id": self.course_id,
            "title": self.title,
            "file_url": self.file_url,
            "file_name": self.file_name,
            "mime_type": self.mime_type,
            "size_bytes": int(self.size_bytes or 0),
            "is_preview": bool(self.is_preview),
            "download_count": int(self.download_count or 0),
            "created_at": _iso(self.created_at),
        }


class Announcement(db.Model):
    """A course-scoped or platform-wide notice from a teacher / admin."""

    __tablename__ = "announcements"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id"), nullable=True, index=True
    )
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(220), nullable=False)
    body = db.Column(db.Text, nullable=False)
    # "info" | "important" | "live"
    level = db.Column(db.String(24), default="info", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    course = db.relationship("Course")
    author = db.relationship("User", foreign_keys=[author_id])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "course_id": self.course_id,
            "course_title": self.course.title if self.course else None,
            "author_name": self.author.full_name if self.author else "Cronyzo",
            "title": self.title,
            "body": self.body,
            "level": self.level,
            "is_active": bool(self.is_active),
            "created_at": _iso(self.created_at),
        }
