import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { analyticsApi, authApi, ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PasswordInput } from "@/components/PasswordInput";
import { formatDate, formatDuration } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   Inline SVG icons — zero dependency
   ═══════════════════════════════════════════════════════════ */

const ico = (d: string) =>
  `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${d}</svg>`;

const I = {
  flame:    ico('<path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/>'),
  trophy:   ico('<path d="M5 3h14l-1 8H6L5 3zM6 11h12v3a4 4 0 01-8 0v-3z"/><path d="M8 3v5m8-5v5"/>'),
  target:   ico('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  check:    ico('<path d="M5 13l4 4L19 7"/>'),
  clock:    ico('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  book:     ico('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  sparkle:  ico('<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>'),
  share:    ico('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>'),
  camera:   ico('<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>'),
  lock:     ico('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'),
  mail:     ico('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  phone:    ico('<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>'),
  calendar: ico('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  shield:   ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  pencil:   ico('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  eye:      ico('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  monitor:  ico('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8M12 17v4"/>'),
  bell:     ico('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>'),
  activity: ico('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  award:    ico('<circle cx="12" cy="8" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>'),
  key:      ico('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  logout:   ico('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  edit3:    ico('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  checkCircle: ico('<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>'),
};

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function avatarInitial(name: string): string {
  return (name || "S").charAt(0).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < (name || "S").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function levelFromXP(xp: number): { level: number; title: string } {
  if (xp >= 10000) return { level: 50, title: "Grandmaster" };
  if (xp >= 5000)  return { level: 40, title: "Master" };
  if (xp >= 2000)  return { level: 30, title: "Expert" };
  if (xp >= 1000)  return { level: 20, title: "Advanced" };
  if (xp >= 500)   return { level: 15, title: "Intermediate" };
  if (xp >= 100)   return { level: 10, title: "Beginner" };
  return { level: 1, title: "Newcomer" };
}

function streakEmoji(days: number): string {
  if (days >= 30) return "🔥🔥🔥";
  if (days >= 7) return "🔥🔥";
  if (days >= 3) return "🔥";
  return "✨";
}

/* ═══════════════════════════════════════════════════════════
   Progress bar
   ═══════════════════════════════════════════════════════════ */

function ProgressBar({ pct, color = "bg-primary" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Stat Pill
   ═══════════════════════════════════════════════════════════ */

function StatPill({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card/80 p-3 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary"
        dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="min-w-0">
        <div className="text-lg font-bold tabular-nums tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Achievement badge
   ═══════════════════════════════════════════════════════════ */

function BadgeCard({ emoji, label, earned, desc }: { emoji: string; label: string; earned: boolean; desc: string }) {
  return (
    <div className={`relative group flex flex-col items-center gap-1.5 rounded-2xl border p-3.5 transition-all duration-200 ${
      earned
        ? "bg-card hover:shadow-md hover:-translate-y-0.5 cursor-default"
        : "bg-muted/20 opacity-40 grayscale hover:opacity-60 cursor-help"
    }`}>
      <span className="text-2xl">{earned ? emoji : "🔒"}</span>
      <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
      {!earned && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/90 rounded-2xl">
          <p className="text-[10px] text-muted-foreground text-center px-2">{desc}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Accordion section
   ═══════════════════════════════════════════════════════════ */

function Accordion({ title, icon, open, onToggle, children, badge }: {
  title: string; icon: string; open: boolean; onToggle: () => void; children: React.ReactNode; badge?: string;
}) {
  return (
    <div className="border rounded-2xl overflow-hidden transition-all duration-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: icon }} />
          <span className="text-sm font-semibold">{title}</span>
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">{badge}</span>}
        </div>
        <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 animate-slide-down">{children}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const isGuestUser = useAuthStore((s) => s.isGuest)();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [bio, setBio] = useState("");
  const [targetExam, setTargetExam] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFullName(user?.full_name || "");
    setPhone(user?.phone || "");
  }, [user]);

  /* ── Analytics for stats ─────────────── */
  const { data } = useQuery({
    queryKey: ["profile-analytics"],
    queryFn: () => analyticsApi.dashboard(),
    enabled: !isGuestUser,
  });
  const stats = (data?.quick_stats || {}) as Record<string, any>;
  const totalQ = stats?.total_questions_attempted || 0;
  const totalTests = stats?.total_tests || (data?.exam_stats?.reduce((s: number, e: any) => s + (e.attempts || 0), 0) || 0);
  const totalTime = stats?.total_time_seconds || 0;
  const accuracy = stats?.accuracy || (totalQ > 0 ? Math.round(((stats?.total_correct || 0) / totalQ) * 100) : 0);
  const xp = totalQ * 2 + totalTests * 10 + Math.floor(totalTime / 60);
  const streakDays = stats?.streak_days || 0;
  const { level, title: levelTitle } = levelFromXP(xp);

  /* ── Profile completion ──────────────── */
  const completionChecks = useMemo(() => [
    { label: "Display name", done: !!(user?.full_name) },
    { label: "Email", done: !!(user?.email) },
    { label: "Phone", done: !!(user?.phone) },
    { label: "Bio", done: !!bio },
    { label: "Target Exam", done: !!targetExam },
  ], [user, bio, targetExam]);
  const completedCount = completionChecks.filter(c => c.done).length;
  const completionPct = Math.round((completedCount / completionChecks.length) * 100);

  /* ── Achievements ────────────────────── */
  const achievements = useMemo(() => [
    { emoji: "💯", label: "100 Questions", earned: totalQ >= 100, desc: "Answer 100 questions" },
    { emoji: "🔥", label: "7-Day Streak", earned: streakDays >= 7, desc: "Study 7 days in a row" },
    { emoji: "⚡", label: "Fast Solver", earned: accuracy >= 70 && totalQ >= 50, desc: "70%+ accuracy on 50+ Q" },
    { emoji: "🎯", label: "Accuracy Master", earned: accuracy >= 85 && totalQ >= 100, desc: "85%+ accuracy on 100+ Q" },
    { emoji: "📚", label: "Mock Master", earned: totalTests >= 10, desc: "Complete 10 mock tests" },
    { emoji: "🏆", label: "Perfect Score", earned: (stats?.best_score || 0) >= 100, desc: "Score 100% on any test" },
  ], [totalQ, streakDays, accuracy, totalTests, stats]);

  /* ── Save profile ────────────────────── */
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setError("");
    if (password && password !== password2) { setError("Passwords do not match"); return; }
    if (password && password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = { full_name: fullName.trim(), phone: phone.trim() };
      if (password) body.password = password;
      const res = await authApi.updateMe(body);
      setUser(res.user);
      setPassword(""); setPassword2("");
      setMsg("Profile updated successfully");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally { setSaving(false); }
  };

  /* ── Share ───────────────────────────── */
  const shareProfile = () => {
    navigator.clipboard.writeText(window.location.href);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  /* ── Not signed in ───────────────────── */
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center py-20 text-center space-y-4 animate-in fade-in">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
            <span dangerouslySetInnerHTML={{ __html: I.shield.replace("w-5 h-5", "w-8 h-8 text-muted-foreground/40") }} />
          </div>
          <h2 className="text-xl font-bold">Not signed in</h2>
          <p className="text-sm text-muted-foreground max-w-xs">Sign in to access your profile, achievements, and learning identity.</p>
          <Link to="/login"><Button className="rounded-xl">Sign In</Button></Link>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════ */
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-300">

      {/* ═══════ HERO BANNER ═══════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-primary/10 to-violet-500/5 border">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl" />

        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full ${avatarColor(user.full_name || "S")} flex items-center justify-center text-white text-3xl sm:text-4xl font-bold shadow-lg ring-4 ring-background`}>
                {avatarInitial(user.full_name || "S")}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-card border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-200 opacity-0 group-hover:opacity-100"
                title="Upload photo"
              >
                <span dangerouslySetInnerHTML={{ __html: I.camera.replace("w-5 h-5", "w-3.5 h-3.5") }} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{user.full_name || "Student"}</h1>
                <p className="text-sm text-muted-foreground">{user.email || ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isGuestUser ? (
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600">Guest</Badge>
                ) : (
                  <>
                    <Badge className="text-[10px] bg-primary/10 text-primary hover:bg-primary/15 border-0">
                      Level {level} · {levelTitle}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">{xp.toLocaleString()} XP</Badge>
                    {streakDays > 0 && (
                      <span className="text-[11px] font-medium text-amber-500">{streakEmoji(streakDays)} {streakDays}d streak</span>
                    )}
                  </>
                )}
                <span className="text-[10px] text-muted-foreground">
                  <span dangerouslySetInnerHTML={{ __html: I.calendar.replace("w-5 h-5", "w-3 h-3 inline -mt-0.5 mr-1") }} />
                  {(user as any).created_at ? formatDate((user as any).created_at) : "Welcome!"}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={shareProfile}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                <span dangerouslySetInnerHTML={{ __html: shared ? I.checkCircle.replace("w-5 h-5", "w-3.5 h-3.5 text-emerald-500") : I.share.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                {shared ? "Copied" : "Share"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ PROFILE COMPLETION ════════════════════ */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Profile Completion</h3>
            <span className="text-sm font-bold tabular-nums">{completionPct}%</span>
          </div>
          <ProgressBar pct={completionPct} color={completionPct === 100 ? "bg-emerald-500" : "bg-primary"} />
          {completionPct < 100 && (
            <div className="flex flex-wrap gap-1.5">
              {completionChecks.filter(c => !c.done).map(c => (
                <span key={c.label} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
                  + {c.label}
                </span>
              ))}
            </div>
          )}
          {completionPct === 100 && (
            <p className="text-[11px] text-emerald-500 font-medium">🎉 Profile complete! All badges unlocked.</p>
          )}
        </CardContent>
      </Card>

      {/* ═══════ QUICK STATS ════════════════════════════ */}
      {!isGuestUser && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatPill icon={I.book} label="Tests Done" value={totalTests} />
          <StatPill icon={I.target} label="Q Solved" value={totalQ.toLocaleString()} />
          <StatPill icon={I.clock} label="Study Time" value={formatDuration(totalTime)} />
          <StatPill icon={I.check} label="Accuracy" value={`${accuracy}%`} />
        </div>
      )}

      {/* ═══════ EDIT PROFILE — accordion ═════════════ */}
      <form onSubmit={onSave} className="space-y-3">
        {/* Personal Info */}
        <Accordion
          title="Personal Information"
          icon={I.pencil}
          open={expandedSection === "personal"}
          onToggle={() => setExpandedSection(expandedSection === "personal" ? null : "personal")}
          badge={completionPct < 100 ? "Incomplete" : undefined}
        >
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Display Name</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={150}
                  className="rounded-xl h-9 text-sm" placeholder="Your full name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <span dangerouslySetInnerHTML={{ __html: I.mail.replace("w-5 h-5", "w-3 h-3") }} />
                  Email
                </Label>
                <Input value={user.email || ""} disabled
                  className="rounded-xl h-9 text-sm bg-muted/30 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <span dangerouslySetInnerHTML={{ __html: I.phone.replace("w-5 h-5", "w-3 h-3") }} />
                  Phone
                </Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)}
                  className="rounded-xl h-9 text-sm" placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Target Exam</Label>
                <Input value={targetExam} onChange={e => setTargetExam(e.target.value)}
                  className="rounded-xl h-9 text-sm" placeholder="e.g. SSC CHSL 2026" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bio</Label>
              <Input value={bio} onChange={e => setBio(e.target.value)}
                className="rounded-xl h-9 text-sm" placeholder="Tell us about your preparation journey…" />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span dangerouslySetInnerHTML={{ __html: I.calendar.replace("w-5 h-5", "w-3 h-3") }} />
              Joined {(user as any).created_at ? formatDate((user as any).created_at) : "recently"}
              {user.auth_provider && (
                <><span>·</span><span className="capitalize">via {user.auth_provider}</span></>
              )}
            </div>
          </div>
        </Accordion>

        {/* Security */}
        {!isGuestUser && (
          <Accordion
            title="Security Center"
            icon={I.shield}
            open={expandedSection === "security"}
            onToggle={() => setExpandedSection(expandedSection === "security" ? null : "security")}
          >
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <span dangerouslySetInnerHTML={{ __html: I.key.replace("w-5 h-5", "w-3 h-3") }} />
                    New Password
                  </Label>
                  <PasswordInput value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password" placeholder="Leave blank to keep current" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirm Password</Label>
                  <PasswordInput value={password2} onChange={e => setPassword2(e.target.value)}
                    autoComplete="new-password" placeholder="Re-enter new password" />
                </div>
              </div>
              <div className="flex items-center gap-6 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span dangerouslySetInnerHTML={{ __html: I.monitor.replace("w-5 h-5", "w-3 h-3") }} />
                  Last login: just now
                </span>
                <span className="flex items-center gap-1">
                  <span dangerouslySetInnerHTML={{ __html: I.lock.replace("w-5 h-5", "w-3 h-3") }} />
                  Auth: {user.auth_provider || "password"}
                </span>
              </div>
            </div>
          </Accordion>
        )}
      </form>

      {/* ═══════ SAVE / ERROR / SUCCESS ════════════════ */}
      {error && (
        <div className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-4 py-2.5">{error}</div>
      )}
      {msg && (
        <div className="text-[11px] text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-4 py-2.5">{msg}</div>
      )}
      <div className="flex gap-2">
        <Button type="submit" onClick={onSave} disabled={saving} className="rounded-xl gap-2 h-9">
          <span dangerouslySetInnerHTML={{ __html: I.checkCircle.replace("w-5 h-5", "w-4 h-4") }} />
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {/* ═══════ ACHIEVEMENTS ══════════════════════════ */}
      {!isGuestUser && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Achievements</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {achievements.map(a => (
              <BadgeCard key={a.label} emoji={a.emoji} label={a.label} earned={a.earned} desc={a.desc} />
            ))}
          </div>
        </div>
      )}

      {/* ═══════ AI PROFILE INSIGHT ════════════════════ */}
      {!isGuestUser && (totalQ > 0 || totalTests > 0) && (
        <Card className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 border-violet-200/50 dark:border-violet-800/20 overflow-hidden">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: I.sparkle.replace("w-5 h-5", "w-5 h-5 text-violet-500") }} />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">AI Profile Insight</h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  {accuracy >= 70
                    ? `You're performing well at ${accuracy}% accuracy. Focus on speed — try timed full-length mocks.`
                    : totalTests < 3
                      ? "Take a few more mock tests so we can analyze your patterns and give personalized recommendations."
                      : "Your accuracy can improve with targeted chapter-wise practice. Start with high-weightage topics."}
                </p>
              </div>
            </div>
            <Link to="/exams">
              <Button size="sm" className="rounded-xl gap-1.5 shrink-0">
                <span dangerouslySetInnerHTML={{ __html: I.activity.replace("w-5 h-5", "w-3.5 h-3.5") }} />
                Practice Now
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ═══════ GUEST WARNING ════════════════════════ */}
      {isGuestUser && (
        <Card className="border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-800/20">
          <CardContent className="p-5 flex items-start gap-3">
            <span className="text-lg shrink-0">⚠️</span>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Guest Session</h3>
              <p className="text-xs text-muted-foreground">
                Your progress is tied to this browser. Sign in with Google, phone, or email to keep a permanent account and unlock achievements, streaks, and AI insights.
              </p>
              <Link to="/login"><Button variant="outline" size="sm" className="rounded-lg mt-1 h-7 text-[11px]">Sign in to save progress</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
