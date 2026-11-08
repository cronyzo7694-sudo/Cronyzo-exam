import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { analyticsApi } from "@/lib/api";
import { usePlatformStore } from "@/stores/platformStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import { useState, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════
   SVG Icons — inline, zero dependency
   ═══════════════════════════════════════════════════════════ */

const svg = (d: string, c = "w-5 h-5") =>
  `<svg class="${c}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${d}</svg>`;

const IC = {
  target:   svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  check:    svg('<path d="M5 13l4 4L19 7"/>'),
  xmark:    svg('<path d="M6 18L18 6M6 6l12 12"/>'),
  clock:    svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  trophy:   svg('<path d="M5 3h14l-1 8H6L5 3zM6 11h12v3a4 4 0 01-8 0v-3z"/><path d="M8 3v5m8-5v5"/>'),
  flame:    svg('<path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/>'),
  book:     svg('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  sparkle:  svg('<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>'),
  trending: svg('<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  download: svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  share:    svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>'),
  play:     svg('<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/>'),
  arrowR:   svg('<path d="M13 7l5 5m0 0l-5 5m5-5H6"/>'),
  barChart: svg('<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>'),
  pieChart: svg('<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>'),
  zap:      svg('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
};

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

type Period = "week" | "month" | "all";

function trendIcon(v: number) { return v > 0 ? "↑" : v < 0 ? "↓" : "→"; }
function trendColor(v: number) { return v > 0 ? "text-emerald-500" : v < 0 ? "text-red-500" : "text-muted-foreground"; }
function barH(pct: number) { return `${Math.max(2, Math.min(100, pct))}%`; }

/* ═══════════════════════════════════════════════════════════
   Pure SVG Charts — zero library dependency
   ═══════════════════════════════════════════════════════════ */

/** Simple SVG line chart */
function LineChart({ data, w = 400, h = 140, color = "#2563eb" }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (data.length < 2) return <NullChart />;
  const pad = 8;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => `${pad + i * stepX},${h - pad - ((v - min) / range) * (h - pad * 2)}`).join(" ");
  const areaPts = `${pad},${h - pad} ${pts} ${w - pad},${h - pad}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={areaPts} fill="url(#lg)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((v, i) => (
        <circle key={i} cx={pad + i * stepX} cy={h - pad - ((v - min) / range) * (h - pad * 2)} r="2.5" fill={color} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
      ))}
    </svg>
  );
}

/** Donut ring */
function DonutRing({ pct, size = 64, stroke = 6, color = "#2563eb" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/15"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} className="transition-all duration-1000 ease-out"/>
    </svg>
  );
}

/** Horizontal bar chart */
function HBar({ label, pct, color = "#2563eb", sub }: { label: string; pct: number; color?: string; sub?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]"><span className="font-medium truncate">{label}</span><span className="tabular-nums ml-2 shrink-0">{Math.round(pct)}%</span></div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: barH(pct), backgroundColor: color }}/></div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function NullChart() {
  return <div className="flex items-center justify-center h-32 text-xs text-muted-foreground/50">Not enough data for chart</div>;
}

/* ═══════════════════════════════════════════════════════════
   KPI Pill
   ═══════════════════════════════════════════════════════════ */

function Kpi({ icon, label, value, trend, sub }: { icon: string; label: string; value: string | number; trend?: number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary transition-colors group-hover:bg-primary/15" dangerouslySetInnerHTML={{ __html: icon }}/>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums tracking-tight">{value}</span>
          {trend !== undefined && <span className={`text-[10px] font-semibold ${trendColor(trend)}`}>{trendIcon(trend)} {Math.abs(trend)}%</span>}
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          {label}
          {sub && <span className="text-[10px] opacity-60">· {sub}</span>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Loading Skeleton
   ═══════════════════════════════════════════════════════════ */

function Skeleton() {
  return (
    <div className="animate-in fade-in duration-300 space-y-6 mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-8 w-48 bg-muted rounded-lg animate-pulse"/>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {[1,2,3,4,5,6,7,8].map(i=><div key={i} className="h-20 bg-muted rounded-2xl animate-pulse"/>)}
      </div>
      <div className="h-48 bg-muted rounded-2xl animate-pulse"/>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="h-64 bg-muted rounded-2xl animate-pulse"/>
        <div className="h-64 bg-muted rounded-2xl animate-pulse"/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Empty State
   ═══════════════════════════════════════════════════════════ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-20 px-4 text-center space-y-6 animate-in fade-in">
      <div className="relative">
        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
          <span dangerouslySetInnerHTML={{ __html: IC.barChart.replace("w-5 h-5", "w-10 h-10 text-primary/40") }}/>
        </div>
        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
          <span dangerouslySetInnerHTML={{ __html: IC.sparkle.replace("w-5 h-5", "w-5 h-5 text-amber-500") }}/>
        </div>
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-xl font-bold tracking-tight">No analytics yet</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Complete your first mock test to unlock detailed performance insights, AI recommendations, and progress tracking.
        </p>
      </div>
      <div className="flex gap-2">
        <Link to="/exams"><Button className="rounded-xl gap-2"><span dangerouslySetInnerHTML={{ __html: IC.play }}/>Start Mock Test</Button></Link>
        <Link to="/exams"><Button variant="outline" className="rounded-xl">Explore Exams</Button></Link>
      </div>
      <p className="text-[11px] text-muted-foreground/60">Unlock achievements, streaks, and AI coaching after your first attempt 🏆</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Error State
   ═══════════════════════════════════════════════════════════ */

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col items-center py-20 px-4 text-center space-y-4 animate-in fade-in">
      <div className="w-16 h-16 rounded-2xl bg-destructive/5 flex items-center justify-center"><span className="text-2xl">⚠️</span></div>
      <h3 className="text-lg font-bold">Failed to load analytics</h3>
      <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <Button onClick={retry} variant="outline" className="rounded-xl">Retry</Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export function AnalyticsPage() {
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const analyticsOn = isEnabled("ENABLE_ANALYTICS", true);
  const [period, setPeriod] = useState<Period>("month");
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: () => analyticsApi.dashboard(),
    enabled: analyticsOn,
  });

  /* ── Derived data ────────────────────── */
  const stats = useMemo(() => (data?.quick_stats || {}) as Record<string, any>, [data]);
  const scoreTrend: number[] = useMemo(() =>
    (data?.score_trend || []).map((t: any) => t.percentage || 0), [data]);
  const weakSubjects: any[] = useMemo(() =>
    (data?.weak_subjects || data?.latest_analytics?.weak_subjects || []), [data]);
  const bySubject: any[] = useMemo(() =>
    (data?.by_subject || data?.latest_analytics?.by_subject || []), [data]);
  const coach = data?.ai_coach || data?.latest_analytics?.ai_coach;
  const examStats: any[] = useMemo(() =>
    (data?.exam_stats || []).slice(0, 5), [data]);
  const accuracy = stats?.accuracy || (stats?.total_questions_attempted > 0
    ? Math.round((stats.total_correct / stats.total_questions_attempted) * 100) : 0);
  const totalQ = stats?.total_questions_attempted || 0;
  const totalTests = examStats?.reduce((s: number, e: any) => s + (e.attempts || 0), 0) || stats?.total_tests || 0;
  const totalTime = stats?.total_time_seconds || 0;
  const bestScore = stats?.best_score || 0;
  const correctQ = stats?.total_correct || 0;
  const wrongQ = stats?.total_wrong || 0;
  const skippedQ = totalQ - correctQ - wrongQ;

  const hasData = totalTests > 0 || scoreTrend.length > 0;

  /* ── Subject colors ──────────────────── */
  const subColors: Record<string, string> = {
    "General Intelligence & Reasoning": "#7c3aed",
    "Reasoning": "#7c3aed",
    "Reasoning Ability": "#7c3aed",
    "Quantitative Aptitude": "#2563eb",
    "Mathematics": "#2563eb",
    "Numerical Ability": "#2563eb",
    "English Language": "#059669",
    "English": "#059669",
    "English Comprehension": "#059669",
    "General Awareness": "#ea580c",
    "General Knowledge": "#ea580c",
    "General Science": "#0d9488",
  };

  /* ── Guard ───────────────────────────── */
  if (!analyticsOn) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center py-20 text-center space-y-3">
          <span className="text-3xl">📊</span>
          <h2 className="text-lg font-bold">Analytics is disabled</h2>
          <p className="text-sm text-muted-foreground">Enable analytics in platform settings to unlock insights.</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState retry={() => refetch()} />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-300">

      {/* ════════════════════════════════════════════════════
         HEADER
         ════════════════════════════════════════════════════ */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Track your learning progress with AI-powered insights</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-xl border bg-muted/30 p-0.5">
            {(["week","month","all"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {p === "all" ? "All Time" : `This ${p === "week" ? "Week" : "Month"}`}
              </button>
            ))}
          </div>
          {/* Export */}
          <button className="shrink-0 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Share report" onClick={() => navigator.clipboard.writeText(window.location.href)}>
            <span dangerouslySetInnerHTML={{ __html: IC.share.replace("w-5 h-5","w-4 h-4") }}/>
          </button>
          <button className="shrink-0 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Export PDF">
            <span dangerouslySetInnerHTML={{ __html: IC.download.replace("w-5 h-5","w-4 h-4") }}/>
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════
         TODAY'S SNAPSHOT — hero card
         ════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-primary/10 to-amber-500/5 border p-5 sm:p-6">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl"/>
        <div className="relative z-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          <div className="sm:col-span-2 lg:col-span-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Today's Progress</p>
            <p className="text-lg font-bold">
              {totalTests > 0 ? "Keep the momentum going!" : "Your analytics journey begins"}
            </p>
            <p className="text-xs text-muted-foreground">
              {correctQ > 0 ? `${correctQ} correct out of ${totalQ} attempted` : "Start a mock test to see your stats"}
            </p>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 lg:col-span-3">
            {[
              { l: "Study Time", v: formatDuration(totalTime), ico: IC.clock },
              { l: "Accuracy", v: `${accuracy}%`, ico: IC.target },
              { l: "Questions", v: totalQ.toLocaleString(), ico: IC.book },
              { l: "Best Score", v: `${bestScore}%`, ico: IC.trophy },
            ].map(s => (
              <div key={s.l} className="flex flex-col items-center gap-1">
                <span className="text-muted-foreground/60" dangerouslySetInnerHTML={{ __html: s.ico.replace("w-5 h-5","w-4 h-4") }}/>
                <span className="text-lg font-bold tabular-nums">{s.v}</span>
                <span className="text-[10px] text-muted-foreground text-center">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
         QUICK KPIs — 8 pills
         ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        <Kpi icon={IC.target} label="Accuracy" value={`${accuracy}%`} trend={2}/>
        <Kpi icon={IC.trophy} label="Avg Score" value={`${Math.round((stats?.avg_score || stats?.total_score / Math.max(1, totalTests)) || 0)}%`}/>
        <Kpi icon={IC.flame} label="Best Score" value={`${bestScore}%`}/>
        <Kpi icon={IC.book} label="Q Solved" value={totalQ.toLocaleString()} sub="total"/>
        <Kpi icon={IC.barChart} label="Tests Done" value={totalTests} sub={`${examStats.length} exams`}/>
        <Kpi icon={IC.clock} label="Study Time" value={formatDuration(totalTime)}/>
        <Kpi icon={IC.check} label="Correct" value={correctQ} trend={totalQ > 0 ? Math.round((correctQ/totalQ)*100) : undefined}/>
        <Kpi icon={IC.xmark} label="Wrong" value={wrongQ}/>
      </div>

      {/* ════════════════════════════════════════════════════
         PERFORMANCE TREND + DISTRIBUTION
         ════════════════════════════════════════════════════ */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Line chart */}
        <Card className="lg:col-span-2 group">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold flex items-center gap-2"><span dangerouslySetInnerHTML={{ __html: IC.trending.replace("w-5 h-5","w-4 h-4 text-blue-500") }}/>Performance Trend</CardTitle></CardHeader>
          <CardContent>
            {scoreTrend.length >= 2 ? (
              <div className="space-y-3">
                <LineChart data={scoreTrend} w={500} h={150} color="#2563eb"/>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>First test</span>
                  <span className="font-medium text-foreground">Latest: {scoreTrend[scoreTrend.length-1]}%</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center space-y-2">
                <span className="text-2xl">📈</span>
                <p className="text-xs text-muted-foreground">Complete 2+ tests to see your performance trend</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribution donut */}
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold flex items-center gap-2"><span dangerouslySetInnerHTML={{ __html: IC.pieChart.replace("w-5 h-5","w-4 h-4 text-violet-500") }}/>Distribution</CardTitle></CardHeader>
          <CardContent>
            {totalQ > 0 ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <DonutRing pct={totalQ>0?Math.round((correctQ/totalQ)*100):0} size={80} stroke={7} color="#059669"/>
                </div>
                <div className="space-y-2">
                  <HBar label="Correct" pct={totalQ>0?Math.round((correctQ/totalQ)*100):0} color="#059669" sub={`${correctQ} questions`}/>
                  <HBar label="Wrong" pct={totalQ>0?Math.round((wrongQ/totalQ)*100):0} color="#dc2626" sub={`${wrongQ} questions`}/>
                  <HBar label="Skipped" pct={totalQ>0?Math.round((skippedQ/totalQ)*100):0} color="#f59e0b" sub={`${skippedQ} questions`}/>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center space-y-2">
                <span className="text-2xl">🍩</span>
                <p className="text-xs text-muted-foreground">Answer questions to see distribution</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════
         SUBJECT ANALYTICS
         ════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Subject Performance</h3>
        {bySubject.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {bySubject.map((s: any) => {
              const name = s.name || s.subject_name || "Unknown";
              const pct = s.accuracy || Math.round(((s.correct || 0) / Math.max(1, (s.attempted || s.total || 1))) * 100) || 0;
              const color = subColors[name] || "#6b7280";
              const expanded = expandedSubject === name;
              const weakChaps = s.weak_chapters || [];
              const strongChaps = s.strong_chapters || [];
              return (
                <Card key={name} className={`hover:shadow-md transition-all duration-200 cursor-pointer ${expanded ? "ring-2 ring-primary/20" : ""}`}
                  onClick={() => setExpandedSubject(expanded ? null : name)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}/>
                        <h4 className="text-sm font-semibold">{name}</h4>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{s.attempted || s.total || 0} Q</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <DonutRing pct={pct} size={48} stroke={5} color={color}/>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Accuracy</span><span className="font-semibold tabular-nums">{pct}%</span></div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: barH(pct), backgroundColor: color }}/></div>
                      </div>
                    </div>
                    {/* Expanded detail */}
                    {expanded && (
                      <div className="animate-slide-down space-y-2 border-t pt-3">
                        {weakChaps.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-red-500 uppercase tracking-wider">Weak Chapters</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {weakChaps.map((c: any) => (
                                <span key={c.name || c} className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                                  {c.name || c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {strongChaps.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wider">Strong Chapters</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {strongChaps.map((c: any) => (
                                <span key={c.name || c} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                                  {c.name || c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <Link to="/exams">
                          <Button size="sm" variant="secondary" className="rounded-lg gap-1 h-7 text-[11px] w-full mt-1">
                            <span dangerouslySetInnerHTML={{ __html: IC.play.replace("w-5 h-5","w-3 h-3") }}/>Practice {name}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : weakSubjects.length > 0 ? (
          /* Fallback: weak subjects from AI */
          <div className="grid sm:grid-cols-2 gap-3">
            {weakSubjects.map((w: any) => {
              const pct = w.accuracy || 0;
              const color = subColors[w.name] || "#6b7280";
              return (
                <Card key={w.name} className="hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}/>
                        <h4 className="text-sm font-semibold">{w.name}</h4>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">{pct}% accuracy</Badge>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: barH(pct), backgroundColor: color }}/></div>
                    <Link to="/exams"><Button size="sm" variant="secondary" className="rounded-lg gap-1 h-7 text-[11px] w-full"><span dangerouslySetInnerHTML={{ __html: IC.play.replace("w-5 h-5","w-3 h-3") }}/>Practice {w.name}</Button></Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* ════════════════════════════════════════════════════
         AI INSIGHTS
         ════════════════════════════════════════════════════ */}
      <Card className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 border-violet-200/50 dark:border-violet-800/20 overflow-hidden">
        <CardContent className="p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <span dangerouslySetInnerHTML={{ __html: IC.sparkle.replace("w-5 h-5","w-5 h-5 text-violet-500") }}/>
            </div>
            <div className="space-y-2 min-w-0">
              <h3 className="text-sm font-semibold">AI Insights</h3>
              {coach?.summary ? (
                <p className="text-xs text-muted-foreground leading-relaxed">{coach.summary}</p>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {accuracy < 50
                    ? "Focus on chapter-wise practice to strengthen fundamentals. Start with high-weightage topics."
                    : accuracy < 70
                      ? "You're making steady progress. Target specific weak chapters to break through to 70%+."
                      : totalTests < 3
                        ? "Great accuracy! Now increase volume — take more mock tests to build exam stamina."
                        : `Excellent performance at ${accuracy}% accuracy. Challenge yourself with full-length timed mocks to reach 90%+.`
                  }
                </p>
              )}
              {coach?.suggestions?.length > 0 && (
                <ul className="space-y-1">
                  {coach.suggestions.slice(0, 3).map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <span className="mt-0.5 shrink-0 w-1 h-1 rounded-full bg-violet-400"/>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {coach?.next_best_action && (
                <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                  💡 Next: {coach.next_best_action}
                </p>
              )}
            </div>
          </div>
          <Link to="/exams">
            <Button size="sm" className="rounded-xl gap-1.5 shrink-0">
              <span dangerouslySetInnerHTML={{ __html: IC.zap.replace("w-5 h-5","w-3.5 h-3.5") }}/>Practice Now
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════
         EXAM HISTORY — compact timeline
         ════════════════════════════════════════════════════ */}
      {examStats.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recent Exam Performance</h3>
          <div className="space-y-2">
            {examStats.map((e: any) => {
              const pct = e.avg_percentage || e.percentage || 0;
              const color = pct >= 70 ? "#059669" : pct >= 50 ? "#2563eb" : "#dc2626";
              return (
                <div key={e.title || e.exam_id} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
                  <DonutRing pct={pct} size={36} stroke={4} color={color}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{e.title}</div>
                    <div className="text-[10px] text-muted-foreground">{e.attempts || 0} attempts · avg {pct}%</div>
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
