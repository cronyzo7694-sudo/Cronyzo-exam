"""
One-off: regenerate catalog artwork with the corrected aspect ratios.

The placeholder SVGs were previously rendered at a fixed 800x600 / 600x900,
which the square and 16:10 cards cropped — clipping the title off the edge.
This rewrites the stored URLs in place using the new aspect-aware helpers
without touching orders, enrollments or any other rows.
"""

from __future__ import annotations

import json
import sys

from app import create_app
from app.extensions import db
from app.models.book import Book
from app.models.course import Course
from app.models.store import Product
from app.services.commerce_seed import _BOOKS, _COURSES, _PRODUCTS
from app.services.media import cover_artwork, course_artwork, product_artwork


def course_slug(spec: dict) -> str:
    slug = spec["title"].lower().replace(" & ", "-").replace(",", "").replace("'", "")
    return "-".join(slug.split())


def book_slug(spec: dict) -> str:
    return "-".join(spec["title"].lower().replace(",", "").replace("'", "").split())


def product_slug(spec: dict) -> str:
    slug = spec["title"].lower().replace(",", "").replace("'", "")
    slug = slug.replace("(", "").replace(")", "")
    return "-".join(slug.split())


def main() -> int:
    app = create_app()
    with app.app_context():
        course_glyph = {course_slug(s): s.get("glyph", "course") for s in _COURSES}
        book_glyph = {book_slug(s): s.get("glyph", "book") for s in _BOOKS}
        product_glyph = {product_slug(s): s.get("glyph", "bag") for s in _PRODUCTS}

        n_course = n_book = n_product = 0

        for course in Course.query.all():
            title = course.title
            slug = course.slug
            course.thumbnail_url = course_artwork(
                title, seed=slug, glyph=course_glyph.get(slug, "course")
            )
            n_course += 1

        for book in Book.query.all():
            title = book.title
            slug = book.slug
            book.cover_url = cover_artwork(
                title, seed=slug, glyph=book_glyph.get(slug, "book")
            )
            n_book += 1

        for product in Product.query.all():
            title = product.title
            slug = product.slug
            glyph = product_glyph.get(slug, "bag")
            product.image_url = product_artwork(title, seed=slug, glyph=glyph)
            extra = [i for i in product.gallery() if i != product.image_url]
            if extra:
                product.gallery_json = json.dumps(
                    [
                        product_artwork(title, seed=f"{slug}-{i}", glyph=glyph)
                        for i in range(len(extra))
                    ]
                )
            n_product += 1

        db.session.commit()
        print(
            f"regenerated artwork: {n_course} courses, {n_book} books, {n_product} products"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
