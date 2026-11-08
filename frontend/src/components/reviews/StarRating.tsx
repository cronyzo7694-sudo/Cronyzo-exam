import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only stars, e.g. 4.6 → 4 full + a half-looking star. */
export function StarRating({
  value,
  count,
  size = "sm",
  className,
}: {
  value: number;
  count?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const px = size === "md" ? "h-4.5 w-4.5" : size === "sm" ? "h-3.5 w-3.5" : "h-3 w-3";
  const rounded = Math.round((value || 0) * 2) / 2;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="flex">
        {Array.from({ length: 5 }).map((_, index) => {
          const filled = rounded >= index + 1;
          const half = !filled && rounded >= index + 0.5;
          return (
            <Star
              key={index}
              className={cn(
                px,
                filled || half
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-muted-foreground/40",
              )}
              strokeWidth={1.75}
            />
          );
        })}
      </span>
      <span className={cn("font-semibold", size === "md" ? "text-[13px]" : "text-[11.5px]")}>
        {(value || 0).toFixed(1)}
      </span>
      {typeof count === "number" && (
        <span className={cn("text-muted-foreground", size === "md" ? "text-[12px]" : "text-[11px]")}>
          ({count})
        </span>
      )}
    </span>
  );
}

/** Interactive stars for the review form. */
export function StarPicker({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState(0);
  const px = size === "md" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
          className="rounded p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              px,
              (hover || value) >= star
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40",
            )}
            strokeWidth={1.75}
          />
        </button>
      ))}
    </div>
  );
}
