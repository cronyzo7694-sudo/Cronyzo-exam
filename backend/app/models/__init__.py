"""SQLAlchemy models — Cronyzo CBT domain layer.

Import order is intentional: parent entities before children so relationship
string resolutions and metadata registration remain stable under
``db.create_all()`` and Alembic autogenerate.

Public exports (stable — routes/services import these names)::

    User, Subject, Chapter, Question, QuestionOption,
    Exam, ExamSection, ExamQuestion, Attempt, AttemptAnswer

Do not rename table names, class names, or ``__all__`` entries — they are part
of the application contract.
"""

from __future__ import annotations

from app.models.user import User
from app.models.subject import Subject
from app.models.chapter import Chapter
from app.models.question import Question, QuestionOption
from app.models.exam import Exam, ExamSection, ExamQuestion
from app.models.attempt import Attempt, AttemptAnswer
from app.models.bank import (
    QuestionBank,
    Topic,
    Tag,
    QuestionTag,
    ImportJob,
    AuditLog,
)
from app.models.platform import Plan, Subscription, Payment, Coupon, WalletLedger
from app.models.auth_otp import PhoneOtp
from app.models.notification import (
    NotificationTemplate,
    NotificationPreference,
    Notification,
    NotificationDelivery,
)
from app.models.knowledge import QuestionAppearance, KnowledgeIngestionJob
from app.models.upload import StoredFile, UploadedImage
from app.models.user_message import UserMessage

# --- Cronyzo commerce domain (Learn / Read / Shop) ------------------------
# Import order matters: parents before children so relationship string
# resolutions stay stable under db.create_all() and Alembic autogenerate.
from app.models.store import (
    Category,
    Store,
    Product,
    ProductReview,
    Address,
    CartItem,
    WishlistItem,
)
from app.models.course import (
    Course,
    CourseModule,
    Lesson,
    Enrollment,
    CourseReview,
)
from app.models.book import Book, BookChapter
from app.models.order import Order, OrderItem

# --- Operator-editable site content (hero, pillars, testimonials, settings) ---
from app.models.site import SiteSetting, HeroSlide, PillarCard, Testimonial

# --- Chat + support helpdesk ---
from app.models.chat import (
    ChatThread,
    ChatMessage,
    ContactTicket,
    ContactReply,
)

# --- Teaching delivery (live classes, PDFs, announcements) ---
from app.models.teaching import LiveClass, LessonFile, Announcement

__all__ = [
    "User",
    "Subject",
    "Chapter",
    "Question",
    "QuestionOption",
    "Exam",
    "ExamSection",
    "ExamQuestion",
    "Attempt",
    "AttemptAnswer",
    "QuestionBank",
    "Topic",
    "Tag",
    "QuestionTag",
    "ImportJob",
    "AuditLog",
    "Plan",
    "Subscription",
    "Payment",
    "Coupon",
    "WalletLedger",
    "PhoneOtp",
    "NotificationTemplate",
    "NotificationPreference",
    "Notification",
    "NotificationDelivery",
    "QuestionAppearance",
    "KnowledgeIngestionJob",
    "UserMessage",
    # Commerce domain
    "Category",
    "Store",
    "Product",
    "ProductReview",
    "Address",
    "CartItem",
    "WishlistItem",
    "Course",
    "CourseModule",
    "Lesson",
    "Enrollment",
    "CourseReview",
    "Book",
    "BookChapter",
    "Order",
    "OrderItem",
    "UploadedImage",
    "StoredFile",
    # Site content
    "SiteSetting",
    "HeroSlide",
    "PillarCard",
    "Testimonial",
    # Chat + support
    "ChatThread",
    "ChatMessage",
    "ContactTicket",
    "ContactReply",
    # Teaching delivery
    "LiveClass",
    "LessonFile",
    "Announcement",
]
