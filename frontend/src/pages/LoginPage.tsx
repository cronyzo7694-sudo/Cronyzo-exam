import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { usePlatformStore } from "@/stores/platformStore";
import { authApi, ApiError } from "@/lib/api";
import { firebaseConfigured, signInWithGooglePopup } from "@/lib/firebase";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/PublicLayout";

type AuthMethods = {
  guest: boolean;
  email_password: boolean;
  google: boolean;
  google_mode?: "firebase" | "gis" | "demo";
  google_client_id: string;
  phone_otp: boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google script failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google script failed"));
    document.head.appendChild(s);
  });
}

/** The four-colour Google "G" — drawn inline so it never waits on a CDN. */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className ?? "h-4 w-4"} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);
  const claimGuest = useAuthStore((s) => s.claimGuest);
  const user = useAuthStore((s) => s.user);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const sendPhoneOtp = useAuthStore((s) => s.sendPhoneOtp);
  const verifyPhoneOtp = useAuthStore((s) => s.verifyPhoneOtp);
  const loading = useAuthStore((s) => s.loading);
  const appName = usePlatformStore((s) => s.appName);
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const navigate = useNavigate();

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** "claim" (upgrade the guest session) or "signin" (an existing account). */
  const [mode, setMode] = useState<"claim" | "signin">("signin");
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A guest session turns this page into "keep what you did" — make that
    // the primary action instead of a second competing email/password form.
    if (user?.is_guest || user?.role === "guest") setMode("claim");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await authApi.methods();
        if (!cancelled) setMethods(m);
      } catch {
        // Fallback from platform flags
        if (!cancelled) {
          setMethods({
            guest: isEnabled("ENABLE_GUEST_ACCESS", true),
            email_password: isEnabled("ENABLE_EMAIL_PASSWORD_LOGIN", true),
            google: true,
            google_mode: "demo",
            google_client_id: "",
            phone_otp: isEnabled("ENABLE_PHONE_OTP", false),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEnabled]);

  useEffect(() => {
    if (!methods?.google || !methods.google_client_id || !googleBtnRef.current) return;
    // Native Google Identity Services button is only rendered with a real client id
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleScript();
        if (cancelled || !window.google || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: methods.google_client_id,
          callback: async (resp: { credential?: string }) => {
            if (!resp?.credential) return;
            setError("");
            setBusy(true);
            try {
              await loginWithGoogle(resp.credential);
              navigate({ to: "/dashboard" });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Google sign-in failed");
            } finally {
              setBusy(false);
            }
          },
        });
        googleBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: 352,
          text: "continue_with",
          shape: "rectangular",
        });
      } catch {
        /* Google script blocked — button simply won't show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [methods, loginWithGoogle, navigate]);

  /**
   * Real Google sign-in.
   *
   *  * Firebase configured in the build → popup, real ID token, real account.
   *  * Otherwise → the server's GIS/demo mode is used by the effect above.
   *
   * One button, no branching the visitor has to understand.
   */
  const onGoogleClick = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await signInWithGooglePopup();
      await loginWithGoogle(res.idToken);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    }
  };

  /**
   * The visitor already has a guest session (they took a test, filled a
   * cart). Claiming upgrades that very same account server-side, so their
   * attempts and basket come along — no second person, no lost work.
   */
  const onClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await claimGuest(email, password, user?.full_name || undefined);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your account");
    } finally {
      setBusy(false);
    }
  };

  const onGuest = async () => {
    setError("");
    setBusy(true);
    try {
      await continueAsGuest();
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start guest session");
    } finally {
      setBusy(false);
    }
  };

  const onSendOtp = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await sendPhoneOtp(phone);
      setOtpSent(true);
      setDevOtp(res.dev_otp || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send OTP");
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await verifyPhoneOtp(phone, otp);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid OTP");
    }
  };

  /**
   * Google sign-in.
   *
   * With a real client id the GIS script renders its own button and calls back
   * with a credential — but that script can be blocked by an extension or a
   * strict CSP, so this handler is wired to the styled fallback button as well.
   * In demo mode there is nothing to obtain: the server issues a demo account.
   */
  const onGoogle = async () => {
    // Real Firebase sign-in when the build carries a web config; otherwise the
    // server's demo/GIS mode below handles it.
    if (firebaseConfigured()) {
      await onGoogleClick();
      return;
    }
    setError("");
    setBusy(true);
    try {
      await loginWithGoogle();
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const name = appName();
  const locked = loading || busy;
  const hasGuestSession = Boolean(user?.is_guest || user?.role === "guest");
  const showGuest = methods?.guest !== false && !hasGuestSession;
  const showEmail = methods?.email_password !== false;
  // Google is offered whenever the server says so. In "demo" mode there is no
  // client id yet, so the button posts to /auth/google without a credential and
  // the server signs in a clearly-labelled demo account — the flow is testable
  // today and becomes a real Google account the moment the keys arrive.
  const googleMode = methods?.google_mode || (methods?.google_client_id ? "gis" : "demo");
  const showGoogle = Boolean(methods?.google);
  const showPhone = Boolean(methods?.phone_otp);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Same header as every other page — signing in is part of the site,
          not a separate grey screen. */}
      <SiteHeader />
      {/* Way out — a visitor who changed their mind must never feel trapped. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.assign("/");
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-[12.5px] font-bold text-foreground transition hover:bg-muted"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Link
          to="/"
          className="ml-2 inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Continue browsing without signing in
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-6">
      <Card className="w-full max-w-[400px] shadow-sm border-slate-200">
        <CardHeader className="space-y-3 pb-2">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="Cronyzo" className="h-7 w-7 rounded bg-white" />
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">{name}</CardTitle>
              <CardDescription className="text-xs">
                One account for courses, books, gear and mock tests
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasGuestSession && mode === "claim" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-amber-900 leading-snug">
                    You&rsquo;re using a guest session
                  </p>
                  <p className="text-[11px] text-amber-800/80 leading-snug mt-0.5">
                    Create an account to keep your attempts, course progress and
                    cart. It stays the same account — nothing is lost.
                  </p>
                </div>
              </div>
              <form onSubmit={onClaim} className="space-y-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-9 text-sm"
                />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  required
                  minLength={8}
                  className="h-9 text-sm"
                />
                <Button type="submit" className="w-full h-9" disabled={locked}>
                  {busy ? "Saving…" : "Save my progress"}
                </Button>
              </form>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="text-[11px] text-amber-800/70 hover:text-amber-900 transition-colors"
                >
                  Go to dashboard as guest
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-[11px] text-amber-900/80 hover:text-amber-900 underline underline-offset-2 transition-colors"
                >
                  Sign in instead
                </button>
              </div>
            </div>
          ) : null}

          {showGuest && mode === "signin" ? (
            <div className="space-y-2">
              <Button type="button" className="w-full h-10" disabled={locked} onClick={onGuest}>
                {busy && !loading ? "Starting…" : "Continue as guest"}
              </Button>
              <p className="text-[11px] text-center text-slate-500 leading-snug">
                No email, phone, or password. Take published exams immediately.
              </p>
            </div>
          ) : null}

          {mode === "signin" && (showGoogle || showPhone || showEmail) && showGuest ? (
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wide">
                <span className="bg-white px-2 text-slate-400">or continue with</span>
              </div>
            </div>
          ) : null}

          {mode === "signin" && showGoogle ? (
            <div className="space-y-1.5">
              {/* Real Google Identity Services button when a client id exists */}
              <div
                className={googleMode === "gis" ? "flex justify-center min-h-[40px]" : "hidden"}
                ref={googleBtnRef}
              />
              {/* Styled button: demo mode, and a fallback if the GIS script is blocked */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 gap-2 bg-white"
                disabled={locked}
                onClick={() => void onGoogle()}
              >
                <GoogleGlyph />
                {busy ? "Signing in…" : "Continue with Google"}
              </Button>
              {googleMode === "firebase" && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Signs in with your real Google account. Your name, email and photo
                  come straight from Google — we never see your password.
                </p>
              )}
              {googleMode === "demo" && (
                <p className="text-[10.5px] leading-snug text-center text-slate-400">
                  Testing mode — signs in a demo Google account. Add your Firebase
                  keys to switch to real Google sign-in.
                </p>
              )}
            </div>
          ) : null}

          {mode === "signin" && showPhone ? (
            <form onSubmit={otpSent ? onVerifyOtp : (e) => { e.preventDefault(); void onSendOtp(); }} className="space-y-2.5 border border-slate-200 rounded-md p-3">
              <div className="text-xs font-medium text-slate-700">Phone OTP</div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs text-slate-600">
                  Mobile number
                </Label>
                <Input
                  id="phone"
                  className="h-9"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={otpSent}
                />
              </div>
              {otpSent ? (
                <div className="space-y-1.5">
                  <Label htmlFor="otp" className="text-xs text-slate-600">
                    OTP
                  </Label>
                  <Input
                    id="otp"
                    className="h-9"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                  {devOtp ? (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                      Dev OTP: <span className="font-mono font-semibold">{devOtp}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Button type="submit" variant="outline" className="w-full h-9" disabled={locked}>
                {otpSent ? (loading ? "Verifying…" : "Verify & continue") : busy ? "Sending…" : "Send OTP"}
              </Button>
              {otpSent ? (
                <button
                  type="button"
                  className="text-[11px] text-[#2f6fed] hover:underline w-full"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setDevOtp("");
                  }}
                >
                  Change number
                </button>
              ) : null}
            </form>
          ) : null}

          {mode === "signin" && showEmail ? (
            <form onSubmit={onEmailSubmit} className="space-y-3">
              {(showGuest || showGoogle || showPhone) ? (
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  Email & password
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-slate-600">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="h-9"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-slate-600">
                  Password
                </Label>
                <PasswordInput
                  id="password"
                  className="h-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="outline" className="w-full h-9" disabled={locked}>
                {loading ? "Signing in…" : "Sign in with email"}
              </Button>
            </form>
          ) : null}

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          {showEmail ? (
            <div className="text-center text-xs text-slate-500">
              Need an account?{" "}
              <Link to="/register" className="text-[#2f6fed] hover:underline">
                Register
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
