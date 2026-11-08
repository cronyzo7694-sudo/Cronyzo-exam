"""Idempotent demo dataset for the Cronyzo commerce domain.

Runs alongside the exam-domain seed in :mod:`app.services.seed`. Safe to
invoke repeatedly: the guard is the presence of the ``Electronics`` category,
so a populated database is never mutated.

Seeds:
    * 6 marketplace categories
    * 3 teachers, 2 vendors (plus their storefronts)
    * 9 courses with modules + lessons
    * 9 books with a table of contents
    * 18 products spread across categories and stores
    * product / course reviews and a demo coupon

Public contract (stable)::

    seed_commerce() -> None
"""

from __future__ import annotations

import logging
import secrets
from typing import Any, Dict, List, Optional, Sequence

from app.extensions import db
from app.models.book import Book, BookChapter
from app.models.course import Course, CourseModule, CourseReview, Enrollment, Lesson
from app.models.platform import Coupon
from app.models.store import Category, Product, ProductReview, Store
from app.models.user import User
from app.services.media import (
    artwork,
    avatar_artwork,
    cover_artwork,
    course_artwork,
    product_artwork,
)

logger = logging.getLogger("cronyzo.services.commerce_seed")

_SENTINEL_CATEGORY = "electronics"

# ---------------------------------------------------------------------------
# Category definitions
# ---------------------------------------------------------------------------
_CATEGORIES: Sequence[Dict[str, Any]] = (
    {"name": "Electronics", "icon": "phone", "desc": "Phones, laptops and audio gear"},
    {"name": "Fashion", "icon": "shirt", "desc": "Clothing, footwear and accessories"},
    {"name": "Home & Kitchen", "icon": "home", "desc": "Everything that makes a house a home"},
    {"name": "Stationery", "icon": "pen", "desc": "Notebooks, pens and exam supplies"},
    {"name": "Sports", "icon": "sports", "desc": "Fitness, cricket and outdoor gear"},
    {"name": "Food & Beverages", "icon": "food", "desc": "Snacks, coffee and daily essentials"},
)

# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------
_TEACHERS: Sequence[Dict[str, Any]] = (
    {
        "email": "teacher@examos.local",
        "full_name": "Ravi Sharma",
        "password": "teacher123",
        "headline": "Senior Data Engineer & Educator",
        "city": "Bengaluru",
        "expertise": "Python, Data Engineering, SQL",
        "qualifications": "M.Tech Computer Science, ex-Flipkart",
        "bio": "I have spent 11 years building data platforms and now teach the "
        "practical way I wish someone had taught me — with real datasets, "
        "real breakages, and real interviews.",
    },
    {
        "email": "ananya@examos.local",
        "full_name": "Ananya Iyer",
        "password": "teacher123",
        "headline": "Frontend Architect & Design Educator",
        "city": "Pune",
        "expertise": "React, TypeScript, UI Design",
        "qualifications": "B.Des Interaction Design, ex-Figma",
        "bio": "Design systems, React architecture and the craft of interfaces. "
        "I teach by building things you will actually ship at work.",
    },
    {
        "email": "imran@examos.local",
        "full_name": "Imran Qureshi",
        "password": "teacher123",
        "headline": "Exam Trainer — SSC, Banking & Railways",
        "city": "Hyderabad",
        "expertise": "Quantitative Aptitude, Reasoning, Current Affairs",
        "qualifications": "B.Sc Mathematics, 8 years in exam coaching",
        "bio": "I prepare aspirants for SSC CGL, IBPS and RRB. My courses are "
        "revision-heavy, shortcut-free and built around previous year papers.",
    },
)

_SELLERS: Sequence[Dict[str, Any]] = (
    {
        "email": "seller@examos.local",
        "full_name": "Vikram Malhotra",
        "password": "seller123",
        "store": "TechNest India",
        "tagline": "Genuine electronics, honest prices, next-day delivery",
        "city": "Delhi",
        "description": "We source directly from manufacturers and keep a small, "
        "carefully audited catalogue. No refurbished surprises, no grey market.",
    },
    {
        "email": "seller2@examos.local",
        "full_name": "Priya Nair",
        "password": "seller123",
        "store": "Paper & Page",
        "tagline": "Stationery, books and study supplies for serious learners",
        "city": "Kochi",
        "description": "A family-run stationery house supplying schools, "
        "coaching institutes and serious self-learners since 1998.",
    },
)

# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------
_COURSES: Sequence[Dict[str, Any]] = (
    {
        "teacher": 0,
        "title": "Python & Data Engineering Masterclass",
        "subtitle": "From first script to a production-grade pipeline",
        "category": "Data & AI",
        "level": "intermediate",
        "price": 2499,
        "mrp": 4999,
        "hours": 24.5,
        "glyph": "code",
        "desc": "A complete, project-first path through Python, SQL, orchestration "
        "and data modelling. You will ship four real pipelines and finish with a "
        "portfolio recruiters actually read.",
        "modules": [
            (
                "Python Foundations That Actually Stick",
                [
                    ("Why Python for data work", "video", 18, True),
                    ("Types, mutability and the mental model", "video", 24, False),
                    ("Comprehensions vs loops — a real benchmark", "video", 16, False),
                    ("Hands-on: clean a 200MB CSV in 40 seconds", "article", 22, False),
                ],
            ),
            (
                "SQL and Analytical Thinking",
                [
                    ("Window functions from scratch", "video", 26, True),
                    ("Query plans and reading EXPLAIN", "video", 21, False),
                    ("Cohort analysis without crying", "video", 19, False),
                    ("Practice set: 30 interview queries", "quiz", 35, False),
                ],
            ),
            (
                "Pipelines and Orchestration",
                [
                    ("Airflow DAGs you will actually maintain", "video", 28, False),
                    ("Idempotency, retries and late data", "video", 23, False),
                    ("Project: daily orders → warehouse → dashboard", "article", 45, False),
                ],
            ),
        ],
    },
    {
        "teacher": 0,
        "title": "SQL for Business Analysts",
        "subtitle": "Answer business questions with data, not guesswork",
        "category": "Data & AI",
        "level": "beginner",
        "price": 1299,
        "mrp": 2499,
        "hours": 9.0,
        "glyph": "chart",
        "desc": "Ten focused hours that turn a spreadsheet analyst into the person "
        "the leadership team asks when the numbers matter.",
        "modules": [
            (
                "Getting Comfortable",
                [
                    ("Your first real query", "video", 14, True),
                    ("GROUP BY without the fear", "video", 17, False),
                    ("Joins, visually explained", "video", 20, False),
                ],
            ),
            (
                "Answering Real Questions",
                [
                    ("Retention cohorts", "video", 22, False),
                    ("Variance vs target", "video", 18, False),
                    ("Capstone: revenue dashboard query", "article", 40, False),
                ],
            ),
        ],
    },
    {
        "teacher": 1,
        "title": "React & TypeScript — Production Patterns",
        "subtitle": "The patterns senior engineers use in real codebases",
        "category": "Engineering",
        "level": "advanced",
        "price": 2999,
        "mrp": 5999,
        "hours": 18.0,
        "glyph": "code",
        "desc": "Stop copying tutorial apps. Learn how component boundaries, "
        "server state, error handling and design systems work together in a "
        "codebase that has to survive contact with users.",
        "modules": [
            (
                "Component Architecture",
                [
                    ("Composition over configuration", "video", 20, True),
                    ("TypeScript patterns that scale", "video", 26, False),
                    ("Design tokens and theming", "video", 18, False),
                ],
            ),
            (
                "State and Data",
                [
                    ("Server state vs client state", "video", 24, False),
                    ("Caching, revalidation, staleness", "video", 22, False),
                    ("Project: analytics dashboard shell", "article", 50, False),
                ],
            ),
            (
                "Shipping It",
                [
                    ("Error boundaries and fallbacks", "video", 16, False),
                    ("Bundle budgets and code splitting", "video", 19, False),
                    ("Testing what users care about", "video", 21, False),
                ],
            ),
        ],
    },
    {
        "teacher": 1,
        "title": "UI Design Fundamentals",
        "subtitle": "Design interfaces people understand on the first try",
        "category": "Design",
        "level": "beginner",
        "price": 899,
        "mrp": 1999,
        "hours": 6.5,
        "glyph": "lamp",
        "desc": "Typography, spacing, colour and hierarchy — taught with the "
        "same vocabulary professional design teams use in critique.",
        "modules": [
            (
                "Visual Foundations",
                [
                    ("The 4pt spacing system", "video", 15, True),
                    ("Type scale and hierarchy", "video", 18, False),
                    ("Colour that carries meaning", "video", 16, False),
                ],
            ),
            (
                "Putting It Together",
                [
                    ("Rebuilding a real checkout screen", "article", 45, False),
                ],
            ),
        ],
    },
    {
        "teacher": 2,
        "title": "SSC CGL — Quantitative Aptitude Sprint",
        "subtitle": "Topic-wise speed-drills with previous year papers",
        "category": "Exam Prep",
        "level": "intermediate",
        "price": 1499,
        "mrp": 2999,
        "hours": 14.0,
        "glyph": "math",
        "desc": "Thirty-two focused sessions covering every quant topic in the "
        "syllabus, each closing with a timed set drawn from previous papers.",
        "modules": [
            (
                "Number System",
                [
                    ("Divisibility and remainders", "video", 25, True),
                    ("LCM/HCM shortcuts", "video", 22, False),
                    ("Timed set: 20 questions", "quiz", 30, False),
                ],
            ),
            (
                "Algebra & Mensuration",
                [
                    ("Quadratics without fear", "video", 28, False),
                    ("Area, volume, shortcuts", "video", 26, False),
                    ("Timed set: 20 questions", "quiz", 30, False),
                ],
            ),
        ],
    },
    {
        "teacher": 2,
        "title": "Banking Reasoning Made Easy",
        "subtitle": "Seating arrangement, puzzles and speed logic",
        "category": "Exam Prep",
        "level": "beginner",
        "price": 999,
        "mrp": 1999,
        "hours": 8.0,
        "glyph": "chart",
        "desc": "Puzzles are a fixed pattern, not a talent. This course breaks "
        "them into repeatable moves so you stop freezing in the exam hall.",
        "modules": [
            (
                "The Puzzles Toolkit",
                [
                    ("Floor &amp; flat based sets", "video", 24, True),
                    ("Box, schedule and day sets", "video", 27, False),
                    ("Ordering &amp; ranking", "video", 19, False),
                    ("Full mock: reasoning section", "quiz", 40, False),
                ],
            ),
        ],
    },
    {
        "teacher": 2,
        "title": "English Preparation for Competitive Exams",
        "subtitle": "Grammar, comprehension and vocabulary in 10 hours",
        "category": "Exam Prep",
        "level": "beginner",
        "price": 799,
        "mrp": 1499,
        "hours": 10.0,
        "glyph": "book",
        "desc": "Grammar rules worth memorising, comprehension tricks that "
        "actually work, and a vocabulary plan you can sustain for 60 days.",
        "modules": [
            (
                "Grammar That Sticks",
                [
                    ("Tenses without confusion", "video", 26, True),
                    ("Subject-verb agreement", "video", 21, False),
                    ("Error spotting drill", "quiz", 25, False),
                ],
            ),
            (
                "Reading &amp; Vocabulary",
                [
                    ("Reading in 7 minutes", "video", 18, False),
                    ("Word power — prefix method", "video", 22, False),
                ],
            ),
        ],
    },
    {
        "teacher": 0,
        "title": "Cloud Architecture on AWS",
        "subtitle": "Design systems that survive a 10x traffic jump",
        "category": "Engineering",
        "level": "advanced",
        "price": 3499,
        "mrp": 6999,
        "hours": 20.0,
        "glyph": "globe",
        "desc": "Compute, storage, networking and the cost decisions that decide "
        "whether your monthly bill is a rounding error or a board meeting.",
        "modules": [
            (
                "Foundations on AWS",
                [
                    ("Regions, AZs and the shared responsibility model", "video", 24, True),
                    ("EC2 vs Lambda — choosing well", "video", 22, False),
                    ("S3 and storage classes", "video", 19, False),
                ],
            ),
            (
                "Designing for Scale",
                [
                    ("Auto-scaling policies that work", "video", 25, False),
                    ("Load balancers and health checks", "video", 20, False),
                    ("Project: multi-AZ deployment plan", "article", 55, False),
                ],
            ),
        ],
    },
    {
        "teacher": 1,
        "title": "Figma for Working Designers",
        "subtitle": "From wireframe to a design system your developers love",
        "category": "Design",
        "level": "intermediate",
        "price": 1499,
        "mrp": 2999,
        "hours": 11.0,
        "glyph": "lamp",
        "desc": "Auto-layout, components, variants and handoff. Build a system, "
        "not a set of pretty screens.",
        "modules": [
            (
                "Working in Figma",
                [
                    ("Auto-layout as a mental model", "video", 20, True),
                    ("Components, variants and properties", "video", 25, False),
                    ("Developer handoff done right", "video", 18, False),
                ],
            ),
        ],
    },
)

# ---------------------------------------------------------------------------
# Books
# ---------------------------------------------------------------------------
_BOOKS: Sequence[Dict[str, Any]] = (
    {
        "seller": 1,
        "title": "Python for Everybody — Practical Edition",
        "author": "Dr. Charles Severance",
        "publisher": "CRC Press",
        "isbn": "978-93-5000-112-3",
        "category": "Programming",
        "pages": 412,
        "price": 549,
        "mrp": 899,
        "format": "paperback",
        "stock": 42,
        "glyph": "code",
        "desc": "The gentlest, most complete route into Python you will find. "
        "Every chapter ends with something you can actually run.",
        "highlights": "Completely rewritten for Python 3.12\nReal datasets in every chapter\nNo prior programming assumed",
        "chapters": [
            ("Why We Program", 1, 24),
            ("Variables and Expressions", 25, 58),
            ("Conditionals and Loops", 59, 96),
            ("Functions", 97, 142),
            ("Lists and Dictionaries", 143, 198),
        ],
    },
    {
        "seller": 1,
        "title": "Designing Data-Intensive Applications",
        "author": "Martin Kleppmann",
        "publisher": "O'Reilly Media",
        "isbn": "978-93-5000-456-8",
        "category": "Programming",
        "pages": 616,
        "price": 1299,
        "mrp": 1899,
        "format": "hardcover",
        "stock": 18,
        "glyph": "book",
        "desc": "The reference for anyone designing systems that hold up under "
        "load. Dense, opinionated, and worth the effort.",
        "highlights": "Storage and retrieval internals\nConsensus and replication explained\nThe only book on modern data engineering",
        "chapters": [
            ("Introduction", 1, 22),
            ("Relational Databases", 25, 96),
            ("Distributed Data", 137, 210),
            ("Derived Data", 211, 296),
        ],
    },
    {
        "seller": 0,
        "title": "The Pragmatic Programmer, 20th Anniversary Edition",
        "author": "David Thomas & Andrew Hunt",
        "publisher": "Addison-Wesley",
        "isbn": "978-93-5000-789-1",
        "category": "Programming",
        "pages": 352,
        "price": 799,
        "mrp": 1199,
        "format": "paperback",
        "stock": 26,
        "glyph": "code",
        "desc": "Timeless advice on craftsmanship, estimation, debugging and "
        "career growth. Read it once, refer to it forever.",
        "highlights": "Essential chapters on debugging and estimation\nNew foreword by the authors\nThe career-changer's bible",
        "chapters": [
            ("Your Tools", 1, 30),
            ("Estimating", 31, 70),
            ("Debugging", 71, 110),
            ("The Tracer Bullet Approach", 111, 150),
        ],
    },
    {
        "seller": 0,
        "title": "Quantitative Aptitude for Competitive Examinations",
        "author": "R.S. Aggarwal",
        "publisher": "S. Chand",
        "isbn": "978-93-5283-045-6",
        "category": "Exam Prep",
        "pages": 592,
        "price": 449,
        "mrp": 799,
        "format": "paperback",
        "stock": 120,
        "glyph": "math",
        "desc": "The standard reference for SSC, banking and railway aspirants, "
        "reprinted with clearer type and a bonus solved-paper section.",
        "highlights": "Fully solved examples\nChapter-wise practice sets\nIncludes 2023 papers with solutions",
        "chapters": [
            ("Number System", 1, 88),
            ("Algebra", 89, 204),
            ("Mensuration", 205, 296),
            ("Data Interpretation", 297, 372),
        ],
    },
    {
        "seller": 1,
        "title": "Clean Code — A Handbook of Agile Software Craftsmanship",
        "author": "Robert C. Martin",
        "publisher": "Prentice Hall",
        "isbn": "978-93-5000-233-8",
        "category": "Programming",
        "pages": 464,
        "price": 899,
        "mrp": 1399,
        "format": "ebook",
        "stock": 999,
        "glyph": "code",
        "desc": "The book that started a thousand code-review arguments — and "
        "improved a thousand codebases.",
        "highlights": "Practical refactoring patterns\nNaming, comments and functions\nThe SRP and OCP explained with examples",
        "chapters": [
            ("The Smell of Code", 1, 34),
            ("Functions", 35, 88),
            ("Comments", 89, 132),
            ("Object-Oriented Design", 163, 240),
        ],
    },
    {
        "seller": 0,
        "title": "Atomic Habits",
        "author": "James Clear",
        "publisher": "Avery",
        "isbn": "978-93-5000-901-7",
        "category": "Self Development",
        "pages": 320,
        "price": 399,
        "mrp": 699,
        "format": "paperback",
        "stock": 200,
        "glyph": "sports",
        "desc": "A practical system for building good habits and breaking bad "
        "ones — popular with students who need a study routine that sticks.",
        "highlights": "The four laws of behaviour change\nIdentity-based habits\nA weekly review template",
        "chapters": [
            ("The Surprising Power of Tiny Habits", 1, 28),
            ("How Your Habits Shape Your Identity", 29, 64),
            ("The Man Who Did It Right", 65, 110),
        ],
    },
    {
        "seller": 0,
        "title": "Deep Work",
        "author": "Cal Newport",
        "publisher": "Grand Central",
        "isbn": "978-93-5000-455-1",
        "category": "Self Development",
        "pages": 304,
        "price": 349,
        "mrp": 599,
        "format": "paperback",
        "stock": 140,
        "glyph": "lamp",
        "desc": "Concentration is a superpower that can be trained. A book for "
        "anyone whose attention keeps getting stolen.",
        "highlights": "Four philosophies of deep work\nRituals that protect focus\nA shutdown ritual for evening",
        "chapters": [
            ("Deep Work Is Valuable", 1, 26),
            ("Rituals", 53, 96),
            ("Drain the Shallows", 131, 168),
        ],
    },
    {
        "seller": 1,
        "title": "Cracking the Coding Interview",
        "author": "Gayle Laakmann McDowell",
        "publisher": "Sixth Edition",
        "isbn": "978-93-5000-667-3",
        "category": "Interview Prep",
        "pages": 704,
        "price": 999,
        "mrp": 1599,
        "format": "paperback",
        "stock": 64,
        "glyph": "rocket",
        "desc": "150 curated interview questions with clear solutions, plus "
        "the behavioural and negotiation prep most books skip.",
        "highlights": "150 interview questions\nProblem breakdown by pattern\nBehavioural and HR prep appendix",
        "chapters": [
            ("Getting Ready", 1, 30),
            ("Arrays and Strings", 43, 150),
            ("Linked Lists", 151, 200),
            ("Design Questions", 485, 560),
        ],
    },
    {
        "seller": 1,
        "title": "A Brief History of Time",
        "author": "Stephen Hawking",
        "publisher": "Bantam",
        "isbn": "978-93-5000-334-2",
        "category": "Science",
        "pages": 212,
        "price": 249,
        "mrp": 399,
        "format": "paperback",
        "stock": 90,
        "glyph": "globe",
        "desc": "The clearest popular account of cosmology ever written, and a "
        "reminder that good explanations are an act of generosity.",
        "highlights": "Big Bang to black holes\nIllustrated throughout\nA classic for every study table",
        "chapters": [
            ("Our Universe", 1, 22),
            ("Space, Time and Causality", 23, 62),
            ("Black Holes", 123, 168),
        ],
    },
)

# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
_PRODUCTS: Sequence[Dict[str, Any]] = (
    {"store": 0, "cat": "Electronics", "title": "Aurex Pro 5G Smartphone (256GB)", "brand": "Aurex", "price": 31999, "mrp": 38999, "stock": 24, "glyph": "phone", "desc": "6.7\" AMOLED, 120Hz, 5000mAh with 67W charging. Dual SIM, 1 year warranty."},
    {"store": 0, "cat": "Electronics", "title": "Nimbus Air 13 Ultrabook", "brand": "Nimbus", "price": 74999, "mrp": 89999, "stock": 8, "glyph": "laptop", "desc": "13.3\" 2.8K OLED, 16GB RAM, 512GB SSD, 12-hour battery, 1.4kg magnesium body."},
    {"store": 0, "cat": "Electronics", "title": "Pulse ANC Over-Ear Headphones", "brand": "Pulse", "price": 8999, "mrp": 12999, "stock": 45, "glyph": "headphones", "desc": "Hybrid active noise cancellation, 40-hour playback, multipoint Bluetooth 5.3."},
    {"store": 0, "cat": "Electronics", "title": "Lumen 4K Action Camera", "brand": "Lumen", "price": 21999, "mrp": 27999, "stock": 15, "glyph": "camera", "desc": "4K60 recording, waterproof to 10m, stabilisation, dual-screen kit."},
    {"store": 0, "cat": "Electronics", "title": "Chrono Smartwatch Series 7", "brand": "Chrono", "price": 4999, "mrp": 7499, "stock": 60, "glyph": "watch", "desc": "AMOLED always-on display, SpO2, GPS, 14-day battery, 50m water resistant."},
    {"store": 0, "cat": "Electronics", "title": "Vox Bluetooth Speaker (30W)", "brand": "Vox", "price": 2499, "mrp": 3499, "stock": 75, "glyph": "music", "desc": "IPX7 waterproof, 24-hour playtime, stereo pairing, hands-free mic."},
    {"store": 1, "cat": "Stationery", "title": "Ruled Notebook — Pack of 5 (A4)", "brand": "Paper & Page", "price": 649, "mrp": 899, "stock": 200, "glyph": "pen", "desc": "160 GSM ivory paper, 200 pages each, perforated, spiral bound. Built for heavy pens."},
    {"store": 1, "cat": "Stationery", "title": "Exam Answer Sheet Bundle (10 sheets)", "brand": "Paper & Page", "price": 399, "mrp": 599, "stock": 300, "glyph": "book", "desc": "Pre-printed OMR sheets with a carbon copy, plus an answer key booklet. Strictly exam-hall compliant."},
    {"store": 1, "cat": "Stationery", "title": "Rollerball Pens — 10 Pack", "brand": "Paper & Page", "price": 249, "mrp": 399, "stock": 500, "glyph": "pen", "desc": "0.5mm tip, quick-drying ink that will not smudge. Colours: black, blue, red, green."},
    {"store": 1, "cat": "Stationery", "title": "A4 Geometry Box with 45 Pieces", "brand": "Paper & Page", "price": 899, "mrp": 1299, "stock": 95, "glyph": "math", "desc": "Includes protractor, compass, set squares, ruler, eraser and a pencil pouch in a hard zip case."},
    {"store": 1, "cat": "Stationery", "title": "Whiteboard Pen Set (8 colours)", "brand": "Paper & Page", "price": 349, "mrp": 499, "stock": 180, "glyph": "pen", "desc": "Capillary tip, low odour, wipes clean off any non-porous surface."},
    {"store": 1, "cat": "Home & Kitchen", "title": "Brew Master Coffee Maker 1.2L", "brand": "Brew", "price": 3499, "mrp": 4999, "stock": 30, "glyph": "coffee", "desc": "Programmable 24-hour timer, 10-cup glass carafe, anti-drip system, 900W."},
    {"store": 0, "cat": "Fashion", "title": "Everyday Cotton Oversized Tee", "brand": "Loom", "price": 899, "mrp": 1499, "stock": 220, "glyph": "shirt", "desc": "240 GSM combed cotton, bio-washed for softness, relaxed fit. Six solid colours."},
    {"store": 0, "cat": "Fashion", "title": "Canvas Laptop Backpack 25L", "brand": "Loom", "price": 1999, "mrp": 2999, "stock": 85, "glyph": "bag", "desc": "Water-resistant 16oz canvas, padded 16\" laptop sleeve, hidden anti-theft pocket."},
    {"store": 1, "cat": "Sports", "title": "Pro Grip Yoga Mat 6mm", "brand": "Pro Grip", "price": 1299, "mrp": 1899, "stock": 110, "glyph": "sports", "desc": "Non-slip TPE surface, alignment markers, carry strap included. 183 x 61cm."},
    {"store": 1, "cat": "Sports", "title": "Adjustable Dumbbell Pair 20kg", "brand": "Pro Grip", "price": 5499, "mrp": 7499, "stock": 22, "glyph": "sports", "desc": "Dial adjustment from 2.5kg to 10kg per bell, rubber-coated, replaces 15 fixed weights."},
    {"store": 0, "cat": "Food & Beverages", "title": "Single Origin Coffee Beans 500g", "brand": "Brew", "price": 749, "mrp": 999, "stock": 160, "glyph": "coffee", "desc": "Medium roast, washed Arabica from Chikmagalur. Roasted to order every Monday."},
    {"store": 0, "cat": "Food & Beverages", "title": "Artisan Dark Chocolate Box (12 bars)", "brand": "Cocoa", "price": 999, "mrp": 1299, "stock": 140, "glyph": "food", "desc": "Seven single-origin bars from 72% to 90% cacao. Tasting notes on every wrapper."},
)


def _get_or_create_user(
    email: str,
    full_name: str,
    password: str,
    role: str,
    enforce_role: bool = False,
    **profile: Any,
) -> User:
    """
    Fetch a seeded user or create it with the given profile fields.

    ``enforce_role`` keeps the demo accounts in their documented state. A
    seeded account can be promoted during manual testing (``become-creator``,
    the admin panel), and without this the demo drifts — e.g. the "student"
    demo quietly turning into a teacher and changing what the Seller Studio
    shows. Demo accounts are meant to be reproducible.
    """
    user = User.query.filter_by(email=email).first()
    if user is not None:
        if enforce_role and user.role != role:
            logger.info(
                "seed: resetting demo account %s: role %s -> %s",
                email,
                user.role,
                role,
            )
            user.role = role
            user.creator_type = None
            user.headline = None
            user.bio = None
        elif enforce_role and role == "student":
            # A plain learner must not keep a creator profile.
            user.creator_type = None
        db.session.flush()
        return user

    user = User(email=email, full_name=full_name, role=role, auth_provider="password")
    user.set_password(password)
    for key, value in profile.items():
        setattr(user, key, value)
    db.session.add(user)
    db.session.flush()
    return user


def _ensure_categories() -> Dict[str, Category]:
    """Create the standard category set and return them keyed by name."""
    result: Dict[str, Category] = {}
    for index, spec in enumerate(_CATEGORIES):
        slug = spec["name"].lower().replace(" & ", "-").replace(" ", "-")
        category = Category.query.filter_by(slug=slug).first()
        if category is None:
            category = Category(
                name=spec["name"],
                slug=slug,
                icon=spec.get("icon"),
                description=spec.get("desc"),
                sort_order=index,
            )
            db.session.add(category)
            db.session.flush()
        result[spec["name"]] = category
    return result


def _ensure_courses(teachers: List[User]) -> List[Course]:
    """Create the demo courses with their modules and lessons."""
    created: List[Course] = []
    for spec in _COURSES:
        slug = spec["title"].lower().replace(" & ", "-").replace(",", "").replace("'", "")
        slug = "-".join(slug.split())
        if Course.query.filter_by(slug=slug).first() is not None:
            continue

        teacher = teachers[spec["teacher"] % len(teachers)]
        course = Course(
            teacher_id=teacher.id,
            title=spec["title"],
            slug=slug,
            subtitle=spec.get("subtitle"),
            description=spec.get("desc"),
            category=spec.get("category", "General"),
            level=spec.get("level", "beginner"),
            language="Hindi",
            thumbnail_url=course_artwork(spec["title"], seed=slug, glyph=spec.get("glyph", "course")),
            price=spec.get("price", 0),
            mrp=spec.get("mrp", 0),
            delivery_mode="self_paced",
            duration_hours=spec.get("hours", 0),
            is_featured=spec.get("price", 0) >= 2499,
            status="published",
        )
        db.session.add(course)
        db.session.flush()

        lesson_total = 0
        for module_index, (module_title, lessons) in enumerate(spec.get("modules", []), start=1):
            module = CourseModule(
                course_id=course.id,
                title=module_title,
                sort_order=module_index,
            )
            db.session.add(module)
            db.session.flush()

            for lesson_index, lesson_spec in enumerate(lessons, start=1):
                title, content_type, duration, is_preview = lesson_spec
                db.session.add(
                    Lesson(
                        module_id=module.id,
                        title=title,
                        content_type=content_type,
                        video_url=(
                            "https://cdn.cronyzo.dev/lessons/"
                            f"{slug}-m{module_index}-l{lesson_index}.mp4"
                            if content_type == "video"
                            else None
                        ),
                        content=(
                            "Notes, reference links and a downloadable summary "
                            "for this session."
                            if content_type == "article"
                            else None
                        ),
                        duration_minutes=duration,
                        is_preview=is_preview,
                        is_locked=not is_preview,
                        sort_order=lesson_index,
                    )
                )
                lesson_total += 1

        course.lesson_count = lesson_total
        created.append(course)
    return created


def _ensure_books(sellers: List[User]) -> List[Book]:
    """Create the demo book listings."""
    created: List[Book] = []
    for spec in _BOOKS:
        slug = "-".join(spec["title"].lower().replace(",", "").replace("'", "").split())
        if Book.query.filter_by(slug=slug).first() is not None:
            continue

        seller = sellers[spec["seller"] % len(sellers)]
        book = Book(
            seller_id=seller.id,
            title=spec["title"],
            slug=slug,
            author=spec.get("author"),
            publisher=spec.get("publisher"),
            isbn=spec.get("isbn"),
            edition=spec.get("edition"),
            language="English",
            category=spec.get("category", "General"),
            pages=spec.get("pages", 0),
            cover_url=cover_artwork(spec["title"], seed=slug, glyph=spec.get("glyph", "book")),
            description=spec.get("desc"),
            highlights=spec.get("highlights"),
            price=spec.get("price", 0),
            mrp=spec.get("mrp", 0),
            format=spec.get("format", "paperback"),
            stock=spec.get("stock", 0),
            is_featured=spec.get("price", 0) >= 899,
            status="published",
        )
        db.session.add(book)
        db.session.flush()

        for index, (title, start, end) in enumerate(spec.get("chapters", []), start=1):
            db.session.add(
                BookChapter(
                    book_id=book.id,
                    title=title,
                    page_start=start,
                    page_end=end,
                    sort_order=index,
                )
            )
        created.append(book)
    return created


def _ensure_products(
    sellers: List[User], stores: List[Store], categories: Dict[str, Category]
) -> List[Product]:
    """Create the demo product catalogue."""
    created: List[Product] = []
    for spec in _PRODUCTS:
        slug = "-".join(spec["title"].lower().replace(",", "").replace("(", "").replace(")", "").split())
        if Product.query.filter_by(slug=slug).first() is not None:
            continue

        store = stores[spec["store"] % len(stores)]
        seller = sellers[spec["store"] % len(sellers)]
        category = categories.get(spec.get("cat"))
        product = Product(
            store_id=store.id,
            category_id=category.id if category else None,
            seller_id=seller.id,
            title=spec["title"],
            slug=slug,
            description=spec.get("desc"),
            brand=spec.get("brand"),
            price=spec.get("price", 0),
            mrp=spec.get("mrp", 0),
            stock=spec.get("stock", 0),
            condition="new",
            fulfillment="physical",
            image_url=product_artwork(spec["title"], seed=slug, glyph=spec.get("glyph", "bag")),
            is_featured=spec.get("price", 0) >= 5000,
        )
        db.session.add(product)
        db.session.flush()

        # A couple of extra gallery frames so the detail page looks real
        gallery = [
            product_artwork(spec["title"], seed=f"{slug}-{i}", glyph=spec.get("glyph", "bag"))
            for i in range(1, 4)
        ]
        import json as _json

        product.gallery_json = _json.dumps(gallery)
        created.append(product)
    return created


def _ensure_reviews(
    courses: List[Course], books: List[Book], products: List[Product], buyer: User
) -> None:
    """Attach believable reviews to a slice of the catalogue."""
    sample = [
        (5, "Exactly what I needed", "Explains the hard parts without padding. Finished the whole thing in three weeks."),
        (4, "Very good, minor gaps", "Content is strong. Would love one more worked example in the middle section."),
        (5, "Worth every rupee", "Used this right before my interview and it made a real difference."),
        (4, "Clear and practical", "No fluff. The examples are realistic and the exercises actually check understanding."),
        (5, "Will buy the next one too", "My whole study group uses this. Explanations are calm and easy to follow."),
    ]

    for index, course in enumerate(courses):
        rating, title, body = sample[index % len(sample)]
        if CourseReview.query.filter_by(user_id=buyer.id, course_id=course.id).first():
            continue
        db.session.add(
            CourseReview(
                course_id=course.id,
                user_id=buyer.id,
                rating=rating,
                title=title,
                body=body,
                is_verified=True,
            )
        )

    for index, product in enumerate(products):
        rating, title, body = sample[index % len(sample)]
        if ProductReview.query.filter_by(user_id=buyer.id, product_id=product.id).first():
            continue
        db.session.add(
            ProductReview(
                product_id=product.id,
                user_id=buyer.id,
                rating=rating,
                title=title,
                body=body,
                is_verified=True,
            )
        )

    db.session.flush()

    # Recompute aggregates
    for course in courses:
        agg = (
            db.session.query(
                db.func.avg(CourseReview.rating), db.func.count(CourseReview.id)
            )
            .filter(CourseReview.course_id == course.id)
            .one()
        )
        course.rating_avg = round(float(agg[0] or 0.0), 2)
        course.rating_count = int(agg[1] or 0)

    for product in products:
        agg = (
            db.session.query(
                db.func.avg(ProductReview.rating), db.func.count(ProductReview.id)
            )
            .filter(ProductReview.product_id == product.id)
            .one()
        )
        product.rating_avg = round(float(agg[0] or 0.0), 2)
        product.rating_count = int(agg[1] or 0)


def _ensure_coupons() -> None:
    """Seed a couple of working coupons."""
    from datetime import datetime, timedelta, timezone

    existing = {c.code for c in Coupon.query.all()}
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=90)

    for code, percent, amount, label in (
        ("WELCOME10", 10.0, 0.0, "10% off your first order"),
        ("CRONYZO50", 0.0, 50.0, "Flat ₹50 off"),
        ("STUDENT15", 15.0, 0.0, "15% student discount"),
    ):
        if code in existing:
            continue
        db.session.add(
            Coupon(
                code=code,
                percent_off=percent,
                amount_off=amount,
                max_redemptions=1000,
                redeemed_count=0,
                is_active=True,
                expires_at=expires,
            )
        )


def _enforce_demo_accounts() -> None:
    """
    Put the demo accounts back into their documented roles.

    Runs on every boot, even when the dataset already exists. Demo accounts
    can be promoted during manual testing (become-creator, the admin panel)
    and the demo should stay reproducible: the "student" account must read
    as a student so the Seller Studio and the nav show what they should.
    """
    for spec in _TEACHERS:
        _get_or_create_user(
            spec["email"],
            spec["full_name"],
            spec["password"],
            "teacher",
            enforce_role=True,
            headline=spec.get("headline"),
            bio=spec.get("bio"),
            city=spec.get("city"),
            expertise=spec.get("expertise"),
            qualifications=spec.get("qualifications"),
            creator_type="teacher",
            is_verified=True,
        )
    for spec in _SELLERS:
        _get_or_create_user(
            spec["email"],
            spec["full_name"],
            spec["password"],
            "seller",
            enforce_role=True,
            headline=spec.get("tagline"),
            bio=spec.get("description"),
            city=spec.get("city"),
            creator_type="seller",
            is_verified=True,
        )
    _get_or_create_user(
        "student@examos.local",
        "Aarav Mehta",
        secrets.token_urlsafe(18),
        "student",
        enforce_role=True,
        city="Delhi",
    )


def seed_commerce() -> None:
    """
    Populate the commerce domain with a demo dataset.

    Idempotent — the sentinel category check short-circuits on an already
    populated database. The demo accounts' roles are still re-asserted so a
    manual promotion cannot permanently change the demo.
    """
    try:
        if Category.query.filter_by(slug=_SENTINEL_CATEGORY).first() is not None:
            logger.info("commerce seed: already populated, skipping")
            _enforce_demo_accounts()
            db.session.commit()
            return

        categories = _ensure_categories()

        teachers: List[User] = []
        for spec in _TEACHERS:
            user = _get_or_create_user(
                spec["email"],
                spec["full_name"],
                spec["password"],
                "teacher",
                headline=spec.get("headline"),
                bio=spec.get("bio"),
                city=spec.get("city"),
                expertise=spec.get("expertise"),
                qualifications=spec.get("qualifications"),
                creator_type="teacher",
                is_verified=True,
            )
            if user.avatar_url is None:
                user.avatar_url = avatar_artwork(spec["full_name"], seed=spec["email"])
            teachers.append(user)

        sellers: List[User] = []
        stores: List[Store] = []
        for index, spec in enumerate(_SELLERS):
            user = _get_or_create_user(
                spec["email"],
                spec["full_name"],
                spec["password"],
                "seller",
                headline=spec.get("tagline"),
                bio=spec.get("description"),
                city=spec.get("city"),
                creator_type="seller",
                is_verified=True,
            )
            if user.avatar_url is None:
                user.avatar_url = avatar_artwork(spec["full_name"], seed=spec["email"])
            sellers.append(user)

            slug = "-".join(spec["store"].lower().split())
            store = Store.query.filter_by(slug=slug).first()
            if store is None:
                store = Store(
                    owner_id=user.id,
                    name=spec["store"],
                    slug=slug,
                    tagline=spec.get("tagline"),
                    description=spec.get("description"),
                    city=spec.get("city"),
                    logo_url=avatar_artwork(spec["store"], seed=slug),
                    banner_url=artwork(spec["store"], seed=f"{slug}-banner", glyph="bag", width=1200, height=400),
                    status="approved",
                )
                db.session.add(store)
                db.session.flush()
            stores.append(store)

        courses = _ensure_courses(teachers)
        books = _ensure_books(sellers)
        products = _ensure_products(sellers, stores, categories)

        # A demo buyer for reviews + a starter enrollment
        buyer = _get_or_create_user(
            "student@examos.local",
            "Aarav Mehta",
            secrets.token_urlsafe(18),
            "student",
            enforce_role=True,
            city="Delhi",
        )
        if buyer.avatar_url is None:
            buyer.avatar_url = avatar_artwork("Aarav Mehta", seed="student@examos.local")

        _ensure_reviews(courses, books, products, buyer)

        # Enroll the demo student in the first two courses with some progress
        for index, course in enumerate(courses[:2]):
            if Enrollment.query.filter_by(user_id=buyer.id, course_id=course.id).first():
                continue
            enrollment = Enrollment(
                user_id=buyer.id,
                course_id=course.id,
                completed_lessons=min(3, course.lesson_count or 0),
                progress=round(min(100.0, (min(3, course.lesson_count or 0) / max(1, course.lesson_count or 1)) * 100), 2),
            )
            db.session.add(enrollment)

        _ensure_coupons()

        db.session.commit()
        logger.info(
            "commerce seed complete: %d courses, %d books, %d products",
            len(courses),
            len(books),
            len(products),
        )
    except Exception:
        db.session.rollback()
        logger.exception("seed_commerce failed")
        raise


__all__ = ["seed_commerce"]
