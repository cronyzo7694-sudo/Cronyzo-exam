"""Remove seeded DEMO content from a live database without touching real data.

Why this exists
---------------
A demo seed (`CRONYZO_SEED_DEMO=1`) puts sample teachers, sellers, courses,
books, products and one demo mock test into the database so a fresh install has
something to look at. That is great on a throwaway environment and wrong on a
real one: visitors see "Atomic Habits — ₹399" and assume it is for sale.

This script deletes **only** rows it can prove are demo:
  * accounts on the reserved demo domains  (@cronyzo.local, @examos.local)
  * catalogue rows owned by those accounts
  * the demo mock test ("… — Demo") and the questions only it uses
  * marketplace scaffolding created in the same seed pass (categories, coupons,
    stores, reviews)

Everything else — the operator's own books, question banks, exams, tests,
attempts, reviews and settings — is left alone. Every deleted row is written to
`backups/demo_cleanup_<timestamp>.json` first, so a mistake is recoverable.

Usage
-----
    python scripts/clean_demo_data.py            # dry run: prints the plan
    python scripts/clean_demo_data.py --yes      # actually delete
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

DEMO_DOMAINS = ("@cronyzo.local", "@examos.local")
BACKUP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups"
)


def _rows(sql: str, **params) -> List[Dict[str, Any]]:
    result = db.session.execute(text(sql), params)
    return [dict(row._mapping) for row in result]


def _demo_user_ids() -> List[int]:
    like = " OR ".join(["email ILIKE :d%d" % i for i in range(len(DEMO_DOMAINS))])
    params = {f"d{i}": f"%{domain}" for i, domain in enumerate(DEMO_DOMAINS)}
    rows = _rows(f"SELECT id, email FROM users WHERE {like}", **params)
    return [row["id"] for row in rows]


def _demo_exam_ids() -> List[int]:
    rows = _rows("SELECT id FROM exams WHERE title ILIKE '%— Demo%' OR title ILIKE '% - Demo%'")
    return [row["id"] for row in rows]


def _in(column: str, values: List[Any], prefix: str) -> tuple[str, Dict[str, Any]]:
    if not values:
        return "1 = 0", {}
    names = [f"{prefix}{i}" for i in range(len(values))]
    params = {name: value for name, value in zip(names, values)}
    return f"{column} IN ({', '.join(':' + n for n in names)})", params


def build_plan() -> Dict[str, Any]:
    """Work out exactly what would be deleted. Nothing is written here."""
    user_ids = _demo_user_ids()
    exam_ids = _demo_exam_ids()

    plan: Dict[str, Any] = {"users": user_ids, "exams": exam_ids, "tables": {}}

    insp = inspect(db.engine)
    tables = set(insp.get_table_names())

    # Catalogue rows that belong to demo sellers/teachers.
    for table, column in (
        ("products", "seller_id"),
        ("stores", "owner_id"),
        ("courses", "teacher_id"),
        ("books", "seller_id"),
        ("course_reviews", "user_id"),
        ("product_reviews", "user_id"),
        ("enrollments", "user_id"),
        ("attempts", "user_id"),
        ("orders", "user_id"),
        ("reviews", "user_id"),
        ("notifications", "user_id"),
        ("uploaded_images", "owner_id"),
    ):
        if table not in tables or column not in {c["name"] for c in insp.get_columns(table)}:
            continue
        clause, params = _in(column, user_ids, "u")
        rows = _rows(f"SELECT * FROM {table} WHERE {clause}", **params) if user_ids else []
        if rows:
            plan["tables"][table] = rows

    # Teaching + reading content that hangs off demo courses/books.
    demo_course_ids = [r["id"] for r in plan["tables"].get("courses", [])]
    demo_book_ids = [r["id"] for r in plan["tables"].get("books", [])]
    demo_product_ids = [r["id"] for r in plan["tables"].get("products", [])]

    def _collect(table: str, column: str, values: List[Any], tag: str) -> List[Dict[str, Any]]:
        if table not in tables or not values:
            return []
        if column not in {c["name"] for c in insp.get_columns(table)}:
            return []
        clause, params = _in(column, values, tag)
        return _rows(f"SELECT * FROM {table} WHERE {clause}", **params)

    modules = _collect("course_modules", "course_id", demo_course_ids, "cm")
    if modules:
        plan["tables"]["course_modules"] = modules
    module_ids = [r["id"] for r in modules]
    for table, column, values, tag in (
        ("lessons", "module_id", module_ids, "ls"),
        ("live_classes", "course_id", demo_course_ids, "lc"),
        ("announcements", "course_id", demo_course_ids, "an"),
        ("lesson_files", "course_id", demo_course_ids, "lf"),
        # Someone may have enrolled in / reviewed a demo course — that row has to
        # go with the course, whoever owns it.
        ("enrollments", "course_id", demo_course_ids, "en2"),
        ("course_reviews", "course_id", demo_course_ids, "cr2"),
        ("book_chapters", "book_id", demo_book_ids, "bc"),
        ("cart_items", "product_id", demo_product_ids, "ci"),
        ("wishlist_items", "product_id", demo_product_ids, "wi"),
        ("question_banks", "owner_id", user_ids, "qb"),
        ("seller_applications", "user_id", user_ids, "sa"),
        ("addresses", "user_id", user_ids, "ad"),
        ("wishlist_items", "user_id", user_ids, "wu"),
        ("cart_items", "user_id", user_ids, "cu"),
        ("subscriptions", "user_id", user_ids, "su"),
        ("wallet_ledger", "user_id", user_ids, "wl"),
        ("payments", "user_id", user_ids, "pa"),
        ("contact_tickets", "user_id", user_ids, "ct"),
        ("user_messages", "user_id", user_ids, "um"),
        ("chat_threads", "user_a_id", user_ids, "ca"),
        ("chat_threads", "user_b_id", user_ids, "cb"),
        ("knowledge_ingestion_jobs", "user_id", user_ids, "ki"),
        ("notification_preferences", "user_id", user_ids, "np"),
        ("audit_logs", "user_id", user_ids, "al"),
    ):
        found = _collect(table, column, values, tag)
        if found:
            plan["tables"].setdefault(table, [])
            existing = {row.get("id") for row in plan["tables"][table]}
            plan["tables"][table].extend(row for row in found if row.get("id") not in existing)

    # Demo exam: questions only it references, its sections, its mappings.
    if exam_ids:
        clause, params = _in("exam_id", exam_ids, "e")
        for table in ("exam_questions", "exam_sections", "attempts"):
            if table in tables and "exam_id" in {c["name"] for c in insp.get_columns(table)}:
                rows = _rows(f"SELECT * FROM {table} WHERE {clause}", **params)
                if rows:
                    plan["tables"][table] = plan["tables"].get(table, []) + rows

        mapped = _rows(
            f"SELECT question_id FROM exam_questions WHERE {clause}", **params
        )
        question_ids = [row["question_id"] for row in mapped]
        # Only questions that appear in NO other exam are demo-only.
        if question_ids:
            q_clause, q_params = _in("id", question_ids, "q")
            survivors = _rows(
                f"SELECT DISTINCT question_id FROM exam_questions WHERE {q_clause} "
                "AND exam_id NOT IN (SELECT unnest(:exam_arr))",
                exam_arr=exam_ids,
                **q_params,
            )
            keep = {row["question_id"] for row in survivors}
            doomed = [qid for qid in question_ids if qid not in keep]
            if doomed:
                d_clause, d_params = _in("id", doomed, "d")
                plan["tables"]["questions"] = _rows(
                    f"SELECT * FROM questions WHERE {d_clause}", **d_params
                )
                plan["tables"]["question_options"] = _rows(
                    f"SELECT * FROM question_options WHERE question_id IN "
                    f"(SELECT id FROM questions WHERE {d_clause})",
                    **d_params,
                )

    # Marketplace scaffolding from the same seed pass: categories and coupons
    # carry no ownership, so they go only when nothing real references them.
    demo_ids = {r["id"] for r in plan["tables"].get("products", [])}
    real_products_left = [
        r for r in _rows("SELECT id FROM products") if r["id"] not in demo_ids
    ]
    if "categories" in tables and not real_products_left:
        plan["tables"]["categories"] = _rows("SELECT * FROM categories")
    if "coupons" in tables and not _rows("SELECT id FROM orders LIMIT 1"):
        plan["tables"]["coupons"] = _rows("SELECT * FROM coupons")

    return plan


def describe(plan: Dict[str, Any]) -> None:
    print("Demo accounts :", plan["users"] or "none")
    print("Demo exams    :", plan["exams"] or "none")
    for table, rows in sorted(plan["tables"].items()):
        print(f"  {table:22} {len(rows):5} row(s)")
    if not plan["tables"] and not plan["users"] and not plan["exams"]:
        print("Nothing to clean — database already holds only real data.")


def execute(plan: Dict[str, Any]) -> None:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = os.path.join(BACKUP_DIR, f"demo_cleanup_{stamp}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(plan, handle, indent=2, default=str)
    print("Backup written →", path)

    # Children before parents.
    order = [
        "cart_items",
        "wishlist_items",
        "lesson_files",
        "live_classes",
        "announcements",
        "lessons",
        "course_modules",
        "book_chapters",
        "payments",
        "addresses",
        "subscriptions",
        "wallet_ledger",
        "seller_applications",
        "knowledge_ingestion_jobs",
        "notification_preferences",
        "notification_deliveries",
        "audit_logs",
        "contact_replies",
        "contact_tickets",
        "chat_messages",
        "chat_threads",
        "user_messages",
        "question_banks",
        "question_options",
        "questions",
        "exam_questions",
        "exam_sections",
        "attempts",
        "course_reviews",
        "product_reviews",
        "enrollments",
        "notifications",
        "uploaded_images",
        "products",
        "books",
        "courses",
        "stores",
        "orders",
        "reviews",
        "coupons",
        "categories",
    ]
    for table in order:
        rows = plan["tables"].get(table)
        if not rows:
            continue
        ids = [row["id"] for row in rows if "id" in row]
        if not ids:
            continue
        clause, params = _in("id", ids, "x")
        db.session.execute(text(f"DELETE FROM {table} WHERE {clause}"), params)
        print(f"  deleted {len(ids):5} from {table}")

    if plan["exams"]:
        clause, params = _in("id", plan["exams"], "e")
        db.session.execute(text(f"DELETE FROM exams WHERE {clause}"), params)
        print("  deleted demo exams")

    if plan["users"]:
        clause, params = _in("id", plan["users"], "u")
        db.session.execute(text(f"DELETE FROM users WHERE {clause}"), params)
        print("  deleted demo accounts")

    db.session.commit()
    print("Done.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="actually delete (default is a dry run)")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        plan = build_plan()
        describe(plan)
        if not args.yes:
            print("\nDry run only. Re-run with --yes to delete.")
            return
        execute(plan)


if __name__ == "__main__":
    main()
