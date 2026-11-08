/**
 * Mock tests — one card per TEST, exactly like the reference platform.
 *
 * Every card is a single test (25 Q · 21 min · 25 marks), grouped under a
 * running "SERIES #N" badge. Nothing is grouped by subject here — subjects are
 * only a filter chip, because a learner comes to sit *a test*, not to browse a
 * syllabus. Attempts drive the card state:
 *
 *   never attempted → START TEST   ("Never attempted — fresh questions waiting")
 *   half-done       → RESUME TEST  ("Half-done — resume anytime, timer picks up")
 *   submitted       → VIEW RESULT  ("Completed — 18/25, 72%")
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  RotateCcw,
  Search as SearchIcon,
  Sigma,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { examsApi, type Exam } from "@/lib/api";
import { useExamPlayerStore } from "@/stores/examPlayerStore";
import { Loader } from "@/components/Loader";
import { useSlowFlag } from "@/lib/useSlowFlag";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

type Filter = "all" | "new" | "progress" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All tests" },
  { key: "new", label: "Not attempted" },
  { key: "progress", label: "In progress" },
  { key: "done", label: "Completed" },
];

function isLoadingAttempt(exam: Exam) {
  return Boolean(exam.attempt?.in_progress);
}

function isDone(exam: Exam) {
  return Boolean(exam.attempt && !exam.attempt.in_progress);
}

function isFresh(exam: Exam) {
  return !exam.attempt;
}

/** "Half-done — 7 of 25 answered, timer picks up where you left." */
function statusLine(exam: Exam) {
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

function ExamCard({
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
  const subject = exam.subject || exam.title.replace(/\s*Test\s*\d+.*$/i, "").trim() || "Test";
  const inProgress = isLoadingAttempt(exam);
  const done = isDone(exam);
  const fresh = isFresh(exam);
  const isNew =
    !exam.created_at ||
    Date.now() - new Date(exam.created_at).getTime() < 7 * 24 * 3600 * 1000;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        inProgress ? "border-amber-400/70" : done ? "border-emerald-500/40" : "hover:border-primary/40",
      )}
    >
      {/* Top line: series badge + state */}
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

      {/* Title */}
      <h3 className="mt-2.5 text-[15px] font-extrabold leading-snug tracking-tight">
        {exam.title}
      </h3>

      {/* Subject chip with question count, like "English 25" */}
      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          {subject} {exam.total_questions}
        </span>
      </div>

      {/* Facts row */}
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

      {/* Status line */}
      <p
        className={cn(
          "mt-3 flex-1 text-[11.5px] leading-relaxed",
          inProgress ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {statusLine(exam)}
      </p>

      {/* Action */}
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

function PageNumbers({
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

export function ExamsPage() {
  const navigate = useNavigate();
  const loadFromPayload = useExamPlayerStore((s) => s.loadFromPayload);
  const reset = useExamPlayerStore((s) => s.reset);

  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: () => examsApi.listAll("parent_id=null"),
    refetchOnWindowFocus: true,
  });
  const slowLoad = useSlowFlag(isLoading, 3000);

  const items = useMemo(() => data ?? [], [data]);

  const subjects = useMemo(() => {
    const map = new Map<string, number>();
    for (const exam of items) {
      const name = exam.subject || "Other";
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  // Only playable tests count — an exam with no questions is not a test yet,
  // and showing it in the header would make the number disagree with the list.
  const stats = useMemo(() => {
    const playable = items.filter((exam) => (exam.total_questions || 0) > 0);
    return {
      total: playable.length,
      inProgress: playable.filter(isLoadingAttempt).length,
      done: playable.filter(isDone).length,
    };
  }, [items]);

  const processed = useMemo(() => {
    let arr = items.filter((exam) => (exam.total_questions || 0) > 0);
    if (subject !== "all") arr = arr.filter((e) => (e.subject || "Other") === subject);
    if (filter === "new") arr = arr.filter(isFresh);
    if (filter === "progress") arr = arr.filter(isLoadingAttempt);
    if (filter === "done") arr = arr.filter(isDone);
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.subject || "").toLowerCase().includes(q) ||
          String(e.series_no ?? "").includes(q),
      );
    }
    return arr.sort((a, b) => {
      const sa = a.series_no ?? Number.MAX_SAFE_INTEGER;
      const sb = b.series_no ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title);
    });
  }, [items, subject, filter, search]);

  const pages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const shown = processed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = processed.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, processed.length);

  const resetPaging = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const startExam = async (exam: Exam) => {
    setStarting(exam.id);
    setError(null);
    try {
      reset();
      const { attemptsApi } = await import("@/lib/api");
      const payload = await attemptsApi.start(exam.id);
      loadFromPayload(payload);
      navigate({
        to: "/play/$attemptId",
        params: { attemptId: String(payload.attempt.id) },
      });
    } catch (err: any) {
      setError(err?.message || "Test shuru nahi ho paya — dobara try karo.");
    } finally {
      setStarting(null);
    }
  };

  if (isLoading) {
    return slowLoad ? (
      <Loader
        title="Loading tests"
        messages={["Server jaga rahe hain…", "Tests la rahe hain…", "Bas thoda aur…"]}
      />
    ) : (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl animate-in space-y-4 px-4 py-6 fade-in duration-300 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight sm:text-3xl">Mock tests</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {stats.total} tests · {stats.inProgress} in progress · {stats.done} completed
          </p>
        </div>
        {stats.inProgress > 0 && (
          <button
            onClick={() => resetPaging(setFilter)("progress")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-[12px] font-bold text-amber-700 dark:text-amber-400"
          >
            <PlayCircle className="h-3.5 w-3.5" /> Resume unfinished ({stats.inProgress})
          </button>
        )}
      </header>

      {/* Search + filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(e) => resetPaging(setSearch)(e.target.value)}
            placeholder="Search test or series number (e.g. 42)…"
            className="h-10 w-full rounded-xl border bg-muted/40 pl-9 pr-9 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          {search && (
            <button
              onClick={() => resetPaging(setSearch)("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => resetPaging(setSubject)("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition",
              subject === "all"
                ? "bg-foreground text-background"
                : "border text-muted-foreground hover:border-primary/40",
            )}
          >
            All subjects
          </button>
          {subjects.map(([name, count]) => (
            <button
              key={name}
              onClick={() => resetPaging(setSubject)(name)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition",
                subject === name
                  ? "bg-foreground text-background"
                  : "border text-muted-foreground hover:border-primary/40",
              )}
            >
              {name} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => resetPaging(setFilter)(item.key)}
              className={cn(
                "shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition",
                filter === item.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}

      {/* Count line */}
      <p className="text-[11.5px] font-medium text-muted-foreground">
        Showing <span className="font-bold text-foreground">{from}–{to}</span> of{" "}
        <span className="font-bold text-foreground">{processed.length}</span> tests
      </p>

      {/* Cards */}
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center">
          <p className="text-[14px] font-bold">No tests here yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            {filter === "progress"
              ? "Koi adhoora test nahi hai — jo shuru kiya tha wo submit ho chuka hai."
              : filter === "done"
                ? "Abhi koi test complete nahi kiya — pehla test shuru karo."
                : "Is filter par kuch nahi mila. Doosra subject ya filter try karo."}
          </p>
          {(search || subject !== "all" || filter !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setSubject("all");
                setFilter("all");
                setPage(1);
              }}
              className="mt-3 rounded-xl border px-3 py-1.5 text-[12px] font-semibold hover:bg-muted"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((exam) => (
            <ExamCard key={exam.id} exam={exam} onStart={startExam} starting={starting} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <PageNumbers page={safePage} pages={pages} onChange={setPage} />
        <p className="text-[11px] text-muted-foreground">
          Page {safePage} of {pages}
        </p>
      </div>
    </div>
  );
}
