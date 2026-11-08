import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Stats = {
  total_file_questions: number;
  stats: {
    total: number;
    with_answer?: number;
    without_answer?: number;
    by_subject: Record<string, number>;
    by_chapter: Record<string, number>;
    by_topic: Record<string, number>;
    by_difficulty: Record<string, number>;
  };
};

export function FileBankPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [error, setError] = useState("");

  const { data: statsData, isLoading } = useQuery({
    queryKey: ["file-bank-stats"],
    queryFn: () => api.get<Stats>("/exams/file-bank/stats"),
  });

  const stats = statsData?.stats;
  const total = statsData?.total_file_questions || 0;

  const reloadFiles = async () => {
    setBusy("reload"); setError(""); setMsg("");
    try {
      const res = await api.post<any>("/exams/file-bank/reload", {});
      setMsg(`${res.total} questions loaded. ${res.refresh?.tests_created ?? 0} naye tests bane, ${res.refresh?.coming_soon_exams ?? 0} exams abhi "Coming Soon".`);
      qc.invalidateQueries({ queryKey: ["file-bank-stats"] });
      qc.invalidateQueries({ queryKey: ["exams"] });
    } catch (e: any) {
      setError(e.message || "Reload failed");
    } finally { setBusy(null); }
  };

  const rebuildAll = async () => {
    if (!confirm("Sabhi exams ke tests dobara banenge (file bank se). Aapke EXAM CARDS safe rahenge — sirf unke andar ke tests refresh honge. Continue?")) return;
    setBusy("rebuild"); setError(""); setMsg("");
    try {
      const res = await api.post<any>("/exams/admin/rebuild-all-tests", {});
      setMsg(`${res.message} (${res.exams_rebuilt} exams, ${res.tests_created} tests)`);
      qc.invalidateQueries({ queryKey: ["exams"] });
    } catch (e: any) {
      setError(e.message || "Rebuild failed");
    } finally { setBusy(null); }
  };

  const factoryReset = async () => {
    // Triple safety: two confirms + typed phrase.
    if (!confirm("⚠️ KHATRA: Ye SAB KUCH hata dega — saare exams, tests, questions, subjects. Ye wapas nahi aayega!")) return;
    const typed = window.prompt('Pakka karne ke liye ye type karo: DELETE EVERYTHING');
    if (typed !== "DELETE EVERYTHING") { setError("Factory reset cancel — confirmation match nahi hua."); return; }
    setBusy("reset"); setError(""); setMsg("");
    try {
      const res = await api.post<any>("/exams/admin/factory-reset", { confirm: "DELETE EVERYTHING" });
      setMsg(res.message || "Factory reset done.");
      qc.invalidateQueries({ queryKey: ["exams"] });
    } catch (e: any) {
      setError(e.message || "Reset failed");
    } finally { setBusy(null); }
  };

  if (isLoading) return <div className="p-8 text-sm">Loading file bank...</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">File Bank 🧠</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Code me <code>questions_data/</code> folder me subject/topic ki .txt files daalo
            (jaise <code>reasoning analogy.txt</code>). Phir <b>Reload</b> dabao.
            Tests khud nahi bante yahan — <b>Exam banao</b> (SSC CHSL etc.) + uska syllabus do,
            to us exam ke andar matching tests apne aap ban jayenge.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reloadFiles} disabled={!!busy} className="rounded-xl gap-2 bg-violet-600 hover:bg-violet-700 text-white">
            {busy === "reload" ? "Reloading..." : "🔄 Reload Files"}
          </Button>
          <Button onClick={rebuildAll} disabled={!!busy} variant="outline" className="rounded-xl gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            {busy === "rebuild" ? "Rebuilding..." : "♻️ Rebuild All Tests"}
          </Button>
          <Button onClick={factoryReset} disabled={!!busy} variant="outline" className="rounded-xl gap-2 border-red-300 text-red-600 hover:bg-red-50">
            {busy === "reset" ? "Resetting..." : "🧹 Factory Reset"}
          </Button>
        </div>
      </header>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800">
        <b>♻️ Rebuild All Tests</b> = safe safai. Sabhi exams ke tests dobara file bank se ban jaate hain,
        par aapke <b>exam cards (SSC CHSL etc.) SAFE rehte hain</b>. Rozana isi ka use karo.
        <br/><b>🧹 Factory Reset</b> = sab kuch mita deta hai (exams bhi) — sirf ekdum shuru se start karne ke liye. Double confirm + phrase maangta hai.
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[12px] text-blue-800">
        <b>Rules:</b> No exam → no test. Exam banaya par uske questions file me nahi → exam par
        <b> "Coming Soon"</b> dikhega. File me questions aa gaye → Reload dabate hi test ban jayega.
        Saare chapters aaye → Subject test. Saare subjects aaye → Full test.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total Questions" value={stats?.total || total} />
        <Stat label="With Answer" value={stats?.with_answer ?? "-"} />
        <Stat label="Subjects" value={Object.keys(stats?.by_subject || {}).length}
              sub={Object.keys(stats?.by_subject || {}).join(", ")} />
        <Stat label="Chapters" value={Object.keys(stats?.by_chapter || {}).length}
              sub={Object.keys(stats?.by_chapter || {}).slice(0, 4).join(", ")} />
      </div>

      {/* Breakdown */}
      {stats?.by_subject && Object.keys(stats.by_subject).length > 0 && (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">File Bank Contents</h3>
          {Object.entries(stats.by_subject).map(([subj, cnt]) => (
            <div key={subj} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{subj}</span>
                <Badge variant="secondary" className="text-[10px]">{cnt as any} Qs</Badge>
              </div>
            </div>
          ))}
          <div className="pt-2 border-t">
            <div className="text-[11px] text-muted-foreground mb-1">Topics available:</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.by_topic || {}).map(([t, c]) => (
                <span key={t} className="rounded-full border px-2.5 py-1 text-[11px]">
                  {t} <span className="text-muted-foreground">({c as any})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {msg && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{msg}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {sub && <div className="text-[10px] truncate text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
