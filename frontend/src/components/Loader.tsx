/**
 * Reusable full-area loader with an animated spinner + rotating status messages.
 * Use for any screen that may take a while (result calc, exam load, etc.)
 */
import { useEffect, useState } from "react";

const DEFAULT_MESSAGES = [
  "Loading…",
  "Please wait…",
  "Almost there…",
];

export function Loader({
  title = "Loading",
  messages = DEFAULT_MESSAGES,
  className = "",
}: {
  title?: string;
  messages?: string[];
  className?: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % messages.length), 1600);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className={`flex flex-col items-center justify-center py-20 gap-5 text-center ${className}`}>
      {/* Animated ring */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-primary/60 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.2s" }} />
      </div>

      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground animate-pulse min-h-[20px]">{messages[i]}</p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="w-2 h-2 rounded-full bg-primary/70 animate-bounce"
            style={{ animationDelay: `${d * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default Loader;
