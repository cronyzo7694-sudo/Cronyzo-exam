import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { attemptsApi, type Attempt } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/utils";
import { useState, useMemo, useCallback } from "react";
import { Loader } from "@/components/Loader";
import { useSlowFlag } from "@/lib/useSlowFlag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ═══════════════════════════════════════════════════════════
   Icons — inline SVG Lucide replacements
   ═══════════════════════════════════════════════════════════ */

const icon = (d: string, cls = "w-5 h-5") =>
  `<svg class="${cls}" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">${d}</svg>`;

const I = {
  target: icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  check:  icon('<path d="M5 13l4 4L19 7"/>'),
  xmark:  icon('<path d="M6 18L18 6M6 6l12 12"/>'),
  clock:  icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  book:   icon('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  flame:  icon('<path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/>'),
  star:   icon('<path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>'),
  trophy: icon('<path d="M5 3h14l-1 8H6L5 3zM6 11h12v3a4 4 0 01-8 0v-3z"/><path d="M8 3v5m8-5v5"/>'),
  arrowR: icon('<path d="M13 7l5 5m0 0l-5 5m5-5H6"/>'),
  search: icon('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  grid:   icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  list:   icon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  play:   icon('<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/>'),
  share:  icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>'),
  sparkle:icon('<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>'),
  trending:icon('<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  calendar:icon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  skip:   icon('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h11M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H6"/>'),
};

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

type ViewMode = "cards" | "timeline" | "table";
type FilterKey = "all" | "completed" | "in_progress" | "mock" | "subject" | "mini";

const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "in_progress", label: "In Progress" },
];

// A finished attempt can be submitted / auto_submitted / evaluated / completed.
function isDone(status?: string): boolean {
  return ["submitted", "auto_submitted", "evaluated", "completed"].includes(status || "");
}

function scoreColor(pct: number): string {
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 60) return "text-blue-500";
  if (pct >= 40) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(pct: number): string {
  if (pct >= 80) return "bg-emerald-50 dark:bg-emerald-950/30";
  if (pct >= 60) return "bg-blue-50 dark:bg-blue-950/30";
  if (pct >= 40) return "bg-amber-50 dark:bg-amber-950/30";
  return "bg-red-50 dark:bg-red-950/30";
}

function scoreRing(pct: number): string {
  if (pct >= 80) return "stroke-emerald-500";
  if (pct >= 60) return "stroke-blue-500";
  if (pct >= 40) return "stroke-amber-500";
  return "stroke-red-500";
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function groupByDate(attempts: Attempt[]): Map<string, Attempt[]> {
  const groups = new Map<string, Attempt[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  attempts.forEach((a) => {
    const d = new Date(a.submitted_at || a.started_at || "").getTime();
    let key: string;
    if (d >= today) key = "Today";
    else if (d >= yesterday) key = "Yesterday";
    else if (d >= today - 7 * 86400000) key = "This Week";
    else if (d >= today - 30 * 86400000) key = "This Month";
    else key = "Earlier";

    const existing = groups.get(key) || [];
    existing.push(a);
    groups.set(key, existing);
  });
  return groups;
}

/* ═══════════════════════════════════════════════════════════
   Mini progress ring
   ═══════════════════════════════════════════════════════════ */

function ProgressRing({ pct, size = 48, stroke = 4 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/15" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} className={`${scoreRing(pct)} transition-all duration-700 ease-out`} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI pill
   ═══════════════════════════════════════════════════════════ */

function KPI({ icon: ico, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: ico }} />
      <div className="min-w-0">
        <div className="text-lg font-bold tracking-tight tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          {label}
          {sub && <span className="text-[10px] opacity-60">· {sub}</span>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Loading skeleton
   ═══════════════════════════════════════════════════════════ */

function Skeleton() {
  return (
    <div className="animate-in fade-in duration-300 space-y-6 mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Empty state
   ═══════════════════════════════════════════════════════════ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 px-4 text-center space-y-6 animate-in fade-in">
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <span className="text-4xl">📝</span>
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm">✨</div>
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-bold tracking-tight">Your journey starts here</h3>
        <p className="text-sm text-muted-foreground">
          Take your first mock test and watch your progress unfold. Every attempt builds your learning portfolio.
        </p>
      </div>
      <div className="flex gap-2">
        <Link to="/exams">
          <Button className="rounded-xl gap-2">
            <span dangerouslySetInnerHTML={{ __html: I.play }} />
            Explore Exams
          </Button>
        </Link>
      </div>
      <p className="text-[11px] text-muted-foreground/60">
        Complete your first mock to unlock analytics and achievements 🏆
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */

export function AttemptsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<ViewMode>("cards");
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["attempts"],
    queryFn: () => attemptsApi.list(),
  });
  const slowLoad = useSlowFlag(isLoading, 3000);

  const items: Attempt[] = useMemo(() => (data?.items || []), [data]);

  /* ── Computed stats ──────────────────── */
  const stats = useMemo(() => {
    const completed = items.filter((a) => isDone(a.status));
    const total = completed.length;
    const avgScore = total > 0 ? Math.round(completed.reduce((s, a) => s + (a.percentage || 0), 0) / total) : 0;
    const avgAccuracy = total > 0 ? Math.round(completed.reduce((s, a) => {
      const totalQ = a.total_questions || 1;
      return s + ((a.correct_count || 0) / totalQ) * 100;
    }, 0) / total) : 0;
    const totalQ = completed.reduce((s, a) => s + (a.total_questions || 0), 0);
    const totalTime = completed.reduce((s, a) => s + (a.time_spent_seconds || 0), 0);
    const bestScore = total > 0 ? Math.max(...completed.map((a) => a.percentage || 0)) : 0;
    return { total, avgScore, avgAccuracy, totalQ, totalTime, bestScore };
  }, [items]);

  /* ── Filtered & sorted ──────────────── */
  const filtered = useMemo(() => {
    let arr = [...items];

    // Status filter
    if (filter === "completed") arr = arr.filter((a) => isDone(a.status));
    if (filter === "in_progress") arr = arr.filter((a) => a.status === "in_progress");

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((a) => (a.exam_title || "").toLowerCase().includes(q));
    }

    // Sort
    switch (sort) {
      case "oldest":
        arr.sort((a, b) => new Date(a.started_at || 0).getTime() - new Date(b.started_at || 0).getTime());
        break;
      case "highest":
        arr.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
        break;
      case "lowest":
        arr.sort((a, b) => (a.percentage || 0) - (b.percentage || 0));
        break;
      default:
        arr.sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime());
    }
    return arr;
  }, [items, filter, search, sort]);

  const timelineGroups = view === "timeline" ? groupByDate(filtered) : null;

  if (isLoading) return slowLoad ? <Loader title="Attempts load ho rahe hain" messages={["Server jaga rahe hain…", "Aapke tests la rahe hain…", "Bas thoda aur…"]} /> : <Skeleton />;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-300">

      {/* ── Header ────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Attempts</h1>
          <p className="text-sm text-muted-foreground">Track your complete examination journey</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border bg-muted/30 p-0.5">
            {([
              { key: "cards", ico: I.grid },
              { key: "timeline", ico: I.calendar },
              { key: "table", ico: I.list },
            ] as { key: ViewMode; ico: string }[]).map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`p-1.5 rounded-lg transition-colors ${view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                dangerouslySetInnerHTML={{ __html: v.ico.replace("w-5 h-5", "w-4 h-4") }}
                title={v.key}
              />
            ))}
          </div>
        </div>
      </header>

      {/* ── KPI Row ────────────────────────── */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <KPI icon={I.book} label="Attempts" value={stats.total} />
          <KPI icon={I.target} label="Avg Score" value={`${stats.avgScore}%`} sub={stats.avgScore >= 70 ? "Great" : ""} />
          <KPI icon={I.check} label="Accuracy" value={`${stats.avgAccuracy}%`} />
          <KPI icon={I.star} label="Questions" value={stats.totalQ.toLocaleString()} sub="solved" />
          <KPI icon={I.clock} label="Study Time" value={formatDuration(stats.totalTime)} />
          <KPI icon={I.trophy} label="Best Score" value={`${stats.bestScore}%`} />
        </div>
      )}

      {/* ── Filter bar (sticky) ────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b space-y-3">
        {/* Search + Sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" dangerouslySetInnerHTML={{ __html: I.search.replace("w-5 h-5", "w-4 h-4") }} />
            <input
              type="text"
              placeholder="Search exams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-muted/30 pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="appearance-none rounded-xl border bg-card pl-3 pr-8 py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer transition-colors"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest">Highest Score</option>
            <option value="lowest">Lowest Score</option>
          </select>
        </div>

        {/* Status chips */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                filter === f.key
                  ? "bg-foreground text-background"
                  : "border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              {f.label}
              {f.key !== "all" && (
                <span className="text-[10px] opacity-60">
                  {items.filter((a) => f.key === "completed" ? isDone(a.status) : a.status === "in_progress").length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────── */}
      {filtered.length === 0 ? (
        search || filter !== "all" ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40" dangerouslySetInnerHTML={{ __html: I.search }} />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No attempts found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try a different filter or search term</p>
            </div>
            <button onClick={() => { setFilter("all"); setSearch(""); }} className="text-xs text-primary hover:underline">Clear filters</button>
          </div>
        ) : (
          <EmptyState />
        )
      ) : view === "cards" ? (
        /* ── Card View ──────────────────────── */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => {
            const pct = a.percentage || 0;
            const isInProgress = a.status === "in_progress";
            const expanded = expandedCard === a.id;

            return (
              <Card
                key={a.id}
                className={`group relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${expanded ? "ring-2 ring-primary/20" : ""}`}
                onClick={() => setExpandedCard(expanded ? null : (a.id ?? null))}
              >
                {/* Accent top bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${scoreBg(pct)}`} />

                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate">{a.exam_title || `Attempt #${a.id}`}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] capitalize">{a.status?.replace("_", " ")}</Badge>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(a.submitted_at || a.started_at)}</span>
                      </div>
                    </div>
                    <div className="relative shrink-0">
                      <ProgressRing pct={pct} size={44} stroke={3.5} />
                      <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${scoreColor(pct)}`}>
                        {pct}%
                      </span>
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-3">
                    <span>✓ {a.correct_count || 0}</span>
                    <span>✗ {a.wrong_count || 0}</span>
                    <span className="inline-flex items-center gap-0.5" dangerouslySetInnerHTML={{ __html: I.skip.replace("w-5 h-5", "w-3 h-3") + String(a.skipped_count || 0) }} />
                    {a.time_spent_seconds > 0 && <span>{formatDuration(a.time_spent_seconds)}</span>}
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="animate-slide-down border-t pt-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Score</span>
                        <span className="font-semibold">{a.score} / {a.max_score}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Negative</span>
                        <span className="text-red-500">-{(a.negative_marks_total || 0).toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Questions</span>
                        <span>{a.total_questions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tab switches</span>
                        <span>{a.tab_switch_count || 0}</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {isInProgress ? (
                      <Button
                        size="sm"
                        className="rounded-lg gap-1 h-8 text-xs flex-1"
                        onClick={(e) => { e.stopPropagation(); navigate({ to: "/play/$attemptId", params: { attemptId: String(a.id) } }); }}
                      >
                        <span dangerouslySetInnerHTML={{ __html: I.play.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="rounded-lg gap-1 h-8 text-xs flex-1"
                        onClick={(e) => { e.stopPropagation(); navigate({ to: "/results/$attemptId", params: { attemptId: String(a.id) } }); }}
                      >
                        <span dangerouslySetInnerHTML={{ __html: I.target.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                        Review
                      </Button>
                    )}
                    <button
                      className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(`${window.location.origin}/results/${a.id}`);
                      }}
                      title="Share result"
                    >
                      <span dangerouslySetInnerHTML={{ __html: I.share.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : view === "timeline" ? (
        /* ── Timeline View ──────────────────── */
        <div className="space-y-8">
          {timelineGroups && Array.from(timelineGroups.entries()).map(([group, attempts]) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{group}</h3>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                {attempts.map((a) => {
                  const pct = a.percentage || 0;
                  return (
                    <div
                      key={a.id}
                      className="relative pl-6 py-2 hover:bg-muted/30 rounded-xl -ml-[21px] pl-8 cursor-pointer transition-colors group"
                      onClick={() => navigate({ to: a.status === "in_progress" ? "/play/$attemptId" : "/results/$attemptId", params: { attemptId: String(a.id) } })}
                    >
                      {/* Timeline dot */}
                      <div className={`absolute left-0 top-4 w-3 h-3 rounded-full border-2 border-background ${scoreBg(pct)} ring-2 ring-muted`} />
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{a.exam_title || `Attempt #${a.id}`}</div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span className="capitalize">{a.status?.replace("_", " ")}</span>
                            <span>·</span>
                            <span>{formatDate(a.submitted_at || a.started_at)}</span>
                            {a.time_spent_seconds > 0 && <><span>·</span><span>{formatDuration(a.time_spent_seconds)}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${scoreColor(pct)}`}>{pct}%</span>
                          <span className="text-muted-foreground/30 group-hover:text-foreground transition-colors" dangerouslySetInnerHTML={{ __html: I.arrowR.replace("w-5 h-5", "w-4 h-4") }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Table View ─────────────────────── */
        <div className="rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Exam</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">%</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Time</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const pct = a.percentage || 0;
                  const isInProgress = a.status === "in_progress";
                  return (
                    <tr key={a.id} className="border-t hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => navigate({ to: isInProgress ? "/play/$attemptId" : "/results/$attemptId", params: { attemptId: String(a.id) } })}>
                      <td className="px-4 py-3 font-medium truncate max-w-[180px]">{a.exam_title || `#${a.id}`}</td>
                      <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px] capitalize">{a.status?.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3 tabular-nums">{a.score}/{a.max_score}</td>
                      <td className={`px-4 py-3 font-semibold tabular-nums ${scoreColor(pct)}`}>{pct}%</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{a.time_spent_seconds > 0 ? formatDuration(a.time_spent_seconds) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">{formatDate(a.submitted_at || a.started_at)}</td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground/30 group-hover:text-foreground transition-colors" dangerouslySetInnerHTML={{ __html: I.arrowR.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AI Insights (only when attempts exist) ── */}
      {items.length > 0 && stats.total > 0 && (
        <Card className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 border-violet-200/50 dark:border-violet-800/20">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: I.sparkle.replace("w-5 h-5", "w-5 h-5 text-violet-500") }} />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">AI Insight</h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  {stats.avgScore < 50
                    ? "Focus on chapter-wise tests to strengthen your fundamentals."
                    : stats.avgAccuracy < 60
                      ? "Your accuracy can improve — try subject-specific practice."
                      : stats.total < 3
                        ? "Great start! Take more mock tests to build consistency."
                        : `You're performing well at ${stats.avgScore}% average. Push for 80%+ with full-length mocks!`
                  }
                </p>
              </div>
            </div>
            <Link to="/exams">
              <Button size="sm" className="rounded-xl gap-1.5 shrink-0">
                <span dangerouslySetInnerHTML={{ __html: I.trending.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                Practice Now
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
