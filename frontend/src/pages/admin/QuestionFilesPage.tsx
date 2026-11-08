/**
 * Question files — upload a bank, then turn it into a test.
 *
 * The operator keeps question banks as files (a JSON pack exported from
 * another app, a CSV, a PYQ paper pasted as text or HTML). This page:
 *
 *   1. uploads the file → every question is imported into the bank,
 *   2. keeps the file in a list, with what came out of it,
 *   3. builds a ready test from it — new test, or added into an existing one.
 */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileJson,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { examsApi, questionFilesApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none transition-colors focus:border-primary/60";

export function QuestionFilesPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const files = useQuery({
    queryKey: ["question-files"],
    queryFn: () => questionFilesApi.list(),
  });

  const exams = useQuery({
    queryKey: ["exams-for-file"],
    queryFn: () => examsApi.listAll("per_page=100"),
  });

  const detail = useQuery({
    queryKey: ["question-file", active],
    queryFn: () => questionFilesApi.get(active as string),
    enabled: Boolean(active),
  });

  /* ── create-test form state ─────────────────────────────── */
  const [form, setForm] = useState({
    title: "",
    question_count: "25",
    duration_minutes: "30",
    marks: "1",
    negative_marks: "0.25",
    exam_id: "",
  });
  const [buildMsg, setBuildMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const build = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      questionFilesApi.buildExam(payload.fileId as string, payload),
    onSuccess: (res) => {
      setBuildMsg({ ok: true, text: res.message });
      qc.invalidateQueries({ queryKey: ["exams-for-file"] });
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (err: any) => setBuildMsg({ ok: false, text: err?.message || "Could not build the test" }),
  });

  /* ── series builder: one file (or all files) → many tests ── */
  const [series, setSeries] = useState({
    per_test: "25",
    duration_minutes: "21",
    marks: "1",
    negative_marks: "0.25",
    tests_per_file: "",
  });
  const [seriesMsg, setSeriesMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const seriesPayload = () => ({
    per_test: Number(series.per_test || 25),
    duration_minutes: Number(series.duration_minutes || 21),
    marks: Number(series.marks || 1),
    negative_marks: Number(series.negative_marks || 0),
    tests_per_file: Number(series.tests_per_file || 0),
    status: "published",
    exam_mode: "mock",
    shuffle: true,
  });

  const seriesAll = useMutation({
    mutationFn: () => questionFilesApi.buildSeries(seriesPayload()),
    onSuccess: (res) => {
      setSeriesMsg({
        ok: true,
        text: `${res.message} ${res.files
          .filter((f) => f.created.length)
          .map((f) => `${f.subject}: ${f.created.length}`)
          .join(" · ")}`,
      });
      qc.invalidateQueries({ queryKey: ["exams"] });
      qc.invalidateQueries({ queryKey: ["exams-for-file"] });
    },
    onError: (err: any) => setSeriesMsg({ ok: false, text: err?.message || "Series nahi ban payi" }),
  });

  const seriesOne = useMutation({
    mutationFn: (fileId: string) => questionFilesApi.seriesFromFile(fileId, seriesPayload()),
    onSuccess: (res) => {
      setSeriesMsg({ ok: true, text: res.message });
      qc.invalidateQueries({ queryKey: ["exams"] });
      qc.invalidateQueries({ queryKey: ["exams-for-file"] });
    },
    onError: (err: any) => setSeriesMsg({ ok: false, text: err?.message || "Series nahi ban payi" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => questionFilesApi.remove(id),
    onSuccess: () => {
      setActive(null);
      qc.invalidateQueries({ queryKey: ["question-files"] });
    },
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await questionFilesApi.upload(file);
      setUploadMsg({ ok: true, text: res.message });
      setActive(res.item.id);
      setForm((f) => ({ ...f, title: `${file.name.replace(/\.[^.]+$/, "")} — test` }));
      qc.invalidateQueries({ queryKey: ["question-files"] });
    } catch (err: any) {
      setUploadMsg({ ok: false, text: err?.message || "Upload failed" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const items = files.data?.items ?? [];
  const current = items.find((i) => i.id === active) || null;
  const available = current?.question_count ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Question files</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Upload a question bank (.json, .csv, or a pasted paper as .txt) — every question
          goes into the bank, and you can build a test from the file in one click.
        </p>
      </header>

      {/* ═══ Upload ═══════════════════════════════════════ */}
      <section className="mb-5 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileJson className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">Upload a question file</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              JSON packs (questionText / options / correctAnswer), CSV with option_a…option_d,
              or a text paper with “Q1 … Answer: B”. Duplicates are skipped automatically.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-xl">
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Importing…" : "Choose file"}
              </Button>
              <span className="text-[11.5px] text-muted-foreground">Max 25 MB · 20,000 questions</span>
            </div>
            {uploadMsg && (
              <p
                className={cn(
                  "mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold",
                  uploadMsg.ok
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {uploadMsg.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                {uploadMsg.text}
              </p>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.jsonl,.csv,.tsv,.txt,.html,.htm"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </section>

      {/* ═══ Files ════════════════════════════════════════ */}
      <section className="mb-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex items-start gap-2">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-extrabold">Series banao — ek file se bahut se test</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Har file ko chhote tests me tod dega: “English Test 1”, “English Test 2”, …
              Numbering khud continue hoti hai, isliye dobara chalane par naye tests aage judte hain.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {[
            { key: "per_test", label: "Qs per test" },
            { key: "duration_minutes", label: "Minutes" },
            { key: "marks", label: "Marks / Q" },
            { key: "negative_marks", label: "Negative" },
            { key: "tests_per_file", label: "Tests/file (0=all)" },
          ].map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {field.label}
              </span>
              <input
                type="number"
                step={field.key === "negative_marks" ? "0.05" : "1"}
                min={0}
                value={(series as any)[field.key]}
                onChange={(e) => setSeries({ ...series, [field.key]: e.target.value })}
                className="h-9 w-full rounded-xl border bg-card px-2.5 text-[12.5px] outline-none focus:border-primary/60"
              />
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button className="rounded-xl" disabled={seriesAll.isPending} onClick={() => seriesAll.mutate()}>
            {seriesAll.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Bana rahe hain…
              </>
            ) : (
              <>
                <Layers className="mr-1.5 h-3.5 w-3.5" /> Saari files se series banao
              </>
            )}
          </Button>
          {seriesMsg && (
            <span
              className={cn(
                "text-[11.5px] font-semibold",
                seriesMsg.ok ? "text-emerald-600" : "text-destructive",
              )}
            >
              {seriesMsg.text}
            </span>
          )}
        </div>
      </section>

      <section className="mb-5 rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-[13px] font-bold">
            Uploaded files <span className="text-muted-foreground">({items.length})</span>
          </p>
          {files.isFetching && <span className="text-[11px] text-muted-foreground">updating…</span>}
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
            Nothing uploaded yet. Pick a file above — 600–800 question packs import in seconds.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((file) => (
              <li
                key={file.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3 transition-colors",
                  active === file.id ? "bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <button
                  onClick={() => {
                    setActive(file.id);
                    setBuildMsg(null);
                    setForm((f) => ({
                      ...f,
                      title: `${file.filename.replace(/\.[^.]+$/, "")} — test`,
                      question_count: String(Math.min(25, file.question_count || 25)),
                    }));
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-bold">{file.filename}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                    {file.question_count} questions · {file.subjects.join(", ") || "no subject"} ·{" "}
                    {file.chapter_count} chapters
                    {file.duplicate_count > 0 && ` · ${file.duplicate_count} dupes skipped`}
                    {file.error_count > 0 && ` · ${file.error_count} rows skipped`}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      setActive(file.id);
                      setBuildMsg(null);
                      setForm({
                        title: `${file.filename.replace(/\.[^.]+$/, "")} — test`,
                        question_count: String(Math.min(25, file.question_count || 25)),
                        duration_minutes: String(Math.min(60, Math.max(10, file.question_count || 25))),
                        marks: "1",
                        negative_marks: "0.25",
                        exam_id: "",
                      });
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Make test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={seriesOne.isPending}
                    title={`${Math.floor((file.question_count || 0) / Number(series.per_test || 25))} tests banenge`}
                    onClick={() => seriesOne.mutate(file.id)}
                  >
                    <Layers className="mr-1.5 h-3.5 w-3.5" />
                    Series
                  </Button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove “${file.filename}” from this list? The imported questions stay in the bank.`)) {
                        remove.mutate(file.id);
                      }
                    }}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ═══ Build a test ═════════════════════════════════ */}
      {current && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[14px] font-bold">Build a test from “{current.filename}”</p>
              <p className="text-[11.5px] text-muted-foreground">
                {available} questions available · leave the count as-is to use them all
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Test title
              </span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputCls}
                placeholder="Airforce XY — Physics PYQ 1"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Add into
              </span>
              <select
                value={form.exam_id}
                onChange={(e) => setForm({ ...form, exam_id: e.target.value })}
                className={inputCls}
              >
                <option value="">New test</option>
                {(exams.data ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Questions
              </span>
              <input
                type="number"
                min={1}
                max={available || 1}
                value={form.question_count}
                onChange={(e) => setForm({ ...form, question_count: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Marks per question
              </span>
              <input
                type="number"
                step="0.25"
                value={form.marks}
                onChange={(e) => setForm({ ...form, marks: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Negative marks
              </span>
              <input
                type="number"
                step="0.05"
                value={form.negative_marks}
                onChange={(e) => setForm({ ...form, negative_marks: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              className="rounded-xl"
              disabled={build.isPending}
              onClick={() =>
                build.mutate({
                  fileId: current.id,
                  title: form.title,
                  question_count: Number(form.question_count || 0),
                  duration_minutes: Number(form.duration_minutes || 30),
                  marks: Number(form.marks || 1),
                  negative_marks: Number(form.negative_marks || 0),
                  exam_id: form.exam_id ? Number(form.exam_id) : undefined,
                  shuffle: true,
                })
              }
            >
              {build.isPending ? "Building…" : form.exam_id ? "Add to that test" : "Create test"}
            </Button>
            {buildMsg && (
              <span
                className={cn(
                  "text-[12px] font-semibold",
                  buildMsg.ok ? "text-emerald-600" : "text-destructive",
                )}
              >
                {buildMsg.text}
              </span>
            )}
          </div>

          {detail.data?.samples?.length ? (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Preview · first {detail.data.samples.length} questions
              </p>
              <ol className="space-y-2.5">
                {detail.data.samples.map((sample, index) => (
                  <li key={sample.id} className="rounded-xl border bg-muted/20 px-3 py-2.5">
                    <p className="text-[12.5px] font-semibold">
                      {index + 1}. {sample.question_text}
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                      {(sample.options || []).map((option) => (
                        <span key={option.key}>
                          <b className="text-foreground">{option.key}.</b> {option.text}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-emerald-600">
                      Answer: {String(sample.correct_answer)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
