import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authApi, notificationsApi, platformApi, type NotificationPreferences,
} from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { usePlatformStore } from "@/stores/platformStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════
   Inline SVG — Lucide-style icons, zero dependency
   ══════════════════════════════════════════════════════════ */

const si = (d: string) =>
  `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${d}</svg>`;

const I = {
  search:     si('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  user:       si('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  lock:       si('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'),
  palette:    si('<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C22.965 6.012 17.461 2 12 2z"/>'),
  bell:       si('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>'),
  book:       si('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  eye:        si('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  link:       si('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>'),
  shield:     si('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  alert:      si('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'),
  monitor:    si('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8M12 17v4"/>'),
  layers:     si('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  settings:   si('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>'),
  file:       si('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>'),
  globe:      si('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>'),
  sun:        si('<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
  moon:       si('<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'),
  check:      si('<path d="M5 13l4 4L19 7"/>'),
  plus:       si('<path d="M12 5v14M5 12h14"/>'),
  edit:       si('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  trash:      si('<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
  creditCard: si('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><path d="M1 10h22"/>'),
  help:       si('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  download:   si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  flag:       si('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'),
  activity:   si('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  zap:        si('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
  save:       si('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  undo:       si('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>'),
  arrowRight: si('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  arrowLeft:  si('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
};

/* ══════════════════════════════════════════════════════════
   Toggle Switch — CSS-only, animated
   ══════════════════════════════════════════════════════════ */

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        checked ? "bg-primary" : "bg-muted-foreground/20"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition duration-200 ${
        checked ? "translate-x-[18px]" : "translate-x-[3px]"
      }`} />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   Section row with toggle
   ══════════════════════════════════════════════════════════ */

function ToggleRow({ icon, title, desc, checked, onChange, disabled }: {
  icon: string; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 shrink-0 text-muted-foreground" dangerouslySetInnerHTML={{ __html: icon.replace("w-5 h-5", "w-3.5 h-3.5") }} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Radio card (for theme selection)
   ══════════════════════════════════════════════════════════ */

function RadioCard({ icon, label, desc, selected, onClick }: {
  icon: string; label: string; desc?: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200 ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/20 hover:bg-muted/30"
      }`}>
      <span className="shrink-0 text-primary" dangerouslySetInnerHTML={{ __html: icon.replace("w-5 h-5", "w-5 h-5") }} />
      <div className="flex-1 text-left">
        <p className="text-[13px] font-semibold">{label}</p>
        {desc && <p className="text-[10px] text-muted-foreground">{desc}</p>}
      </div>
      {selected && <span className="shrink-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" /></span>}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   Section header with icon
   ══════════════════════════════════════════════════════════ */

function SectionHead({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: icon }} />
      <div>
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Nav item with icon
   ══════════════════════════════════════════════════════════ */

function NavButton({ id, icon, label, active, onClick }: {
  id: string; icon: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}>
      <span className="shrink-0" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="text-[13px]">{label}</span>
      {active && <span className="ml-auto w-0.5 h-5 rounded-full bg-primary" />}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION DEFINITIONS
   ══════════════════════════════════════════════════════════ */

type StudentSection = "general" | "security" | "study" | "notifications" | "appearance" | "connected" | "privacy" | "danger" | "help";
type AdminSection = "system" | "users" | "content" | "exam_config" | "integrations" | "monetization" | "notifications" | "flags" | "monitoring";

const STUDENT_NAV: { id: StudentSection; icon: string; label: string }[] = [
  { id: "general", icon: I.user, label: "General" },
  { id: "security", icon: I.lock, label: "Security" },
  { id: "study", icon: I.book, label: "Study Preferences" },
  { id: "notifications", icon: I.bell, label: "Notifications" },
  { id: "appearance", icon: I.palette, label: "Appearance" },
  { id: "connected", icon: I.link, label: "Connected Accounts" },
  { id: "privacy", icon: I.shield, label: "Privacy & Data" },
  { id: "danger", icon: I.alert, label: "Danger Zone" },
  { id: "help", icon: I.help, label: "Help & Legal" },
];

const ADMIN_NAV: { id: AdminSection; icon: string; label: string }[] = [
  { id: "system", icon: I.monitor, label: "System" },
  { id: "users", icon: I.user, label: "Users & Access" },
  { id: "content", icon: I.layers, label: "Content" },
  { id: "exam_config", icon: I.file, label: "Exam Configuration" },
  { id: "integrations", icon: I.link, label: "Integrations" },
  { id: "monetization", icon: I.creditCard, label: "Monetization" },
  { id: "notifications", icon: I.bell, label: "Notification Center" },
  { id: "flags", icon: I.flag, label: "Feature Flags" },
  { id: "monitoring", icon: I.activity, label: "Monitoring" },
];

/* ══════════════════════════════════════════════════════════
   SETTINGS SHELL — Premium layout
   ══════════════════════════════════════════════════════════ */

function SettingsShell({ title, subtitle, nav, active, onChange, children }: {
  title: string; subtitle: string; nav: { id: string; icon: string; label: string }[];
  active: string; onChange: (id: string) => void; children: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filteredNav = useMemo(() => {
    if (!search.trim()) return nav;
    const q = search.toLowerCase();
    return nav.filter(n => n.label.toLowerCase().includes(q));
  }, [nav, search]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5 animate-in fade-in duration-300">
      {/* Header + search */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Settings search */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" dangerouslySetInnerHTML={{ __html: I.search.replace("w-5 h-5", "w-4 h-4") }} />
        <input type="text" placeholder="Search settings…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border bg-muted/30 pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all" />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/60">⌘K</kbd>
      </div>

      {/* Layout: nav + content */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Desktop sidebar */}
        <nav className="hidden lg:block w-52 shrink-0 space-y-1 sticky top-20 self-start">
          {filteredNav.map(n => (
            <NavButton key={n.id} id={n.id} icon={n.icon} label={n.label} active={active === n.id} onClick={() => onChange(n.id)} />
          ))}
        </nav>

        {/* Mobile nav dropdown */}
        <div className="lg:hidden w-full">
          <button onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm font-medium">
            <span className="flex items-center gap-2">
              <span dangerouslySetInnerHTML={{ __html: nav.find(n => n.id === active)?.icon || I.settings }} />
              {nav.find(n => n.id === active)?.label}
            </span>
            <svg className={`w-4 h-4 transition-transform ${mobileNavOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {mobileNavOpen && (
            <div className="mt-2 border rounded-2xl p-2 space-y-1 animate-slide-down bg-card">
              {filteredNav.map(n => (
                <NavButton key={n.id} id={n.id} icon={n.icon} label={n.label} active={active === n.id} onClick={() => { onChange(n.id); setMobileNavOpen(false); }} />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Panel wrapper — premium card with optional icon header
   ══════════════════════════════════════════════════════════ */

function Panel({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="py-4 px-5 border-b bg-muted/20">
        <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
          {icon && <span className="text-primary" dangerouslySetInnerHTML={{ __html: icon.replace("w-5 h-5", "w-4 h-4") }} />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 py-5">{children}</CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════
   Helper components
   ══════════════════════════════════════════════════════════ */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function FlagTag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${on ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "border text-muted-foreground"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
      {label}: {on ? "on" : "off"}
    </span>
  );
}

function AdminLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-xl border p-3 hover:border-primary/30 hover:bg-muted/30 transition-all duration-150 group">
      <span className="text-[13px] font-medium">{label}</span>
      <span className="text-muted-foreground/30 group-hover:text-primary transition-colors" dangerouslySetInnerHTML={{ __html: I.arrowRight.replace("w-5 h-5", "w-4 h-4") }} />
    </Link>
  );
}

/* ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const capabilities = useAuthStore((s) => s.capabilities);
  const isAdmin = Boolean(capabilities?.can_administer);
  if (!user) return <div className="max-w-5xl mx-auto px-6 py-8"><div className="flex flex-col items-center py-20 text-center space-y-4"><span className="text-3xl">🔐</span><h2 className="text-lg font-bold">Sign in to manage settings</h2><p className="text-sm text-muted-foreground">Access your preferences after signing in</p><Link to="/login"><Button className="rounded-xl">Sign In</Button></Link></div></div>;
  return isAdmin ? <AdminSettingsShell /> : <StudentSettingsShell />;
}

/* ══════════════════════════════════════════════════════════
   STUDENT SETTINGS
   ══════════════════════════════════════════════════════════ */

function StudentSettingsShell() {
  const [section, setSection] = useState<StudentSection>("general");
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const appName = usePlatformStore((s) => s.appName);
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);

  const nav = STUDENT_NAV.filter(n => {
    if (n.id === "security" && isGuest()) return false;
    if (n.id === "notifications" && !(isEnabled("NOTIFICATIONS_ENABLED", true) || isEnabled("ENABLE_NOTIFICATIONS", true))) return false;
    return true;
  });

  return (
    <SettingsShell title="Settings" subtitle={`${appName()} · student workspace`} nav={nav} active={section} onChange={(id) => setSection(id as StudentSection)}>
      {section === "general" && <GeneralPanel />}
      {section === "security" && <SecurityPanel />}
      {section === "study" && <StudyPanel />}
      {section === "notifications" && <NotificationPrefsPanel />}
      {section === "appearance" && <AppearancePanel />}
      {section === "connected" && <ConnectedPanel />}
      {section === "privacy" && <PrivacyPanel />}
      {section === "danger" && <DangerPanel />}
      {section === "help" && <HelpPanel />}
      {isGuest() && section === "general" && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/10 dark:border-amber-800/20 p-4 flex items-start gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">Guest Session</p>
            <p className="text-xs text-muted-foreground">Progress is tied to this browser. <Link to="/login" className="underline font-medium text-primary">Sign in</Link> to keep a permanent account.</p>
          </div>
        </div>
      )}
    </SettingsShell>
  );
}

/* ═══════ GENERAL ════════════════════════════════════════ */
function GeneralPanel() {
  const user = useAuthStore((s) => s.user);
  const [lang, setLang] = useState(() => localStorage.getItem("pref_lang") || "en");
  const [tz, setTz] = useState(() => localStorage.getItem("pref_tz") || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.user} title="General" desc="Your account basics and regional preferences" />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Display Name"><Input value={user?.full_name || ""} readOnly className="rounded-xl h-9 text-sm bg-muted/30 cursor-not-allowed" /></Field>
        <Field label="Email"><Input value={user?.email || ""} readOnly className="rounded-xl h-9 text-sm bg-muted/30 cursor-not-allowed" /></Field>
        <Field label="Language"><select value={lang} onChange={e => setLang(e.target.value)} className="w-full rounded-xl border bg-card h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer"><option value="en">English</option><option value="hi">हिन्दी (Hindi)</option></select></Field>
        <Field label="Timezone"><select value={tz} onChange={e => setTz(e.target.value)} className="w-full rounded-xl border bg-card h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer"><option value="Asia/Kolkata">Asia/Kolkata (IST)</option><option value="UTC">UTC</option></select></Field>
      </div>
      <Button size="sm" onClick={() => { localStorage.setItem("pref_lang", lang); localStorage.setItem("pref_tz", tz); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className="rounded-xl gap-1.5 h-8">{saved ? "✓ Saved" : "Save Preferences"}</Button>
    </div>
  );
}

/* ═══════ SECURITY ════════════════════════════════════════ */
function SecurityPanel() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.lock} title="Security" desc="Password, sessions, and authentication" />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-2xl border p-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: I.lock.replace("w-5 h-5","w-4 h-4") }} />
            <div className="min-w-0"><p className="text-sm font-semibold">Password</p><p className="text-[11px] text-muted-foreground truncate">Last changed: —</p></div>
          </div>
          <Link to="/profile" className="shrink-0"><Button variant="outline" size="sm" className="rounded-xl h-8 text-[11px]">Change</Button></Link>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-2xl border p-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground" dangerouslySetInnerHTML={{ __html: I.monitor.replace("w-5 h-5","w-4 h-4") }} />
            <div className="min-w-0"><p className="text-sm font-semibold">Active Sessions</p><p className="text-[11px] text-muted-foreground truncate">1 device · {user?.auth_provider || "password"} auth</p></div>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl h-8 text-[11px] shrink-0">Manage</Button>
        </div>
      </div>
    </div>
  );
}

/* ═══════ STUDY PREFERENCES ═══════════════════════════════ */
function StudyPanel() {
  const [goal, setGoal] = useState(() => Number(localStorage.getItem("daily_goal")) || 50);
  const [reminder, setReminder] = useState(() => localStorage.getItem("study_reminder") === "true");
  const [pomodoro, setPomodoro] = useState(() => localStorage.getItem("pomodoro") === "true");
  const [aiRecs, setAiRecs] = useState(() => localStorage.getItem("ai_recs") !== "false");
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem("daily_goal", String(goal));
    localStorage.setItem("study_reminder", String(reminder));
    localStorage.setItem("pomodoro", String(pomodoro));
    localStorage.setItem("ai_recs", String(aiRecs));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <SectionHead icon={I.book} title="Study Preferences" desc="Customize how you learn" />
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><Label>Daily Question Goal</Label><span className="font-bold tabular-nums">{goal}</span></div>
          <input type="range" min="10" max="200" step="10" value={goal} onChange={e => setGoal(Number(e.target.value))} className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm" />
        </div>
        <ToggleRow icon={I.bell} title="Study Reminder" desc="Get reminded at your preferred study time" checked={reminder} onChange={setReminder} />
        <ToggleRow icon={I.zap} title="Pomodoro Timer" desc="25 min study, 5 min break intervals" checked={pomodoro} onChange={setPomodoro} />
        <ToggleRow icon={I.settings} title="AI Recommendations" desc="Receive personalized practice suggestions" checked={aiRecs} onChange={setAiRecs} />
      </div>
      <Button size="sm" onClick={save} className="rounded-xl gap-1.5 h-8">{saved ? "✓ Saved" : "Save Preferences"}</Button>
    </div>
  );
}

/* ═══════ NOTIFICATION PREFERENCES ═══════════════════════ */

function NotificationPrefsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["notif-prefs"], queryFn: () => notificationsApi.getPreferences() });
  const [local, setLocal] = useState<NotificationPreferences | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setLocal(data); }, [data]);

  const saveMut = useMutation({
    mutationFn: () => notificationsApi.updatePreferences({ channels: local!.channels, categories: local!.categories, telegram_chat_id: local!.telegram_chat_id }),
    onSuccess: (res) => { setLocal(res.item); setSaved(true); qc.invalidateQueries({ queryKey: ["notif-prefs"] }); setTimeout(() => setSaved(false), 1500); },
  });

  if (isLoading || !local) return <Panel title="Notification Preferences"><p className="text-sm text-muted-foreground">Loading…</p></Panel>;

  const ck = (k: keyof NotificationPreferences["channels"]) => setLocal({ ...local, channels: { ...local.channels, [k]: !local.channels[k] } });
  const ct = (k: keyof NotificationPreferences["categories"]) => { if (k === "security") return; setLocal({ ...local, categories: { ...local.categories, [k]: !local.categories[k] } }); };

  return (
    <div className="space-y-5">
      <SectionHead icon={I.bell} title="Notifications" desc="Control how and when you're notified" />
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Channels</p>
          {(["in_app","email","push","telegram","whatsapp","sms"] as Array<keyof NotificationPreferences["channels"]>).map(k => (
            <ToggleRow key={k} icon={k==="in_app"?I.bell:k==="email"?I.file:k==="telegram"?I.link:k==="sms"?I.file:I.bell}
              title={k.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
              desc={k==="in_app"?"Inside the platform":k==="email"?"Via email":k==="telegram"?"Via Telegram bot":"Via SMS"}
              checked={!!local.channels[k]} onChange={() => ck(k)} />
          ))}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Alert Types</p>
          {(["exam_alerts","result_alerts","reminders","system","security","marketing"] as Array<keyof NotificationPreferences["categories"]>).map(k => (
            <ToggleRow key={k} icon={k==="security"?I.shield:I.bell}
              title={k.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
              desc={k==="security"?"Always on — login and account alerts":"Receive these notifications"}
              checked={!!local.categories[k]} onChange={() => ct(k)} disabled={k==="security"} />
          ))}
        </div>
      </div>
      <Button size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()} className="rounded-xl gap-1.5 h-8">
        {saved ? "✓ Saved" : saveMut.isPending ? "Saving…" : "Save Preferences"}
      </Button>
    </div>
  );
}

/* ═══════ APPEARANCE ═════════════════════════════════════ */

function AppearancePanel() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("font_size")) || 16);
  const [compact, setCompact] = useState(() => localStorage.getItem("compact_mode") === "true");
  const [animations, setAnimations] = useState(() => localStorage.getItem("reduce_animations") !== "true");

  const save = useCallback(() => {
    localStorage.setItem("theme", theme);
    localStorage.setItem("font_size", String(fontSize));
    localStorage.setItem("compact_mode", String(compact));
    localStorage.setItem("reduce_animations", String(!animations));
    if (theme === "dark") document.documentElement.classList.add("dark");
    else if (theme === "light") document.documentElement.classList.remove("dark");
  }, [theme, fontSize, compact, animations]);

  return (
    <div className="space-y-5">
      <SectionHead icon={I.palette} title="Appearance" desc="Customize how Cronyzo looks" />
      <div className="space-y-3">
        <Label className="text-xs font-semibold">Theme</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RadioCard icon={I.sun} label="Light" desc="Clean & bright" selected={theme==="light"} onClick={() => setTheme("light")} />
          <RadioCard icon={I.moon} label="Dark" desc="Easy on eyes" selected={theme==="dark"} onClick={() => setTheme("dark")} />
          <RadioCard icon={I.monitor} label="System" desc="Follows OS" selected={theme==="system"} onClick={() => setTheme("system")} />
        </div>
        {/* Live preview card */}
        <div className={`rounded-2xl border p-4 transition-colors duration-300 ${theme==="dark"?"bg-slate-900 text-slate-100 border-slate-700":theme==="light"?"bg-white text-slate-800":"bg-background text-foreground"}`}>
          <div className="flex gap-2 mb-3"><div className="w-3 h-3 rounded-full bg-red-400"/><div className="w-3 h-3 rounded-full bg-amber-400"/><div className="w-3 h-3 rounded-full bg-emerald-400"/></div>
          <p className="text-xs font-medium">Live preview</p><p className="text-[10px] opacity-60">This is how cards and text will appear.</p>
        </div>
        <div className="space-y-2"><div className="flex justify-between text-xs"><Label>Font Size</Label><span className="font-bold">{fontSize}px</span></div><input type="range" min="12" max="22" step="1" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm" /></div>
        <ToggleRow icon={I.settings} title="Compact Mode" desc="Reduce spacing for denser layouts" checked={compact} onChange={setCompact} />
        <ToggleRow icon={I.zap} title="Animations" desc="Smooth transitions and micro-interactions" checked={animations} onChange={setAnimations} />
      </div>
      <Button size="sm" onClick={save} className="rounded-xl gap-1.5 h-8">Apply Appearance</Button>
    </div>
  );
}

/* ═══════ CONNECTED ACCOUNTS ════════════════════════════ */
function ConnectedPanel() {
  const user = useAuthStore((s) => s.user);
  const accounts = [
    { name: "Google", icon: "G", bg: "bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400", connected: user?.auth_provider === "google" },
    { name: "Telegram", icon: "✈", bg: "bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400", connected: false },
    { name: "GitHub", icon: "GH", bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", connected: false },
  ];
  return (
    <div className="space-y-5">
      <SectionHead icon={I.link} title="Connected Accounts" desc="Link accounts for easy sign-in" />
      <div className="space-y-3">
        {accounts.map(a => (
          <div key={a.name} className="flex items-center justify-between rounded-2xl border p-4 hover:border-primary/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${a.bg} flex items-center justify-center text-sm font-bold`}>{a.icon}</div>
              <div><p className="text-sm font-medium">{a.name}</p><p className="text-[10px] text-muted-foreground">{a.connected ? "Connected" : "Not connected"}</p></div>
            </div>
            <Badge variant={a.connected ? "secondary" : "outline"} className="text-[10px]">{a.connected ? "Connected" : "Connect"}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════ PRIVACY & DATA ════════════════════════════════ */
function PrivacyPanel() {
  const [pub, setPub] = useState(false);
  const [hideEmail, setHideEmail] = useState(true);
  const [shareAnalytics, setShareAnalytics] = useState(true);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.shield} title="Privacy & Data" desc="Control your data and visibility" />
      <ToggleRow icon={I.eye} title="Public Profile" desc="Allow others to find you by name" checked={pub} onChange={setPub} />
      <ToggleRow icon={I.file} title="Hide Email" desc="Keep email private from other students" checked={hideEmail} onChange={setHideEmail} />
      <ToggleRow icon={I.settings} title="Analytics Sharing" desc="Help improve by sharing anonymized data" checked={shareAnalytics} onChange={setShareAnalytics} />
      <div className="pt-3 border-t space-y-2">
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-8 w-full justify-start" onClick={() => {}}><span dangerouslySetInnerHTML={{ __html: I.download.replace("w-5 h-5","w-3.5 h-3.5") }} />Download My Data</Button>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-8 w-full justify-start" onClick={() => {}}><span dangerouslySetInnerHTML={{ __html: I.trash.replace("w-5 h-5","w-3.5 h-3.5") }} />Clear Search History</Button>
      </div>
    </div>
  );
}

/* ═══════ DANGER ZONE ═══════════════════════════════════ */
function DangerPanel() {
  const [confirmDelete, setConfirmDelete] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.alert} title="Danger Zone" desc="Irreversible account actions" />
      <div className="rounded-2xl border border-red-200 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-red-500 mt-0.5" dangerouslySetInnerHTML={{ __html: I.alert.replace("w-5 h-5","w-4 h-4") }} />
          <div><p className="text-sm font-semibold text-red-600 dark:text-red-400">Delete Account</p><p className="text-[11px] text-muted-foreground">Permanently delete your account and all data. This cannot be undone.</p></div>
        </div>
        {!showDelete ? (
          <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} className="rounded-xl h-8">Delete Account</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-red-500">Type "DELETE" to confirm:</p>
            <div className="flex gap-2"><Input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} placeholder='Type "DELETE"' className="rounded-xl h-8 text-sm" /><Button variant="destructive" size="sm" disabled={confirmDelete!=="DELETE"} className="rounded-xl h-8 shrink-0">Confirm</Button><Button variant="outline" size="sm" onClick={()=>{setShowDelete(false);setConfirmDelete("")}} className="rounded-xl h-8 shrink-0">Cancel</Button></div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-8 w-full justify-start text-muted-foreground hover:text-red-500"><span dangerouslySetInnerHTML={{ __html: I.undo.replace("w-5 h-5","w-3.5 h-3.5") }} />Reset All Progress</Button>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-8 w-full justify-start text-muted-foreground hover:text-red-500"><span dangerouslySetInnerHTML={{ __html: I.trash.replace("w-5 h-5","w-3.5 h-3.5") }} />Delete All Bookmarks</Button>
      </div>
    </div>
  );
}

/* ═══════ HELP ══════════════════════════════════════════ */
function HelpPanel() {
  const appName = usePlatformStore((s) => s.appName);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.help} title="Help & Legal" desc="Support, documentation, and policies" />
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground"><strong className="text-foreground">{appName()}</strong> practice environment.</p>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
          <li>Help — use your institution contact or platform support email.</li>
          <li>Report a bug — include exam name, time, and screenshot if possible.</li>
          <li>Terms & privacy — provided by your deployment operator.</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline" className="rounded-xl h-8"><Link to="/exams">Browse Exams</Link></Button>
          <Button asChild size="sm" variant="outline" className="rounded-xl h-8"><Link to="/attempts">My Attempts</Link></Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ADMIN SETTINGS SHELL
   ══════════════════════════════════════════════════════════ */

function AdminSettingsShell() {
  const [section, setSection] = useState<AdminSection>("system");
  const appName = usePlatformStore((s) => s.appName);
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const nav = ADMIN_NAV.filter(n => { if (n.id === "notifications" && !(isEnabled("NOTIFICATIONS_ENABLED", true) || isEnabled("ENABLE_NOTIFICATIONS", true))) return false; return true; });

  return (
    <SettingsShell title="Administration" subtitle={`${appName()} · control plane`} nav={nav} active={section} onChange={(id) => setSection(id as AdminSection)}>
      {section === "system" && <AdminSystemPanel />}
      {section === "users" && <AdminUsersPanel />}
      {section === "content" && <AdminContentPanel />}
      {section === "exam_config" && <AdminExamConfigPanel />}
      {section === "integrations" && <AdminIntegrationsPanel />}
      {section === "monetization" && <AdminMonetizationPanel />}
      {section === "notifications" && <AdminNotificationCenter />}
      {section === "flags" && <AdminFlagsPanel />}
      {section === "monitoring" && <AdminMonitoringPanel />}
    </SettingsShell>
  );
}

/* ── Admin panels (same logic, premium visuals) ──────────── */

function AdminSystemPanel() {
  const config = usePlatformStore((s) => s.config);
  const reload = usePlatformStore((s) => s.bootstrap);
  const { data: adminCfg } = useQuery({ queryKey: ["admin-platform-config"], queryFn: () => platformApi.config() });
  return (
    <div className="space-y-5">
      <SectionHead icon={I.monitor} title="System Configuration" />
      <div className="grid gap-2 text-sm">
        <Row label="App" value={String(adminCfg?.app?.name || config?.app?.name || "—")} />
        <Row label="Version" value={String(adminCfg?.app?.version || "—")} />
        <Row label="Environment" value={String(adminCfg?.app?.environment || "—")} />
        <Row label="Maintenance" value={adminCfg?.maintenance?.enabled || config?.maintenance?.enabled ? "ON" : "Off"} />
        <Row label="Timezone" value={String(adminCfg?.app?.timezone || "—")} />
      </div>
      <p className="text-xs text-muted-foreground">Runtime values from <code className="bg-muted px-1 rounded text-[11px]">cronyzo.config.json</code> and environment variables.</p>
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void reload()} className="rounded-xl h-8">Reload Client Config</Button><Button asChild size="sm" variant="outline" className="rounded-xl h-8"><Link to="/admin/users">User Management</Link></Button></div>
    </div>
  );
}

function AdminUsersPanel() {
  return (
    <div className="space-y-5">
      <SectionHead icon={I.user} title="Users & Access" desc="Manage accounts, roles, and permissions" />
      <p className="text-sm text-muted-foreground">Manage accounts, activate/deactivate users, and assign admin vs student roles.</p>
      <Button asChild size="sm" className="rounded-xl h-8"><Link to="/admin/users">Open Users →</Link></Button>
    </div>
  );
}

function AdminContentPanel() {
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.layers} title="Content Operations" desc="Subjects, chapters, and question bank" />
      <div className="grid sm:grid-cols-2 gap-2">
        <AdminLink to="/admin/subjects" label="Subjects" />
        <AdminLink to="/admin/chapters" label="Chapters" />
        <AdminLink to="/admin/questions" label="Question Bank" />
        <AdminLink to="/admin/exams" label="Exam Builder" />
        {isEnabled("ENABLE_IMPORT", true) && <AdminLink to="/admin/import" label="Import Engine" />}
      </div>
    </div>
  );
}

function AdminExamConfigPanel() {
  return (
    <div className="space-y-5">
      <SectionHead icon={I.file} title="Exam Configuration" desc="Timer settings, marking, and proctoring defaults" />
      <div className="text-sm text-muted-foreground space-y-2">
        <p><strong className="text-foreground">Overall timer</strong> — set per exam as duration. Auto-submit on expiry.</p>
        <p><strong className="text-foreground">Sectional timer</strong> — enable in Create exam. Optional strict lock (SSC-style).</p>
        <p>Rules live in <code className="bg-muted px-1 rounded text-[11px]">exam.rules_json</code> merged by the Rule Engine.</p>
      </div>
      <Button asChild size="sm" className="rounded-xl h-8"><Link to="/admin/exams">Exam Builder →</Link></Button>
    </div>
  );
}

function AdminIntegrationsPanel() {
  const { data: methods } = useQuery({ queryKey: ["auth-methods-admin"], queryFn: () => authApi.methods() });
  const { data: notifStatus } = useQuery({ queryKey: ["notif-status"], queryFn: () => notificationsApi.adminStatus() });
  return (
    <div className="space-y-5">
      <SectionHead icon={I.link} title="Integrations" desc="Auth providers, notifications, and APIs" />
      <div className="space-y-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Auth Providers</p><div className="flex flex-wrap gap-1.5"><FlagTag on={!!methods?.guest} label="Guest" /><FlagTag on={!!methods?.email_password} label="Email" /><FlagTag on={!!methods?.google} label="Google" /><FlagTag on={!!methods?.phone_otp} label="Phone OTP" /></div></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Notification Providers</p><div className="flex flex-wrap gap-1.5">{Object.entries((notifStatus?.providers as Record<string, boolean>) || {}).map(([k, v]) => (<FlagTag key={k} on={!!v} label={k} />))}</div></div>
      </div>
    </div>
  );
}

function AdminMonetizationPanel() {
  const { data } = useQuery({ queryKey: ["monetization"], queryFn: () => platformApi.monetization() });
  return (
    <div className="space-y-5">
      <SectionHead icon={I.creditCard} title="Monetization" desc="Payments, subscriptions, and ads" />
      <div className="space-y-1.5 text-sm"><Row label="Mode" value={String(data?.mode || "free")} /><Row label="Subscriptions" value={data?.subscriptions_enabled ? "On" : "Off"} /><Row label="Payments" value={data?.payments_enabled ? "On" : "Off"} /><Row label="Ads" value={data?.ads_enabled ? "On" : "Off"} /></div>
    </div>
  );
}

function AdminFlagsPanel() {
  const features = usePlatformStore((s) => s.features);
  const entries = useMemo(() => Object.entries(features || {}).sort(([a], [b]) => a.localeCompare(b)), [features]);
  return (
    <div className="space-y-5">
      <SectionHead icon={I.flag} title="Feature Flags" />
      <div className="max-h-80 overflow-auto rounded-2xl border divide-y text-sm">
        {entries.map(([k, v]) => (<div key={k} className="flex justify-between px-4 py-2.5"><span className="font-mono text-xs">{k}</span><Badge variant={v ? "secondary" : "outline"} className="text-[10px]">{v ? "on" : "off"}</Badge></div>))}
        {!entries.length && <div className="px-4 py-6 text-xs text-muted-foreground">No flags loaded.</div>}
      </div>
    </div>
  );
}

function AdminMonitoringPanel() {
  return (
    <div className="space-y-5">
      <SectionHead icon={I.activity} title="Monitoring & Audit" />
      <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
        <li>API health: GET /api/health</li><li>Notification queue: Notification center</li><li>Import jobs: Admin → Import</li><li>Structured request IDs on every API response (X-Request-ID)</li>
      </ul>
      <Button asChild size="sm" variant="outline" className="rounded-xl h-8"><Link to="/analytics">Analytics Dashboard →</Link></Button>
    </div>
  );
}

function AdminNotificationCenter() {
  const qc = useQueryClient();
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [role, setRole] = useState("student"); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const { data: status } = useQuery({ queryKey: ["notif-admin-status"], queryFn: () => notificationsApi.adminStatus() });
  const { data: history } = useQuery({ queryKey: ["notif-admin-history"], queryFn: () => notificationsApi.adminHistory("per_page=20") });
  const broadcastMut = useMutation({ mutationFn: () => notificationsApi.adminBroadcast({ title, body, role: role || undefined, channels: ["in_app","email"], category:"admin_broadcast" }), onSuccess: (res) => { setMsg(`Queued for ${res.recipients} recipient(s)`); qc.invalidateQueries({queryKey:["notif-admin-history"]}); }, onError: (e:any) => setErr(e.message||"Failed") });
  const processMut = useMutation({ mutationFn: () => notificationsApi.adminProcessQueue(), onSuccess: (res) => setMsg(`Processed ${res.processed} job(s)`) });

  return (
    <div className="space-y-5">
      <Panel title="Broadcast Notification" icon={I.bell}>
        <div className="space-y-3">
          <Field label="Title"><Input value={title} onChange={e=>setTitle(e.target.value)} className="rounded-xl h-9 text-sm" /></Field>
          <Field label="Message"><Textarea value={body} onChange={e=>setBody(e.target.value)} className="text-sm rounded-xl" rows={4} /></Field>
          <Field label="Target Role"><select value={role} onChange={e=>setRole(e.target.value)} className="w-full rounded-xl border bg-card h-9 px-3 text-sm"><option value="student">Students</option><option value="guest">Guests</option><option value="admin">Admins</option></select></Field>
          {err && <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{err}</p>}
          {msg && <p className="text-[11px] text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-3 py-2">{msg}</p>}
          <div className="flex gap-2"><Button size="sm" disabled={!title.trim()||!body.trim()||broadcastMut.isPending} onClick={()=>broadcastMut.mutate()} className="rounded-xl h-8">{broadcastMut.isPending?"Sending…":"Send Broadcast"}</Button><Button size="sm" variant="outline" disabled={processMut.isPending} onClick={()=>processMut.mutate()} className="rounded-xl h-8">Process Queue</Button></div>
        </div>
      </Panel>
      <Panel title="Recent History" icon={I.activity}>
        <div className="max-h-56 overflow-auto divide-y text-xs">
          {(history?.items||[]).map((n:any)=>(<div key={n.id} className="py-2"><div className="flex justify-between"><span className="font-medium truncate">{n.title}</span><Badge variant="outline" className="text-[10px]">{n.status}</Badge></div><div className="text-muted-foreground truncate">{n.body}</div></div>))}
          {!history?.items?.length && <p className="py-3 text-muted-foreground">No notifications sent yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
