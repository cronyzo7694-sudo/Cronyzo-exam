/**
 * Slowly drifting multi-colour gradient behind the hero.
 *
 * Four oversized radial blobs in different hues orbit on long, offset
 * animations so the colour behind the headline never settles on one flat tone.
 * Everything is CSS — no canvas, no JS tick, no repaint cost when the tab is
 * hidden (animations pause automatically).
 *
 * Respects `prefers-reduced-motion`: the blobs freeze in place rather than
 * disappearing, so the design still reads.
 */

import { cn } from "@/lib/utils";

const BLOBS = [
  {
    // indigo
    className: "left-[-14%] top-[-22%] h-[38rem] w-[38rem] sm:h-[46rem] sm:w-[46rem]",
    color: "from-indigo-500/45 via-violet-500/25 to-transparent",
    duration: "26s",
    delay: "0s",
  },
  {
    // fuchsia
    className: "right-[-18%] top-[-14%] h-[32rem] w-[32rem] sm:h-[40rem] sm:w-[40rem]",
    color: "from-fuchsia-500/40 via-pink-500/22 to-transparent",
    duration: "31s",
    delay: "-6s",
  },
  {
    // teal
    className: "bottom-[-18%] left-[6%] h-[30rem] w-[30rem] sm:h-[38rem] sm:w-[38rem]",
    color: "from-teal-400/38 via-cyan-400/22 to-transparent",
    duration: "34s",
    delay: "-12s",
  },
  {
    // amber
    className: "bottom-[-10%] right-[-6%] h-[28rem] w-[28rem] sm:h-[34rem] sm:w-[34rem]",
    color: "from-amber-400/38 via-orange-400/22 to-transparent",
    duration: "29s",
    delay: "-18s",
  },
];

export function GradientBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
    >
      {/* Base wash so the blobs blend into the page rather than floating */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-100/80 via-sky-50/60 to-background dark:from-indigo-950/60 dark:via-violet-950/30 dark:to-background" />

      {BLOBS.map((blob, i) => (
        <div
          key={i}
          className={cn("cz-blob absolute rounded-full blur-2xl sm:blur-3xl", blob.className)}
          style={{
            // CSS custom properties drive the shared keyframes
            ["--blob-duration" as string]: blob.duration,
            ["--blob-delay" as string]: blob.delay,
            animationDelay: blob.delay,
          }}
        >
          <span className={cn("block h-full w-full rounded-full bg-gradient-to-br", blob.color)} />
        </div>
      ))}

      {/* Faint grid to give the colour some structure */}
      <div
        className="absolute inset-0 opacity-[0.25] dark:opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
        }}
      />

      {/* A light veil keeps copy legible no matter which blob drifts under it */}
      <div className="absolute inset-0 bg-white/25 dark:bg-black/20" />

      {/* Fade the whole thing into the page */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
