import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { analyticsApi, type Attempt } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { usePlatformStore } from "@/stores/platformStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatDate } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { Loader } from "@/components/Loader";
import { useSlowFlag } from "@/lib/useSlowFlag";
import { DonateButton } from "@/components/DonateButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { messagesApi } from "@/lib/api";

/* ══════════════════════════════════════════════════════════════
   Icons — inline SVG for zero dependency
   ══════════════════════════════════════════════════════════════ */

const I = {
  flame:   `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/>`,
  trophy: `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3h14l-1 8H6L5 3zM6 11h12v3a4 4 0 01-8 0v-3z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 3v5m8-5v5"/>`,
  target: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
  clock:  `<circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2"/>`,
  check:  `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>`,
  xmark:  `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>`,
  arrowR: `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>`,
  book:   `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>`,
  chart:  `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`,
  lightning:`<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>`,
  medal:  `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15l-2 5 2-1 2 1-2-5zM9.5 10A4.5 4.5 0 1114 5.5 4.5 4.5 0 019.5 10z"/><circle cx="9.5" cy="5.5" r="1.5"/>`,
  activity:`<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,
  search: `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>`,
  star:   `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>`,
  bell:   `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>`,
  play:   `<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><circle cx="12" cy="12" r="10"/>`,
  sparkle:`<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>`,
};

function ii(name: keyof typeof I, cls = "w-5 h-5") {
  return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${I[name]}</svg>`;
}

/* ══════════════════════════════════════════════════════════════
   Tiny helpers
   ══════════════════════════════════════════════════════════════ */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function streakEmoji(days: number) {
  if (days >= 30) return "🔥🔥🔥";
  if (days >= 7) return "🔥🔥";
  if (days >= 3) return "🔥";
  return "✨";
}

/* ══════════════════════════════════════════════════════════════
   Loading skeleton
   ══════════════════════════════════════════════════════════════ */

function Skeleton() {
  return (
    <div className="animate-in fade-in duration-300 space-y-6 mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-48 bg-muted rounded-3xl animate-pulse" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 bg-muted rounded-2xl animate-pulse" />
        <div className="h-64 bg-muted rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════ */

/** Circular progress ring */
function ProgressRing({ pct, size = 80, stroke = 6, label, sublabel }: {
  pct: number; size?: number; stroke?: number; label: string; sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/15" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" className="text-primary transition-all duration-1000 ease-out" />
      </svg>
      <span className="text-lg font-bold">{Math.round(pct)}%</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      {sublabel && <span className="text-[11px] font-medium">{sublabel}</span>}
    </div>
  );
}

/** Compact stat */
function KPI({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="min-w-0">
        <div className="text-lg font-bold tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}{sub && <span className="ml-1 text-[10px] opacity-60">{sub}</span>}</div>
      </div>
    </div>
  );
}

/** Quick action pill */
function QuickAction({ icon, label, to, onClick }: { icon: string; label: string; to?: string; onClick?: () => void }) {
  const inner = (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group cursor-pointer">
      <div className="w-12 h-12 rounded-2xl bg-muted/60 group-hover:bg-primary/10 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-all duration-200 group-hover:scale-105 group-hover:shadow-sm" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground text-center leading-tight transition-colors">{label}</span>
    </button>
  );
  return to ? <Link to={to} className="no-underline">{inner}</Link> : inner;
}

/** Progress bar */
function ProgressBar({ pct, color = "bg-primary" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700 ease-out`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Dashboard
   ══════════════════════════════════════════════════════════════ */

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const appName = usePlatformStore((s) => s.appName);
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const analyticsOn = isEnabled("ENABLE_ANALYTICS", true);
  const navigate = useNavigate();

  // Request-a-test / feedback dialog state
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgType, setMsgType] = useState("request");
  const [msgText, setMsgText] = useState("");
  const [msgEmail, setMsgEmail] = useState("");
  const [msgSent, setMsgSent] = useState(false);
  const [msgSending, setMsgSending] = useState(false);

  const submitMessage = async () => {
    if (!msgText.trim()) return;
    setMsgSending(true);
    try {
      await messagesApi.send({
        message: msgText,
        message_type: msgType,
        name: user?.full_name || undefined,
        email: msgEmail || user?.email || undefined,
      });
      setMsgSent(true);
    } catch {
      // keep open
    } finally {
      setMsgSending(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => analyticsApi.dashboard(),
    enabled: analyticsOn,
  });
  const slowLoad = useSlowFlag(isLoading, 3000);

  // ── Derived data ────────────────────────
  const stats = (data?.quick_stats || {}) as Record<string, any>;
  const streakDays = stats?.streak_days ?? (localStorage.getItem("streak") ? Number(localStorage.getItem("streak")) : 0);
  const todayGoal = stats?.daily_goal ?? 50;
  const todayDone = stats?.daily_done ?? 12;
  const todayPct = todayGoal > 0 ? Math.round((todayDone / todayGoal) * 100) : 0;
  const accuracy = stats?.accuracy ?? (stats?.total_questions_attempted > 0 ? Math.round((stats.total_correct / stats.total_questions_attempted) * 100) : 0);
  const totalQuestions = stats?.total_questions_attempted ?? 0;
  const totalTime = stats?.total_time_seconds ?? 0;
  const totalTests = stats?.total_tests ?? (data?.recent_attempts?.length ?? 0);

  // ── Last in-progress attempt ────────────
  const inProgress = useMemo(() => {
    if (!data?.recent_attempts) return null;
    return (data.recent_attempts as any[]).find((a: any) => a.status === "in_progress") ?? null;
  }, [data]);

  if (isLoading) return slowLoad ? <Loader title="Dashboard load ho raha hai" messages={["Server jaga rahe hain…", "Aapka data la rahe hain…", "Bas thoda aur…"]} /> : <Skeleton />;

  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-300">

      {/* ─── Welcome Hero ──────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border p-6 sm:p-8">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {greeting()}, {user?.full_name?.split(" ")[0] || "Student"} <span className="inline-block animate-bounce">👋</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-md">
              {inProgress
                ? "You have an exam in progress. Pick up where you left off!"
                : totalTests > 0
                  ? "Great consistency! Keep pushing towards your goal."
                  : "Welcome aboard! Start your first mock test to begin your journey."
              }
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {inProgress ? (
                <Button onClick={() => navigate({ to: "/play/$attemptId", params: { attemptId: String(inProgress.id) } })} className="rounded-xl gap-2 h-9">
                  <span dangerouslySetInnerHTML={{ __html: ii("play", "w-4 h-4") }} />
                  Continue Exam
                </Button>
              ) : (
                <Button onClick={() => navigate({ to: "/exams" })} className="rounded-xl gap-2 h-9">
                  <span dangerouslySetInnerHTML={{ __html: ii("play", "w-4 h-4") }} />
                  Start Mock Test
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate({ to: "/exams" })} className="rounded-xl h-9">
                Browse Exams
              </Button>
            </div>
          </div>
          {/* Streak & motivational */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="text-4xl">{streakEmoji(streakDays)}</div>
            <div className="text-2xl font-black tabular-nums">{streakDays}</div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Day Streak</div>
          </div>
        </div>
      </div>

      {/* ─── Request a Test / Feedback banner ──── */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: ii("sparkle", "w-5 h-5") }} />
          <p className="text-[13px] text-muted-foreground leading-snug">
            <span className="font-semibold text-foreground">कोई भी test चाहिए?</span>{" "}
            हमें message भेजो — हम उसे जल्द से जल्द add करने की कोशिश करेंगे। Feedback भी भेज सकते हो।
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setMsgOpen(true); setMsgSent(false); setMsgType("request"); }}
          className="rounded-xl gap-1.5 shrink-0 h-8"
        >
          <span dangerouslySetInnerHTML={{ __html: ii("lightning", "w-3.5 h-3.5") }} />
          Message
        </Button>
      </div>

      {/* ─── FREE + Donation banner ────────────── */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-green-50 to-emerald-50 p-5 sm:p-6">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-emerald-400/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2">
              <span className="rounded-full bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">100% Free</span>
              <span className="text-emerald-700 font-extrabold text-base sm:text-lg">ये सारे टेस्ट बिल्कुल फ्री हैं! 🎉</span>
            </div>
            <p className="text-[13px] text-emerald-900/80 leading-relaxed max-w-2xl">
              <b>All these tests are completely FREE</b> — aaram se apni taiyaari karo. Aage main notes,
              free books aur bhi बहुत kuch dene ki poori koshish karunga.
              <br />
              Abhi website thodi slow hai / apna domain nahi hai kyunki <b>main bhi ek student hu</b> aur paid
              domain/hosting ke paise nahi hain. Agar kisi ke paas <b>₹40–50</b> bhi extra hain to please donate
              karein — taaki sabhi log is website ka poora fayda le sakein. Agar in tests se aapko madad mile,
              to zaroor support karein. 🙏
              <br />
              <span className="text-emerald-800/70">Sirf jitna aaram se de sako — ₹10, ₹20 kuch bhi. Koi zabardasti nahi, poori tarah aapki marzi. Jitna type karoge bas utna hi katega, ek rupya extra nahi. 🙏</span>
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-2">
            <DonateButton />
            <span className="text-[10px] text-emerald-700/70">Secured by Razorpay 🔒</span>
          </div>
        </div>
      </div>
      {inProgress && (
        <Card className="border-primary/20 bg-primary/5 overflow-hidden">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">In Progress</Badge>
                <span className="text-[11px] text-muted-foreground">{(inProgress as any).exam_title}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{(inProgress as any).attempted_count ?? 0} / {(inProgress as any).total_questions ?? 0} Q answered</span>
                <span>{(inProgress as any).correct_count ?? 0} correct</span>
              </div>
              <ProgressBar pct={((inProgress as any).attempted_count ?? 0) / Math.max(1, (inProgress as any).total_questions ?? 1) * 100} color="bg-primary" />
            </div>
            <Button onClick={() => navigate({ to: "/play/$attemptId", params: { attemptId: String(inProgress.id) } })} className="rounded-xl gap-2 shrink-0">
              <span dangerouslySetInnerHTML={{ __html: ii("play", "w-4 h-4") }} />
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Quick KPIs ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KPI icon={ii("target")} label="Questions Solved" value={totalQuestions.toLocaleString()} />
        <KPI icon={ii("check")} label="Accuracy" value={`${accuracy}%`} sub={accuracy > 70 ? "Great!" : accuracy > 50 ? "Good" : ""} />
        <KPI icon={ii("clock")} label="Study Time" value={formatDuration(totalTime)} />
        <KPI icon={ii("book")} label="Mock Tests" value={totalTests} sub="attempted" />
      </div>

      {/* ─── Today's Goal + Performance ─────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Today's Goal */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span dangerouslySetInnerHTML={{ __html: ii("target", "w-4 h-4 text-amber-500") }} />
              Today's Goal
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-4 pb-5 space-y-3">
            <ProgressRing pct={todayPct} size={100} stroke={7} label="Daily Goal" sublabel={`${todayDone} / ${todayGoal} Q`} />
            <ProgressBar pct={todayPct} color="bg-amber-500" />
            <p className="text-[11px] text-muted-foreground text-center">
              {todayPct >= 100 ? "🎉 Goal achieved! Amazing consistency!" : todayPct >= 50 ? "Halfway there! Keep going!" : `${todayGoal - todayDone} questions to go`}
            </p>
          </CardContent>
        </Card>

        {/* Performance Overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span dangerouslySetInnerHTML={{ __html: ii("chart", "w-4 h-4 text-blue-500") }} />
              Performance Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.score_trend?.length > 0 ? (
              <div className="space-y-4">
                {/* Mini bar chart */}
                <div className="flex items-end gap-2 h-28">
                  {(data.score_trend as any[]).slice(-8).map((t: any, i: number) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[10px] font-medium tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{t.percentage}%</span>
                      <div className="w-full bg-primary/20 rounded-t-md hover:bg-primary/40 transition-colors" style={{ height: `${Math.max(4, t.percentage ?? 0)}%` }} />
                      <span className="text-[9px] text-muted-foreground truncate w-full text-center">{t.exam_title?.substring(0, 6)}</span>
                    </div>
                  ))}
                </div>
                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { l: "Correct", v: stats?.total_correct ?? 0, c: "text-emerald-500" },
                    { l: "Wrong", v: stats?.total_wrong ?? 0, c: "text-red-500" },
                    { l: "Skipped", v: (stats?.total_questions_attempted ?? 0) - (stats?.total_correct ?? 0) - (stats?.total_wrong ?? 0), c: "text-muted-foreground" },
                  ].map((s) => (
                    <div key={s.l} className="rounded-xl bg-muted/30 p-2.5">
                      <div className={`text-lg font-bold ${s.c}`}>{s.v}</div>
                      <div className="text-[10px] text-muted-foreground">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyBlock icon="chart" title="No performance data yet" cta="Take your first mock" to="/exams" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── AI Insights ────────────────────── */}
      <Card className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 border-violet-200/50 dark:border-violet-800/20">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: ii("sparkle", "w-5 h-5 text-violet-500") }} />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">AI Practice Recommendation</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                {accuracy < 60
                  ? "Focus on weak areas for maximum score improvement. Practice chapter-wise tests."
                  : totalTests < 3
                    ? "Take more mock tests to build your consistency and confidence."
                    : "You're doing great! Try full-length mocks under timed conditions."
                }
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate({ to: "/exams" })} className="rounded-xl gap-1.5 shrink-0">
            <span dangerouslySetInnerHTML={{ __html: ii("lightning", "w-3.5 h-3.5") }} />
            Practice Now
          </Button>
        </CardContent>
      </Card>

      {/* ─── Quick Actions ──────────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Quick Actions</h3>
        <div className="flex gap-4 overflow-x-auto scrollbar-none pb-1">
          <QuickAction icon={ii("play")} label="Start Mock" to="/exams" />
          <QuickAction icon={ii("book")} label="Subject Tests" to="/exams" />
          <QuickAction icon={ii("lightning")} label="Daily Challenge" to="/exams" />
          <QuickAction icon={ii("star")} label="PYQ Papers" to="/exams" />
          <QuickAction icon={ii("activity")} label="Analytics" to="/analytics" />
          <QuickAction icon={ii("target")} label="My Attempts" to="/attempts" />
          <QuickAction icon={ii("flame")} label="Revision" to="/exams" />
        </div>
      </div>

      {/* ─── Recent Activity ────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent Attempts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span dangerouslySetInnerHTML={{ __html: ii("activity", "w-4 h-4 text-emerald-500") }} />
                Recent Activity
              </span>
              <Link to="/attempts" className="text-[11px] font-normal text-muted-foreground hover:text-foreground transition-colors">View all</Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recent_attempts?.length > 0 ? (
              <div className="space-y-2">
                {(data.recent_attempts as any[]).slice(0, 4).map((a: any) => (
                  <Link key={a.id} to="/results/$attemptId" params={{ attemptId: String(a.id) }} className="flex items-center justify-between rounded-xl hover:bg-muted/30 px-3 py-2.5 -mx-3 transition-colors cursor-pointer group">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{a.exam_title || `Attempt #${a.id}`}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(a.submitted_at) || a.status}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold tabular-nums">{a.percentage}%</span>
                      <Badge variant={a.percentage >= 60 ? "secondary" : "outline"} className="text-[10px] px-1.5">
                        {a.score}/{a.max_score}
                      </Badge>
                      <span className="text-muted-foreground/30 group-hover:text-foreground transition-colors" dangerouslySetInnerHTML={{ __html: ii("arrowR", "w-3 h-3") }} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyBlock icon="activity" title="No attempts yet" cta="Start your first test" to="/exams" />
            )}
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span dangerouslySetInnerHTML={{ __html: ii("trophy", "w-4 h-4 text-amber-500") }} />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: "🔥", label: "3-Day Streak", earned: streakDays >= 3, color: streakDays >= 3 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/30" : "bg-muted/30 opacity-50" },
                { icon: "💯", label: "100 Questions", earned: totalQuestions >= 100, color: totalQuestions >= 100 ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/30" : "bg-muted/30 opacity-50" },
                { icon: "🎯", label: "Perfect Score", earned: (stats?.max_score_ever ?? 0) >= 100, color: (stats?.max_score_ever ?? 0) >= 100 ? "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/30" : "bg-muted/30 opacity-50" },
                { icon: "⚡", label: "Speed Demon", earned: totalTests >= 5, color: totalTests >= 5 ? "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800/30" : "bg-muted/30 opacity-50" },
                { icon: "📚", label: "Scholar", earned: totalTests >= 10, color: totalTests >= 10 ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/30" : "bg-muted/30 opacity-50" },
                { icon: "🏆", label: "Mock Master", earned: totalTests >= 20, color: totalTests >= 20 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/30" : "bg-muted/30 opacity-50" },
              ].map((a) => (
                <div key={a.label} className={`flex items-center gap-2.5 rounded-xl border p-3 transition-all duration-200 ${a.color} ${a.earned ? "hover:shadow-sm" : "grayscale"}`}>
                  <span className="text-lg">{a.icon}</span>
                  <div>
                    <div className="text-[11px] font-semibold">{a.label}</div>
                    <div className="text-[10px] text-muted-foreground">{a.earned ? "Earned" : "Locked"}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Request / Feedback dialog ──────── */}
      <Dialog open={msgOpen} onOpenChange={(o) => { setMsgOpen(o); if (!o) { setMsgSent(false); setMsgText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Message / Request a Test</DialogTitle>
            <DialogDescription>
              अगर किसी और test की ज़रूरत है या feedback देना है, तो नीचे लिखो। हम जल्द से जल्द add करने की कोशिश करेंगे।
            </DialogDescription>
          </DialogHeader>
          {msgSent ? (
            <div className="text-center py-6">
              <p className="text-2xl">🙏</p>
              <p className="mt-2 text-sm font-medium">Message भेज दिया गया है!</p>
              <p className="text-xs text-muted-foreground mt-1">धन्यवाद — हम जल्द ही देखेंगे।</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[
                  { k: "request", l: "Request Test" },
                  { k: "feedback", l: "Feedback" },
                  { k: "other", l: "Other" },
                ].map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setMsgType(o.k)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${msgType === o.k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:border-primary/40"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <Textarea
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="बताओ कौन-सा test चाहिए, या कोई feedback…"
                rows={4}
              />
              <Input
                value={msgEmail}
                onChange={(e) => setMsgEmail(e.target.value)}
                placeholder="Email (optional, reply के लिए)"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMsgOpen(false)}>Close</Button>
            {!msgSent && (
              <Button size="sm" onClick={submitMessage} disabled={!msgText.trim() || msgSending} className="gap-1.5">
                {msgSending ? "Sending…" : "Send"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Popular Exams quick access ─────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Popular Exams</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[
            { l: "SSC CGL", c: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/30", t: "text-blue-600" },
            { l: "SSC CHSL", c: "bg-sky-50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-800/30", t: "text-sky-600" },
            { l: "IBPS PO", c: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/30", t: "text-emerald-600" },
            { l: "RRB NTPC", c: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800/30", t: "text-orange-600" },
            { l: "UPSC CDS", c: "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800/30", t: "text-violet-600" },
            { l: "CTET", c: "bg-teal-50 border-teal-200 dark:bg-teal-950/20 dark:border-teal-800/30", t: "text-teal-600" },
          ].map((e) => (
            <Link key={e.l} to="/exams" className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3.5 ${e.c} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}>
              <span className={`text-xl font-bold ${e.t}`}>{e.l.split(" ")[0]}</span>
              <span className="text-[10px] text-muted-foreground">{e.l}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Empty state helper
   ══════════════════════════════════════════════════════════════ */

function EmptyBlock({ icon, title, cta, to }: { icon: keyof typeof I; title: string; cta: string; to: string }) {
  return (
    <div className="flex flex-col items-center py-8 gap-3 text-center">
      <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground/40" dangerouslySetInnerHTML={{ __html: ii(icon, "w-5 h-5") }} />
      <div>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      </div>
      <Link to={to} className="text-[11px] font-medium text-primary hover:underline">{cta} →</Link>
    </div>
  );
}
