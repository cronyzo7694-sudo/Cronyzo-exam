"""Course routes — catalog browsing, teacher publishing, enrollment, reviews.

Stable endpoints under ``/api/courses``::

    GET    /api/courses                    public catalog (filters + paging)
    GET    /api/courses/meta/categories     distinct category list
    GET    /api/courses/meta/stats          catalog counters for the landing page
    GET    /api/courses/<slug>              course detail (modules + lessons)
    POST   /api/courses                     teacher creates a course
    PUT    /api/courses/<int:course_id>     teacher updates own course
    DELETE /api/courses/<int:course_id>     teacher deletes own course
    POST   /api/courses/<int:course_id>/modules           add module
    POST   /api/courses/<int:course_id>/modules/<int:module_id>/lessons  add lesson
    POST   /api/courses/<int:course_id>/enroll             student enrolls
    GET    /api/courses/<int:course_id>/reviews            reviews list
    POST   /api/courses/<int:course_id>/reviews            student review

Plus student-scoped endpoints under ``/api/my/courses``::

    GET    /api/my/courses                 enrolled courses + progress
    PUT    /api/my/courses/<int:course_id>/progress   update lesson progress
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Final, List, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.course import (
    Course,
    CourseModule,
    CourseReview,
    Enrollment,
    Lesson,
    utcnow,
)
from app.models.user import User
from app.services.media import course_artwork
from app.utils.decorators import get_current_user, roles_required
from app.utils.slugify import unique_slug
from app.utils.validators import parse_pagination

courses_bp = Blueprint("courses", __name__)
logger = logging.getLogger("cronyzo.routes.courses")

_MAX_TITLE: Final[int] = 220
_MAX_SHORT: Final[int] = 255
_MAX_DESC: Final[int] = 20000
_MAX_CATEGORY: Final[int] = 120
_MAX_URL: Final[int] = 512
_MAX_SEARCH: Final[int] = 120

_VALID_LEVELS = ("beginner", "intermediate", "advanced")
_VALID_MODES = ("self_paced", "live", "mentored")
_VALID_CONTENT_TYPES = ("video", "article", "quiz", "live", "download")


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clean(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


# ---------------------------------------------------------------------------
# Public catalog
# ---------------------------------------------------------------------------
@courses_bp.get("")
def list_courses():
    """Public course catalog — no auth required (browsing is open)."""
    page, per_page = parse_pagination(request.args)
    q = Course.query.filter(
        Course.status == "published",
        Course.is_active.is_(True),
    )

    # "mine=true" → the signed-in teacher's own catalogue (Seller Studio).
    # Drafts are included so a teacher can see work in progress, but
    # soft-deleted courses stay hidden.
    if (request.args.get("mine") or "").lower() in ("1", "true", "yes"):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        q = Course.query.filter(
            Course.teacher_id == user.id,
            Course.is_active.is_(True),
        )

    search = (request.args.get("search") or "").strip()[:_MAX_SEARCH]
    if search:
        like = f"%{_escape_like(search)}%"
        q = q.filter(
            db.or_(Course.title.ilike(like, escape="\\"), Course.subtitle.ilike(like, escape="\\"))
        )

    category = (request.args.get("category") or "").strip()[:_MAX_CATEGORY]
    if category and category.lower() != "all":
        q = q.filter(Course.category == category)

    level = (request.args.get("level") or "").strip().lower()[:_MAX_SHORT]
    if level and level != "all":
        q = q.filter(Course.level == level)

    language = (request.args.get("language") or "").strip()[:_MAX_SHORT]
    if language and language.lower() != "all":
        q = q.filter(Course.language == language)

    if request.args.get("featured", "").lower() == "true":
        q = q.filter(Course.is_featured.is_(True))

    max_price = request.args.get("max_price")
    if max_price not in (None, ""):
        cap = _safe_float(max_price, -1.0)
        if cap >= 0:
            q = q.filter(Course.price <= cap)

    min_price = request.args.get("min_price")
    if min_price not in (None, ""):
        floor = _safe_float(min_price, -1.0)
        if floor >= 0:
            q = q.filter(Course.price >= floor)

    teacher_id = request.args.get("teacher_id")
    if teacher_id:
        tid = _safe_int(teacher_id, 0)
        if tid > 0:
            q = q.filter(Course.teacher_id == tid)

    sort = (request.args.get("sort") or "popular").strip().lower()
    if sort == "price_low":
        q = q.order_by(Course.price.asc())
    elif sort == "price_high":
        q = q.order_by(Course.price.desc())
    elif sort == "rating":
        q = q.order_by(Course.rating_avg.desc(), Course.rating_count.desc())
    elif sort == "newest":
        q = q.order_by(Course.created_at.desc())
    else:  # popular
        q = q.order_by(Course.student_count.desc(), Course.rating_avg.desc())

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify(
        {
            "items": [c.to_dict() for c in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page else 1,
        }
    )


@courses_bp.get("/meta/categories")
def course_categories():
    """Distinct category names currently in the catalog."""
    rows = (
        db.session.query(Course.category)
        .filter(Course.status == "published", Course.is_active.is_(True))
        .distinct()
        .order_by(Course.category)
        .all()
    )
    categories = [r[0] for r in rows if r and r[0]]
    return jsonify({"items": categories, "total": len(categories)})


@courses_bp.get("/meta/stats")
def course_stats():
    """Headline counters used by the landing page hero."""
    try:
        courses = Course.query.filter(
            Course.status == "published", Course.is_active.is_(True)
        ).count()
        students = db.session.query(db.func.coalesce(db.func.sum(Course.student_count), 0)).scalar() or 0
        lessons = db.session.query(db.func.coalesce(db.func.sum(Course.lesson_count), 0)).scalar() or 0
    except Exception:  # noqa: BLE001
        logger.exception("course_stats failed")
        courses = students = lessons = 0
    return jsonify({"courses": int(courses), "students": int(students), "lessons": int(lessons)})


@courses_bp.get("/<slug>")
def get_course(slug):
    """Course detail. Preview lessons are visible; paid content needs enrollment."""
    course = Course.query.filter_by(slug=slug).first()
    if course is None:
        return jsonify({"error": "Course not found"}), 404
    if course.status != "published" and not course.is_active:
        return jsonify({"error": "Course not found"}), 404

    data = course.to_dict(include_modules=True)

    # Mark which lessons the viewer may open
    enrolled = False
    viewer_id = None
    try:
        from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity is not None:
            viewer_id = int(identity)
            enrollment = Enrollment.query.filter_by(
                user_id=viewer_id, course_id=course.id
            ).first()
            enrolled = enrollment is not None
    except Exception:  # noqa: BLE001 — anonymous browsing is fine
        viewer_id = None

    has_preview = any(
        lesson.is_preview for module in course.modules for lesson in module.lessons
    )

    for module in data.get("modules", []):
        for lesson in module.get("lessons", []):
            locked = bool(lesson.get("is_locked"))
            if locked and not (enrolled or lesson.get("is_preview")):
                lesson["video_url"] = None
                lesson["content"] = None
            lesson["accessible"] = bool(enrolled or lesson.get("is_preview") or not locked)

    data["enrolled"] = enrolled
    data["viewer_id"] = viewer_id
    data["has_free_preview"] = has_preview

    # Reviews (public)
    try:
        reviews = (
            CourseReview.query.filter_by(course_id=course.id)
            .order_by(CourseReview.created_at.desc())
            .limit(20)
            .all()
        )
        data["reviews"] = [r.to_dict() for r in reviews]
    except Exception:  # noqa: BLE001
        data["reviews"] = []

    return jsonify(data)


# ---------------------------------------------------------------------------
# Teacher publishing
# ---------------------------------------------------------------------------
def _can_publish(user: Optional[User]) -> bool:
    """Teachers and sellers may publish; admins may publish anything."""
    if user is None:
        return False
    return user.role in ("teacher", "seller", "admin")


@courses_bp.post("")
@roles_required("teacher", "seller", "admin")
def create_course():
    """Create a course owned by the calling teacher."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    data = _json_body()
    title = _clean(data.get("title"), _MAX_TITLE)
    if not title:
        return jsonify({"error": "title is required"}), 400

    level = (str(data.get("level") or "beginner").strip().lower())[:32]
    if level not in _VALID_LEVELS:
        level = "beginner"

    mode = (str(data.get("delivery_mode") or "self_paced").strip().lower())[:32]
    if mode not in _VALID_MODES:
        mode = "self_paced"

    price = max(0.0, _safe_float(data.get("price"), 0.0))
    mrp = max(0.0, _safe_float(data.get("mrp"), price))

    course_slug = unique_slug(Course, title)
    thumbnail_url = _clean(data.get("thumbnail_url"), _MAX_URL)
    if not thumbnail_url:
        # No upload yet — deterministic placeholder so the card is never blank.
        thumbnail_url = course_artwork(title, seed=course_slug, glyph="course")

    course = Course(
        teacher_id=user.id,
        title=title,
        slug=course_slug,
        subtitle=_clean(data.get("subtitle"), _MAX_SHORT),
        description=_clean(data.get("description"), _MAX_DESC),
        category=(_clean(data.get("category"), _MAX_CATEGORY) or "General"),
        level=level,
        language=(_clean(data.get("language"), 40) or "Hindi"),
        thumbnail_url=thumbnail_url,
        trailer_url=_clean(data.get("trailer_url"), _MAX_URL),
        price=price,
        mrp=mrp,
        delivery_mode=mode,
        duration_hours=max(0.0, _safe_float(data.get("duration_hours"), 0.0)),
        is_featured=bool(data.get("is_featured", False)) and user.role == "admin",
        status="published",
    )
    db.session.add(course)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_course failed")
        return jsonify({"error": "Could not create course"}), 500

    return jsonify({"message": "Course created", "item": course.to_dict()}), 201


@courses_bp.put("/<int:course_id>")
@roles_required("teacher", "seller", "admin")
def update_course(course_id):
    """Update a course — only the owning teacher or an admin may edit."""
    course = Course.query.get_or_404(course_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if course.teacher_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own courses"}), 403

    data = _json_body()
    if "title" in data:
        title = _clean(data.get("title"), _MAX_TITLE)
        if title:
            course.title = title
    for field, limit in (
        ("subtitle", _MAX_SHORT),
        ("description", _MAX_DESC),
        ("category", _MAX_CATEGORY),
        ("language", 40),
        ("thumbnail_url", _MAX_URL),
        ("trailer_url", _MAX_URL),
    ):
        if field in data:
            setattr(course, field, _clean(data.get(field), limit))
    if "level" in data:
        level = str(data.get("level") or "").strip().lower()[:32]
        if level in _VALID_LEVELS:
            course.level = level
    if "delivery_mode" in data:
        mode = str(data.get("delivery_mode") or "").strip().lower()[:32]
        if mode in _VALID_MODES:
            course.delivery_mode = mode
    if "price" in data:
        course.price = max(0.0, _safe_float(data.get("price"), course.price))
    if "mrp" in data:
        course.mrp = max(0.0, _safe_float(data.get("mrp"), course.mrp))
    if "duration_hours" in data:
        course.duration_hours = max(0.0, _safe_float(data.get("duration_hours"), course.duration_hours))
    if "is_active" in data:
        course.is_active = bool(data.get("is_active"))
    if "status" in data and user.role == "admin":
        status = str(data.get("status") or "").strip().lower()[:32]
        if status in ("draft", "published", "rejected", "pending"):
            course.status = status
    if "is_featured" in data and user.role == "admin":
        course.is_featured = bool(data.get("is_featured"))

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_course id=%s failed", course_id)
        return jsonify({"error": "Could not update course"}), 500

    return jsonify({"message": "Course updated", "item": course.to_dict()})


@courses_bp.delete("/<int:course_id>")
@roles_required("teacher", "seller", "admin")
def delete_course(course_id):
    """Delete a course owned by the caller."""
    course = Course.query.get_or_404(course_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if course.teacher_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only delete your own courses"}), 403

    db.session.delete(course)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("delete_course id=%s failed", course_id)
        return jsonify({"error": "Could not delete course"}), 500
    return jsonify({"message": "Course deleted"})


@courses_bp.post("/<int:course_id>/modules")
@roles_required("teacher", "seller", "admin")
def create_module(course_id):
    """Add a module (lesson bucket) to a course."""
    course = Course.query.get_or_404(course_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if course.teacher_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own courses"}), 403

    data = _json_body()
    title = _clean(data.get("title"), _MAX_TITLE)
    if not title:
        return jsonify({"error": "title is required"}), 400

    last = (
        CourseModule.query.filter_by(course_id=course.id)
        .order_by(CourseModule.sort_order.desc())
        .first()
    )
    next_order = (last.sort_order + 1) if last else 1

    module = CourseModule(
        course_id=course.id,
        title=title,
        description=_clean(data.get("description"), _MAX_DESC),
        sort_order=next_order,
    )
    db.session.add(module)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_module failed course=%s", course_id)
        return jsonify({"error": "Could not create module"}), 500

    return jsonify({"message": "Module created", "item": module.to_dict()}), 201


@courses_bp.post("/<int:course_id>/modules/<int:module_id>/lessons")
@roles_required("teacher", "seller", "admin")
def create_lesson(course_id, module_id):
    """Add a lesson inside a course module."""
    course = Course.query.get_or_404(course_id)
    module = CourseModule.query.filter_by(id=module_id, course_id=course.id).first()
    if module is None:
        return jsonify({"error": "Module not found in this course"}), 404

    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if course.teacher_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only edit your own courses"}), 403

    data = _json_body()
    title = _clean(data.get("title"), _MAX_TITLE)
    if not title:
        return jsonify({"error": "title is required"}), 400

    content_type = (str(data.get("content_type") or "video").strip().lower())[:32]
    if content_type not in _VALID_CONTENT_TYPES:
        content_type = "video"

    last = (
        Lesson.query.filter_by(module_id=module.id)
        .order_by(Lesson.sort_order.desc())
        .first()
    )
    next_order = (last.sort_order + 1) if last else 1

    lesson = Lesson(
        module_id=module.id,
        title=title,
        content_type=content_type,
        video_url=_clean(data.get("video_url"), _MAX_URL),
        content=_clean(data.get("content"), _MAX_DESC),
        duration_minutes=max(0, _safe_int(data.get("duration_minutes"), 0)),
        is_preview=bool(data.get("is_preview", False)),
        is_locked=bool(data.get("is_locked", False)),
        sort_order=next_order,
    )
    db.session.add(lesson)
    try:
        db.session.flush()
        # Keep the denormalised lesson_count on the course in sync
        total_lessons = Lesson.query.filter(
            Lesson.module_id.in_(
                db.session.query(CourseModule.id).filter(CourseModule.course_id == course.id)
            )
        ).count()
        course.lesson_count = total_lessons
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_lesson failed course=%s module=%s", course_id, module_id)
        return jsonify({"error": "Could not create lesson"}), 500

    return jsonify({"message": "Lesson created", "item": lesson.to_dict()}), 201


# ---------------------------------------------------------------------------
# Enrollment
# ---------------------------------------------------------------------------
@courses_bp.post("/<int:course_id>/enroll")
@jwt_required()
def enroll_course(course_id):
    """
    Enroll the caller in a course.

    Free courses enroll instantly. Paid courses require a paid order that
    already contains this course — the checkout route creates the enrollment.
    """
    course = Course.query.get_or_404(course_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    existing = Enrollment.query.filter_by(user_id=user.id, course_id=course.id).first()
    if existing:
        return jsonify({"message": "Already enrolled", "item": existing.to_dict()}), 200

    if course.price > 0:
        from app.models.order import Order, OrderItem

        paid = (
            Order.query.join(OrderItem)
            .filter(
                Order.user_id == user.id,
                Order.payment_status == "paid",
                OrderItem.item_type == "course",
                OrderItem.item_id == course.id,
            )
            .first()
        )
        if paid is None:
            return jsonify({"error": "Purchase this course to enroll"}), 402

    enrollment = Enrollment(user_id=user.id, course_id=course.id)
    db.session.add(enrollment)
    course.student_count = int(course.student_count or 0) + 1
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("enroll_course failed course=%s user=%s", course_id, user.id)
        return jsonify({"error": "Could not enroll"}), 500

    return jsonify({"message": "Enrolled successfully", "item": enrollment.to_dict()}), 201


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
@courses_bp.get("/<int:course_id>/reviews")
def list_course_reviews(course_id):
    course = Course.query.get_or_404(course_id)
    reviews = (
        CourseReview.query.filter_by(course_id=course.id)
        .order_by(CourseReview.created_at.desc())
        .all()
    )
    return jsonify({"items": [r.to_dict() for r in reviews], "total": len(reviews)})


@courses_bp.post("/<int:course_id>/reviews")
@jwt_required()
def create_course_review(course_id):
    """Review a course you are enrolled in (one review per student)."""
    course = Course.query.get_or_404(course_id)
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    enrollment = Enrollment.query.filter_by(user_id=user.id, course_id=course.id).first()
    if enrollment is None:
        return jsonify({"error": "Enroll in the course before reviewing it"}), 403

    data = _json_body()
    rating = _safe_int(data.get("rating"), 5)
    rating = max(1, min(5, rating))

    review = CourseReview.query.filter_by(user_id=user.id, course_id=course.id).first()
    if review is None:
        review = CourseReview(user_id=user.id, course_id=course.id)
        db.session.add(review)

    review.rating = rating
    review.title = _clean(data.get("title"), 200)
    review.body = _clean(data.get("body"), 4000)
    review.is_verified = True

    # Recompute the course rating aggregate
    try:
        db.session.flush()
        agg = (
            db.session.query(
                db.func.avg(CourseReview.rating), db.func.count(CourseReview.id)
            )
            .filter(CourseReview.course_id == course.id)
            .one()
        )
        course.rating_avg = round(float(agg[0] or 0.0), 2)
        course.rating_count = int(agg[1] or 0)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("create_course_review failed course=%s", course_id)
        return jsonify({"error": "Could not save review"}), 500

    return jsonify({"message": "Review saved", "item": review.to_dict()}), 201


# ---------------------------------------------------------------------------
# Student scope — mounted at /api/my
# ---------------------------------------------------------------------------
my_courses_bp = Blueprint("my_courses", __name__)


@my_courses_bp.get("/courses")
@jwt_required()
def my_courses():
    """Courses the caller is enrolled in, with progress info."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    rows = (
        Enrollment.query.filter_by(user_id=user.id)
        .order_by(Enrollment.last_accessed_at.desc())
        .all()
    )
    items = []
    for row in rows:
        data = row.to_dict()
        course = row.course
        if course is not None:
            data["course"]["thumbnail_url"] = course.thumbnail_url
            data["course"]["teacher_name"] = (
                course.teacher.full_name if course.teacher else None
            )
        items.append(data)
    return jsonify({"items": items, "total": len(items)})


@my_courses_bp.put("/courses/<int:course_id>/progress")
@jwt_required()
def update_progress(course_id):
    """Record lesson progress and recompute the course completion percentage."""
    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401

    enrollment = Enrollment.query.filter_by(user_id=user.id, course_id=course_id).first()
    if enrollment is None:
        return jsonify({"error": "You are not enrolled in this course"}), 404

    data = _json_body()
    lesson_id = data.get("lesson_id")
    completed = data.get("completed")

    try:
        total_lessons = (
            db.session.query(db.func.count(Lesson.id))
            .join(CourseModule, Lesson.module_id == CourseModule.id)
            .filter(CourseModule.course_id == course_id)
            .scalar()
            or 0
        )
    except Exception:  # noqa: BLE001
        logger.exception("update_progress count failed course=%s", course_id)
        total_lessons = enrollment.course.lesson_count if enrollment.course else 0

    if lesson_id is not None and completed:
        lid = _safe_int(lesson_id, 0)
        if lid > 0:
            already = enrollment.completed_lessons or 0
            enrollment.completed_lessons = min(total_lessons, already + 1)
            enrollment.last_lesson_id = lid

    if total_lessons > 0:
        enrollment.progress = round(
            min(100.0, (enrollment.completed_lessons / total_lessons) * 100), 2
        )
    else:
        enrollment.progress = 0.0

    enrollment.last_accessed_at = utcnow()
    if enrollment.progress >= 100.0:
        enrollment.is_completed = True

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("update_progress failed course=%s", course_id)
        return jsonify({"error": "Could not update progress"}), 500

    return jsonify({"message": "Progress updated", "item": enrollment.to_dict()})
