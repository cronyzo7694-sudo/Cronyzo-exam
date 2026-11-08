/**
 * Seller applications — the approval queue behind the publishing gate.
 *
 * Nobody can list a book or a product until an application here is approved,
 * so this screen is the gate's other half: review, note, approve, reject or
 * suspend. Approving flips the member to `role="seller"` server-side.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Store,
  XCircle,
} from "lucide-react";
import { adminSellerApi, type SellerApplication } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
] as const;

const STATUS_TINT: Record<SellerApplication["status"], string> = {
  pending: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/30",
  suspended: "bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

export function SellerApplicationsPage() {
  const [filter, setFilter] = useState<string>("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();

  const queue = useQuery({
    queryKey: ["admin", "seller-applications", filter],
    queryFn: () => adminSellerApi.list(filter || undefined),
  });

  const review = useMutation({
    mutationFn: (vars: { id: number; action: "approve" | "reject" | "suspend" }) =>
      adminSellerApi.review(vars.id, vars.action, notes[vars.id] || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "seller-applications"] });
    },
  });

  const items = queue.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Shopkeeper applications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve a shop and that member can list books and products.
            Until then the API refuses their listings.
          </p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-2 text-sm">
          <span className="font-extrabold text-amber-600 dark:text-amber-400">
            {queue.data?.pending ?? 0}
          </span>{" "}
          <span className="text-muted-foreground">waiting for review</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-white"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading applications…
        </div>
      ) : queue.isError ? (
        <div className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(queue.error as Error)?.message || "Could not load applications."}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-2xl border bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BadgeCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-foreground">No applications here</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            When someone applies to sell on Cronyzo their shop lands in this queue
            and you get a Telegram alert.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((app) => (
            <article key={app.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">{app.shop_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {app.owner_name}
                      {app.applicant?.email ? ` · ${app.applicant.email}` : app.email ? ` · ${app.email}` : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {app.phone}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {app.created_at ? new Date(app.created_at).toLocaleString() : "—"}
                      </span>
                      <span className="font-semibold uppercase tracking-wide">{app.sells}</span>
                      {app.gstin && <span>GSTIN {app.gstin}</span>}
                      {(app.city || app.state) && (
                        <span>{[app.city, app.state].filter(Boolean).join(", ")}</span>
                      )}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold capitalize",
                    STATUS_TINT[app.status],
                  )}
                >
                  {app.status}
                </span>
              </div>

              {app.about && (
                <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                  {app.about}
                </p>
              )}

              {app.document_url && (
                <a
                  href={app.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs font-bold text-primary hover:underline"
                >
                  Open attached document →
                </a>
              )}

              {app.admin_note && (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Note:</span> {app.admin_note}
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={notes[app.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [app.id]: e.target.value }))}
                  placeholder="Reviewer note (shown to the applicant)"
                  className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => review.mutate({ id: app.id, action: "approve" })}
                    disabled={review.isPending || app.status === "approved"}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review.mutate({ id: app.id, action: "reject" })}
                    disabled={review.isPending || app.status === "rejected"}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review.mutate({ id: app.id, action: "suspend" })}
                    disabled={review.isPending || app.status === "suspended"}
                  >
                    <Ban className="mr-1.5 h-4 w-4" /> Suspend
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {review.isError && (
        <p className="mt-4 text-sm font-medium text-destructive">
          {(review.error as Error)?.message || "Could not save that decision."}
        </p>
      )}
    </div>
  );
}

export default SellerApplicationsPage;
