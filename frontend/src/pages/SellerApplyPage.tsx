/**
 * Become a shopkeeper.
 *
 * Nobody can list a product or a book on Cronyzo until the operator approves
 * the shop — this page is that front door. It doubles as the "where is my
 * application?" screen once submitted.
 */

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BadgeCheck,
  Clock,
  Loader2,
  Send,
  ShieldCheck,
  Store,
  XCircle,
} from "lucide-react";
import { sellerApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATES: Record<
  string,
  { label: string; tone: string; icon: any; blurb: string }
> = {
  pending: {
    label: "Under review",
    tone: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    icon: Clock,
    blurb:
      "Your application is with the Cronyzo team. You can keep browsing and studying — publishing unlocks the moment it's approved.",
  },
  approved: {
    label: "Approved",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    icon: BadgeCheck,
    blurb: "You're a Cronyzo shopkeeper. Your product and book forms are unlocked.",
  },
  rejected: {
    label: "Not approved",
    tone: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    icon: XCircle,
    blurb: "This application wasn't approved. Fix the details below and submit again.",
  },
  suspended: {
    label: "Suspended",
    tone: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
    icon: XCircle,
    blurb: "Publishing is paused for this shop. Contact support to resolve it.",
  },
};

export function SellerApplyPage() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["seller", "application"],
    queryFn: () => sellerApi.application(),
    staleTime: 30_000,
  });

  const existing = status.data?.application;
  const [form, setForm] = useState({
    shop_name: "",
    owner_name: "",
    phone: "",
    email: "",
    city: "",
    state: "",
    pincode: "",
    sells: "products",
    gstin: "",
    about: "",
  });
  const [hydrated, setHydrated] = useState(false);

  // Prefill once from the saved application
  if (!hydrated && existing) {
    setHydrated(true);
    setForm((f) => ({
      ...f,
      shop_name: existing.shop_name || "",
      owner_name: existing.owner_name || "",
      phone: existing.phone || "",
      email: existing.email || "",
      city: existing.city || "",
      state: existing.state || "",
      pincode: existing.pincode || "",
      sells: existing.sells || "products",
      gstin: existing.gstin || "",
      about: existing.about || "",
    }));
  }

  const submit = useMutation({
    mutationFn: () => sellerApi.apply(form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["seller", "application"] });
    },
  });

  const state = existing ? STATES[existing.status] || STATES.pending : null;
  const approved = Boolean(status.data?.can_publish);
  const isAdmin = Boolean(status.data?.is_admin);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/sell"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-primary"
      >
        ← Back to seller hub
      </Link>

      <header className="mt-4">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-primary">
          <Store className="h-3 w-3" />
          Shopkeeper account
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
          Apply to sell on Cronyzo
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
          Products and books are published by verified shops only — anyone can
          study here, but listing inventory needs a quick review. Courses are
          separate: teachers can publish them right away.
        </p>
      </header>

      {/* Current state */}
      {state && (
        <div className={cn("mt-5 flex items-start gap-3 rounded-2xl border p-4", state.tone)}>
          <state.icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-[13px] font-extrabold">
              {state.label}
              {existing?.shop_name ? ` · ${existing.shop_name}` : ""}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">
              {state.blurb}
            </p>
            {existing?.admin_note && (
              <p className="mt-1.5 rounded-lg bg-white/60 px-2 py-1 text-[12px] font-semibold dark:bg-black/20">
                Admin: {existing.admin_note}
              </p>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border bg-card p-4 text-[13px] font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          You're an admin — you can publish inventory directly, no application needed.
          <Link to="/sell/products/new" className="ml-auto text-primary hover:underline">
            Add a product →
          </Link>
        </div>
      )}

      {approved && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/sell/products/new"
            className="rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground hover:brightness-110"
          >
            + List a product
          </Link>
          <Link
            to="/sell/books/new"
            className="rounded-xl border bg-card px-4 py-2 text-[13px] font-bold hover:bg-muted"
          >
            + List a book
          </Link>
        </div>
      )}

      {/* Form — hidden once approved */}
      {!approved && !isAdmin && (
        <form
          className="mt-6 space-y-4 rounded-2xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shop name *">
              <input
                required
                value={form.shop_name}
                onChange={(e) => set("shop_name", e.target.value)}
                placeholder="e.g. Sharma Book Depot"
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="Owner name *">
              <input
                required
                value={form.owner_name}
                onChange={(e) => set("owner_name", e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="Phone *">
              <input
                required
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="10-digit mobile"
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="shop@example.com"
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="City">
              <input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="State">
              <input
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="Pincode">
              <input
                value={form.pincode}
                onChange={(e) => set("pincode", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
            <Field label="GSTIN (optional)">
              <input
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              />
            </Field>
          </div>

          <Field label="What will you sell?">
            <div className="flex flex-wrap gap-2">
              {[
                { v: "products", l: "Study gear / products" },
                { v: "books", l: "Books / PDFs" },
                { v: "both", l: "Both" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("sells", o.v)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-[12.5px] font-bold transition",
                    form.sells === o.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </Field>

          <Field label="About your shop">
            <textarea
              rows={3}
              value={form.about}
              onChange={(e) => set("about", e.target.value)}
              placeholder="What do you stock, where do you ship from, how fast?"
              className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
            />
          </Field>

          {submit.isError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              {(submit.error as Error)?.message || "Could not submit"}
            </p>
          )}
          {submit.isSuccess && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              Application submitted — we'll review it shortly.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submit.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {submit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {existing ? "Resubmit application" : "Submit application"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export default SellerApplyPage;
