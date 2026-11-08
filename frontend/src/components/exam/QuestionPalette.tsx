import { cn } from "@/lib/utils";
import { useExamPlayerStore, type PaletteStatus } from "@/stores/examPlayerStore";

const statusClass: Record<PaletteStatus, string> = {
  not_visited: "palette-not-visited",
  not_answered: "palette-not-answered",
  answered: "palette-answered",
  marked: "palette-marked",
  marked_answered: "palette-marked-answered",
};

export function QuestionPalette() {
  const flatQuestions = useExamPlayerStore((s) => s.flatQuestions);
  const currentGlobalIndex = useExamPlayerStore((s) => s.currentGlobalIndex);
  const sections = useExamPlayerStore((s) => s.sections);
  const goTo = useExamPlayerStore((s) => s.goTo);
  const getStatus = useExamPlayerStore((s) => s.getStatus);
  const summary = useExamPlayerStore((s) => s.summary());

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="font-semibold text-sm">Question Palette</div>
        <div className="grid grid-cols-2 gap-1 mt-2 text-[11px]">
          <Legend className="palette-answered" label={`Answered (${summary.answered})`} />
          <Legend className="palette-not-answered" label={`Not Ans (${summary.notAnswered})`} />
          <Legend className="palette-marked" label={`Marked (${summary.marked})`} />
          <Legend className="palette-not-visited" label={`Not Visited (${summary.notVisited})`} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {sections.map((sec, si) => {
          const start = flatQuestions.findIndex((q) => q.sectionIndex === si);
          if (start < 0) return null;
          const count = sec.questions.length;
          return (
            <div key={sec.id ?? si}>
              <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                {sec.title}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: count }).map((_, i) => {
                  const gi = start + i;
                  const status = getStatus(gi);
                  const current = gi === currentGlobalIndex;
                  return (
                    <button
                      key={gi}
                      type="button"
                      onClick={() => goTo(gi)}
                      className={cn("palette-btn", statusClass[status], current && "palette-current")}
                      title={`Q${gi + 1}`}
                    >
                      {gi + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-3.5 w-3.5 rounded-sm border", className)} />
      <span className="text-slate-600">{label}</span>
    </div>
  );
}
