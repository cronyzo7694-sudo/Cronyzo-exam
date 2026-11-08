"""Learning models — courses, modules, lessons, enrollments, reviews.

This module implements the "Learn" vertical of Cronyzo: teachers publish
:class:`Course` objects made of :class:`CourseModule` buckets and
:class:`Lesson` items; students enroll via :class:`Enrollment` and track
their progress against it.

Design notes
------------
* ``Enrollment`` carries a unique constraint on ``(user_id, course_id)`` so a
  student can never double-enroll; the API returns the existing row instead.
* Lesson progress is stored as a counter on the enrollment (``completed_lessons``)
  which keeps the "resume where you left off" lookup a single indexed read.
* Reviews are stored separately from :class:`~app.models.store.ProductReview`
  so catalog and learning domains can evolve independently.

Public exports (stable)::

    Course, CourseModule, Lesson, Enrollment, CourseReview
"""

from __future__ import annotations

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


def _money(value: Any) -> float:
    try:
        return round(float(value or 0.0), 2)
    except (TypeError, ValueError):
        return 0.0


class Course(db.Model):
    """A sellable course published by a teacher."""

    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(220), nullable=False)
    slug = db.Column(db.String(240), unique=True, nullable=False, index=True)
    subtitle = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(120), default="General", nullable=False, index=True)
    # "beginner" | "intermediate" | "advanced"
    level = db.Column(db.String(32), default="beginner", nullable=False)
    language = db.Column(db.String(40), default="Hindi", nullable=False)

    thumbnail_url = db.Column(db.Text, nullable=True)
    trailer_url = db.Column(db.Text, nullable=True)
    # "draft" | "pending" | "published" | "rejected"
    status = db.Column(db.String(32), default="published", nullable=False, index=True)

    price = db.Column(db.Float, default=0.0, nullable=False)
    mrp = db.Column(db.Float, default=0.0, nullable=False)
    # "self_paced" | "live" | "mentored"
    delivery_mode = db.Column(db.String(32), default="self_paced", nullable=False)

    duration_hours = db.Column(db.Float, default=0.0, nullable=False)
    lesson_count = db.Column(db.Integer, default=0, nullable=False)
    student_count = db.Column(db.Integer, default=0, nullable=False)
    rating_avg = db.Column(db.Float, default=0.0, nullable=False)
    rating_count = db.Column(db.Integer, default=0, nullable=False)

    is_featured = db.Column(db.Boolean, default=False, nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    teacher = db.relationship("User", foreign_keys=[teacher_id])
    modules = db.relationship(
        "CourseModule",
        back_populates="course",
        lazy="selectin",
        order_by="CourseModule.sort_order",
        cascade="all, delete-orphan",
    )
    enrollments = db.relationship("Enrollment", back_populates="course", lazy="dynamic")

    @property
    def discount_percent(self) -> int:
        mrp = _money(self.mrp)
        price = _money(self.price)
        if mrp <= 0 or price >= mrp:
            return 0
        return int(round((mrp - price) / mrp * 100))

    @property
    def is_free(self) -> bool:
        return _money(self.price) <= 0

    def to_dict(self, include_modules: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "subtitle": self.subtitle,
            "description": self.description,
            "category": self.category,
            "level": self.level,
            "language": self.language,
            "thumbnail_url": self.thumbnail_url,
            "trailer_url": self.trailer_url,
            "status": self.status,
            "price": _money(self.price),
            "mrp": _money(self.mrp),
            "discount_percent": self.discount_percent,
            "is_free": self.is_free,
            "delivery_mode": self.delivery_mode,
            "duration_hours": _money(self.duration_hours),
            "lesson_count": self.lesson_count,
            "student_count": self.student_count,
            "rating_avg": _money(self.rating_avg),
            "rating_count": self.rating_count,
            "is_featured": bool(self.is_featured),
            "created_at": _iso(self.created_at),
            "teacher": {
                "id": self.teacher_id,
                "full_name": self.teacher.full_name if self.teacher else None,
                "avatar_url": self.teacher.avatar_url if self.teacher else None,
                "bio": getattr(self.teacher, "bio", None) if self.teacher else None,
            },
        }
        if include_modules:
            data["modules"] = [m.to_dict(include_lessons=True) for m in self.modules]
        return data


class CourseModule(db.Model):
    """A grouping of lessons inside a course (e.g. "Module 3 — APIs")."""

    __tablename__ = "course_modules"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    title = db.Column(db.String(220), nullable=False)
    description = db.Column(db.Text, nullable=True)
    sort_order = db.Column(db.Integer, default=0, nullable=False)

    course = db.relationship("Course", back_populates="modules")
    lessons = db.relationship(
        "Lesson",
        back_populates="module",
        lazy="selectin",
        order_by="Lesson.sort_order",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_lessons: bool = True) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "course_id": self.course_id,
            "title": self.title,
            "description": self.description,
            "sort_order": self.sort_order,
            "lesson_count": len(self.lessons),
        }
        if include_lessons:
            data["lessons"] = [l.to_dict() for l in self.lessons]
        return data


class Lesson(db.Model):
    """A single teachable item inside a course module."""

    __tablename__ = "lessons"

    id = db.Column(db.Integer, primary_key=True)
    module_id = db.Column(db.Integer, db.ForeignKey("course_modules.id"), nullable=False, index=True)
    title = db.Column(db.String(220), nullable=False)
    # "video" | "article" | "quiz" | "live" | "download"
    content_type = db.Column(db.String(32), default="video", nullable=False)
    video_url = db.Column(db.Text, nullable=True)
    content = db.Column(db.Text, nullable=True)
    duration_minutes = db.Column(db.Integer, default=0, nullable=False)
    is_preview = db.Column(db.Boolean, default=False, nullable=False)
    is_locked = db.Column(db.Boolean, default=False, nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    module = db.relationship("CourseModule", back_populates="lessons")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "module_id": self.module_id,
            "title": self.title,
            "content_type": self.content_type,
            "video_url": self.video_url,
            "content": self.content,
            "duration_minutes": int(self.duration_minutes or 0),
            "is_preview": bool(self.is_preview),
            "is_locked": bool(self.is_locked),
            "sort_order": self.sort_order,
        }


class Enrollment(db.Model):
    """Links a student to a purchased / enrolled course."""

    __tablename__ = "enrollments"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)

    progress = db.Column(db.Float, default=0.0, nullable=False)  # 0..100
    completed_lessons = db.Column(db.Integer, default=0, nullable=False)
    last_lesson_id = db.Column(db.Integer, db.ForeignKey("lessons.id"), nullable=True)
    is_completed = db.Column(db.Boolean, default=False, nullable=False)
    rating = db.Column(db.Integer, nullable=True)
    review_text = db.Column(db.Text, nullable=True)

    enrolled_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    last_accessed_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])
    course = db.relationship("Course", back_populates="enrollments")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "course_id": self.course_id,
            "progress": _money(self.progress),
            "completed_lessons": int(self.completed_lessons or 0),
            "last_lesson_id": self.last_lesson_id,
            "is_completed": bool(self.is_completed),
            "rating": self.rating,
            "review_text": self.review_text,
            "enrolled_at": _iso(self.enrolled_at),
            "last_accessed_at": _iso(self.last_accessed_at),
            "completed_at": _iso(self.completed_at),
            "course": self.course.to_dict() if self.course else None,
        }


class CourseReview(db.Model):
    """A student review for a course."""

    __tablename__ = "course_reviews"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_course_review_user_course"),)

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    rating = db.Column(db.Integer, default=5, nullable=False)
    title = db.Column(db.String(200), nullable=True)
    body = db.Column(db.Text, nullable=True)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    course = db.relationship("Course", foreign_keys=[course_id])
    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "course_id": self.course_id,
            "rating": int(self.rating or 0),
            "title": self.title,
            "body": self.body,
            "is_verified": bool(self.is_verified),
            "user": {
                "id": self.user_id,
                "full_name": self.user.full_name if self.user else "Learner",
                "avatar_url": self.user.avatar_url if self.user else None,
            },
            "created_at": _iso(self.created_at),
        }


__all__ = [
    "Course",
    "CourseModule",
    "Lesson",
    "Enrollment",
    "CourseReview",
    "utcnow",
    "_iso",
    "_money",
]
