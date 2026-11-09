/**
 * Exam page — level 2 of the exam shelf.
 *
 * Two shapes, decided by the data:
 *
 *   EXAM (has tests inside)  → header + all its test cards, numbered series,
 *                              filters, pagination. This is what opens when a
 *                              learner taps Airforce / SSC CGL.
 *   TEST (a single paper)    → instructions + one big start button, plus the
 *                              result if it has already been attempted.
 *
 * Nothing here is invented: an exam with no tests says so plainly instead of
 * showing placeholder cards.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  PlayCircle,
  RotateCcw,
  Search as SearchIcon,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { attemptsApi, examsApi, type Exam } from "@/lib/api";
import { useExamPlayerStore } from "@/stores/examPlayerStore";
import { Loader } from "@/components/Loader";
import {
  PageNumbers,
  TESTS_PER_PAGE,
  TestCard,
  isDone,
  isRunning,
  subjectOf,
} from "@/components/exams/TestCard";
import { cn } from "@/lib/utils";

type Filter = "all" | "new" | "progress" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All tests" },
  { key: "new", label: "Not attempted" },
  { key: "progress", label: "In progress" },
  { key: "done", label: "Completed" },
];

export function ExamDetailPage() {
  const { examId } = useParams({ from: "/app/exams/$examId" });
  // Arriving from search (?series=12) pre-filters the card list to that test.
  const id = Number(examId);
  const navigate = useNavigate();
  const loadFromPayload = useExamPlayerStore((s) => s.loadFromPayload);
  const reset = useExamPlayerStore((s) => s.reset);

  const { series } = useSearch({ from: "/app/exams/$examId" }) as { series?: string };
  const [search, setSearch] = useState(series ?? "");
  const [subject, setSubject] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const examQuery = useQuery({
    queryKey: ["exam", id],
    queryFn: () => examsApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  const testsQuery = useQuery({
    queryKey: ["exams", "children", id],
    queryFn: () => examsApi.listAll(`parent_id=${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });

  const exam = examQuery.data;
  const tests = useMemo(() => testsQuery.data ?? [], [testsQuery.data]);
  const hasTests = tests.length > 0;

  const subjects = useMemo(() => {
    const map = new Map<string, number>();
    for (const test of tests) map.set(subjectOf(test), (map.get(subjectOf(test)) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [tests]);

  const processed = useMemo(() => {
    let arr = tests.filter((test) => (test.total_questions || 0) > 0);
    if (subject !== "all") arr = arr.filter((test) => subjectOf(test) === subject);
    if (filter === "new") arr = arr.filter((test) => !test.attempt);
    if (filter === "progress") arr = arr.filter(isRunning);
    if (filter === "done") arr = arr.filter(isDone);
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (test) =>
          test.title.toLowerCase().includes(q) ||
          String(test.series_no ?? "").includes(q) ||
          subjectOf(test).toLowerCase().includes(q),
      );
    }
    return arr.sort((a, b) => (a.series_no ?? 1e9) - (b.series_no ?? 1e9));
  }, [tests, subject, filter, search]);

  const pages = Math.max(1, Math.ceil(processed.length / TESTS_PER_PAGE));
  const safePage = Math.min(page, pages);
  const shown = processed.slice((safePage - 1) * TESTS_PER_PAGE, safePage * TESTS_PER_PAGE);
  const from = processed.length === 0 ? 0 : (safePage - 1) * TESTS_PER_PAGE + 1;
  const to = Math.min(safePage * TESTS_PER_PAGE, processed.length);

  const progress = useMemo(
    () => ({
      running: tests.filter(isRunning).length,
      done: tests.filter(isDone).length,
      total: tests.length,
      questions: tests.reduce((sum, t) => sum + (t.total_questions || 0), 0),
    }),
    [tests],
  );

  const startExam = async (target: Exam) => {
    setStarting(target.id);
    setError(null);
    try {
      reset();
      const payload = await attemptsApi.start(target.id);
      loadFromPayload(payload);
      navigate({ to: "/play/$attemptId", params: { attemptId: String(payload.attempt.id) } });
    } catch (err: any) {
      setError(err?.message || "Test shuru nahi ho paya — dobara try karo.");
    } finally {
      setStarting(null);
    }
  };

  if (examQuery.isLoading) return <Loader title="Loading" messages={["Exam khol rahe hain…"]} />;

  if (examQuery.isError || !exam) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[15px] font-bold">Ye exam nahi mila</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Shayad delete ho gaya hai ya link purana hai.
        </p>
        <Link
          to="/exams"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Saare exams
        </Link>
      </div>
    );
  }

  const description = (exam.description || "").trim();
  const isTestItself = !hasTests && (exam.total_questions || 0) > 0;

  return (
    <div className="mx-auto w-full max-w-5xl animate-in space-y-4 px-4 py-6 fade-in duration-300 sm:px-6 sm:py-8">
      <Link
        to="/exams"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Saare exams
      </Link>

      {/* Exam header */}
      <header className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-4 sm:p-5">
        <h1 className="text-[20px] font-extrabold leading-tight tracking-tight sm:text-2xl">
          {exam.title}
        </h1>

        {hasTests && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpenCheck className="h-3.5 w-3.5" /> {progress.total} tests
            </span>
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5" /> {progress.questions.toLocaleString("en-IN")} questions
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {progress.done} completed
            </span>
            {progress.running > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400">
                <PlayCircle className="h-3.5 w-3.5" /> {progress.running} in progress
              </span>
            )}
          </div>
        )}

        {description && (
          <div className="mt-3">
            <p
              className={cn(
                "whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground",
                !showFullDescription && "line-clamp-4",
              )}
            >
              {description}
            </p>
            {description.length > 220 && (
              <button
                onClick={() => setShowFullDescription((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-bold text-primary"
              >
                {showFullDescription ? (
                  <>
                    Kam dikhao <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Poora padho <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}

      {/* ── A single test: instructions + start ────────────────────────── */}
      {isTestItself && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpenCheck className="h-3.5 w-3.5" /> {exam.total_questions} Q
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {Math.round((exam.duration_seconds || 0) / 60)} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5" /> {exam.total_marks} marks
            </span>
            <span>+{exam.default_marks} / −{exam.default_negative_marks} per question</span>
          </div>

          {exam.instructions && (
            <p className="mt-3 whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground">
              {exam.instructions}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => startExam(exam)}
              disabled={starting === exam.id}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {starting === exam.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : exam.attempt?.in_progress ? (
                <PlayCircle className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {exam.attempt?.in_progress ? "Resume test" : "Start test"}
            </button>
            {exam.attempt && !exam.attempt.in_progress && (
              <>
                <button
                  onClick={() =>
                    navigate({
                      to: "/results/$attemptId",
                      params: { attemptId: String(exam.attempt!.id) },
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white"
                >
                  <CheckCircle2 className="h-4 w-4" /> Result dekho
                </button>
                <button
                  onClick={() => startExam(exam)}
                  disabled={starting === exam.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold"
                >
                  <RotateCcw className="h-4 w-4" /> Dobara do
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── An exam: the tests inside it ───────────────────────────────── */}
      {hasTests && (
        <>
          <div className="space-y-2.5">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Test dhundo — naam ya series number (jaise 42)…"
                className="h-10 w-full rounded-xl border bg-muted/40 pl-9 pr-9 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {subjects.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => {
                    setSubject("all");
                    setPage(1);
                  }}
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
                    onClick={() => {
                      setSubject(name);
                      setPage(1);
                    }}
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
            )}

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setFilter(item.key);
                    setPage(1);
                  }}
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

          <p className="text-[11.5px] font-medium text-muted-foreground">
            Showing <span className="font-bold text-foreground">{from}–{to}</span> of{" "}
            <span className="font-bold text-foreground">{processed.length}</span> tests
          </p>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card px-5 py-12 text-center">
              <p className="text-[13.5px] font-bold">Is filter par koi test nahi</p>
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
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((test) => (
                <TestCard key={test.id} exam={test} onStart={startExam} starting={starting} />
              ))}
            </div>
          )}

          <div className="flex flex-col items-center gap-2 pt-2">
            <PageNumbers page={safePage} pages={pages} onChange={setPage} />
            <p className="text-[11px] text-muted-foreground">
              Page {safePage} of {pages}
            </p>
          </div>
        </>
      )}

      {/* Exam with nothing inside yet */}
      {!hasTests && !isTestItself && (
        <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-[14px] font-bold">Is exam ke tests jald hi aayenge</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            Abhi is exam me koi test publish nahi hua. Jaise hi hoga, yahan cards dikhne lagenge.
          </p>
        </div>
      )}
    </div>
  );
}
