/**
 * Orders — the buyer's order history with item detail and cancellation.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Package,
  Receipt,
  Truck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { ordersApi, type Order } from "@/lib/commerce";
import { EmptyState } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-blue-500/12 text-blue-600",
  paid: "bg-emerald-500/12 text-emerald-600",
  shipped: "bg-violet-500/12 text-violet-600",
  delivered: "bg-emerald-500/12 text-emerald-600",
  cancelled: "bg-slate-500/12 text-slate-600",
  refunded: "bg-amber-500/12 text-amber-600",
  pending: "bg-amber-500/12 text-amber-600",
};

const FILTERS = ["all", "paid", "confirmed", "shipped", "delivered", "cancelled"];

export function OrdersPage() {
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["orders", filter],
    queryFn: () => ordersApi.mine(filter === "all" ? undefined : filter),
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Your orders
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Courses, books and products — all in one place
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Receipt}
            title="No orders here"
            description="When you buy a course, a book or a product it shows up here with delivery status."
            action={
              <Button asChild>
                <Link to="/shop">Start shopping</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {items.map((order: Order) => (
            <div key={order.id} className="overflow-hidden rounded-2xl border bg-card">
              {/* Header */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-muted/30 px-5 py-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Order
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {order.order_number}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Placed
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {order.placed_at
                      ? new Date(order.placed_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Total
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    ₹{order.total.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold capitalize",
                      STATUS_STYLE[order.status] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {order.status}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold capitalize text-muted-foreground">
                    {order.payment_method}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="divide-y">
                {order.items.map((item) => {
                  const Icon =
                    item.item_type === "course"
                      ? GraduationCap
                      : item.item_type === "book"
                        ? BookOpen
                        : Package;
                  const link =
                    item.item_type === "product"
                      ? `/shop/${item.item_id}`
                      : item.item_type === "book"
                        ? "/books"
                        : "/courses";
                  return (
                    <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="text-[11px] font-bold capitalize text-muted-foreground">
                            {item.item_type}
                          </span>
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-sm font-semibold text-foreground">
                          {item.title}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-foreground">
                          ₹{item.line_total.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.qty} × ₹{item.unit_price.toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center gap-3 border-t bg-muted/20 px-5 py-3.5">
                {order.status === "shipped" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600">
                    <Truck className="h-3.5 w-3.5" />
                    Tracking: {order.tracking_id ?? "AWB pending"}
                  </span>
                )}
                {order.status === "delivered" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Delivered
                  </span>
                )}
                {order.status === "cancelled" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelled — refund initiated
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  {order.items.some((i) => i.item_type === "course") && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/my-courses">Go to learning</Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/shop">Shop again</Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
