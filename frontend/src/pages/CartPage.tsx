/**
 * Cart page — the buyer's basket with live totals.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { useEffect } from "react";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { EmptyState, Price } from "@/components/commerce/Primitives";

export function CartPage() {
  const navigate = useNavigate();
  const {
    items,
    totals,
    loading,
    mutating,
    load,
    update,
    remove,
    clear,
  } = useCartStore();

  useEffect(() => {
    void load();
  }, [load]);

  const subtotal = totals?.subtotal ?? 0;
  const shipping = totals?.shipping_fee ?? 0;
  const gap = totals?.free_shipping_gap ?? 0;
  const threshold = totals?.free_shipping_threshold ?? 999;
  const progress = Math.min(100, (subtotal / Math.max(1, threshold)) * 100);

  if (loading && items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-shimmer h-9 w-40 rounded" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Browse courses, books and products — everything you add lands here and checks out in one go."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/shop">
                  Shop products
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/courses">Browse courses</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Your cart
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {totals?.item_count ?? 0} item{totals?.item_count === 1 ? "" : "s"} ·{" "}
            {totals?.total_qty ?? 0} unit{totals?.total_qty === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void clear()}
          disabled={mutating}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Empty cart
        </Button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* ── Items ────────────────────────────────────────────── */}
        <div className="space-y-3">
          {items.map((item) => {
            const product = item.product;
            return (
              <div
                key={item.id}
                className="flex gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <Link to="/shop/$slug" params={{ slug: product?.slug ?? "" }}>
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-28">
                    {product?.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product?.title ?? ""}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to="/shop/$slug"
                        params={{ slug: product?.slug ?? "" }}
                        className="line-clamp-2 text-sm font-bold text-foreground transition-colors hover:text-primary"
                      >
                        {product?.title ?? "Product"}
                      </Link>
                      {product?.store_name && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Sold by {product.store_name}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => void remove(item.id)}
                      disabled={mutating}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${product?.title ?? "item"}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
                    <div className="flex items-center rounded-lg border">
                      <button
                        onClick={() => void update(item.id, item.qty - 1)}
                        disabled={mutating || item.qty <= 1}
                        className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-9 text-center text-sm font-bold text-foreground">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => void update(item.id, item.qty + 1)}
                        disabled={mutating || item.qty >= 10}
                        className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="text-right">
                      <Price
                        price={item.unit_price}
                        mrp={product?.mrp}
                        discountPercent={product?.discount_percent}
                        size="sm"
                      />
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Line total{" "}
                        <span className="font-bold text-foreground">
                          ₹{item.line_total.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Summary ───────────────────────────────────────────── */}
        <aside>
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border bg-card p-6 shadow-lg">
              <h2 className="text-base font-bold text-foreground">Order summary</h2>

              {gap > 0 && (
                <div className="mt-4 rounded-xl bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <Truck className="h-3.5 w-3.5" />
                    Add ₹{gap.toLocaleString("en-IN")} more for free delivery
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-500/20">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold text-foreground">
                    ₹{subtotal.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span
                    className={
                      shipping === 0
                        ? "font-semibold text-emerald-600"
                        : "font-semibold text-foreground"
                    }
                  >
                    {shipping === 0 ? "FREE" : `₹${shipping.toLocaleString("en-IN")}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-semibold text-foreground">
                    ₹{(totals?.tax ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-3 text-base">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-extrabold text-foreground">
                    ₹{(totals?.total ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              <Button
                className="mt-5 w-full"
                size="lg"
                onClick={() => navigate({ to: "/checkout" })}
              >
                Proceed to checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <Link
                to="/shop"
                className="mt-3 block text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
              >
                or continue shopping
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
