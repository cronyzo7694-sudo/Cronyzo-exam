/**
 * My Account — the one page where a signed-in person controls their identity.
 *
 * Why this page exists: name, email, phone, photo and password used to be
 * scattered between /profile (stats) and /settings (preferences), which meant
 * nobody could find them. Here they are together, in the same shell on phone
 * and desktop, and reachable from the header avatar and the "You" tab.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  BookOpen,
  ClipboardList,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Phone,
  Settings as SettingsIcon,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/lib/api";
import { ImagePicker } from "@/components/ImagePicker";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { cn } from "@/lib/utils";

function Card({
  title,
  desc,
  icon,
  children,
  tone = "default",
}: {
  title: string;
  desc?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-4 sm:p-5",
        tone === "danger" && "border-destructive/30",
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold">{value}</span>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none transition-colors focus:border-primary/60";

export function AccountPage() {
  const { user, isGuest, setUser, logout, capabilities } = useAuthStore();

  const guest = isGuest();

  /* ── profile form ─────────────────────────────────────── */
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatar, setAvatar] = useState(user?.avatar_url || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setFullName(user?.full_name || "");
    setPhone(user?.phone || "");
    setAvatar(user?.avatar_url || "");
  }, [user?.id, user?.full_name, user?.phone, user?.avatar_url]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const res = await authApi.updateMe({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        avatar_url: avatar.trim() || null,
      });
      setUser(res.user);
      setProfileMsg({ ok: true, text: "Saved — your details are updated." });
    } catch (err) {
      setProfileMsg({ ok: false, text: (err as Error)?.message || "Could not save." });
    } finally {
      setSavingProfile(false);
    }
  };

  /* ── password form ────────────────────────────────────── */
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const provider = (user?.auth_provider || "password").toLowerCase();
  const hasPassword = provider === "password";

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (next !== confirm) {
      setPwMsg({ ok: false, text: "The two new passwords do not match." });
      return;
    }
    setSavingPw(true);
    try {
      const res = await authApi.changePassword(current, next);
      setUser(res.user);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwMsg({ ok: true, text: "Password changed. Use it the next time you sign in." });
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error)?.message || "Could not change the password." });
    } finally {
      setSavingPw(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold">You are not signed in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to see your account details, orders and password settings.
        </p>
        <Button asChild className="mt-5">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const initial = (user.full_name || user.email || "S").charAt(0).toUpperCase();
  const roleLabel =
    user.role === "admin"
      ? "Administrator"
      : user.role === "seller"
        ? "Shopkeeper"
        : user.role === "teacher"
          ? "Teacher"
          : guest
            ? "Guest session"
            : "Student";

  const quickLinks = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/orders", label: "My orders", icon: ClipboardList, show: true },
    { to: "/my-courses", label: "My learning", icon: GraduationCap, show: true },
    { to: "/profile", label: "Profile & stats", icon: UserRound, show: true },
    { to: "/settings", label: "Settings", icon: SettingsIcon, show: true },
    {
      to: "/sell/dashboard",
      label: "Seller studio",
      icon: Store,
      show: Boolean(capabilities?.can_publish_books || capabilities?.can_publish_courses || user.role === "admin"),
    },
    { to: "/help", label: "Help & support", icon: LifeBuoy, show: true },
  ].filter((l) => l.show) as { to: string; label: string; icon: typeof LayoutDashboard }[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* ═══ Identity header ═══════════════════════════════ */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="shrink-0">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-16 w-16 rounded-full border object-cover sm:h-20 sm:w-20"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary sm:h-20 sm:w-20">
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight sm:text-xl">
            {user.full_name || (guest ? "Guest" : "Student")}
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            {user.email || "No email yet — guest session"}
          </p>
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
              user.role === "admin"
                ? "bg-primary text-primary-foreground"
                : guest
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-emerald-500/15 text-emerald-700",
            )}
          >
            <BadgeCheck className="h-3 w-3" />
            {roleLabel}
          </span>
        </div>
      </div>

      {guest && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-[13px] font-bold text-amber-800">You are on a guest session</p>
          <p className="mt-1 text-[12px] leading-snug text-amber-800/80">
            Guest sessions live in this browser only and have no password. Create an account to keep
            your orders, books and progress on every device.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/register">Create my account</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-5">
        {/* ═══ Details ════════════════════════════════════ */}
        <Card
          title="Your details"
          desc="Your name and phone appear on orders and invoices."
          icon={<UserRound className="h-4 w-4" />}
        >
          <form onSubmit={saveProfile} className="space-y-4">
            {!guest && (
              <ImagePicker
                label="Profile photo"
                shape="avatar"
                value={avatar}
                onChange={setAvatar}
                hint="Shown on your profile and beside your reviews."
              />
            )}

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={user.email || ""}
                  readOnly
                  disabled
                  className={cn(inputCls, "cursor-not-allowed bg-muted/40 pl-9")}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                This is the address you sign in with. To change it, write to{" "}
                <a className="font-semibold underline" href="mailto:cronyzo7694@gmail.com">
                  cronyzo7694@gmail.com
                </a>
                .
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Phone (optional)
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="+91 98xxxxxxxx"
                  className={cn(inputCls, "pl-9")}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingProfile} className="rounded-xl">
                {savingProfile ? "Saving…" : "Save changes"}
              </Button>
              {profileMsg && (
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    profileMsg.ok ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {profileMsg.text}
                </span>
              )}
            </div>
          </form>
        </Card>

        {/* ═══ Password ═══════════════════════════════════ */}
        <Card
          title={hasPassword ? "Change password" : "Set a password"}
          desc={
            guest
              ? "Create an account to get a password."
              : hasPassword
                ? "You need your current password to set a new one."
                : "You signed in with Google — set a password to also sign in with email."
          }
          icon={<KeyRound className="h-4 w-4" />}
        >
          {guest ? (
            <Button asChild size="sm" variant="outline" className="rounded-xl">
              <Link to="/register">Create my account</Link>
            </Button>
          ) : (
            <form onSubmit={savePassword} className="space-y-3.5">
              {hasPassword && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Current password
                  </label>
                  <PasswordInput
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Current password"
                    className="rounded-xl"
                  />
                </div>
              )}
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    New password
                  </label>
                  <PasswordInput
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Confirm new password
                  </label>
                  <PasswordInput
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat it"
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={savingPw} className="rounded-xl">
                  {savingPw ? "Updating…" : hasPassword ? "Change password" : "Set password"}
                </Button>
                {pwMsg && (
                  <span
                    className={cn(
                      "text-[12px] font-semibold",
                      pwMsg.ok ? "text-emerald-600" : "text-destructive",
                    )}
                  >
                    {pwMsg.text}
                  </span>
                )}
              </div>
            </form>
          )}
        </Card>

        {/* ═══ Sign-in method ═════════════════════════════ */}
        <Card
          title="Sign-in & security"
          desc="How this account gets in, and where it came from."
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <div className="rounded-xl border bg-muted/20 px-3 py-1">
            <Row
              label="Sign-in method"
              value={
                provider === "google"
                  ? "Google"
                  : provider === "guest"
                    ? "Guest (this browser)"
                    : provider === "phone"
                      ? "Phone OTP"
                      : "Email + password"
              }
            />
            <Row label="Account ID" value={`#${user.id}`} />
            <Row label="Role" value={roleLabel} />
            <Row
              label="Member since"
              value={
                (user as { created_at?: string }).created_at
                  ? new Date((user as { created_at?: string }).created_at as string).toLocaleDateString(
                      "en-IN",
                      { day: "numeric", month: "short", year: "numeric" },
                    )
                  : "—"
              }
            />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Passwords are stored only as a one-way hash — nobody, including the operator, can read
            them back.
          </p>
        </Card>

        {/* ═══ Shortcuts ══════════════════════════════════ */}
        <Card title="Go to" icon={<BookOpen className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {quickLinks.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{l.label}</span>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* ═══ Sign out ═══════════════════════════════════ */}
        <Card
          title="Sign out"
          desc="Ends this session on this device only."
          icon={<LogOut className="h-4 w-4" />}
          tone="danger"
        >
          <Button
            variant="outline"
            className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={logout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </Card>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Need help with your account? Write to{" "}
          <a className="font-semibold underline" href="mailto:cronyzo7694@gmail.com">
            cronyzo7694@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}
