import { MathText } from "@/components/MathText";
import { cn } from "@/lib/utils";
import type { Question } from "@/lib/api";
import { Input } from "@/components/ui/input";

type Props = {
  question: Question;
  selected: string | string[] | null;
  onChange: (value: string | string[] | null) => void;
  disabled?: boolean;
};

/**
 * Renders all supported question types:
 * single_choice | multiple_choice | integer | paragraph | image | math
 */
export function QuestionRenderer({ question, selected, onChange, disabled }: Props) {
  const type = question.question_type || "single_choice";

  return (
    <div className="space-y-4">
      {question.paragraph_text || question.paragraph_html ? (
        <div className="rounded-lg border bg-slate-50 p-4 text-sm">
          <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Passage</div>
          <MathText text={question.paragraph_text} html={question.paragraph_html} />
        </div>
      ) : null}

      {(type === "image" || question.image_url) && question.image_url ? (
        <div className="rounded-lg border p-2 bg-white inline-block max-w-full">
          <img
            src={question.image_url}
            alt="Question figure"
            className="max-h-64 max-w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : null}

      <div className="text-base font-medium leading-relaxed">
        <MathText text={question.question_text} html={question.question_html} />
      </div>

      {type === "integer" ? (
        <div className="max-w-xs">
          <label className="text-sm text-muted-foreground mb-1 block">Enter integer answer</label>
          <Input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={typeof selected === "string" || typeof selected === "number" ? String(selected ?? "") : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 42"
          />
        </div>
      ) : type === "multiple_choice" ? (
        <div className="space-y-2">
          {(question.options || []).map((opt) => {
            const arr = Array.isArray(selected) ? selected : selected ? [String(selected)] : [];
            const checked = arr.includes(opt.option_key);
            return (
              <button
                key={opt.option_key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  const next = checked
                    ? arr.filter((k) => k !== opt.option_key)
                    : [...arr, opt.option_key];
                  onChange(next);
                }}
                className={cn(
                  "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  checked ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-400 bg-white",
                  disabled && "opacity-70 cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-5 w-5 rounded border flex items-center justify-center text-xs font-bold",
                    checked ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300",
                  )}
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="font-semibold text-slate-600 w-6">{opt.option_key}.</span>
                <div className="flex-1">
                  <MathText text={opt.option_text} html={opt.option_html} />
                  {opt.image_url ? (
                    <img src={opt.image_url} alt="" className="mt-2 max-h-32 object-contain" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        // single_choice | paragraph | image | math — radio style
        <div className="space-y-2">
          {(question.options || []).map((opt) => {
            const checked = selected === opt.option_key;
            return (
              <button
                key={opt.option_key}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onChange(opt.option_key)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  checked ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-400 bg-white",
                  disabled && "opacity-70 cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center text-[10px]",
                    checked ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300",
                  )}
                >
                  {checked ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
                <span className="font-semibold text-slate-600 w-6">{opt.option_key}.</span>
                <div className="flex-1">
                  <MathText text={opt.option_text} html={opt.option_html} />
                  {opt.image_url ? (
                    <img src={opt.image_url} alt="" className="mt-2 max-h-32 object-contain" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
