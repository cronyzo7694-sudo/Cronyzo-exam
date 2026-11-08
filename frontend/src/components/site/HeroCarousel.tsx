/**
 * Animated hero artwork carousel.
 *
 * One slide is visible at a time; every few seconds the current image fades and
 * scales out while the next fades in from the opposite direction, so the hero
 * feels alive rather than static. The copy that changes with the slide (title,
 * subtitle, CTA) is rendered outside this component so the page can keep a
 * constant headline and let only the artwork rotate — that is how the operator
 * reads it: "ek dikhega, animate hoke dusre me change hoga".
 *
 * Accessibility
 * -------------
 * * `aria-hidden` — the rotation is decorative; the slide titles are repeated in
 *   the visible caption strip and in the dot controls' labels.
 * * Pauses on hover/focus and when the tab is hidden.
 * * `prefers-reduced-motion` switches to a plain cross-fade (no zoom/slide).
 * * Dot buttons are real `<button>`s with `aria-label`s.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/api";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 5200;

const ACCENTS: Record<string, string> = {
  indigo: "from-indigo-500/25 via-violet-500/15 to-transparent",
  violet: "from-violet-500/25 via-fuchsia-500/15 to-transparent",
  teal: "from-teal-500/25 via-cyan-500/15 to-transparent",
  amber: "from-amber-500/25 via-orange-500/15 to-transparent",
};

export function HeroCarousel({
  slides,
  className,
  onSlideChange,
}: {
  slides: HeroSlide[];
  className?: string;
  /** Notified whenever the visible index changes, so the parent can sync copy. */
  onSlideChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      const wrapped = ((next % count) + count) % count;
      setIndex(wrapped);
      onSlideChange?.(wrapped);
    },
    [count, onSlideChange],
  );

  // Auto-advance
  useEffect(() => {
    if (count <= 1 || paused) return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      go(index + 1);
    };
    timer.current = window.setTimeout(tick, INTERVAL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, count, paused, go]);

  // Keep the parent in sync on the very first render
  useEffect(() => {
    onSlideChange?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (count === 0) return null;

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Cronyzo highlights"
    >
      {/* ── Stage ─────────────────────────────────────────────── */}
      <div className="relative aspect-[16/11] w-full overflow-hidden rounded-[26px] border border-white/60 bg-card shadow-2xl shadow-indigo-500/20 ring-1 ring-black/5 dark:border-white/10 dark:ring-white/10">
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <div
              key={slide.id ?? i}
              aria-hidden={!active}
              className={cn(
                "absolute inset-0 transition-all duration-700 ease-out",
                active
                  ? "cz-slide-in z-10 opacity-100"
                  : "cz-slide-out z-0 opacity-0",
              )}
            >
              {slide.image_url ? (
                <img
                  src={slide.image_url}
                  alt={slide.image_alt || slide.title}
                  className="h-full w-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <div
                  className={cn(
                    "flex h-full w-full items-center justify-center bg-gradient-to-br",
                    ACCENTS[slide.accent] || ACCENTS.indigo,
                  )}
                >
                  <span className="text-2xl font-extrabold tracking-tight text-foreground/70">
                    {slide.title}
                  </span>
                </div>
              )}

              {/* Accent wash + caption so the slide reads even on a busy image */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-tr opacity-60 mix-blend-soft-light",
                  ACCENTS[slide.accent] || ACCENTS.indigo,
                )}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 pr-24 pt-16 sm:p-5 sm:pr-28">
                <div className="flex flex-wrap items-center gap-2">
                  {slide.eyebrow && (
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                      {slide.eyebrow}
                    </span>
                  )}
                  <p className="text-sm font-bold leading-snug text-white drop-shadow-sm sm:text-base">
                    {slide.title}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── Arrows ──────────────────────────────────────────── */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous slide"
              className="absolute left-2.5 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-md backdrop-blur transition hover:bg-white sm:flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next slide"
              className="absolute right-2.5 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-md backdrop-blur transition hover:bg-white sm:flex"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* ── Progress dots ───────────────────────────────────── */}
        {count > 1 && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1.5 backdrop-blur-sm">
            {slides.map((slide, i) => (
              <button
                key={slide.id ?? i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show slide ${i + 1}: ${slide.title}`}
                aria-current={i === index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
