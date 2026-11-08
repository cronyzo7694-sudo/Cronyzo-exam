/**
 * Exams — the shelf of EXAM cards.
 *
 * Level 1 of 2. This screen answers one question: "kis exam ki taiyari karni
 * hai?" — Airforce, SSC CHSL, CGL, CPO … Nothing else. Tapping a card opens
 * that exam's tests (level 2). Keeping the split means a learner never has to
 * scroll past 106 test cards to find a different exam, and the shelf can grow to
 * as many exams as we want without the page getting confusing.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  Clock,
  GraduationCap,
  LibraryBig,
  Loader2,
  PlayCircle,
  Search as SearchIcon,
  Shield,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { examsApi, type Exam } from "@/lib/api";
import { useExamPlayerStore } from "@/stores/examPlayerStore";
import { useNavigate } from "@tanstack/react-router";
import { Loader } from "@/components/Loader";
import { useSlowFlag } from "@/lib/useSlowFlag";
import { cn } from "@/lib/utils";

export const EXAM_PAGE_SIZE = 12;

/** Cheap, deterministic icon/colour per exam so cards don't all look alike. */
function examLook(exam: Exam) {
  const t = (exam.title || "").toLowerCase();
  if (/air ?force|agniveer|vayu|navy|army|nda|cds|defence/.test(t))
    return { Icon: Shield, tone: "text-indigo-600 bg-indigo-500/10" };
  if (/ssc|cgl|chsl|cpo|mts|gd/.test(t))
    return { Icon: GraduationCap, tone: "text-blue-600 bg-blue-500/10" };
  if (/bank|ibps|sbi|rbi|po\b|clerk/.test(t))
    return { Icon: LibraryBig, tone: "text-emerald-600 bg-emerald-500/10" };
  return { Icon: BookOpenCheck, tone: "text-violet-600 bg-violet-500/10" };
}

function firstLine(description?: string | null) {
  if (!description) return "";
  const line = description
    .split("\n")
    .map((l) => l.replace(/[━─=_*]+/g, "").trim())
    .find((l) => l.length > 3 && !/^[A-Z\s]+$/.test(l) && !l.includes("🇮🇳"));
  return (line || description.split("\n")[0] || "").slice(0, 140);
}

function ExamCard({
  exam,
  starting,
  onStart,
}: {
  exam: Exam;
  starting: number | null;
  onStart: (exam: Exam) => void;
}) {
  const { Icon, tone } = examLook(exam);
  const tests = exam.test_count ?? 0;
  const questions = exam.question_total || exam.total_questions || 0;
  const progress = exam.progress;
  const donePct = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const playableDirectly = tests === 0 && (exam.total_questions || 0) > 0;

  const navigate = useNavigate();
  const openExam = () => {
    navigate({ to: "/exams/$examId", params: { examId: String(exam.id) } });
  };

  return (
    <article
      // The whole card is tappable — thumbs hit the title, not just the button.
      onClick={openExam}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") openExam();
      }}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-extrabold leading-snug tracking-tight">
            {exam.title}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {firstLine(exam.description) || "Test series"}
          </p>
        </div>
      </div>

      {/* What's inside */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <BookOpenCheck className="h-3 w-3" />
          {tests > 0 ? `${tests} tests` : `${exam.total_questions || 0} Q`}
        </span>
        {questions > 0 && (
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3 w-3" /> {questions.toLocaleString("en-IN")} Q
          </span>
        )}
        {exam.subjects?.length ? <span className="truncate">{exam.subjects.join(" · ")}</span> : null}
      </div>

      {/* Progress */}
      <div className="mt-3 flex-1">
        {progress && progress.total > 0 ? (
          <>
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-muted-foreground">
              <span>
                {progress.completed} of {progress.total} completed
              </span>
              <span>{donePct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(donePct, progress.completed ? 3 : 0)}%` }}
              />
            </div>
            {progress.in_progress > 0 && (
              <p className="mt-1.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-400">
                {progress.in_progress} test{progress.in_progress > 1 ? "s" : ""} adhoore hain — resume
                kar sakte ho
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {tests > 0 ? "Abhi shuru nahi kiya — pehla test try karo." : "Tests jald hi add honge."}
          </p>
        )}
      </div>

      {/* Action */}
      <div className="mt-3 border-t pt-3">
        {playableDirectly ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onStart(exam);
            }}
            disabled={starting === exam.id}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {starting === exam.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Start test
          </button>
        ) : (
          <Link
            to="/exams/$examId"
            params={{ examId: String(exam.id) }}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition",
              progress?.in_progress
                ? "bg-amber-500 text-white hover:brightness-105"
                : "bg-primary text-primary-foreground hover:brightness-110",
            )}
          >
            {progress?.in_progress ? (
              <>
                <PlayCircle className="h-3.5 w-3.5" /> Continue ({progress.in_progress})
              </>
            ) : (
              <>
                Open tests <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Link>
        )}
      </div>
    </article>
  );
}

export function ExamsPage() {
  const navigate = useNavigate();
  const loadFromPayload = useExamPlayerStore((s) => s.loadFromPayload);
  const reset = useExamPlayerStore((s) => s.reset);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Top-level rows only — everything else lives one level down.
  const { data, isLoading } = useQuery({
    queryKey: ["exams", "top-level"],
    queryFn: () => examsApi.listAll("parent_id=null"),
    refetchOnWindowFocus: true,
  });
  const slowLoad = useSlowFlag(isLoading, 3000);

  const exams = useMemo(() => {
    const list = (data || []).filter(
      (exam) => (exam.test_count ?? 0) > 0 || (exam.total_questions || 0) > 0,
    );
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((e) => e.title.toLowerCase().includes(q)) : list;
    return filtered.sort((a, b) => (b.test_count ?? 0) - (a.test_count ?? 0) || a.title.localeCompare(b.title));
  }, [data, search]);

  const totalTests = exams.reduce((sum, e) => sum + (e.test_count ?? 0), 0);

  const startExam = async (exam: Exam) => {
    setStarting(exam.id);
    setError(null);
    try {
      reset();
      const { attemptsApi } = await import("@/lib/api");
      const payload = await attemptsApi.start(exam.id);
      loadFromPayload(payload);
      navigate({ to: "/play/$attemptId", params: { attemptId: String(payload.attempt.id) } });
    } catch (err: any) {
      setError(err?.message || "Test shuru nahi ho paya — dobara try karo.");
    } finally {
      setStarting(null);
    }
  };

  const pages = Math.max(1, Math.ceil(exams.length / EXAM_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const shown = exams.slice((safePage - 1) * EXAM_PAGE_SIZE, safePage * EXAM_PAGE_SIZE);

  if (isLoading) {
    return slowLoad ? (
      <Loader
        title="Loading exams"
        messages={["Server jaga rahe hain…", "Exams la rahe hain…", "Bas thoda aur…"]}
      />
    ) : (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl animate-in space-y-4 px-4 py-6 fade-in duration-300 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight sm:text-3xl">Exams</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {exams.length} exam{exams.length === 1 ? "" : "s"} · {totalTests} tests — pehle exam chuno,
          phir uska test.
        </p>
      </header>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Exam dhundo — Airforce, SSC CGL, CHSL, CPO…"
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

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-[14px] font-bold">Koi exam live nahi hai</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            Jaise hi exam add hoga, uska card yahan aa jayega. Admin → Question Files se files
            upload karke "Series banao" dabao.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((exam) => (
            <ExamCard key={exam.id} exam={exam} starting={starting} onStart={startExam} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="h-8 w-8 rounded-lg border text-sm disabled:opacity-40"
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="text-[11.5px] font-semibold text-muted-foreground">
            Page {safePage} of {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages, safePage + 1))}
            disabled={safePage === pages}
            className="h-8 w-8 rounded-lg border text-sm disabled:opacity-40"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
