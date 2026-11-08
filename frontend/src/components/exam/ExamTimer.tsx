import { useEffect } from "react";
import { Clock } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useExamPlayerStore } from "@/stores/examPlayerStore";

export function ExamTimer() {
  const timeRemaining = useExamPlayerStore((s) => s.timeRemaining);
  const timerRunning = useExamPlayerStore((s) => s.timerRunning);
  const tick = useExamPlayerStore((s) => s.tick);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, tick]);

  const critical = timeRemaining <= 60;
  const warning = timeRemaining <= 300 && !critical;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-sm font-semibold tabular-nums",
        critical && "bg-red-600 text-white animate-pulse",
        warning && "bg-amber-500 text-white",
        !warning && !critical && "bg-slate-800 text-white",
      )}
    >
      <Clock className="h-4 w-4" />
      {formatDuration(timeRemaining)}
    </div>
  );
}
