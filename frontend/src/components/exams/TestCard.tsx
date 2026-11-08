/**
 * TestCard — one TEST inside an exam.
 *
 * Used on the exam page (the screen you land on after tapping an exam card) and
 * anywhere else a single test is listed. The card tells the learner three
 * things in one glance: which series number it is, what it costs in time and
 * marks, and whether they should START or RESUME it.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  RotateCcw,
  Sigma,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Exam } from "@/lib/api";
import { cn } from "@/lib/utils";

export const TESTS_PER_PAGE = 12;

export function isRunning(exam: Exam) {
  return Boolean(exam.attempt?.in_progress);
}

export function isDone(exam: Exam) {
  return Boolean(exam.attempt && !exam.attempt.in_progress);
}

export function isFresh(exam: Exam) {
  return !exam.attempt;
}

/** "Half-done — 7 of 25 answered, 14 min left. Resume anytime." */
export function statusLine(exam: Exam) {
  const attempt = exam.attempt;
  if (!attempt) return "Never attempted — fresh questions waiting";
  if (attempt.in_progress) {
    const left = attempt.expires_at
      ? Math.max(0, Math.round((new Date(attempt.expires_at).getTime() - Date.now()) / 60000))
      : null;
    return `Half-done — ${attempt.answered} of ${exam.total_questions} answered${
      left !== null ? `, ${left} min left` : ""
    }. Resume anytime.`;
  }
  return `Completed — ${attempt.score} of ${attempt.max_score} marks (${Math.round(
    attempt.percentage,
  )}%). You can re-take it.`;
}

export function subjectOf(exam: Exam) {
  return exam.subject || exam.title.replace(/\s*Test\s*\d+.*$/i, "").trim() || "Test";
}

export function TestCard({
  exam,
  onStart,
  starting,
}: {
  exam: Exam;
  onStart: (exam: Exam) => void;
  starting: number | null;
}) {
  const navigate = useNavigate();
  const seriesNo = exam.series_no ?? null;
  const inProgress = isRunning(exam);
  const done = isDone(exam);
  const isNew =
    !exam.created_at || Date.now() - new Date(exam.created_at).getTime() < 7 * 24 * 3600 * 1000;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        inProgress
          ? "border-amber-400/70"
          : done
            ? "border-emerald-500/40"
            : "hover:border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-background">
          {seriesNo ? `Series #${seriesNo}` : exam.exam_mode}
        </span>
        {inProgress ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            In progress
          </span>
        ) : done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Done
          </span>
        ) : isNew ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">
            New
          </span>
        ) : null}
      </div>

      <h3 className="mt-2.5 text-[15px] font-extrabold leading-snug tracking-tight">{exam.title}</h3>

      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          {subjectOf(exam)} {exam.total_questions}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <BookOpenCheck className="h-3 w-3" /> {exam.total_questions} Q
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {Math.round((exam.duration_seconds || 0) / 60)} min
        </span>
        <span className="inline-flex items-center gap-1">
          <Trophy className="h-3 w-3" /> {exam.total_marks} marks
        </span>
        <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
          <Sigma className="h-3 w-3" /> Practice
        </span>
      </div>

      <p
        className={cn(
          "mt-3 flex-1 text-[11.5px] leading-relaxed",
          inProgress ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {statusLine(exam)}
      </p>

      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        {inProgress ? (
          <button
            onClick={() => onStart(exam)}
            disabled={starting === exam.id}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-[12px] font-bold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            {starting === exam.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Resume test
          </button>
        ) : done ? (
          <>
            <button
              onClick={() =>
                navigate({
                  to: "/results/$attemptId",
                  params: { attemptId: String(exam.attempt!.id) },
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white transition hover:brightness-105"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> View result
            </button>
            <button
              onClick={() => onStart(exam)}
              disabled={starting === exam.id}
              title="Re-take this test"
              className="inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-muted-foreground transition hover:bg-muted disabled:opacity-60"
            >
              {starting === exam.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </button>
          </>
        ) : (
          <button
            onClick={() => onStart(exam)}
            disabled={starting === exam.id}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {starting === exam.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Start test
          </button>
        )}

        <Link
          to="/exams/$examId"
          params={{ examId: String(exam.id) }}
          className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-[11.5px] font-semibold text-muted-foreground transition hover:bg-muted"
        >
          Info <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

export function PageNumbers({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const shown = new Set<number>([1, pages, page, page - 1, page + 1, page - 2, page + 2]);
  const list = Array.from(shown)
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm disabled:opacity-40"
        aria-label="Previous page"
      >
        ‹
      </button>
      {list.map((n, index) => {
        const gap = index > 0 && n - list[index - 1] > 1;
        return (
          <span key={n} className="flex items-center gap-1">
            {gap && <span className="px-0.5 text-xs text-muted-foreground">…</span>}
            <button
              onClick={() => onChange(n)}
              className={cn(
                "h-8 min-w-8 rounded-lg px-2 text-[12px] font-bold transition",
                n === page
                  ? "bg-foreground text-background"
                  : "border text-muted-foreground hover:bg-muted",
              )}
            >
              {n}
            </button>
          </span>
        );
      })}
      <button
        onClick={() => onChange(Math.min(pages, page + 1))}
        disabled={page === pages}
        className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm disabled:opacity-40"
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}
