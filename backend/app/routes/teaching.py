"""Teaching delivery routes — live classes, PDF libraries, announcements, uploads.

This is the teacher side of Cronyzo, distilled from the asoom school platform:

* **Live classes on YouTube** — a teacher attaches a scheduled session to a
  course, gives the YouTube link (or Zoom/Meet), and students seen only after
  enrolling get the join link.
* **PDF library** — notes, worksheets and past papers per lesson or per course.
* **Announcements** — a broadcast to a course's students, or platform-wide when
  posted by an admin.
* **Uploads** — one hardened endpoint for PDFs and images, wired to the
  pluggable storage backend so Cloudinary can be switched on with env vars.

Routes
------
POST   /api/teaching/upload                          upload a PDF or image
GET    /api/files/<path:name>                        serve a locally stored file
POST   /api/courses/<course_id>/live                  schedule a live class
GET    /api/courses/<course_id>/live                  list live classes
PUT    /api/live/<class_id>                           update a live class
DELETE /api/live/<class_id>                           cancel + remove a live class
GET    /api/live/upcoming                             sessions I can attend
POST   /api/courses/<course_id>/files                 attach a PDF to a course/lesson
GET    /api/courses/<course_id>/files                 list PDFs visible to me
DELETE /api/files/<file_id>                           remove a PDF record
POST   /api/courses/<course_id>/announcements         post an announcement
GET    /api/courses/<course_id>/announcements         read announcements
GET    /api/announcements                             platform announcements

Public exports (stable)::

    teaching_bp, files_bp
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, abort, jsonify, request, send_from_directory
from sqlalchemy import or_

from app.extensions import db
from app.models.course import Course, Enrollment, Lesson
from app.models.teaching import Announcement, LessonFile, LiveClass
from app.models.user import User
from app.services.storage import public_dir, save_upload
from app.utils.decorators import get_current_user, roles_required

teaching_bp = Blueprint("teaching", __name__)
files_bp = Blueprint("files", __name__)
logger = logging.getLogger("cronyzo.routes.teaching")

_CREATOR_ROLES = ("teacher", "seller", "admin")
_LIVE_PROVIDERS = ("youtube", "zoom", "meet", "internal", "other")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _clip(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def _is_guest(user: Optional[User]) -> bool:
    return user is not None and (user.role or "") == "guest"


def _can_publish(user: Optional[User]) -> bool:
    return user is not None and (user.role or "") in _CREATOR_ROLES


def _parse_dt(value: Any) -> Optional[datetime]:
    """Parse an ISO-8601 datetime; ``Z`` suffix is accepted."""
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _youtube_embed(url: Optional[str]) -> Optional[str]:
    """Normalise a YouTube URL to its watch form (the frontend embeds it)."""
    if not url:
        return None
    text = str(url).strip()
    if "youtu.be/" in text:
        vid = text.split("youtu.be/")[-1].split("?")[0].split("/")[0]
        return f"https://www.youtube.com/watch?v={vid}"
    return text


def _owns_course(course: Course, user: Optional[User]) -> bool:
    if user is None:
        return False
    return (user.role or "") == "admin" or int(course.teacher_id) == int(user.id)


def _is_enrolled(course_id: int, user: Optional[User]) -> bool:
    if user is None or _is_guest(user):
        return False
    return (
        Enrollment.query.filter_by(user_id=user.id, course_id=course_id).first()
        is not None
    )


# ═══════════════════════════════════════════════════════════════════════════
# Uploads
# ═══════════════════════════════════════════════════════════════════════════
@teaching_bp.post("/upload")
@roles_required("teacher", "seller", "admin")
def upload_file():
    """Multipart upload for a PDF (``?kind=pdf``) or an image (``?kind=image``).

    Guests and students are rejected — only creators and admins can add files.
    """
    kind = (request.args.get("kind") or "pdf").strip().lower()
    if kind not in ("pdf", "image"):
        return jsonify({"error": "kind must be 'pdf' or 'image'"}), 400

    file = request.files.get("file")
    info, error = save_upload(
        file, kind=kind, folder="books" if kind == "pdf" else "images"
    )
    if error:
        return jsonify({"error": error}), 400

    return jsonify({"message": "Uploaded", "file": info}), 201


@files_bp.get("/<path:name>")
def serve_file(name: str):
    """Serve a locally stored upload.

    Path traversal is impossible here: ``send_from_directory`` resolves the path
    inside the upload root and returns 404 for anything that escapes it.
    """
    root = public_dir()
    target = (root / name).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        abort(404)

    if not target.is_file():
        abort(404)

    return send_from_directory(
        str(target.parent), target.name, max_age=3600
    )


# ═══════════════════════════════════════════════════════════════════════════
# Live classes
# ═══════════════════════════════════════════════════════════════════════════
@teaching_bp.post("/courses/<int:course_id>/live")
@roles_required("teacher", "seller", "admin")
def create_live_class(course_id: int):
    course = db.session.get(Course, course_id)
    if course is None:
        return jsonify({"error": "Course not found"}), 404

    user = get_current_user()
    if not _owns_course(course, user):
        return jsonify({"error": "You can only schedule classes for your own course"}), 403

    body = _json_body()
    title = _clip(body.get("title"), 220)
    starts_at = _parse_dt(body.get("starts_at"))
    if not title:
        return jsonify({"error": "A class title is required"}), 400
    if starts_at is None:
        return jsonify({"error": "A valid starts_at (ISO-8601) is required"}), 400

    provider = (_clip(body.get("provider"), 24) or "youtube").lower()
    if provider not in _LIVE_PROVIDERS:
        provider = "other"

    try:
        duration = int(body.get("duration_minutes") or 60)
    except (TypeError, ValueError):
        duration = 60
    duration = max(5, min(duration, 600))

    live = LiveClass(
        course_id=course.id,
        host_id=user.id if user else course.teacher_id,
        title=title,
        description=_clip(body.get("description"), 3000),
        provider=provider,
        join_url=_youtube_embed(_clip(body.get("join_url"), 1024)),
        preview_url=_clip(body.get("preview_url"), 1024),
        starts_at=starts_at,
        duration_minutes=duration,
        status="scheduled",
        is_free=bool(body.get("is_free", False)),
    )
    db.session.add(live)

    # Keep the course-level flag in sync so the catalogue can show a "Live" badge
    course.has_live_classes = True
    db.session.commit()

    return jsonify(
        {"message": "Live class scheduled", "live_class": live.to_dict(include_join=True)}
    ), 201


@teaching_bp.get("/courses/<int:course_id>/live")
def list_live_classes(course_id: int):
    course = db.session.get(Course, course_id)
    if course is None:
        return jsonify({"error": "Course not found"}), 404

    user = get_current_user()
    can_join = _owns_course(course, user) or _is_enrolled(course.id, user)

    rows = (
        LiveClass.query.filter(LiveClass.course_id == course.id)
        .order_by(LiveClass.starts_at.asc())
        .all()
    )
    return jsonify(
        {
            "live_classes": [r.to_dict(include_join=can_join) for r in rows],
            "can_join": bool(can_join),
        }
    )


@teaching_bp.put("/live/<int:class_id>")
@roles_required("teacher", "seller", "admin")
def update_live_class(class_id: int):
    live = db.session.get(LiveClass, class_id)
    if live is None:
        return jsonify({"error": "Live class not found"}), 404

    user = get_current_user()
    course = db.session.get(Course, live.course_id)
    if course is None or not _owns_course(course, user):
        return jsonify({"error": "You can only edit your own classes"}), 403

    body = _json_body()
    if "title" in body:
        title = _clip(body.get("title"), 220)
        if not title:
            return jsonify({"error": "A class title is required"}), 400
        live.title = title
    if "description" in body:
        live.description = _clip(body.get("description"), 3000)
    if "join_url" in body:
        live.join_url = _youtube_embed(_clip(body.get("join_url"), 1024))
    if "preview_url" in body:
        live.preview_url = _clip(body.get("preview_url"), 1024)
    if "starts_at" in body:
        parsed = _parse_dt(body.get("starts_at"))
        if parsed is None:
            return jsonify({"error": "A valid starts_at is required"}), 400
        live.starts_at = parsed
    if "duration_minutes" in body:
        try:
            live.duration_minutes = max(5, min(int(body.get("duration_minutes")), 600))
        except (TypeError, ValueError):
            pass
    if "provider" in body:
        provider = (_clip(body.get("provider"), 24) or "other").lower()
        live.provider = provider if provider in _LIVE_PROVIDERS else "other"
    if "is_free" in body:
        live.is_free = bool(body.get("is_free"))
    if "status" in body:
        status = (_clip(body.get("status"), 24) or "scheduled").lower()
        if status in ("scheduled", "live", "ended", "cancelled"):
            live.status = status

    db.session.commit()
    return jsonify(
        {"message": "Live class updated", "live_class": live.to_dict(include_join=True)}
    )


@teaching_bp.delete("/live/<int:class_id>")
@roles_required("teacher", "seller", "admin")
def delete_live_class(class_id: int):
    live = db.session.get(LiveClass, class_id)
    if live is None:
        return jsonify({"error": "Live class not found"}), 404

    user = get_current_user()
    course = db.session.get(Course, live.course_id)
    if course is None or not _owns_course(course, user):
        return jsonify({"error": "You can only remove your own classes"}), 403

    db.session.delete(live)
    db.session.commit()

    remaining = LiveClass.query.filter_by(course_id=course.id).count()
    course.has_live_classes = remaining > 0
    db.session.commit()

    return jsonify({"message": "Live class removed"})


@teaching_bp.get("/live/upcoming")
def upcoming_live():
    """Every session the caller can attend in the next 30 days."""
    user = get_current_user()
    if user is None or _is_guest(user):
        return jsonify({"live_classes": []})

    now = _utcnow()
    horizon = now + timedelta(days=30)

    if (user.role or "") == "admin":
        scope = LiveClass.query
    elif _can_publish(user):
        owned = [c.id for c in Course.query.filter_by(teacher_id=user.id).all()]
        enrolled = [e.course_id for e in Enrollment.query.filter_by(user_id=user.id).all()]
        ids = list({*owned, *enrolled})
        if not ids:
            return jsonify({"live_classes": []})
        scope = LiveClass.query.filter(LiveClass.course_id.in_(ids))
    else:
        enrolled = [e.course_id for e in Enrollment.query.filter_by(user_id=user.id).all()]
        if not enrolled:
            return jsonify({"live_classes": []})
        scope = LiveClass.query.filter(LiveClass.course_id.in_(enrolled))

    rows = (
        scope.filter(
            LiveClass.starts_at >= now - timedelta(hours=6),
            LiveClass.starts_at <= horizon,
            LiveClass.status != "cancelled",
        )
        .order_by(LiveClass.starts_at.asc())
        .limit(50)
        .all()
    )

    return jsonify({"live_classes": [r.to_dict(include_join=True) for r in rows]})


# ═══════════════════════════════════════════════════════════════════════════
# Lesson / course PDFs
# ═══════════════════════════════════════════════════════════════════════════
@teaching_bp.post("/courses/<int:course_id>/files")
@roles_required("teacher", "seller", "admin")
def add_course_file(course_id: int):
    course = db.session.get(Course, course_id)
    if course is None:
        return jsonify({"error": "Course not found"}), 404

    user = get_current_user()
    if not _owns_course(course, user):
        return jsonify({"error": "You can only add files to your own course"}), 403

    body = _json_body()
    title = _clip(body.get("title"), 220)
    file_url = _clip(body.get("file_url"), 2048)
    if not title or not file_url:
        return jsonify({"error": "title and file_url are required"}), 400

    lesson_id = body.get("lesson_id")
    if lesson_id is not None:
        try:
            lesson_id = int(lesson_id)
        except (TypeError, ValueError):
            lesson_id = None
        if lesson_id is not None:
            lesson = db.session.get(Lesson, lesson_id)
            if lesson is None:
                return jsonify({"error": "Lesson not found"}), 404

    row = LessonFile(
        course_id=course.id,
        lesson_id=lesson_id,
        uploader_id=user.id if user else course.teacher_id,
        title=title,
        file_url=file_url,
        file_name=_clip(body.get("file_name"), 255),
        mime_type=_clip(body.get("mime_type"), 120) or "application/pdf",
        size_bytes=int(body.get("size_bytes") or 0),
        is_preview=bool(body.get("is_preview", False)),
    )
    db.session.add(row)
    db.session.commit()

    return jsonify({"message": "File added", "file": row.to_dict()}), 201


@teaching_bp.get("/courses/<int:course_id>/files")
def list_course_files(course_id: int):
    course = db.session.get(Course, course_id)
    if course is None:
        return jsonify({"error": "Course not found"}), 404

    user = get_current_user()
    is_owner = _owns_course(course, user)
    enrolled = _is_enrolled(course.id, user)

    query = LessonFile.query.filter_by(course_id=course.id)
    if not (is_owner or enrolled):
        # Outsiders see only the deliberately public previews
        query = query.filter(LessonFile.is_preview.is_(True))

    rows = query.order_by(LessonFile.created_at.asc()).all()
    return jsonify(
        {
            "files": [r.to_dict() for r in rows],
            "can_download_all": bool(is_owner or enrolled),
        }
    )


@teaching_bp.delete("/files/<int:file_id>")
@roles_required("teacher", "seller", "admin")
def delete_course_file(file_id: int):
    row = db.session.get(LessonFile, file_id)
    if row is None:
        return jsonify({"error": "File not found"}), 404

    user = get_current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if (user.role or "") != "admin" and int(row.uploader_id) != int(user.id):
        return jsonify({"error": "You can only remove your own files"}), 403

    db.session.delete(row)
    db.session.commit()
    return jsonify({"message": "File removed"})


# ═══════════════════════════════════════════════════════════════════════════
# Announcements
# ═══════════════════════════════════════════════════════════════════════════
@teaching_bp.post("/courses/<int:course_id>/announcements")
@roles_required("teacher", "seller", "admin")
def post_course_announcement(course_id: int):
    course = db.session.get(Course, course_id)
    if course is None:
        return jsonify({"error": "Course not found"}), 404

    user = get_current_user()
    if not _owns_course(course, user):
        return jsonify({"error": "You can only post to your own course"}), 403

    body = _json_body()
    title = _clip(body.get("title"), 220)
    text = _clip(body.get("body"), 4000)
    if not title or not text:
        return jsonify({"error": "title and body are required"}), 400

    level = (_clip(body.get("level"), 24) or "info").lower()
    if level not in ("info", "important", "live"):
        level = "info"

    row = Announcement(
        course_id=course.id,
        author_id=user.id if user else course.teacher_id,
        title=title,
        body=text,
        level=level,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"message": "Announcement posted", "announcement": row.to_dict()}), 201


@teaching_bp.get("/courses/<int:course_id>/announcements")
def list_course_announcements(course_id: int):
    rows = (
        Announcement.query.filter_by(course_id=course_id, is_active=True)
        .order_by(Announcement.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({"announcements": [r.to_dict() for r in rows]})


@teaching_bp.get("/announcements")
def list_platform_announcements():
    """Platform-wide notices (course_id is null)."""
    rows = (
        Announcement.query.filter(
            Announcement.course_id.is_(None), Announcement.is_active.is_(True)
        )
        .order_by(Announcement.created_at.desc())
        .limit(20)
        .all()
    )
    return jsonify({"announcements": [r.to_dict() for r in rows]})
