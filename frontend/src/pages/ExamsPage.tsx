import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { examsApi, type Exam } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useExamPlayerStore } from "@/stores/examPlayerStore";
import { Loader } from "@/components/Loader";
import { useSlowFlag } from "@/lib/useSlowFlag";

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { key: "all", label: "All", color: "" },
  { key: "ssc", label: "SSC", color: "#2563eb" },
  { key: "banking", label: "Banking", color: "#059669" },
  { key: "railway", label: "Railway", color: "#ea580c" },
  { key: "upsc", label: "UPSC", color: "#7c3aed" },
  { key: "teaching", label: "Teaching", color: "#0d9488" },
  { key: "police", label: "Police", color: "#dc2626" },
  { key: "defence", label: "Defence", color: "#4f46e5" },
  { key: "state", label: "State Govt", color: "#b45309" },
  { key: "engineering", label: "Engineering", color: "#475569" },
  { key: "medical", label: "Medical", color: "#be123c" },
  { key: "science", label: "Science", color: "#6d28d9" },
  { key: "law", label: "Law", color: "#15803d" },
  { key: "management", label: "Management", color: "#0891b2" },
  { key: "agriculture", label: "Agriculture", color: "#65a30d" },
  { key: "computer", label: "Computer & IT", color: "#334155" },
  { key: "finance", label: "Finance & Insurance", color: "#a16207" },
] as const;

const SORTS = ["Newest", "Popular", "A-Z", "Updated"] as const;

type SortKey = (typeof SORTS)[number];

const PAGE_SIZE = 12;

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */

function detectCategory(title: string): string {
  const t = title.toLowerCase();
  // ----- Most specific / distinct categories first -----
  // Medical
  if (/(neet|aiims|inicet|nursing|norcet|paramedical)/.test(t)) return "medical";
  // Science & Research
  if (/(iat \(|nest|jest|iit jam|isro|drdo|barc|junior research|phd entrance)/.test(t)) return "science";
  // Defence (before management so "AFCAT" isn't caught by "cat")
  if (/\b(nda|cds|afcat|agniveer|army|navy|inet|mns|jag|rifleman)\b|air force|coast guard|navik|territorial|defence/.test(t)) return "defence";
  // Management
  if (/\b(cat|xat|cmat|mat|snap|nmat)\b|mba|management aptitude/.test(t)) return "management";
  // Law / Judiciary
  if (/(clat|ailet|slat|llb|judicial|civil judge|apo|legal|bar exam|aibe)/.test(t)) return "law";
  // Agriculture
  if (/(icar|agriculture|\bagri\b|crop)/.test(t)) return "agriculture";
  // Computer & IT
  if (/(nielit|ccc|computer operator|programmer|it officer|technical assistant)/.test(t)) return "computer";
  // UPSC (before Engineering/Police so UPSC-prefixed stay in UPSC)
  if (/^upsc/.test(t)) return "upsc";
  // SSC (before state/police/railway so "SSC Stenographer"/"SSC GD Constable"/
  // "SSC CPO"/"SSC JE" stay SSC)
  if (t.includes("ssc")) return "ssc";
  // State Govt / PSC / Patwari / Clerical / University (before Banking so
  // "State Clerk"/"LDC"/"UDC" stay State)
  if (/(mppsc|uppsc|bpsc|bihar|rpsc|rajasthan|mpsc|hpsc|haryana|patwari|state cet|state psc|state ssc|state clerk|ldc|udc|clerical|deo|stenographer|office|cuet|university entrance|common entrance|recruitment exams|departmental)/.test(t)) return "state";
  // Teaching
  if (/(ctet|tet|ugc net|csir net|\bset\b|jrf|b\.ed|d\.el\.ed|m\.ed|kvs|nvs|dsssb|teacher eligibility|eligibility test|teaching)/.test(t)) return "teaching";
  // Banking — "clerk" only counts as banking when a bank name is present
  if (/\b(ibps|sbi|rbi|nabard|sebi)\b|\blic\b|bank|po prelims|po mains|so /.test(t) || (/\bclerk\b/.test(t) && /\b(ibps|sbi|rbi|bank)\b/.test(t))) return "banking";
  // Railway (before Engineering so "RRB Technician" stays Railway; word-boundary
  // so "CRPF" is not caught by "rpf")
  if (/(railway|rrb|ntpc|group d|alp|\brpf\b)/.test(t)) return "railway";
  // Engineering (GATE, AE/JE, PSU, polytechnic, ITI)
  if (/\bgate\b|engineering|ae\/je|psu|polytechnic|\biti\b|apprenticeship|trade test|technician/.test(t)) return "engineering";
  // Police
  if (/(police|constable|capf|crpf|bsf|cisf|itbp|ssb|assam rifles|cpo)/.test(t)) return "police";
  // Insurance & Finance
  if (/(niacl|nicl|uiic|lic assistant|irdai|sidbi|pfrda|insurance|finance)/.test(t)) return "finance";
  // Default
  return "ssc";
}

function catColor(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.color ?? "#6b7280";
}

function catEmoji(key: string): string {
  const map: Record<string, string> = {
    ssc: "🏛️", banking: "🏦", railway: "🚂", upsc: "🎓",
    teaching: "📚", police: "🛡️", defence: "⚔️",
  };
  return map[key] ?? "📝";
}

function iconSvg(key: string) {
  const dim = 28;
  const base = 'fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"';
  switch (key) {
    case "ssc": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`;
    case "banking": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
    case "railway": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`;
    case "upsc": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M12 3l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>`;
    case "teaching": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;
    case "police": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M12 2l8 4v4c0 6-8 12-8 12S4 16 4 10V6l8-4z"/></svg>`;
    case "defence": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M12 2l8 4v4c0 6-8 12-8 12S4 16 4 10V6l8-4z"/></svg>`;
    case "state": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M4 21h16M6 21V8l6-4 6 4v13M9 10h2m2 0h2m-4 4h2m2 0h2"/></svg>`;
    case "engineering": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>`;
    case "medical": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 12h6m-3-3v6M8 8h8"/></svg>`;
    case "science": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M10 3v6L4 19a1 1 0 001 1h14a1 1 0 001-1L14 9V3M7 3h10"/></svg>`;
    case "law": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M12 3v18M5 6h14M5 6l-2 5a3 3 0 006 0L7 6M19 6l-2 5a3 3 0 006 0l-2-5M9 21h6"/></svg>`;
    case "management": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M3 21h18M5 21V8l7-4 7 4v13M9 11h2m2 0h2m-4 4h2m2 0h2"/></svg>`;
    case "agriculture": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><path d="M12 22c0-6-3-10-9-12 0 6 3 10 9 12zM12 22c0-6 3-10 9-12 0 6-3 10-9 12zM12 22V10"/></svg>`;
    case "computer": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`;
    case "finance": return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M8 7V5h8v2M7 15h2m4 0h2"/></svg>`;
    default: return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" ${base}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   Loading Skeleton
   ══════════════════════════════════════════════════════════════ */

function Skeleton() {
  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Stats skeleton */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 w-28 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
      {/* Search skeleton */}
      <div className="h-11 bg-muted rounded-xl animate-pulse" />
      {/* Chips skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-7 w-16 bg-muted rounded-full animate-pulse" />
        ))}
      </div>
      {/* Cards skeleton */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-36 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════ */

export function ExamsPage() {
  const navigate = useNavigate();
  const loadFromPayload = useExamPlayerStore((s) => s.loadFromPayload);
  const reset = useExamPlayerStore((s) => s.reset);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [sort, setSort] = useState<SortKey>("Newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [starting, setStarting] = useState<number | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Data ─────────────────────────────── */
  const { data, isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: () => examsApi.listAll("parent_id=null"),
  });
  const slowLoad = useSlowFlag(isLoading, 3000);

  const items: Exam[] = useMemo(() => (data || []), [data]);

  /* ── Stats ────────────────────────────── */
  const stats = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((e) => cats.add(detectCategory(e.title)));
    return {
      total: items.length,
      categories: cats.size,
      published: items.filter((e) => e.status === "published").length,
    };
  }, [items]);

  /* ── Filtered & sorted ────────────────── */
  const processed = useMemo(() => {
    let arr = [...items];

    // Category filter
    if (activeCat !== "all") {
      arr = arr.filter((e) => detectCategory(e.title) === activeCat);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sort) {
      case "A-Z":
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "Popular":
        arr.sort((a, b) => (b.total_questions || 0) - (a.total_questions || 0));
        break;
      case "Updated":
        arr.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        );
        break;
      default: // Newest
        arr.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        );
    }

    // Always push "coming soon" exams (no tests yet) to the end, keeping the
    // chosen sort order within each group. Ready/clickable exams come first.
    arr.sort((a, b) => {
      const ca = (a as any).coming_soon ? 1 : 0;
      const cb = (b as any).coming_soon ? 1 : 0;
      return ca - cb;
    });

    return arr;
  }, [items, activeCat, search, sort]);

  const displayed = processed.slice(0, visible);
  const hasMore = processed.length > visible;

  // Reset pagination on filter change
  useEffect(() => { setVisible(PAGE_SIZE); }, [activeCat, search, sort]);

  /* ── Keyboard: Ctrl+K ─────────────────── */
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

  /* ── Start exam ───────────────────────── */
  const startExam = useCallback(
    async (examId: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setStarting(examId);
      try {
        reset();
        const { attemptsApi } = await import("@/lib/api");
        const payload = await attemptsApi.start(examId);
        loadFromPayload(payload);
        navigate({
          to: "/play/$attemptId",
          params: { attemptId: String(payload.attempt.id) },
        });
      } catch {
        setStarting(null);
      }
    },
    [navigate, loadFromPayload, reset]
  );

  /* ── Loading ──────────────────────────── */
  if (isLoading) return slowLoad ? <Loader title="Loading exams" messages={["Server jaga rahe hain…", "Exams la rahe hain…", "Bas thoda aur…"]} /> : <Skeleton />;

  /* ══════════════════════════════════════════════════════════ */
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-300">

      {/* ── Header ─────────────────────────── */}
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Exams
        </h1>
        <p className="text-sm text-muted-foreground">
          Find your exam and start practising in seconds
        </p>
      </header>

      {/* ── Stats row ──────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <StatPill label="Exams" value={stats.total} emoji="📚" />
        <StatPill label="Categories" value={stats.categories} emoji="📂" />
        <StatPill label="Published" value={stats.published} emoji="✅" />
        <StatPill label="Updated today" value="—" emoji="🔄" muted />
      </div>

      {/* ── Search (sticky) ────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 space-y-3">
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search exams, SSC, UPSC, Railway…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border bg-muted/40 pl-10 pr-20 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tracking-wide">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* ── Category chips ──────────────── */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none flex-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setActiveCat(c.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                  activeCat === c.key
                    ? "bg-foreground text-background"
                    : "border text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                {c.key !== "all" && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                {c.label}
              </button>
            ))}
          </div>

          {/* ── Sort ───────────────────────── */}
          <div className="relative shrink-0">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none rounded-lg border bg-card pl-3 pr-7 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer transition-colors"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Results count ──────────────────── */}
      {search && (
        <p className="text-xs text-muted-foreground -mt-2">
          {processed.length} result{processed.length !== 1 ? "s" : ""} for "{search}"
        </p>
      )}

      {/* ── Cards grid ─────────────────────── */}
      {displayed.length === 0 ? (
        /* Empty state */
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
            <svg className="w-7 h-7 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No exams found</p>
            <p className="text-xs text-muted-foreground mt-1">Try another search or category</p>
          </div>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-primary hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayed.map((exam) => {
              const cat = detectCategory(exam.title);
              const color = catColor(cat);
              const icon = iconSvg(cat);
              const isStarting = starting === exam.id;
              const createdAt = exam.created_at
                ? new Date(exam.created_at)
                : null;
              const isNew =
                createdAt &&
                Date.now() - createdAt.getTime() < 7 * 24 * 3600 * 1000;

              return (
                (exam as any).coming_soon ? (
                  /* COMING SOON — greyed, not clickable */
                  <div
                    key={exam.id}
                    className="relative flex flex-col rounded-2xl border border-dashed bg-muted/30 p-4 opacity-90 select-none overflow-hidden"
                    aria-disabled="true"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center grayscale opacity-60"
                        style={{ backgroundColor: color + "18" }}
                        dangerouslySetInnerHTML={{ __html: icon }}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug truncate text-muted-foreground">
                          {exam.title}
                        </h3>
                        <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-0.5 leading-relaxed">
                          {exam.description || "No description"}
                        </p>
                      </div>
                    </div>
                    {/* Big COMING SOON banner */}
                    <div className="mt-5 mb-2 flex flex-col items-center justify-center py-4">
                      <span className="text-lg sm:text-xl font-extrabold tracking-widest text-muted-foreground/70">
                        COMING SOON
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 mt-1">
                        Tests jald hi add honge
                      </span>
                    </div>
                  </div>
                ) : (
                <Link
                  key={exam.id}
                  to="/exams/$examId"
                  params={{ examId: String(exam.id) }}
                  className="group relative flex flex-col rounded-2xl border bg-card p-4 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  {/* Accent top line */}
                  <div
                    className="absolute top-0 left-4 right-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ backgroundColor: color }}
                  />

                  {/* Header: icon + title */}
                  <div className="flex items-start gap-3">
                    <div
                      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: color + "18" }}
                      dangerouslySetInnerHTML={{ __html: icon }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-snug truncate">
                        {exam.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {exam.description || "No description"}
                      </p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-muted-foreground/80">
                    {exam.duration_seconds > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatDuration(exam.duration_seconds)}
                      </span>
                    )}
                    <span>{exam.total_questions || 0} Q</span>
                    <span>{exam.total_marks || 0} M</span>
                    <span>{(exam.sections || []).length} sections</span>
                  </div>

                  {/* Footer: status badge + start button */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <BadgeDot color={exam.status === "published" ? "#059669" : "#f59e0b"}>
                        {exam.status}
                      </BadgeDot>
                      {isNew && (
                        <span className="text-[10px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded-full">
                          New
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => startExam(exam.id, e)}
                      disabled={isStarting}
                      className="inline-flex items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background opacity-0 group-hover:opacity-100 transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                    >
                      {isStarting ? "Starting…" : "Start"}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  </div>
                </Link>
                )
              );
            })}
          </div>

          {/* Show More */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={() => setVisible((p) => p + PAGE_SIZE)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Show More
                <span className="text-[10px] opacity-50">
                  ({processed.length - displayed.length} remaining)
                </span>
              </button>
            </div>
          )}

          {!hasMore && processed.length > PAGE_SIZE && (
            <div className="text-center pt-2">
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
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Micro components
   ══════════════════════════════════════════════════════════════ */

function StatPill({
  label,
  value,
  emoji,
  muted,
}: {
  label: string;
  value: number | string;
  emoji: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
        muted
          ? "border-dashed text-muted-foreground/50"
          : "bg-card text-foreground"
      }`}
    >
      <span className="text-sm">{emoji}</span>
      <div className="flex items-baseline gap-1">
        <span className={`font-semibold ${muted ? "" : ""}`}>{value}</span>
        <span className="text-[10px] text-muted-foreground font-normal">
          {label}
        </span>
      </div>
    </div>
  );
}

function BadgeDot({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground capitalize">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}
