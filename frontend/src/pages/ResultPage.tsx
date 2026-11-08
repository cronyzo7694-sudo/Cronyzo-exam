import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { attemptsApi, type AttemptAnalytics } from "@/lib/api";
import { usePlatformStore } from "@/stores/platformStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/MathText";
import { Loader } from "@/components/Loader";
import { formatDuration, cn } from "@/lib/utils";

export function ResultPage() {
  const params = useParams({ strict: false }) as { attemptId?: string };
  const id = Number(params.attemptId);
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const showAnalytics = isEnabled("ENABLE_ANALYTICS", true);
  const showCoach = isEnabled("ENABLE_AI_COACH", true);

  // Result language defaults to the language the test was taken in.
  const [lang, setLang] = useState<"en" | "hi">(() => {
    try { return (localStorage.getItem("exam_lang") as "en" | "hi") || "en"; } catch { return "en"; }
  });
  // Per-question explanation cache { [questionId]: { en, hi } } (file explanations)
  const [expl] = useState<Record<number, { en?: string; hi?: string }>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["review", id],
    queryFn: () => attemptsApi.review(id),
    enabled: Number.isFinite(id),
  });

  // Build a clean prompt text for a question (used by external AI buttons).
  const buildAskText = (q: any) => {
    const qt = lang === "hi" ? (q?.question_text_hi || q?.question_text) : q?.question_text;
    const opts = (q?.options || [])
      .map((o: any) => {
        const t = lang === "hi" ? (o.option_text_hi || o.option_text) : o.option_text;
        return `${o.option_key}) ${t}`;
      })
      .join("\n");
    const correct = q?.correct_answer != null ? `\nCorrect answer: ${q.correct_answer}` : "";
    const ask = lang === "hi"
      ? "\n\nEs question ko step-by-step Hindi me samjhao."
      : "\n\nExplain this question step by step.";
    return `${qt || ""}\n${opts}${correct}${ask}`;
  };

  // Ask an external AI: copy the question to clipboard (so the student just
  // pastes it) and open the AI site. ChatGPT/Gemini no longer reliably auto-fill
  // from a URL param, so clipboard is the dependable way. Zero tokens for us.
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const AI_SITES: Record<string, { label: string; url: string }> = {
    chatgpt: { label: "🤖 ChatGPT", url: "https://chat.openai.com/" },
    gemini: { label: "✨ Gemini", url: "https://gemini.google.com/app" },
    claude: { label: "🧠 Claude", url: "https://claude.ai/new" },
    perplexity: { label: "🔎 Perplexity", url: "https://www.perplexity.ai/" },
    deepseek: { label: "🐳 DeepSeek", url: "https://chat.deepseek.com/" },
  };
  const askExternal = async (provider: string, q: any) => {
    const text = buildAskText(q);
    try { await navigator.clipboard?.writeText(text); } catch { /* ignore */ }
    setCopiedFor(`${provider}-${q?.id}`);
    setTimeout(() => setCopiedFor(null), 2500);
    window.open(AI_SITES[provider]?.url || "https://www.google.com", "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <Loader
        title="Result taiyaar ho raha hai"
        messages={[
          "Aapke jawab check kiye ja rahe hain…",
          "Sahi aur galat count kiya ja raha hai…",
          "Score aur percentage nikaala ja raha hai…",
          "Analysis banaya ja raha hai…",
          "Bas thoda aur…",
        ]}
      />
    );
  }
  if (error || !data) {
    return <div className="text-sm text-red-600">Failed to load result</div>;
  }

  const r = data.result;
  const analytics = (data.analytics || {}) as AttemptAnalytics;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Result</h1>
          <p className="text-slate-500 text-sm mt-0.5">{r.exam_title}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/attempts">Attempts</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/exams">Exams</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Score" value={`${r.score} / ${r.max_score}`} />
        <Stat title="Percentage" value={`${r.percentage}%`} highlight={r.percentage >= 60} />
        <Stat title="Correct" value={r.correct_count} />
        <Stat title="Wrong" value={r.wrong_count} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="shadow-none border-slate-200">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Row label="Attempted" value={String(r.attempted_count)} />
            <Row label="Skipped" value={String(r.skipped_count)} />
            <Row label="Negative marks" value={String(r.negative_marks_total)} />
            <Row label="Time spent" value={formatDuration(r.time_spent_seconds || 0)} />
            <Row label="Status" value={r.status} />
            <Row label="Total questions" value={String(r.total_questions)} />
          </CardContent>
        </Card>

        {showAnalytics && (analytics.accuracy != null || analytics.attempt_quality != null) ? (
          <Card className="shadow-none border-slate-200">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold">Performance</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {analytics.accuracy != null ? (
                <Row label="Accuracy" value={`${analytics.accuracy}%`} />
              ) : null}
              {analytics.attempt_rate != null ? (
                <Row label="Attempt rate" value={`${analytics.attempt_rate}%`} />
              ) : null}
              {analytics.avg_time_per_question != null ? (
                <Row label="Avg time / Q" value={`${analytics.avg_time_per_question}s`} />
              ) : null}
              {analytics.speed_qpm != null ? (
                <Row label="Speed" value={`${analytics.speed_qpm} Q/min`} />
              ) : null}
              {analytics.guess_count != null ? (
                <Row label="Guess signals" value={String(analytics.guess_count)} />
              ) : null}
              {analytics.attempt_quality != null ? (
                <Row label="Attempt quality" value={`${analytics.attempt_quality}/100`} />
              ) : null}
              {analytics.percentile != null ? (
                <Row label="Percentile" value={`${analytics.percentile}`} />
              ) : null}
              {analytics.rank_prediction != null ? (
                <Row label="Rank (est.)" value={`#${analytics.rank_prediction}`} />
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {showAnalytics && analytics.score_loss ? (
        <Card className="shadow-none border-slate-200">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">Score loss</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid sm:grid-cols-4 gap-3 text-sm">
            <Mini label="Total" value={analytics.score_loss.total ?? 0} />
            <Mini label="From wrong" value={analytics.score_loss.from_wrong ?? 0} />
            <Mini label="Negative" value={analytics.score_loss.from_negative ?? 0} />
            <Mini label="Skipped" value={analytics.score_loss.from_skipped ?? 0} />
          </CardContent>
        </Card>
      ) : null}

      {showCoach && analytics.ai_coach?.summary ? (
        <Card className="shadow-none border-slate-200 bg-slate-50/80">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">Coach summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-sm space-y-2">
            <p className="text-slate-700 leading-relaxed">{analytics.ai_coach.summary}</p>
            {analytics.ai_coach.next_best_action ? (
              <p className="text-slate-600">
                <span className="font-medium text-slate-800">Next: </span>
                {analytics.ai_coach.next_best_action}
              </p>
            ) : null}
            {(analytics.ai_coach.suggestions || analytics.suggestions || []).length ? (
              <ul className="list-disc pl-5 text-slate-600 space-y-1">
                {(analytics.ai_coach.suggestions || analytics.suggestions || [])
                  .slice(0, 5)
                  .map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showAnalytics && (analytics.weak_subjects?.length || analytics.strong_subjects?.length) ? (
        <div className="grid gap-3 md:grid-cols-2">
          <AreaList title="Weak areas" items={analytics.weak_subjects || []} tone="weak" />
          <AreaList title="Strong areas" items={analytics.strong_subjects || []} tone="strong" />
        </div>
      ) : null}

      {(r.section_results as any[])?.length ? (
        <Card className="shadow-none border-slate-200">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">Section breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {(r.section_results as any[]).map((s, i) => (
              <div
                key={i}
                className="flex flex-wrap justify-between gap-2 border border-slate-150 rounded-md px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-800">
                  Section {s.section_id ?? i + 1}
                </span>
                <span className="text-slate-600 tabular-nums">
                  {s.correct}/{s.total} correct · {Number(s.score).toFixed(2)}/{s.max_score}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {showAnalytics && isEnabled("ENABLE_WRONG_NOTEBOOK", true) && analytics.mistakes?.length ? (
        <Card className="shadow-none border-slate-200">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">
              Mistake notebook ({analytics.mistakes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5 text-sm">
            {analytics.mistakes.slice(0, 12).map((m: any, i: number) => (
              <div
                key={i}
                className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0"
              >
                <span className="text-slate-700">
                  Q{m.question_id} · {m.subject} / {m.chapter}
                </span>
                <span className="text-slate-500">
                  {m.reason}
                  {m.guess ? " · guess" : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-none border-slate-200">
        <CardHeader className="py-3 px-4 flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            {lang === "hi" ? "प्रश्न समीक्षा" : "Question review"}
          </CardTitle>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "hi")}
            className="h-8 rounded-lg border bg-card text-xs px-2 cursor-pointer focus:outline-none"
            title="Language"
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
          </select>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {!data.items?.length ? (
            <p className="text-sm text-slate-500">
              {data.message || "Detailed review is not available for this exam."}
            </p>
          ) : (
            data.items.map((item: any, idx: number) => {
              const ok = item.is_correct === true;
              const skipped = !item.is_answered;
              return (
                <div
                  key={item.question_id}
                  className={cn(
                    "rounded-md border p-3",
                    ok && "border-emerald-200 bg-emerald-50/30",
                    item.is_correct === false && "border-red-200 bg-red-50/30",
                    skipped && "border-slate-200",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <Badge variant="secondary">Q{idx + 1}</Badge>
                    {skipped ? (
                      <Badge variant="outline">Skipped</Badge>
                    ) : ok ? (
                      <Badge variant="success">Correct</Badge>
                    ) : (
                      <Badge variant="destructive">Wrong</Badge>
                    )}
                    <Badge variant="outline">
                      {item.marks_awarded}/{item.marks}
                    </Badge>
                    {item.time_spent_seconds ? (
                      <Badge variant="outline">{item.time_spent_seconds}s</Badge>
                    ) : null}
                  </div>
                  {item.question ? (
                    <>
                      <MathText
                        text={
                          lang === "hi"
                            ? (item.question.question_text_hi || item.question.question_text)
                            : item.question.question_text
                        }
                        html={lang === "hi" ? null : item.question.question_html}
                        className="font-medium mb-2 text-sm"
                      />
                      {/* Options in chosen language, highlighting correct + chosen */}
                      {Array.isArray(item.question.options) && item.question.options.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {item.question.options.map((o: any) => {
                            const key = o.option_key;
                            const isCorrect = String(item.question.correct_answer) === String(key);
                            const isChosen = String(item.selected_answer) === String(key);
                            const otext = lang === "hi" ? (o.option_text_hi || o.option_text) : o.option_text;
                            return (
                              <div
                                key={key}
                                className={cn(
                                  "text-[13px] rounded px-2 py-1 border",
                                  isCorrect && "border-emerald-300 bg-emerald-50",
                                  isChosen && !isCorrect && "border-red-300 bg-red-50",
                                  !isCorrect && !isChosen && "border-transparent"
                                )}
                              >
                                <span className="font-semibold mr-1">{key}.</span>
                                {otext}
                                {isCorrect && <span className="ml-1 text-emerald-600">✓</span>}
                                {isChosen && !isCorrect && <span className="ml-1 text-red-600">✕</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-sm space-y-1">
                        <div>
                          <span className="text-muted-foreground">{lang === "hi" ? "आपका उत्तर: " : "Your answer: "}</span>
                          <span className="font-medium">
                            {formatAns(item.selected_answer) || "—"}
                          </span>
                        </div>
                        {item.question.correct_answer != null ? (
                          <div>
                            <span className="text-muted-foreground">{lang === "hi" ? "सही उत्तर: " : "Correct: "}</span>
                            <span className="font-medium text-emerald-700">
                              {formatAns(item.question.correct_answer)}
                            </span>
                          </div>
                        ) : null}
                        {(() => {
                          const cached = expl[item.question_id] || {};
                          const fileExpl = lang === "hi"
                            ? (item.question.explanation_hi || item.question.explanation)
                            : item.question.explanation;
                          const shown = lang === "hi" ? (cached.hi || fileExpl) : (cached.en || fileExpl);
                          if (shown) {
                            return (
                              <div className="mt-2 rounded border bg-white/80 p-2">
                                <div className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                                  {lang === "hi" ? "व्याख्या" : "Explanation"}
                                </div>
                                <MathText text={shown} />
                              </div>
                            );
                          }
                          // No file explanation -> let student ask any AI.
                          // We copy the question to clipboard + open the AI site.
                          return (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground w-full sm:w-auto">
                                {lang === "hi" ? "AI से समझें (सवाल कॉपी होकर खुलेगा, पेस्ट करें):" : "Ask AI (question is copied — just paste):"}
                              </span>
                              {Object.entries(AI_SITES).map(([key, meta]) => {
                                const copied = copiedFor === `${key}-${item.question.id}`;
                                return (
                                  <button
                                    key={key}
                                    onClick={() => askExternal(key, item.question)}
                                    className="rounded-lg border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted transition-colors"
                                    title={`Copy question + open ${meta.label}`}
                                  >
                                    {copied ? (lang === "hi" ? "✅ कॉपी!" : "✅ Copied!") : meta.label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatAns(v: unknown) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function Stat({
  title,
  value,
  highlight,
}: {
  title: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={cn("shadow-none", highlight ? "border-emerald-300" : "border-slate-200")}>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-150 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AreaList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  tone: "weak" | "strong";
}) {
  return (
    <Card className="shadow-none border-slate-200">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1.5 text-sm">
        {!items.length ? (
          <p className="text-slate-500">No data</p>
        ) : (
          items.slice(0, 6).map((it, i) => (
            <div
              key={i}
              className="flex justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0"
            >
              <span className="truncate text-slate-700">{String(it.name ?? "—")}</span>
              <span
                className={cn(
                  "tabular-nums font-medium shrink-0",
                  tone === "weak" ? "text-red-600" : "text-emerald-700",
                )}
              >
                {it.accuracy != null ? `${it.accuracy}%` : "—"}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
