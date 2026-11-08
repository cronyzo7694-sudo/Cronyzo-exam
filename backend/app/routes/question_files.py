"""Question bank files → questions → a ready test, in one flow.

The operator keeps question banks as files (a JSON pack exported from a
coaching app, a CSV from a spreadsheet, a PYQ paper pasted as text/HTML). This
blueprint makes those files first-class:

``POST   /api/question-files``              upload + import (json | csv | text/html)
``GET    /api/question-files``              list what was uploaded
``GET    /api/question-files/<id>``         details + a few sample questions
``POST   /api/question-files/<id>/exam``    build a test from this file
``DELETE /api/question-files/<id>``         forget the file (questions stay)

Field names are accepted in both shapes — the camelCase powering most JSON
exports (``questionText``, ``correctAnswer``, ``options: [{id, text}]``) and the
canonical snake_case the importer already speaks — so a file that works in
another app works here without editing.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt

from app.extensions import db
from app.models.exam import Exam, ExamQuestion
from app.models.question import QUESTION_TYPES, Question
from app.models.question_file import QuestionFile
from app.models.upload import StoredFile
from app.utils.decorators import roles_required

logger = logging.getLogger("cronyzo.question_files")

question_files_bp = Blueprint("question_files", __name__)

MAX_UPLOAD = 25 * 1024 * 1024  # a 1.5 MB pack of 750 questions is typical
MAX_ROWS = 20000
_LETTERS = "ABCDEFGH"


# ══════════════════════════════════════════════════════════════════════
# Parsing — one normalised row shape for every input format
# ══════════════════════════════════════════════════════════════════════


def _pick(row: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    # case-insensitive fallback (Question_Text, questiontext…)
    lowered = {str(k).lower().replace("_", ""): v for k, v in row.items()}
    for key in keys:
        value = lowered.get(key.lower().replace("_", ""))
        if value not in (None, ""):
            return value
    return None


def _options(row: Dict[str, Any]) -> List[Dict[str, str]]:
    """Normalise every option shape to ``[{option_key, option_text}]``."""
    raw = _pick(row, "options", "choices", "answers", "option_list")
    out: List[Dict[str, str]] = []

    if isinstance(raw, str):
        text = raw.strip()
        if text.startswith("["):
            try:
                raw = json.loads(text)
            except json.JSONDecodeError:
                raw = None
        if raw is None:
            raw = [part.strip() for part in re.split(r"[|\n]", text) if part.strip()]

    if isinstance(raw, list):
        for index, item in enumerate(raw[:8]):
            if isinstance(item, dict):
                key = (
                    item.get("id")
                    or item.get("key")
                    or item.get("option_key")
                    or item.get("label")
                    or _LETTERS[index]
                )
                text = (
                    item.get("text")
                    or item.get("option_text")
                    or item.get("value")
                    or item.get("body")
                    or ""
                )
                out.append({"option_key": str(key).upper()[:8], "option_text": str(text)})
            else:
                out.append({"option_key": _LETTERS[index], "option_text": str(item)})

    if not out:  # flat columns: option_a … option_d / A … D
        for index, letter in enumerate(_LETTERS[:6]):
            value = _pick(
                row,
                f"option_{letter.lower()}",
                f"option{letter}",
                f"option_{index + 1}",
                letter,
                letter.lower(),
            )
            if value not in (None, ""):
                out.append({"option_key": letter, "option_text": str(value)})
    return out


def _normalise_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """camelCase / snake_case / loose text → the importer's canonical row."""
    if not isinstance(row, dict):
        return None

    text = _pick(row, "questionText", "question_text", "question", "text", "q", "stem")
    if not text or not str(text).strip():
        return None

    correct = _pick(
        row, "correctAnswer", "correct_answer", "answer", "correct", "answer_key", "correctOption"
    )
    if isinstance(correct, list):
        correct = ",".join(str(c) for c in correct)
    if correct in (None, ""):
        return None
    correct = str(correct).strip()
    # "option B" / "b" / "2" → "B"
    match = re.search(r"([A-Ha-h])\b", correct)
    if re.fullmatch(r"\d+", correct):
        index = int(correct)
        if 1 <= index <= len(_LETTERS):
            correct = _LETTERS[index - 1]
    elif match and len(correct) <= 3:
        correct = match.group(1).upper()
    else:
        correct = correct.upper()[:8]

    subject = _pick(row, "subjectName", "subject_name", "subject", "subjectCode")
    chapter = _pick(row, "chapter", "chapterName", "chapter_name", "unit", "section")
    topic = _pick(row, "topic", "topicName", "sub_topic", "subtopic")

    tags = _pick(row, "tags", "labels", "keywords")
    if isinstance(tags, list):
        tags = ",".join(str(t) for t in tags)

    source = _pick(row, "source", "paper_source", "book")
    paper = row.get("paper") if isinstance(row.get("paper"), dict) else {}
    is_pyq = bool(
        _pick(row, "is_pyq", "isPyq", "pyq")
        or (isinstance(tags, str) and "pyq" in tags.lower())
        or (isinstance(source, str) and "PYQ" in source.upper())
        or paper
    )

    return {
        "question_text": str(text).strip(),
        "question_text_hi": _pick(row, "questionTextHi", "question_text_hi", "questionHi"),
        "correct_answer": correct,
        "options": _options(row),
        "explanation": _pick(row, "explanation", "solution", "answer_explanation"),
        "explanation_hi": _pick(row, "explanationHi", "explanation_hi"),
        "subject": str(subject).strip() if subject else None,
        "chapter": str(chapter).strip() if chapter else None,
        "topic": str(topic).strip() if topic else None,
        "difficulty": str(_pick(row, "difficulty", "level") or "medium").lower(),
        "question_type": str(_pick(row, "question_type", "type") or "single_choice").lower(),
        "marks": _pick(row, "marks", "mark"),
        "negative_marks": _pick(row, "negative_marks", "negativeMark", "penalty"),
        "year": _pick(row, "year"),
        "source": source,
        "image_url": _pick(row, "image", "image_url", "imageUrl"),
        "tags": tags,
        "is_pyq": is_pyq,
        "skip_duplicates": True,
    }


def _rows_from_json(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        for key in ("questions", "items", "data", "rows", "questionBank"):
            if isinstance(payload.get(key), list):
                return payload[key]
        # a dict of id → question
        values = [v for v in payload.values() if isinstance(v, dict)]
        return values
    return payload if isinstance(payload, list) else []


def _rows_from_csv(raw: str) -> List[Dict[str, Any]]:
    text = raw.lstrip("\ufeff")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    return [dict(row) for row in csv.DictReader(io.StringIO(text), dialect=dialect)]


_Q_BLOCK = re.compile(
    r"(?:^|\n)\s*(?:Q\.?\s*)?(\d{1,4})[).\s]\s*(.+?)(?=(?:\n\s*(?:Q\.?\s*)?\d{1,4}[).\s])|\Z)",
    re.S,
)


def _rows_from_text(raw: str) -> List[Dict[str, Any]]:
    """Best-effort parse of a pasted question paper.

    Recognises the common layout::

        Q1. Question text
        (A) option   (B) option   (C) option   (D) option
        Answer: B
        Explanation: … (optional)

    Anything that does not match is skipped rather than guessed at.
    """
    rows: List[Dict[str, Any]] = []
    for match in _Q_BLOCK.finditer(raw):
        block = match.group(2)
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        answer_line = next((ln for ln in lines if re.match(r"(?i)^(ans|answer)", ln)), "")
        if not answer_line:
            continue
        answer = re.sub(r"(?i)^(ans|answer)\s*[:.\-]?\s*", "", answer_line).strip()
        explanation = ""
        exp_line = next((ln for ln in lines if re.match(r"(?i)^(explanation|solution)", ln)), "")
        if exp_line:
            explanation = re.sub(r"(?i)^(explanation|solution)\s*[:.\-]?\s*", "", exp_line).strip()

        body = [ln for ln in lines if ln not in (answer_line, exp_line)]
        option_lines = [ln for ln in body if re.match(r"^[\(\[]?[A-Da-d][\)\].:\-]", ln)]
        if len(option_lines) < 2:
            # one line carrying all four options
            joined = " ".join(body[1:])
            found = re.findall(r"[\(\[]([A-Da-d])[\)\]]\s*([^\(\[]+)", joined)
            options = [{"option_key": k.upper(), "option_text": v.strip()} for k, v in found]
            stem = body[0]
        else:
            options = []
            for line in option_lines:
                parts = re.match(r"^[\(\[]?([A-Da-d])[\)\].:\-]\s*(.+)$", line)
                if parts:
                    options.append(
                        {"option_key": parts.group(1).upper(), "option_text": parts.group(2).strip()}
                    )
            stem = next((ln for ln in body if ln not in option_lines), body[0])
        if len(options) < 2:
            continue
        rows.append(
            {
                "question_text": stem,
                "options": options,
                "correct_answer": answer[:8],
                "explanation": explanation,
                "question_type": "single_choice",
                "skip_duplicates": True,
            }
        )
    return rows


def _parse_upload(file) -> Tuple[List[Dict[str, Any]], str, Optional[str]]:
    name = (file.filename or "").lower()
    raw_bytes = file.read(MAX_UPLOAD + 1)
    if not raw_bytes:
        return [], "", "The file is empty"
    if len(raw_bytes) > MAX_UPLOAD:
        return [], "", "File is larger than 25 MB — split it, or import the parts one by one"

    text = raw_bytes.decode("utf-8", errors="replace")

    if name.endswith((".json", ".jsonl")) or text.lstrip()[:1] in ("[", "{"):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            return [], "json", f"Invalid JSON: {exc.msg} (line {exc.lineno})"
        rows = _rows_from_json(payload)
        source = "json"
    elif name.endswith((".csv", ".tsv")):
        rows = _rows_from_csv(text)
        source = "csv"
    else:
        rows = _rows_from_text(text)
        source = "text"
        if not rows:
            rows = _rows_from_csv(text)
            source = "csv" if rows else "text"

    if not rows:
        return [], source, (
            "No questions found in that file. JSON packs (a list of questions), CSV "
            "with question_text/option_a…columns, or a pasted paper with Q1/Answer: "
            "lines are supported."
        )
    return rows[:MAX_ROWS], source, None




# ══════════════════════════════════════════════════════════════════════
# Bulk writer
# ══════════════════════════════════════════════════════════════════════
#
# The row-at-a-time importer is right for hand-typed corrections but far too
# slow for a 700-question pack: every row costs several round-trips to the
# database, which on a hosted Postgres means minutes for one file — long enough
# to hit a request timeout. This writer resolves taxonomy once, checks
# duplicates in one query per chunk, and inserts in batches of 200 (questions
# first, then their options), which turns ~11 minutes into a couple of seconds.


def _bulk_import(rows: List[Dict[str, Any]], user_id: Optional[int]) -> Dict[str, Any]:
    from app.models.chapter import Chapter
    from app.models.question import Question, QuestionOption
    from app.models.subject import Subject
    from app.services.question_hash import compute_question_hash

    created_ids: List[int] = []
    duplicates = 0
    errors: List[Dict[str, Any]] = []

    # ── taxonomy, resolved once ────────────────────────────────────────
    subjects: Dict[str, int] = {
        (s.name or "").strip().lower(): s.id for s in Subject.query.all()
    }
    chapters: Dict[Tuple[int, str], int] = {
        (c.subject_id, (c.name or "").strip().lower()): c.id for c in Chapter.query.all()
    }

    for row in rows:
        name = (row.get("subject") or "").strip()
        key = name.lower()
        if key and key not in subjects:
            subject = Subject(name=name[:200], is_active=True)
            db.session.add(subject)
            db.session.flush()
            subjects[key] = subject.id
    for row in rows:
        chapter_name = (row.get("chapter") or "").strip()
        subject_key = (row.get("subject") or "").strip().lower()
        subject_id = subjects.get(subject_key)
        if chapter_name and subject_id:
            key = (subject_id, chapter_name.lower())
            if key not in chapters:
                chapter = Chapter(
                    subject_id=subject_id, name=chapter_name[:200], is_active=True
                )
                db.session.add(chapter)
                db.session.flush()
                chapters[key] = chapter.id

    # ── prepare rows (hash + payload), skipping duplicates ─────────────
    prepared: List[Tuple[str, Dict[str, Any], List[Dict[str, str]]]] = []
    for index, row in enumerate(rows):
        try:
            text = str(row["question_text"]).strip()[:20000]
            options = row.get("options") or []
            qtype = (row.get("question_type") or "single_choice").lower()
            if qtype not in QUESTION_TYPES:
                qtype = "single_choice"
            correct = str(row.get("correct_answer") or "").strip()
            digest = compute_question_hash(
                text, [{"option_text": o["option_text"]} for o in options], qtype, correct
            )
            prepared.append((digest or f"row-{index}", row, options))
        except Exception as exc:  # noqa: BLE001
            if len(errors) < 5:
                logger.exception("question file row %s failed: %s", index + 1, exc)
            errors.append({"row": index + 1, "error": f"could not read this row: {exc}"[:200]})

    hashes = [h for h, _, _ in prepared if h and not h.startswith("row-")]
    existing: set = set()
    for start in range(0, len(hashes), 400):
        chunk = hashes[start : start + 400]
        existing.update(
            row[0]
            for row in db.session.query(Question.content_hash)
            .filter(Question.content_hash.in_(chunk))
            .all()
            if row[0]
        )

    seen_here: set = set()
    fresh: List[Tuple[Dict[str, Any], List[Dict[str, str]]]] = []
    for digest, row, options in prepared:
        if digest in existing or digest in seen_here:
            duplicates += 1
            continue
        seen_here.add(digest)
        fresh.append(({**row, "_digest": digest}, options))

    # ── batched inserts ───────────────────────────────────────────────
    BATCH = 200
    for start in range(0, len(fresh), BATCH):
        batch = fresh[start : start + BATCH]
        objects: List[Question] = []
        for row, _options in batch:
            subject_id = subjects.get((row.get("subject") or "").strip().lower())
            chapter_id = None
            if subject_id and (row.get("chapter") or "").strip():
                chapter_id = chapters.get((subject_id, row["chapter"].strip().lower()))
            tags = row.get("tags")
            if isinstance(tags, list):
                tags = ",".join(str(t) for t in tags)
            question = Question(
                subject_id=subject_id,
                chapter_id=chapter_id,
                content_hash=row.get("_digest"),
                version=1,
                question_type=(row.get("question_type") or "single_choice")[:32],
                difficulty=(row.get("difficulty") or "medium")[:16],
                question_text=row["question_text"],
                question_text_hi=(row.get("question_text_hi") or None),
                explanation=(row.get("explanation") or None),
                explanation_hi=(row.get("explanation_hi") or None),
                image_url=(row.get("image_url") or None),
                marks=float(row.get("marks") or 1),
                negative_marks=float(row.get("negative_marks") or 0),
                correct_answer=str(row.get("correct_answer") or "")[:64],
                tags=(tags or None),
                language="en",
                status="active",
                is_active=True,
                year=int(row["year"]) if str(row.get("year") or "").isdigit() else None,
                source=(row.get("source") or None),
                is_pyq=bool(row.get("is_pyq")),
                is_book=False,
                is_practice=True,
                is_favorite=False,
                created_by=user_id,
            )
            objects.append(question)
        db.session.add_all(objects)
        db.session.flush()

        option_objects: List[QuestionOption] = []
        for question, (_row, options) in zip(objects, batch):
            for order, option in enumerate(options[:8]):
                option_objects.append(
                    QuestionOption(
                        question_id=question.id,
                        option_key=str(option.get("option_key") or "A")[:8],
                        option_text=str(option.get("option_text") or "")[:20000],
                        order_index=order,
                    )
                )
        if option_objects:
            db.session.add_all(option_objects)

        created_ids.extend(q.id for q in objects)
        db.session.commit()

    logger.info(
        "bulk import rows=%s created=%s duplicates=%s errors=%s",
        len(rows),
        len(created_ids),
        duplicates,
        len(errors),
    )
    return {
        "created_ids": created_ids,
        "success_count": len(created_ids),
        "duplicate_count": duplicates,
        "error_count": len(errors),
        "errors": errors,
    }


# ══════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════


def _api_base() -> str:
    root = request.url_root.rstrip("/")
    if root.startswith("http://") and "localhost" not in root and "127.0.0.1" not in root:
        root = "https://" + root[len("http://") :]
    return root


@question_files_bp.post("")
@roles_required("admin", "teacher")
def upload_question_file():
    """Upload a bank, import it, and keep the file for later re-use."""
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "no_file", "message": "Choose a .json, .csv or text file"}), 400

    original_bytes = b""
    try:
        original_bytes = file.stream.read()
        file.stream.seek(0)
    except Exception:  # noqa: BLE001
        original_bytes = b""

    raw_rows, source_type, error = _parse_upload(file)
    if error:
        return jsonify({"error": "unreadable_file", "message": error}), 400

    rows: List[Dict[str, Any]] = []
    skipped = 0
    for row in raw_rows:
        normalised = _normalise_row(row)
        if normalised is None:
            skipped += 1
            continue
        rows.append(normalised)
    if not rows:
        return (
            jsonify(
                {
                    "error": "no_questions",
                    "message": "Rows were found but none had a question text and an answer.",
                    "skipped": skipped,
                }
            ),
            400,
        )

    claims = get_jwt() or {}
    try:
        user_id = int(claims.get("sub"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        user_id = None

    # Raw file, kept so it can be re-imported or audited later
    stored = StoredFile(
        owner_id=user_id,
        kind="question_file",
        filename=(file.filename or "questions")[:200],
        mime="application/json" if source_type == "json" else "text/plain",
        size_bytes=len(original_bytes),
        data=original_bytes or b"",
    )
    db.session.add(stored)

    result = _bulk_import(rows, user_id)

    record = QuestionFile(
        owner_id=user_id,
        stored_file_id=stored.id,
        filename=(file.filename or "questions")[:200],
        source_type=source_type,
        total_rows=len(raw_rows),
        imported_count=int(result.get("success_count") or 0),
        duplicate_count=int(result.get("duplicate_count") or 0),
        error_count=int(result.get("error_count") or 0) + skipped,
        status="imported",
    )
    record.set_question_ids(result.get("created_ids") or [])
    record.set_subjects(
        [r.get("subject") for r in rows if r.get("subject")]
    )
    record.set_chapters([r.get("chapter") for r in rows if r.get("chapter")])
    record.set_errors(result.get("errors") or [])
    db.session.add(record)
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("question file commit failed")
        return jsonify({"error": "could_not_save", "message": "Import ran but saving the file record failed"}), 500

    logger.info(
        "question file %s imported=%s duplicates=%s errors=%s",
        record.filename,
        record.imported_count,
        record.duplicate_count,
        record.error_count,
    )
    return (
        jsonify(
            {
                "message": (
                    f"{record.imported_count} questions imported"
                    + (f", {record.duplicate_count} already existed" if record.duplicate_count else "")
                ),
                "item": record.to_dict(),
                "skipped_rows": skipped,
            }
        ),
        201,
    )


@question_files_bp.get("")
@roles_required("admin", "teacher")
def list_question_files():
    items = QuestionFile.query.order_by(QuestionFile.id.desc()).limit(100).all()
    return jsonify({"items": [i.to_dict() for i in items], "total": len(items)})


@question_files_bp.get("/<file_id>")
@roles_required("admin", "teacher")
def question_file_detail(file_id: str):
    record = QuestionFile.query.get(file_id)
    if record is None:
        return jsonify({"error": "Not found"}), 404

    ids = record.question_ids[:5]
    samples = []
    if ids:
        for question in Question.query.filter(Question.id.in_(ids)).all():
            data = question.to_dict(include_answer=True)
            samples.append(
                {
                    "id": data.get("id"),
                    "question_text": (data.get("question_text") or "")[:300],
                    "options": [
                        {"key": o.get("option_key"), "text": (o.get("option_text") or "")[:160]}
                        for o in (data.get("options") or [])
                    ],
                    "correct_answer": data.get("correct_answer"),
                    "chapter": data.get("chapter_name") or data.get("chapter"),
                }
            )
    return jsonify({"item": record.to_dict(), "samples": samples})


@question_files_bp.delete("/<file_id>")
@roles_required("admin", "teacher")
def delete_question_file(file_id: str):
    record = QuestionFile.query.get(file_id)
    if record is None:
        return jsonify({"error": "Not found"}), 404
    if request.args.get("purge_questions") in ("1", "true", "yes"):
        ids = record.question_ids
        if ids:
            Question.query.filter(Question.id.in_(ids)).delete(synchronize_session=False)
    if record.stored_file_id:
        StoredFile.query.filter_by(id=record.stored_file_id).delete()
    db.session.delete(record)
    db.session.commit()
    return jsonify({"deleted": True, "id": file_id})


# ══════════════════════════════════════════════════════════════════════════
#  Series builder — one file in, MANY numbered tests out
#  ---------------------------------------------------------------
#  A single question bank is useless if the learner has to sit a 683-question
#  paper. This turns a file into a run of small tests — "English Test 12",
#  "English Test 13", … — each 25 questions / 21 minutes / 25 marks, with one
#  global running number (the SERIES #N badge) so the wall of cards looks and
#  behaves like the reference platform.
# ══════════════════════════════════════════════════════════════════════════


def _subject_of(record: QuestionFile) -> str:
    try:
        subjects = json.loads(record.subjects_json or "[]")
    except (TypeError, ValueError):
        subjects = []
    if isinstance(subjects, list):
        for name in subjects:
            if isinstance(name, str) and name.strip():
                return name.strip()
    stem = (record.filename or "test").rsplit(".", 1)[0]
    for word in ("english", "mathematics", "maths", "physics", "chemistry", "biology", "raga", "reasoning", "gk"):
        if word in stem.lower():
            return word.capitalize() if word != "gk" else "GK"
    return stem[:24].title() or "Test"


def _next_series_no(parent_id: Optional[int] = None) -> int:
    """Running number for the SERIES #N badge, scoped to one exam's tests.

    Inside an exam the badge restarts at #1 — so "Agniveer Vayu" shows its own
    #1… and a different exam shows #1… too, exactly like a fresh test series.
    Without a parent it falls back to a global count.
    """
    query = Exam.query.filter(Exam.rules_json.isnot(None))
    if parent_id is not None:
        query = query.filter(Exam.parent_exam_id == parent_id)
    highest = 0
    for exam in query.all():
        try:
            rules = json.loads(exam.rules_json or "{}")
        except (TypeError, ValueError):
            continue
        series = rules.get("series") if isinstance(rules, dict) else None
        if not isinstance(series, dict):
            continue
        try:
            highest = max(highest, int(series.get("no") or 0))
        except (TypeError, ValueError):
            continue
    return highest + 1


def _parse_series_options(data: Dict[str, Any]) -> Dict[str, Any]:
    def _int(key, default, minimum=0, maximum=500):
        try:
            value = int(data.get(key) if data.get(key) is not None else default)
        except (TypeError, ValueError):
            value = default
        return max(minimum, min(maximum, value))

    per_test = _int("per_test", 25, 1, 200)
    try:
        marks = float(data.get("marks") if data.get("marks") is not None else per_test)
    except (TypeError, ValueError):
        marks = float(per_test)
    try:
        negative = float(data.get("negative_marks") if data.get("negative_marks") is not None else 0.25)
    except (TypeError, ValueError):
        negative = 0.25
    return {
        "per_test": per_test,
        "tests_per_file": _int("tests_per_file", 0, 0, 500),  # 0 = as many as the pool allows
        "duration_minutes": _int("duration_minutes", 21, 1, 300),
        "marks": marks,
        "negative_marks": negative,
        "status": data.get("status") if data.get("status") in ("draft", "published") else "published",
        "shuffle": bool(data.get("shuffle", True)),
        "exam_mode": data.get("exam_mode") if data.get("exam_mode") in ("mock", "practice", "pyq", "sectional") else "mock",
        "start_no": _int("start_no", 0, 0, 100000),
        "parent_id": data.get("parent_id") or data.get("exam_id") or None,
        "parent_title": (str(data.get("parent_title") or "")).strip()[:200],
        "parent_status": data.get("parent_status") if data.get("parent_status") in ("draft", "published") else "published",
    }


def _resolve_parent_exam(opts: Dict[str, Any], created_by: Optional[int]) -> Tuple[Optional[int], Optional[Dict[str, Any]]]:
    """Work out which EXAM the generated tests belong to.

    Returns (parent_id, error). Either an existing exam id was sent, or a title
    was sent and we create that exam (a published container with no questions of
    its own). Without either, tests stay top-level — but the UI always asks.
    """
    raw = opts.get("parent_id")
    if raw not in (None, "", 0, "0"):
        try:
            parent_id = int(raw)
        except (TypeError, ValueError):
            return None, {"error": "bad_parent", "message": "Exam id galat hai."}
        parent = db.session.get(Exam, parent_id)
        if parent is None:
            return None, {"error": "unknown_exam", "message": "Wo exam nahi mila."}
        if (parent.parent_exam_id or None) is not None:
            return None, {
                "error": "nested",
                "message": "Ye khud ek test hai — tests ko exam ke andar hi daalo, test ke andar nahi.",
            }
        return parent_id, None

    title = opts.get("parent_title") or ""
    if title:
        parent = Exam(
            title=title[:255],
            description=f"{title} — online test series",
            exam_mode="mock",
            status=opts.get("parent_status") or "published",
            duration_seconds=0,
            created_by=created_by,
            total_questions=0,
            total_marks=0.0,
        )
        db.session.add(parent)
        db.session.flush()
        return parent.id, None

    return None, None


def _build_series_for_file(
    record: QuestionFile,
    opts: Dict[str, Any],
    created_by: Optional[int],
    start_no: int,
    parent_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Slice one file's questions into tests. Returns a report dict."""
    report = {"file": record.filename, "subject": _subject_of(record), "created": [], "skipped": None}

    ids = record.question_ids
    if not ids:
        report["skipped"] = "no questions imported from this file"
        return report

    available = [q.id for q in Question.query.filter(Question.id.in_(ids)).all()]
    if not available:
        report["skipped"] = "the questions from this file were deleted"
        return report

    pool = list(available)
    if opts["shuffle"]:
        random.shuffle(pool)

    per_test = opts["per_test"]
    how_many = len(pool) // per_test
    if opts["tests_per_file"]:
        how_many = min(how_many, opts["tests_per_file"])
    if how_many < 1:
        report["skipped"] = f"needs at least {per_test} questions, file has {len(pool)}"
        return report

    subject = report["subject"]
    no = start_no
    for index in range(how_many):
        chunk = pool[index * per_test : (index + 1) * per_test]
        exam = Exam(
            title=f"{subject} Test {no}"[:255],
            description=f"Series test #{no} — {per_test} questions · {subject}",
            exam_mode=opts["exam_mode"],
            status=opts["status"],
            duration_seconds=max(60, opts["duration_minutes"] * 60),
            default_marks=opts["marks"],
            default_negative_marks=opts["negative_marks"],
            shuffle_questions=False,  # already shuffled when slicing
            shuffle_options=True,
            parent_exam_id=parent_id,
            created_by=created_by,
            total_questions=0,
            total_marks=0.0,
        )
        # No DB migration needed: series metadata rides in rules_json.
        exam.set_rules(
            {
                "series": {
                    "no": no,
                    "subject": subject,
                    "file_id": record.id,
                    "per_test": per_test,
                    "duration_minutes": opts["duration_minutes"],
                }
            }
        )
        db.session.add(exam)
        db.session.flush()

        for order, qid in enumerate(chunk):
            db.session.add(
                ExamQuestion(
                    exam_id=exam.id,
                    question_id=qid,
                    order_index=order,
                    marks=opts["marks"],
                    negative_marks=opts["negative_marks"],
                )
            )
        _recount(exam)

        report["created"].append(
            {"exam_id": exam.id, "series_no": no, "title": exam.title, "questions": len(chunk)}
        )
        no += 1

    return report


@question_files_bp.post("/series")
@roles_required("admin")
def build_series():
    """Turn one or more uploaded files into a numbered run of tests.

    Body (all optional)::

        {
          "file_ids": ["abc", "def"],     // default: every imported file
          "per_test": 25,
          "tests_per_file": 0,            // 0 = as many full tests as the pool allows
          "duration_minutes": 21,
          "marks": 25,
          "negative_marks": 0.25,
          "status": "published",
          "exam_mode": "mock",
          "shuffle": true,
          "start_no": 0                   // 0 = continue from the last series number
        }

    Response::

        {"created": 112, "series": [...], "files": [{"file":..., "created":[...],
          "skipped": null}], "next_no": 113}
    """
    data = request.get_json(silent=True) or {}
    opts = _parse_series_options(data)

    try:
        created_by_early = int((get_jwt() or {}).get("sub"))
    except (TypeError, ValueError):
        created_by_early = None

    parent_id, parent_error = _resolve_parent_exam(opts, created_by_early)
    if parent_error:
        db.session.rollback()
        return jsonify(parent_error), 400

    wanted_ids = data.get("file_ids") or []
    if isinstance(wanted_ids, str):
        wanted_ids = [wanted_ids]
    if wanted_ids:
        files = QuestionFile.query.filter(QuestionFile.id.in_([str(f) for f in wanted_ids])).all()
    else:
        files = QuestionFile.query.order_by(QuestionFile.created_at.asc()).all()

    if not files:
        return jsonify({"error": "no_files", "message": "Pehle question file upload karo."}), 400

    try:
        created_by = int((get_jwt() or {}).get("sub"))
    except (TypeError, ValueError):
        created_by = None

    next_no = opts["start_no"] or _next_series_no(parent_id)
    reports: List[Dict[str, Any]] = []
    made = 0
    try:
        for record in files:
            report = _build_series_for_file(record, opts, created_by, next_no, parent_id)
            reports.append(report)
            made += len(report["created"])
            next_no += len(report["created"])
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("series build failed")
        return jsonify({"error": "could_not_build", "message": "Series banate waqt error aaya."}), 500

    flat = [item for report in reports for item in report["created"]]
    return (
        jsonify(
            {
                "message": f"{made} tests ban gaye (ab next series number #{next_no}).",
                "created": made,
                "series": flat,
                "files": reports,
                "next_no": next_no,
                "parent_exam_id": parent_id,
            }
        ),
        201,
    )


@question_files_bp.post("/<file_id>/series")
@roles_required("admin")
def build_series_from_file(file_id: str):
    """Same as above, scoped to one file (the per-card button in the admin UI)."""
    record = QuestionFile.query.get(file_id)
    if record is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    opts = _parse_series_options(data)
    try:
        created_by = int((get_jwt() or {}).get("sub"))
    except (TypeError, ValueError):
        created_by = None

    parent_id, parent_error = _resolve_parent_exam(opts, created_by)
    if parent_error:
        db.session.rollback()
        return jsonify(parent_error), 400

    next_no = opts["start_no"] or _next_series_no(parent_id)
    try:
        report = _build_series_for_file(record, opts, created_by, next_no, parent_id)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("series build failed file=%s", file_id)
        return jsonify({"error": "could_not_build", "message": "Series banate waqt error aaya."}), 500

    made = len(report["created"])
    if made == 0:
        return jsonify({"error": "nothing_to_build", "message": report["skipped"]}), 400
    return (
        jsonify(
            {
                "message": f"{made} tests ban gaye — {report['subject']} Test {next_no} se.",
                "created": made,
                "series": report["created"],
                "files": [report],
                "next_no": next_no + made,
                "parent_exam_id": parent_id,
            }
        ),
        201,
    )


def _recount(exam: Exam) -> None:
    rows = ExamQuestion.query.filter_by(exam_id=exam.id).all()
    exam.total_questions = len(rows)
    exam.total_marks = float(sum((r.marks or 0) for r in rows)) or float(len(rows))


@question_files_bp.post("/<file_id>/exam")
@roles_required("admin", "teacher")
def build_exam_from_file(file_id: str):
    """Create a test out of an uploaded file — or top up an existing one.

    Body::

        {
          "title": "Airforce XY — Physics PYQ 1",
          "question_count": 25,          // 0 / omitted = every question in the file
          "duration_minutes": 30,
          "marks": 1, "negative_marks": 0.25,
          "exam_id": 12,                 // optional: append to this exam instead
          "shuffle": true, "status": "published"
        }
    """
    record = QuestionFile.query.get(file_id)
    if record is None:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}
    ids = record.question_ids
    if not ids:
        return (
            jsonify(
                {
                    "error": "empty_file",
                    "message": "This file has no imported questions — upload it again.",
                }
            ),
            400,
        )

    existing = Question.query.filter(Question.id.in_(ids)).all()
    available = [q.id for q in existing]
    if not available:
        return jsonify({"error": "questions_missing", "message": "The questions from this file were deleted."}), 400

    try:
        wanted = int(data.get("question_count") or 0)
    except (TypeError, ValueError):
        wanted = 0
    if wanted <= 0 or wanted > len(available):
        wanted = len(available)

    pool = list(available)
    if data.get("shuffle", True):
        random.shuffle(pool)
    chosen = pool[:wanted]

    try:
        marks = float(data.get("marks") or 1)
    except (TypeError, ValueError):
        marks = 1.0
    try:
        negative = float(data.get("negative_marks") if data.get("negative_marks") is not None else 0.25)
    except (TypeError, ValueError):
        negative = 0.25
    try:
        duration_minutes = int(data.get("duration_minutes") or max(5, wanted))
    except (TypeError, ValueError):
        duration_minutes = max(5, wanted)

    exam_id = data.get("exam_id")
    if exam_id not in (None, "", 0):
        exam = db.session.get(Exam, int(exam_id))
        if exam is None:
            return jsonify({"error": "unknown_exam", "message": "That exam does not exist"}), 404
        created = False
    else:
        title = (data.get("title") or f"{record.filename} — test")[:255]
        status = data.get("status") if data.get("status") in ("draft", "published") else "published"
        try:
            created_by = int((get_jwt() or {}).get("sub"))
        except (TypeError, ValueError):
            created_by = None
        exam = Exam(
            title=title,
            description=(data.get("description") or f"Auto-built from {record.filename}")[:2000],
            exam_mode="mock",
            status=status,
            duration_seconds=max(60, duration_minutes * 60),
            default_marks=marks,
            default_negative_marks=negative,
            shuffle_questions=bool(data.get("shuffle", True)),
            shuffle_options=True,
            created_by=created_by,
            total_questions=0,
            total_marks=0.0,
        )
        db.session.add(exam)
        db.session.flush()
        created = True

    # Skip questions already mapped into this exam
    already = {
        row.question_id
        for row in ExamQuestion.query.filter_by(exam_id=exam.id).all()
    }
    start_order = len(already)
    added = 0
    for qid in chosen:
        if qid in already:
            continue
        db.session.add(
            ExamQuestion(
                exam_id=exam.id,
                question_id=qid,
                order_index=start_order + added,
                marks=marks,
                negative_marks=negative,
            )
        )
        added += 1

    _recount(exam)
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("build exam from file failed file=%s", file_id)
        return jsonify({"error": "could_not_build", "message": "Could not build the test"}), 500

    return (
        jsonify(
            {
                "message": (
                    f"{added} questions added to “{exam.title}”"
                    if not created
                    else f"Test “{exam.title}” created with {added} questions"
                ),
                "added": added,
                "exam": exam.to_dict(),
                "created": created,
            }
        ),
        201 if created else 200,
    )
