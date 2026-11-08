import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { attemptsApi, examsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useExamPlayerStore } from "@/stores/examPlayerStore";
import { useAuthStore } from "@/stores/authStore";
import { useQueryClient } from "@tanstack/react-query";

/* ───────────────────────────────────────────
   Constants & helpers
   ─────────────────────────────────────────── */

const PAGE_SIZE = 10;

function cat(title: string): "full-mock" | "subject" | "chapter" | "topic" {
  const t = (title || "").toLowerCase();
  if (t.includes("full")) return "full-mock";
  if (t.includes("subject test")) return "subject";
  if (t.includes("chapter test")) return "chapter";
  if (t.includes("topic test")) return "topic";
  return "topic";
}

function extractSubject(title: string): string {
  // "Number Analogy - Topic Test" -> "Number Analogy"
  const i = title.indexOf(" - ");
  return i > -1 ? title.substring(0, i) : title;
}

function catIcon(c: string) {
  return c === "full-mock" ? "📝" : c === "subject" ? "🧠" : c === "chapter" ? "📖" : "📘";
}

const TABS = [
  { key: "all", label: "All" },
  { key: "topic", label: "Topic Test" },
  { key: "chapter", label: "Chapter Test" },
  { key: "subject", label: "Subject Test" },
  { key: "full-mock", label: "Full Test" },
] as const;

/* ───────────────────────────────────────────
   Loading skeleton
   ─────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-64 bg-muted rounded-lg animate-pulse" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
          <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
        </div>
        <div className="h-4 w-96 bg-muted rounded animate-pulse" />
      </div>
      {/* Stats skeleton */}
      <div className="flex gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      {/* Cards skeleton */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   Main component
   ─────────────────────────────────────────── */

export function ExamDetailPage() {
  const params = useParams({ strict: false }) as { examId?: string };
  const id = Number(params.examId);
  const navigate = useNavigate();
  const loadFromPayload = useExamPlayerStore((s) => s.loadFromPayload);
  const reset = useExamPlayerStore((s) => s.reset);

  const [starting, setStarting] = useState<string | null>(null);
  // After 3s of "starting", show a richer building animation inside the card
  // (Render free tier can be slow to wake). Keyed by child id.
  const [slowStart, setSlowStart] = useState(false);
  useEffect(() => {
    if (!starting) { setSlowStart(false); return; }
    const t = setTimeout(() => setSlowStart(true), 3000);
    return () => clearTimeout(t);
  }, [starting]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [descOpen, setDescOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const isAdmin = useAuthStore((s) => Boolean(s.capabilities?.can_manage_exams));
  const qc = useQueryClient();

  const rebuildThisExam = useCallback(async () => {
    if (!confirm("Is exam ke tests dobara file bank se banenge. Exam card safe rahega. Continue?")) return;
    setRebuilding(true);
    try {
      await examsApi.rebuildExamTests(id);
      await qc.invalidateQueries({ queryKey: ["exam", id] });
      window.location.reload();
    } catch (e) {
      alert("Rebuild failed. Thodi der baad try karo.");
    } finally {
      setRebuilding(false);
    }
  }, [id, qc]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [shared, setShared] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const { data: exam, isLoading } = useQuery({
    queryKey: ["exam", id],
    queryFn: () => examsApi.get(id),
    enabled: Number.isFinite(id),
  });

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* ── Start exam ──────────────────────── */
  const start = useCallback(
    async (childId: number) => {
      setStarting(String(childId));
      setError("");
      try {
        reset();
        const targetId = childId ?? id;
        const payload = await attemptsApi.start(targetId);
        loadFromPayload(payload);
        navigate({
          to: "/play/$attemptId",
          params: { attemptId: String(payload.attempt.id) },
        });
      } catch (e: any) {
        setError(e.message || "Failed to start");
      } finally {
        setStarting(null);
      }
    },
    [id, navigate, loadFromPayload, reset]
  );

  /* ── Share ───────────────────────────── */
  const shareUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }, []);

  /* ── Computed data ──────────────────── */
  const children = useMemo(() => (exam?.children || []) as any[], [exam]);

  const subjects = useMemo(() => {
    const s = new Set<string>();
    children.forEach((c: any) => {
      const subj = extractSubject(c.title);
      if (subj) s.add(subj);
    });
    return Array.from(s);
  }, [children]);

  const filtered = useMemo(() => {
    let items = children;
    if (activeTab !== "all") items = items.filter((c: any) => cat(c.title) === activeTab);
    if (activeSubject) items = items.filter((c: any) => extractSubject(c.title) === activeSubject);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (c: any) =>
          c.title.toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [children, activeTab, activeSubject, search]);

  const displayed = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: children.length };
    children.forEach((ch: any) => {
      const k = cat(ch.title);
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [children]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [activeTab, activeSubject, search]);

  /* ── Loading ─────────────────────────── */
  if (isLoading) return <Skeleton />;
  if (!exam) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-5">

      {/* ══════════════════════════════════════════════════════
         HEADER: Title + badges + description + share
         ══════════════════════════════════════════════════════ */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground truncate">
              {exam.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[11px] font-medium capitalize">
                {exam.exam_mode}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[11px] font-medium capitalize ${
                  exam.status === "published"
                    ? "border-emerald-500/30 text-emerald-600"
                    : "border-amber-500/30 text-amber-600"
                }`}
              >
                {exam.status}
              </Badge>
            </div>
          </div>
          <button
            onClick={shareUrl}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            {shared ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </>
            )}
          </button>
          {isAdmin && (
            <button
              onClick={rebuildThisExam}
              disabled={rebuilding}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              title="Is exam ke tests dobara banao (exam card safe)"
            >
              ♻️ {rebuilding ? "Rebuilding…" : "Rebuild Tests"}
            </button>
          )}
        </div>
        {exam.description && (
          <div className="max-w-3xl">
            <p className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap ${descOpen ? "" : "line-clamp-3"}`}>
              {exam.description}
            </p>
            {exam.description.length > 160 && (
              <button
                onClick={() => setDescOpen(o => !o)}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                {descOpen ? "Show less ▲" : "Show more ▼"}
              </button>
            )}
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════
         STATS ROW — compact single row
         ══════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs">
        {exam.duration_seconds > 0 && (
          <Stat label="Duration" value={formatDuration(exam.duration_seconds)} />
        )}
        {exam.total_questions > 0 && (
          <Stat label="Questions" value={String(exam.total_questions)} />
        )}
        {exam.total_marks > 0 && (
          <Stat label="Total Marks" value={String(exam.total_marks)} />
        )}
        <Stat label="Negative" value={exam.default_negative_marks > 0 ? `-${exam.default_negative_marks}` : "None"} />
        <Stat label="Sections" value={String((exam.sections || []).length || tabCounts.all)} />
        <Stat label="⌘K" value="Search" muted />
      </div>

      {/* ══════════════════════════════════════════════════════
         INSTRUCTIONS — collapsed accordion
         ══════════════════════════════════════════════════════ */}
      {exam.instructions && (
        <div className="border-t border-b py-2">
          <button
            onClick={() => setInstructionsOpen(!instructionsOpen)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <svg
              className={`w-3 h-3 transition-transform ${instructionsOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Instructions {instructionsOpen ? "" : "(click to expand)"}
          </button>
          {instructionsOpen && (
            <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-3 max-h-48 overflow-y-auto">
              {exam.instructions}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         FILTER BAR: search + tabs + subject chips (sticky)
         ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 space-y-3 border-b">

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search subject or test…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border bg-muted/30 pl-9 pr-10 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Subject chips — horizontally scrollable */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {/* "All" chip */}
          <Chip active={!activeSubject} onClick={() => setActiveSubject(null)}>
            All
          </Chip>
          {/* Mock / PYQ quick filters */}
          <Chip
            active={activeTab === "full-mock"}
            onClick={() => {
              setActiveTab(activeTab === "full-mock" ? "all" : "full-mock");
              setActiveSubject(null);
            }}
          >
            Mock Tests
            <span className="ml-1 text-[10px] opacity-60">{tabCounts["full-mock"] || 0}</span>
          </Chip>
          <Chip dimmed>PYQ</Chip>
          <span className="w-px bg-border mx-1 self-stretch" />
          {subjects.map((s) => (
            <Chip
              key={s}
              active={activeSubject === s}
              onClick={() => {
                setActiveSubject(activeSubject === s ? null : s);
                setActiveTab("all");
              }}
            >
              {s}
            </Chip>
          ))}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setActiveSubject(null);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              <span className="ml-1 opacity-60">{tabCounts[t.key === "all" ? "all" : t.key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
         TEST LIST
         ══════════════════════════════════════════════════════ */}
      {children.length === 0 && (exam as any)?.coming_soon ? (
        <div className="text-center py-16 space-y-3">
          <div className="text-5xl">🚧</div>
          <p className="text-lg font-semibold">Coming Soon</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Is exam ke syllabus ke questions abhi file bank me nahi hain. Jaise hi
            un topics ki questions file add hongi, tests apne aap yahan aa jayenge.
          </p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <svg className="w-10 h-10 mx-auto text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-muted-foreground">No tests found</p>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-primary hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Results count */}
          <p className="text-[11px] text-muted-foreground -mt-2">
            Showing {displayed.length} of {filtered.length} tests
          </p>

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {displayed.map((child: any) => {
              const c = cat(child.title);
              const isStarting = starting === String(child.id);
              return (
                <button
                  key={child.id}
                  onClick={() => start(child.id)}
                  disabled={!!starting}
                  className="group relative flex flex-col text-left rounded-xl border bg-card p-3.5 hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150 disabled:opacity-100 disabled:cursor-wait overflow-hidden"
                >
                  {/* Building animation overlay while this test loads (esp. after 3s) */}
                  {isStarting && (
                    <div className="absolute inset-0 z-10 bg-card/95 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 px-3">
                      {/* animated bars — feels like something is being built */}
                      <div className="flex items-end gap-1 h-6">
                        {[0,1,2,3,4].map((b) => (
                          <span
                            key={b}
                            className="w-1.5 rounded-sm bg-primary/70 animate-pulse"
                            style={{ height: `${8 + ((b*7)%16)}px`, animationDelay: `${b*0.12}s`, animationDuration: "0.9s" }}
                          />
                        ))}
                      </div>
                      <div className="w-full max-w-[160px] h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 bg-primary rounded-full animate-[cardload_1.1s_ease-in-out_infinite]" />
                      </div>
                      <div className="text-[10px] font-medium text-primary text-center leading-tight">
                        {slowStart ? "Aapka test taiyaar ho raha hai…" : "Test khul raha hai…"}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[13px] font-medium leading-snug line-clamp-2 pr-14">
                      {catIcon(c)}{" "}
                      {child.title}
                    </h4>
                    <span className="absolute top-3 right-3 shrink-0 inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      {isStarting ? "..." : "Start"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2.5 text-[11px] text-muted-foreground">
                    {child.duration_seconds > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatDuration(child.duration_seconds)}
                      </span>
                    )}
                    <span>{child.total_questions > 0 ? `${child.total_questions} Q` : "—"}</span>
                    <span>{child.total_marks > 0 ? `${child.total_marks} M` : "—"}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-muted">
                      {child.default_negative_marks > 0 ? `-${child.default_negative_marks}` : "No neg"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Show More */}
          {hasMore && (
            <div className="text-center pt-1">
              <button
                onClick={() => setVisible((p) => p + PAGE_SIZE)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Show More
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-[10px] opacity-60">({filtered.length - displayed.length} remaining)</span>
              </button>
            </div>
          )}

          {/* Show Less */}
          {!hasMore && filtered.length > PAGE_SIZE && (
            <div className="text-center pt-1">
              <button
                onClick={() => setVisible(PAGE_SIZE)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Show Less ↑
              </button>
            </div>
          )}
        </>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-destructive text-destructive-foreground text-xs px-4 py-2.5 rounded-xl shadow-lg animate-in slide-in-from-bottom-2">
          {error}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────
   Tiny components
   ─────────────────────────────────────────── */

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${muted ? "text-muted-foreground/50" : ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${muted ? "" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  dimmed,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  dimmed?: boolean;
}) {
  const base =
    "shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap";
  if (dimmed) return <span className={`${base} border border-dashed text-muted-foreground/40 cursor-not-allowed`}>{children}</span>;
  return (
    <button
      onClick={onClick}
      className={`${base} ${
        active
          ? "bg-foreground text-background"
          : "border text-muted-foreground hover:text-foreground hover:border-primary/30"
      }`}
    >
      {children}
    </button>
  );
}
