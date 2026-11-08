"""Give a brand-new guest session enough demo data to feel like a real account.

The operator's brief was specific: *continue as guest should sign you in and
generate dummy data in the database, so everything behaves exactly like a
signed-in account — except that a guest cannot actually pay.*

Why bother: a guest who lands on ``/my-courses`` and sees an empty page learns
nothing about the product. With two enrollments already in place, the whole
"learning" surface is explorable in one tap.

Design rules
------------
* **Idempotent.** Running twice adds nothing.
* **Cheap.** Two ``Enrollment`` rows, no cart, no orders, no payments.
* **Safe.** Never touches a real account (guests only), and never a course the
  guest cannot legitimately "own" in a demo — the two cheapest published courses
  are picked so the numbers look plausible.
* **Non-fatal.** Any failure is swallowed; a guest session must never fail to
  start because a demo row could not be written.

Public exports (stable)::

    seed_guest_account
"""

from __future__ import annotations

import logging
from typing import List

from app.extensions import db
from app.models.course import Course, Enrollment
from app.models.user import User

logger = logging.getLogger("cronyzo.guest_seed")

# How many courses a fresh guest gets pre-enrolled in.
DEMO_ENROLLMENTS = 2


def seed_guest_account(user: User) -> int:
    """Attach demo enrollments to ``user``. Returns the number of rows created.

    Only ever called for ``role == "guest"`` — guarded again here so a future
    caller cannot accidentally hand a real account free courses.
    """
    if user is None or (user.role or "") != "guest":
        return 0

    created = 0
    try:
        existing = {
            row.course_id
            for row in Enrollment.query.filter_by(user_id=user.id).all()
        }

        courses: List[Course] = (
            Course.query.filter(
                Course.is_active.is_(True), Course.status == "published"
            )
            .order_by(Course.price.asc(), Course.id.asc())
            .limit(DEMO_ENROLLMENTS + len(existing))
            .all()
        )

        for course in courses:
            if course.id in existing:
                continue
            if created >= DEMO_ENROLLMENTS:
                break
            db.session.add(
                Enrollment(
                    user_id=user.id,
                    course_id=course.id,
                    progress=0.0,
                    completed_lessons=0,
                    is_completed=False,
                )
            )
            created += 1

        if created:
            db.session.commit()
            logger.info("guest %s seeded with %s demo enrollments", user.id, created)
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.warning("guest demo seed skipped for user=%s", getattr(user, "id", "?"), exc_info=True)
        return 0

    return created
