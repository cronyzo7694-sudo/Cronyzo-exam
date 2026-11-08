import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { importsApi, type KnowledgeQuestion } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Step = "choose" | "preview" | "validate" | "importing" | "done";
type ImportMethod = "csv" | "json" | "ai_text" | "ai_file";

const METHODS = [
  { key: "ai_file" as ImportMethod, label: "AI - Any File", icon: "🧠", desc: "PDF, DOCX, Image, Screenshot - ANY source", accept: ".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt,.md,.csv,.json,.html" },
  { key: "ai_text" as ImportMethod, label: "AI - Raw Text", icon: "✨", desc: "Paste broken OCR, Hindi-English mix", accept: "" },
  { key: "csv" as ImportMethod, label: "CSV", icon: "📊", desc: "Spreadsheet bulk", accept: ".csv" },
  { key: "json" as ImportMethod, label: "JSON", icon: "{ }", desc: "Structured data", accept: ".json" },
];

const SAMPLE_AI_TEXT = `Pinnacle SSC Reasoning Page 45
Q. Select the option that is related to the third word in same way.
Doctor : Hospital :: Teacher : ?
A) School B) Classroom C) Student D) Book
Answer: A

132 : 156 :: 462 : ?
A) 484 B) 552 C) 496 D) 510
Ans: A

Pressure : Pascal :: Force : ?
A) Newton B) Joule
`;

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <div className="min-w-0">
        <div className="text-lg font-bold">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label} {sub ? `· ${sub}` : ""}</div>
      </div>
    </div>
  );
}

export function ImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<ImportMethod>("ai_file");
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState(SAMPLE_AI_TEXT);
  const [jsonText, setJsonText] = useState(`{\n  "questions": [\n    {\n      "question_text": "Capital of France?",\n      "option_a": "Berlin", "option_b": "Paris",\n      "option_c": "Rome", "option_d": "Madrid",\n      "correct_answer": "B"\n    }\n  ]\n}`);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [previewQuestions, setPreviewQuestions] = useState<KnowledgeQuestion[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const [sourceBook, setSourceBook] = useState("");
  const [examName, setExamName] = useState("");
  const [examYear, setExamYear] = useState("");

  const [importOptions, setImportOptions] = useState({
    skipDuplicates: true,
    createMissing: true,
  });

  const { data: historyData } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => importsApi.jobs().catch(() => ({ items: [], total: 0 })),
  });
  const { data: knowledgeJobsData } = useQuery({
    queryKey: ["knowledge-jobs"],
    queryFn: () => importsApi.knowledgeJobs().catch(() => ({ items: [], total: 0 })),
  });
  const { data: knowledgeStats } = useQuery({
    queryKey: ["knowledge-stats"],
    queryFn: () => importsApi.knowledgeStats().catch(() => null),
  });

  const historyItems: any[] = useMemo(() => historyData?.items || [], [historyData]);
  const knowledgeItems: any[] = useMemo(() => knowledgeJobsData?.items || [], [knowledgeJobsData]);

  useEffect(() => {
    if (step !== "importing") return;
    setProgress(0);
    const iv = setInterval(() => {
      setProgress((p) => (p >= 95 ? p : p + Math.random() * 15));
    }, 300);
    return () => clearInterval(iv);
  }, [step]);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setStep("preview");
    setError("");
    setPreviewQuestions([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const doPreview = async () => {
    setBusy(true);
    setError("");
    setPreviewQuestions([]);
    try {
      if (method === "ai_text") {
        const res = await importsApi.aiTextPreview({
          raw_text: rawText,
          source_book: sourceBook || undefined,
          exam_name: examName || undefined,
          source_type: "typed",
        });
        setPreviewQuestions(res.questions || []);
        setResult(res);
        setStep("validate");
      } else if (method === "ai_file" && file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("source_book", sourceBook || file.name);
        if (examName) fd.append("exam_name", examName);
        if (examYear) fd.append("exam_year", examYear);
        fd.append("preview", "true");
        const res = await importsApi.aiFile(fd);
        setPreviewQuestions(res.questions || []);
        setResult(res);
        setStep("validate");
      } else {
        setStep("validate");
      }
    } catch (e: any) {
      setError(e.message || "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const executeImport = async () => {
    setBusy(true);
    setError("");
    setStep("importing");
    try {
      let res: any;
      if (method === "ai_file" && file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("source_book", sourceBook || file.name);
        if (examName) fd.append("exam_name", examName);
        if (examYear) fd.append("exam_year", examYear);
        fd.append("source_type", file.name.endsWith(".pdf") ? "pdf" : "file");
        fd.append("skip_duplicates", String(importOptions.skipDuplicates));
        fd.append("auto_create", String(importOptions.createMissing));
        res = await importsApi.aiFile(fd);
      } else if (method === "ai_text") {
        res = await importsApi.aiText({
          raw_text: rawText,
          source_book: sourceBook || undefined,
          exam_name: examName || undefined,
          exam_year: examYear ? parseInt(examYear) : undefined,
          source_type: "typed",
          skip_duplicates: importOptions.skipDuplicates,
        });
      } else if (method === "csv" && file) {
        const fd = new FormData();
        fd.append("file", file);
        res = await importsApi.csv(fd);
      } else if (method === "json") {
        const parsed = JSON.parse(jsonText);
        res = await importsApi.json(parsed);
      } else {
        throw new Error("No valid import method");
      }
      setProgress(100);
      setTimeout(() => {
        setResult(res);
        setPreviewQuestions(res.questions || []);
        setStep("done");
        qc.invalidateQueries({ queryKey: ["import-jobs"] });
        qc.invalidateQueries({ queryKey: ["knowledge-jobs"] });
      }, 600);
    } catch (e: any) {
      setError(e.message || "Import failed");
      setStep("validate");
    } finally {
      setBusy(false);
    }
  };

  const isAI = method === "ai_file" || method === "ai_text";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            Import Center <span className="text-sm font-normal px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">AI Knowledge Engine</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ANY source - Pinnacle, Kiran, Lucent, PDF, screenshots. Duplicate-safe.</p>
        </div>
      </header>

      {knowledgeStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Total Questions" value={knowledgeStats.total_questions ?? 0} />
          <Kpi label="Appearances" value={knowledgeStats.total_appearances ?? 0} sub="merged" />
          <Kpi label="Needs Review" value={knowledgeStats.needs_review ?? 0} />
          <Kpi label="Engine" value={knowledgeStats.engine_version || "v1"} sub="integrated" />
        </div>
      )}

      {step === "choose" && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            {METHODS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`text-left rounded-2xl border p-4 transition-all hover:shadow-sm ${method === m.key ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : "bg-card"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-card border flex items-center justify-center text-lg">{m.icon}</div>
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {m.label} {m.key.startsWith("ai_") && <Badge variant="secondary" className="text-[10px]">AI</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {isAI && (
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Source Metadata (optional)</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Source Book</Label>
                  <Input placeholder="Pinnacle Reasoning Page 45" value={sourceBook} onChange={(e) => setSourceBook(e.target.value)} className="h-9 text-sm rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Exam Name</Label>
                  <Input placeholder="SSC CGL 2022 Morning" value={examName} onChange={(e) => setExamName(e.target.value)} className="h-9 text-sm rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Year</Label>
                  <Input placeholder="2022" value={examYear} onChange={(e) => setExamYear(e.target.value)} className="h-9 text-sm rounded-xl" />
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-card overflow-hidden">
            {(method === "ai_file" || method === "csv" || method === "json") && (
              <div className="p-5 space-y-4">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/30"}`}
                >
                  <p className="text-sm font-medium">Drop any file here or click to browse</p>
                  <p className="text-[11px] text-muted-foreground mt-1">PDF, DOCX, PNG, JPG, CSV, JSON, TXT supported</p>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept={METHODS.find((m) => m.key === method)?.accept || ".pdf"}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                  {file && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs">
                      {file.name} - {(file.size / 1024).toFixed(0)} KB
                    </div>
                  )}
                </div>
              </div>
            )}

            {method === "ai_text" && (
              <div className="p-5 space-y-3">
                <Textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="min-h-[280px] font-mono text-sm rounded-xl"
                  placeholder="Paste any educational content..."
                />
              </div>
            )}

            {method === "json" && (
              <div className="p-5">
                <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="min-h-[240px] font-mono text-xs rounded-xl" />
              </div>
            )}

            <div className="px-5 py-3 bg-muted/10 border-t flex justify-between items-center">
              <p className="text-[11px] text-muted-foreground">No hallucination - if answer missing, keep null.</p>
              <Button
                size="sm"
                disabled={(method.includes("file") && !file) || (method === "ai_text" && !rawText.trim()) || busy}
                onClick={doPreview}
                className="rounded-xl h-9"
              >
                AI Preview & Validate
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-5">
          {previewQuestions.length > 0 ? (
            <div className="rounded-2xl border overflow-hidden">
              <div className="bg-muted/20 px-5 py-3 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold">AI Parsed Preview ({previewQuestions.length} questions)</h3>
                <div className="flex gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {previewQuestions.filter((q) => q.duplicate_info?.is_duplicate).length} duplicates
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {previewQuestions.filter((q) => (q as any).needs_review || (q as any).needs_human_review).length} needs review
                  </Badge>
                </div>
              </div>
              <div className="divide-y max-h-[520px] overflow-y-auto">
                {previewQuestions.slice(0, 5).map((q, idx) => (
                  <div key={idx} className="p-4 space-y-2 hover:bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        Q{idx + 1}: {q.question_text?.slice(0, 180)}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        {q.duplicate_info?.is_duplicate && <Badge variant="destructive" className="text-[10px]">Dup #{q.duplicate_info.duplicate_of}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{q.classification?.difficulty}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{q.classification?.subject}</Badge>
                      {q.classification?.chapter && <Badge variant="outline" className="text-[10px]">{q.classification.chapter}</Badge>}
                      {q.classification?.topic && <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">{q.classification.topic}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border p-6 text-center">
              <p className="text-sm text-muted-foreground">Previewing...</p>
              {result && <pre className="mt-3 text-left text-xs bg-muted/30 p-3 rounded-xl overflow-auto max-h-48">{JSON.stringify(result, null, 2).slice(0, 2000)}</pre>}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep("choose")} className="rounded-xl h-9">
              Back
            </Button>
            <Button size="sm" onClick={() => setStep("validate")} className="rounded-xl h-9">
              Continue to Validation
            </Button>
          </div>
        </div>
      )}

      {step === "validate" && (
        <div className="space-y-5">
          <div className="rounded-2xl border overflow-hidden">
            <div className="bg-muted/20 px-5 py-3 border-b">
              <h3 className="text-sm font-semibold">Import Options - Permanent Bank Safety</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="flex items-start justify-between gap-4 py-1 cursor-pointer">
                <div>
                  <p className="text-[13px] font-medium">Skip Duplicates & Merge Appearance History</p>
                  <p className="text-[11px] text-muted-foreground">Same question in Pinnacle + SSC paper? Keep one canonical, merge history</p>
                </div>
                <input type="checkbox" checked={importOptions.skipDuplicates} onChange={(e) => setImportOptions((p) => ({ ...p, skipDuplicates: e.target.checked }))} />
              </label>
              <label className="flex items-start justify-between gap-4 py-1 cursor-pointer">
                <div>
                  <p className="text-[13px] font-medium">Auto-Create Taxonomy</p>
                  <p className="text-[11px] text-muted-foreground">Auto-create subjects/chapters from AI classification</p>
                </div>
                <input type="checkbox" checked={importOptions.createMissing} onChange={(e) => setImportOptions((p) => ({ ...p, createMissing: e.target.checked }))} />
              </label>
            </div>
          </div>

          {result && (
            <div className="grid sm:grid-cols-4 gap-3">
              <Kpi label="Blocks Found" value={result.total_blocks_found ?? 0} />
              <Kpi label="Will Create" value={result.questions_created ?? result.success_count ?? 0} />
              <Kpi label="Duplicates" value={result.duplicates_found ?? result.duplicate_count ?? 0} sub="will merge" />
              <Kpi label="Needs Review" value={result.needs_review ?? 0} />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep("preview")} className="rounded-xl h-9">
              Back
            </Button>
            <Button size="sm" onClick={executeImport} disabled={busy} className="rounded-xl h-9 bg-violet-600 hover:bg-violet-700">
              Run AI Import
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="rounded-3xl border bg-card p-8 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-violet-100 flex items-center justify-center animate-bounce">🧠</div>
          <div>
            <h3 className="text-lg font-bold">AI Knowledge Engine Processing...</h3>
            <p className="text-sm text-muted-foreground mt-1">Parsing like human teacher</p>
          </div>
          <div className="w-full max-w-xs mx-auto space-y-2">
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-violet-600 transition-all duration-500" style={{ width: `${Math.round(progress)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{Math.round(progress)}% complete</p>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-5">
          <div className="rounded-3xl border bg-card p-8 text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">✅</div>
            <div>
              <h3 className="text-xl font-bold">Import Complete! Knowledge Bank Updated</h3>
              <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
              <Kpi label="Created" value={result.questions_created ?? result.success_count ?? 0} />
              <Kpi label="Duplicates Merged" value={result.duplicates_found ?? 0} />
              <Kpi label="Needs Review" value={result.needs_review ?? 0} />
              <Kpi label="Appearances" value={(result.questions_created ?? 0) + (result.duplicates_found ?? 0)} />
            </div>
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={() => { setStep("choose"); setFile(null); setResult(null); setPreviewQuestions([]); }} className="rounded-xl h-9">
                Import Another Source
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStep("choose")} className="rounded-xl h-9">Done</Button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 flex items-start gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-600">Import failed</p>
            <p className="text-xs text-red-500">{error}</p>
            <button onClick={() => { setError(""); setStep("choose"); }} className="text-[11px] text-red-500 hover:underline">Dismiss</button>
          </div>
        </div>
      )}

      {knowledgeItems.length > 0 && step === "choose" && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">AI Knowledge Engine Jobs</h3>
          <div className="rounded-2xl border overflow-hidden divide-y">
            {knowledgeItems.slice(0, 5).map((job: any) => (
              <div key={job.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{job.file_name || job.source_book || `AI Job #${job.id}`}</p>
                  <p className="text-[10px] text-muted-foreground">{job.total_blocks_found || 0} blocks · {job.questions_created || 0} created · {job.duplicates_found || 0} dups merged</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{job.source_type}</Badge>
                  <Badge variant={job.status === "completed" ? "secondary" : "outline"} className="text-[10px] capitalize">{job.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
