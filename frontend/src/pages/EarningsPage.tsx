/**
 * Earnings report — a detailed, per-sale breakdown for the signed-in creator.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeIndianRupee,
  BookOpen,
  GraduationCap,
  Package,
  TrendingUp,
} from "lucide-react";
import { creatorApi } from "@/lib/commerce";
import { EmptyState, StatPill } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EarningsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["creator", "earnings"],
    queryFn: () => creatorApi.earnings(),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/sell/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        Earnings report
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Every sale, the platform fee and your exact payout.
      </p>

      {isLoading ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill
              value={`₹${(data?.gross ?? 0).toLocaleString("en-IN")}`}
              label="Gross sales"
              icon={TrendingUp}
            />
            <StatPill
              value={`₹${(data?.commission ?? 0).toLocaleString("en-IN")}`}
              label={`Platform fee (${data?.commission_percent ?? 12}%)`}
              icon={BadgeIndianRupee}
            />
            <StatPill
              value={`₹${(data?.payout ?? 0).toLocaleString("en-IN")}`}
              label="Your payout"
              icon={BadgeIndianRupee}
            />
            <StatPill value={data?.total ?? 0} label="Transactions" icon={Package} />
          </div>

          {entries.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                icon={TrendingUp}
                title="No sales recorded yet"
                description="Publish a course, list a book or add a product — your earnings will appear here the moment someone buys."
                action={
                  <Button asChild>
                    <Link to="/sell/dashboard">Open seller studio</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-8 overflow-hidden rounded-2xl border bg-card">
              <div className="hidden grid-cols-[1.6fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-4 border-b bg-muted/40 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground lg:grid">
                <span>Item</span>
                <span className="text-right">Units</span>
                <span className="text-right">Gross</span>
                <span className="text-right">Fee</span>
                <span className="text-right">Payout</span>
              </div>

              <div className="divide-y">
                {entries.map((entry, i) => {
                  const Icon =
                    entry.item_type === "course"
                      ? GraduationCap
                      : entry.item_type === "book"
                        ? BookOpen
                        : Package;
                  return (
                    <div
                      key={`${entry.order_number}-${i}`}
                      className="flex flex-wrap items-center gap-3 px-5 py-4 lg:grid lg:grid-cols-[1.6fr_0.6fr_0.6fr_0.6fr_0.6fr] lg:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {entry.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {entry.order_number} ·{" "}
                            <span className="capitalize">{entry.status}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground lg:text-right">
                        <span className="lg:hidden">Units: </span>
                        <span className="font-semibold text-foreground">
                          {entry.qty}
                        </span>
                      </div>
                      <div className="text-xs lg:text-right">
                        <span className="lg:hidden">Gross: </span>
                        <span className="font-semibold text-foreground">
                          ₹{entry.gross.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-xs lg:text-right">
                        <span className="lg:hidden">Fee: </span>
                        <span className="font-semibold text-rose-600">
                          −₹{entry.commission.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-xs lg:text-right">
                        <span className="lg:hidden">Payout: </span>
                        <span
                          className={cn(
                            "font-bold text-emerald-600",
                          )}
                        >
                          ₹{entry.payout.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
