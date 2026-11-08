/**
 * The identity strip that sits directly under the navigation bar.
 *
 * Left: an animated, waving Indian flag. The waving is pure CSS/SVG — the flag
 * is drawn as three bands with a gentle `skew` + `translate` animation on
 * separate layers, so it looks like cloth rippling in the breeze without
 * shipping a single byte of video.
 *
 * Right: a single line of operator-editable copy (`strip.tagline`), editable
 * from Admin → Site content. The flag can be switched off there too.
 */

import { Link } from "@tanstack/react-router";
import { MessageCircle, Sparkles } from "lucide-react";
import { useSetting } from "@/lib/site";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   Waving Indian flag
   ═══════════════════════════════════════════════════════════ */

export function IndiaFlag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "cz-flag relative inline-flex h-[18px] w-[27px] shrink-0 overflow-hidden rounded-[3px] align-middle",
        "ring-1 ring-black/10 dark:ring-white/15",
        className,
      )}
      aria-label="India"
      role="img"
    >
      {/* Saffron */}
      <span className="absolute inset-x-0 top-0 h-1/3 bg-[#FF9933]" />
      {/* White */}
      <span className="absolute inset-x-0 top-1/3 h-1/3 bg-white" />
      {/* India green */}
      <span className="absolute inset-x-0 bottom-0 h-1/3 bg-[#138808]" />
      {/* Ashoka Chakra — 24 spokes drawn as a stroked circle with tick marks */}
      <svg
        viewBox="0 0 24 24"
        className="cz-chakra absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" fill="none" stroke="#000080" strokeWidth="1.6" />
        {Array.from({ length: 24 }).map((_, i) => (
          <line
            key={i}
            x1="12"
            y1="12"
            x2="12"
            y2="2.6"
            stroke="#000080"
            strokeWidth="0.9"
            transform={`rotate(${i * 15} 12 12)`}
          />
        ))}
      </svg>
      {/* Fold highlight so the ripple reads as cloth, not a flat rectangle */}
      <span className="cz-flag-shine pointer-events-none absolute inset-0" />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   Strip
   ═══════════════════════════════════════════════════════════ */

export function TopStrip({ className }: { className?: string }) {
  const tagline = useSetting<string>("strip.tagline");
  const flagEnabled = useSetting<boolean>("strip.flag_enabled", true);

  if (!flagEnabled && !tagline) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden border-b border-border/70",
        "bg-gradient-to-r from-orange-50 via-white to-emerald-50",
        "dark:from-orange-950/30 dark:via-background dark:to-emerald-950/30",
        className,
      )}
    >
      {/* Soft moving sheen */}
      <span
        aria-hidden="true"
        className="cz-strip-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10"
      />

      <div className="relative mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          {flagEnabled && <IndiaFlag />}
          {tagline && (
            <p className="truncate text-[11.5px] font-semibold tracking-tight text-foreground/75 sm:text-xs">
              {tagline}
            </p>
          )}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-4 text-[11.5px] font-semibold text-foreground/60 md:flex">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            One account for everything
          </span>
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
          >
            <MessageCircle className="h-3 w-3" />
            Need help?
          </Link>
        </div>
      </div>
    </div>
  );
}
