"""Remove every seeded demo row so the operator can add real data.

Run::

    .venv/bin/python scripts/purge_demo_data.py --yes

Goes: everything that is *inventory or activity* — courses, modules, lessons,
books, chapters, products, stores, categories, coupons, exams, questions,
subjects, chapters, carts, orders, payments, enrollments, reviews, chats,
support tickets, notifications, subscriptions.

Stays: `users` (logins keep working), `site_settings`, `hero_slides`,
`pillar_cards`, `testimonials`, `notification_templates` — the editorial layer
the admin edits, never sample inventory.

Implemented with one `TRUNCATE … CASCADE` so foreign keys can never leave a
half-deleted catalogue behind. Refuses to run without ``--yes``.
"""

from __future__ import annotations

import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

CONTENT_TABLES = [
    # money & carts
    "cart_items", "wishlist_items", "order_items", "orders", "payments",
    "subscriptions", "wallet_ledger",
    # learning
    "lesson_files", "live_classes", "course_reviews", "enrollments",
    "lessons", "course_modules", "courses",
    # books
    "book_chapters", "books",
    # shop
    "product_reviews", "products", "coupons", "stores", "categories",
    # exams
    "exam_sections", "question_appearances", "question_tags", "exam_questions",
    "question_options", "questions", "exams", "question_banks", "tags",
    "topics", "chapters", "subjects",
    # conversations
    "chat_messages", "chat_threads", "contact_replies", "contact_tickets",
    "user_messages", "notifications", "notification_deliveries",
    "notification_preferences", "phone_otps",
    # jobs
    "import_jobs", "knowledge_ingestion_jobs",
]


def main() -> int:
    if "--yes" not in sys.argv:
        print("Refusing to delete anything without --yes")
        return 1

    app = create_app()
    with app.app_context():
        existing = set(
            db.session.execute(
                text(
                    "select table_name from information_schema.tables "
                    "where table_schema='public'"
                )
            )
            .scalars()
            .all()
        )
        targets = [t for t in CONTENT_TABLES if t in existing]
        if not targets:
            print("No content tables found — nothing to do.")
            return 0

        db.session.execute(
            text("TRUNCATE " + ", ".join(f'"{t}"' for t in targets) + " CASCADE")
        )
        db.session.commit()
        print(f"truncated {len(targets)} content tables")

        print("remaining rows:")
        for table in sorted(existing):
            count = db.session.execute(
                text(f'select count(*) from "{table}"')
            ).scalar()
            if count:
                print(f"  {table:24} {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
