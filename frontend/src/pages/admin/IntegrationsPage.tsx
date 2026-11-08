/**
 * Integrations — the operator's proof screen.
 *
 * Everything the site promises the outside world is listed here with its real
 * state, probed against the live service (not a stored flag):
 *
 *   Database · Google sign-in · Telegram support bot · File storage · Payments
 *
 * Each card answers three questions at once:
 *   1. Is it on?          → colour + status pill
 *   2. How do I know?     → the server's own sentence about what it just did
 *   3. What's missing?    → the exact environment variable names + the fix
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CreditCard,
  Database,
  FlaskConical,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { adminSiteApi, type IntegrationsPayload } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
  database: Database,
  google: ShieldCheck,
  telegram: Send,
  storage: Cloud,
  payments: CreditCard,
};

const TONE: Record<
  string,
  { pill: string; ring: string; icon: string; text: string; label: string }
> = {
  live: {
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    ring: "border-emerald-200 dark:border-emerald-900",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "LIVE",
  },
  demo: {
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-900/70",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    label: "TEST MODE",
  },
  missing: {
    pill: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    ring: "border-border",
    icon: "bg-slate-500/10 text-slate-500",
    text: "text-muted-foreground",
    label: "NOT CONNECTED",
  },
  error: {
    pill: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    ring: "border-rose-200 dark:border-rose-900",
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    text: "text-rose-600 dark:text-rose-400",
    label: "NEEDS ATTENTION",
  },
};

export function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminSiteApi.integrations();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Could not read integration status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retest = async (key: string) => {
    setBusy(key);
    try {
      const res = await adminSiteApi.testIntegration(key);
      setData((prev) => {
        if (!prev) return res;
        const updated = prev.items.map(
          (item) => res.items.find((r) => r.key === item.key) || item,
        );
        return { ...prev, items: updated, checked_at: res.checked_at };
      });
      // Re-read the summary so the headline stays honest
      void load();
    } catch (err: any) {
      setError(err?.message || "Test failed");
    } finally {
      setBusy(null);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Integrations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every outside service Cronyzo talks to, checked against the real
            provider just now — not a stored flag. Green means it answered.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-[13px] font-bold hover:bg-muted"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Re-check all
        </button>
      </header>

      {/* ── Headline ─────────────────────────────────────────── */}
      {summary && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-2xl border p-4",
            summary.all_green
              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
              : summary.error > 0
                ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20"
                : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
          )}
        >
          {summary.all_green ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : summary.error > 0 ? (
            <XCircle className="h-5 w-5 text-rose-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          )}
          <p className="text-[13.5px] font-bold">{summary.headline}</p>
          <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {summary.live} live
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {summary.demo} test mode
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {summary.missing} off
            </span>
            {summary.error > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {summary.error} error
              </span>
            )}
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* ── Cards ────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.items || []).map((item) => {
          const tone = TONE[item.status] || TONE.missing;
          const Icon = ICONS[item.key] || FlaskConical;
          return (
            <div
              key={item.key}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-5 transition-shadow hover:shadow-lg hover:shadow-indigo-500/5",
                tone.ring,
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    tone.icon,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-extrabold tracking-tight">
                      {item.label}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em]",
                        tone.pill,
                      )}
                    >
                      {tone.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </div>

              {item.env.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {item.env.map((key) => (
                    <code
                      key={key}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-bold text-foreground/70"
                    >
                      {key}
                    </code>
                  ))}
                </div>
              )}

              {item.fix && item.status !== "live" && (
                <p className="mt-2.5 rounded-lg bg-muted/60 px-2.5 py-2 text-[11.5px] font-semibold text-foreground/70">
                  {item.fix}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-[10.5px] font-semibold text-muted-foreground">
                  {item.checked_at
                    ? `checked ${new Date(item.checked_at).toLocaleTimeString()}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void retest(item.key)}
                  disabled={busy === item.key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold hover:bg-muted",
                    tone.text,
                  )}
                >
                  {busy === item.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Test now
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && (data?.items?.length ?? 0) === 0 && !error && (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Nothing to report yet.
        </p>
      )}

      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Secrets never leave the server: this page only ever sees modes, host
        names and the provider's own error text. Values live in{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-bold">backend/.env</code>{" "}
        and are read once at boot — restart the API after editing it.
      </p>
    </div>
  );
}

export default IntegrationsPage;
