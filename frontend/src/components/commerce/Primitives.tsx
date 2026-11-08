/**
 * Shared commerce primitives — rating stars, price block, badges, states.
 * Used by every catalog surface (courses, books, shop) so the visual
 * language stays identical across verticals.
 */

import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   Rating
   ═══════════════════════════════════════════════════════════ */

export function Rating({
  value = 0,
  count,
  size = "sm",
  showValue = true,
  className,
}: {
  value?: number;
  count?: number;
  size?: "xs" | "sm" | "md";
  showValue?: boolean;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(5, Number(value) || 0));
  const px = size === "xs" ? 11 : size === "sm" ? 13 : 16;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex items-center gap-0.5" aria-label={`${safe.toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = safe >= i;
          const half = !filled && safe >= i - 0.5;
          const Icon = half ? StarHalf : Star;
          return (
            <Icon
              key={i}
              width={px}
              height={px}
              className={cn(
                "shrink-0",
                filled || half ? "fill-amber-400 text-amber-400" : "fill-muted text-muted/40",
              )}
            />
          );
        })}
      </div>
      {showValue && (
        <span className="text-xs font-semibold text-foreground">
          {safe > 0 ? safe.toFixed(1) : "New"}
        </span>
      )}
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">
          ({count.toLocaleString()})
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Price
   ═══════════════════════════════════════════════════════════ */

export function Price({
  price,
  mrp,
  discountPercent,
  size = "md",
  className,
}: {
  price: number;
  mrp?: number;
  discountPercent?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const hasDiscount = mrp !== undefined && mrp > price;
  const off = discountPercent ?? (hasDiscount ? Math.round(((mrp! - price) / mrp!) * 100) : 0);

  const priceClass =
    size === "lg"
      ? "text-3xl font-bold tracking-tight"
      : size === "sm"
        ? "text-sm font-bold"
        : "text-lg font-bold";
  const mrpClass = size === "lg" ? "text-base" : "text-xs";

  return (
    <div className={cn("flex items-baseline gap-2 flex-wrap", className)}>
      <span className={cn(priceClass, "text-foreground")}>
        ₹{Number(price || 0).toLocaleString("en-IN")}
      </span>
      {hasDiscount && (
        <>
          <span className={cn(mrpClass, "text-muted-foreground line-through")}>
            ₹{Number(mrp).toLocaleString("en-IN")}
          </span>
          {off > 0 && (
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {off}% off
            </span>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Discount ribbon
   ═══════════════════════════════════════════════════════════ */

export function DiscountPill({ percent }: { percent: number }) {
  if (!percent || percent <= 0) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
      {percent}% OFF
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   Section heading
   ═══════════════════════════════════════════════════════════ */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 mb-6", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-2">
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-balance">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Empty state
   ═══════════════════════════════════════════════════════════ */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Skeletons
   ═══════════════════════════════════════════════════════════ */

export function CardSkeleton({ aspect = "4 / 3" }: { aspect?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="animate-shimmer w-full" style={{ aspectRatio: aspect }} />
      <div className="space-y-2.5 p-4">
        <div className="animate-shimmer h-4 w-4/5 rounded" />
        <div className="animate-shimmer h-3 w-2/5 rounded" />
        <div className="animate-shimmer h-5 w-24 rounded" />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 8, aspect }: { count?: number; aspect?: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} aspect={aspect} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Misc helpers
   ═══════════════════════════════════════════════════════════ */

export function StatPill({
  value,
  label,
  icon: Icon,
}: {
  value: string | number;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5">
      {Icon && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight text-foreground">{value}</div>
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function formatCount(n?: number): string {
  const value = Number(n || 0);
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function formatDurationHours(hours?: number): string {
  const value = Number(hours || 0);
  if (value <= 0) return "Self-paced";
  if (value < 1) return `${Math.round(value * 60)} min`;
  return `${value % 1 === 0 ? value : value.toFixed(1)} hours`;
}
