import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { examsApi, type Exam } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════
   Inline SVG Icons
   ══════════════════════════════════════════════════════════ */
const si = (d: string) => `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${d}</svg>`;
const I = {
  search: si('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  plus: si('<path d="M12 5v14M5 12h14"/>'),
  edit: si('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  trash: si('<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
  copy: si('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'),
  check: si('<path d="M5 13l4 4L19 7"/>'),
  xmark: si('<path d="M6 18L18 6M6 6l12 12"/>'),
  more: si('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  eye: si('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  save: si('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  book: si('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  layers: si('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  clock: si('<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>'),
  target: si('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  play: si('<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/>'),
  grid: si('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  list: si('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  sparkle: si('<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>'),
  trending: si('<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  flag: si('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'),
  import: si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  export: si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
};

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */
type StatusFilter = "all" | "draft" | "published" | "archived";
type ViewMode = "cards" | "table";
type SortKey = "title" | "questions" | "marks" | "duration" | "created";

const statusColors: Record<string, string> = {
  draft: "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800/30 dark:text-amber-400",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/30 dark:text-emerald-400",
  archived: "border-slate-200 bg-slate-50 text-slate-500 dark:bg-slate-950/20 dark:border-slate-800/30 dark:text-slate-400",
};

/* ══════════════════════════════════════════════════════════
   KPI Pill
   ══════════════════════════════════════════════════════════ */
function Kpi({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="min-w-0"><div className="text-lg font-bold tabular-nums tracking-tight">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Slide-over Drawer
   ══════════════════════════════════════════════════════════ */
function SlideOver({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[560px] bg-card border-l shadow-2xl transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><span dangerouslySetInnerHTML={{ __html: I.xmark }} /></button>
        </div>
        <div className="overflow-y-auto p-6 h-[calc(100%-65px)]">{children}</div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */

const emptyForm = { title: "", description: "", instructions: "", exam_mode: "mock", duration_minutes: "30", default_marks: "2", default_negative_marks: "0.5", strict_sections: false, section_title: "General" };

export function AdminExamsPage() {
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [sections, setSections] = useState<string[]>(["General"]);

  /* ── Data ────────────────────────────── */
  const { data, isLoading } = useQuery({ queryKey: ["admin-exams"], queryFn: () => examsApi.listAll("parent_id=null") });
  const items: Exam[] = useMemo(() => data || [], [data]);

  /* ── Stats ───────────────────────────── */
  const stats = useMemo(() => ({
    total: items.length,
    published: items.filter(e => e.status === "published").length,
    draft: items.filter(e => e.status === "draft").length,
    questions: items.reduce((s, e) => s + (e.total_questions || 0), 0),
  }), [items]);

  /* ── Filtered & sorted ──────────────── */
  const processed = useMemo(() => {
    let arr = [...items];
    if (search.trim()) { const q = search.toLowerCase(); arr = arr.filter(e => e.title.toLowerCase().includes(q)); }
    if (statusFilter !== "all") arr = arr.filter(e => e.status === statusFilter);
    arr.sort((a, b) => {
      switch (sortKey) {
        case "title": return a.title.localeCompare(b.title);
        case "questions": return (b.total_questions || 0) - (a.total_questions || 0);
        case "marks": return (b.total_marks || 0) - (a.total_marks || 0);
        case "duration": return (b.duration_seconds || 0) - (a.duration_seconds || 0);
        default: return (b.id || 0) - (a.id || 0);
      }
    });
    return arr;
  }, [items, search, statusFilter, sortKey]);

  /* ── Mutations ───────────────────────── */
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title, description: form.description, instructions: form.instructions,
        exam_mode: form.exam_mode, duration_seconds: Math.max(1, Number(form.duration_minutes) || 30) * 60,
        default_marks: Number(form.default_marks) || 2, default_negative_marks: Number(form.default_negative_marks) || 0.5,
        strict_sections: form.strict_sections, status: "published",
        sections: sections.map((s, i) => ({ title: s, order_index: i })),
      };
      if (editing) return examsApi.update(editing.id, payload);
      return examsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-exams"] }); setDrawerOpen(false); setEditing(null);
      setForm(emptyForm); setSections(["General"]);
    },
    onError: (e: any) => setError(e.message || "Save failed"),
  });
  const publishMut = useMutation({ mutationFn: (id: number) => examsApi.publish(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-exams"] }) });
  const unpublishMut = useMutation({ mutationFn: (id: number) => examsApi.unpublish(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-exams"] }) });
  const delMut = useMutation({ mutationFn: (id: number) => examsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-exams"] }) });
  const duplicate = useCallback(async (e: Exam) => { try { await examsApi.create({ ...e, title: `${e.title} (Copy)`, status: "draft", sections: (e.sections || []).map(s => ({ title: s.title, order_index: s.order_index })) } as any); qc.invalidateQueries({ queryKey: ["admin-exams"] }); } catch {} }, [qc]);

  const toggleSelect = (id: number) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkPublish = () => { selectedIds.forEach(id => { const e = items.find(i => i.id === id); if (e && e.status === "draft") publishMut.mutate(id); }); setSelectedIds(new Set()); };
  const bulkDelete = () => { if (!window.confirm(`Delete ${selectedIds.size} exams?`)) return; selectedIds.forEach(id => delMut.mutate(id)); setSelectedIds(new Set()); };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setSections(["General"]); setError(""); setDrawerOpen(true); };
  const openEdit = (e: Exam) => { setEditing(e); setForm({ title: e.title, description: e.description || "", instructions: e.instructions || "", exam_mode: e.exam_mode, duration_minutes: String(Math.floor((e.duration_seconds || 3600) / 60)), default_marks: String(e.default_marks || 2), default_negative_marks: String(e.default_negative_marks || 0.5), strict_sections: e.strict_sections, section_title: "" }); setSections((e.sections || []).map(s => s.title) || ["General"]); setError(""); setDrawerOpen(true); };

  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); } if ((e.metaKey || e.ctrlKey) && e.key === "n") { e.preventDefault(); openCreate(); } }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, []);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in">
        <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">{[1,2,3,4].map(i=><div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i=><div key={i} className="h-44 bg-muted rounded-2xl animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5 animate-in fade-in duration-300">

      {/* ═══════ HEADER ═══════════════════ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Exam Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Create, organize and publish examinations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex"><span dangerouslySetInnerHTML={{ __html: I.import.replace("w-5 h-5","w-3.5 h-3.5") }} />Import</Button>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex"><span dangerouslySetInnerHTML={{ __html: I.export.replace("w-5 h-5","w-3.5 h-3.5") }} />Export</Button>
          <Button onClick={openCreate} size="sm" className="rounded-xl gap-1.5 h-9">
            <span dangerouslySetInnerHTML={{ __html: I.plus.replace("w-5 h-5","w-4 h-4") }} />Create Exam
            <kbd className="hidden lg:inline-flex ml-1.5 rounded-md border border-primary-foreground/30 px-1 py-0 text-[9px]">⌘N</kbd>
          </Button>
        </div>
      </header>

      {/* ═══════ KPIs ══════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi icon={I.book} label="Total Exams" value={stats.total} />
        <Kpi icon={I.check} label="Published" value={stats.published} />
        <Kpi icon={I.flag} label="Draft" value={stats.draft} />
        <Kpi icon={I.target} label="Questions" value={stats.questions.toLocaleString()} />
      </div>

      {/* ═══════ TOOLBAR — sticky ══════════ */}
      <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" dangerouslySetInnerHTML={{ __html: I.search.replace("w-5 h-5","w-4 h-4") }} />
            <input ref={searchRef} type="text" placeholder="Search exams, sections, subjects…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-muted/30 pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all" />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/60">⌘K</kbd>
          </div>
          <div className="hidden sm:flex rounded-xl border bg-muted/30 p-0.5">
            {([{k:"cards" as const,i:I.grid},{k:"table" as const,i:I.list}] as const).map(v=>(
              <button key={v.k} onClick={()=>setViewMode(v.k)} className={`p-1.5 rounded-lg transition-colors ${viewMode===v.k?"bg-card text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`} dangerouslySetInnerHTML={{ __html: v.i.replace("w-5 h-5","w-4 h-4") }} title={v.k}/>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 justify-between">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none items-center">
            {(["all","draft","published","archived"] as StatusFilter[]).map(f=>(
              <button key={f} onClick={()=>setStatusFilter(f)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize transition-all duration-150 ${statusFilter===f?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>{f}</button>
            ))}
            <span className="w-px bg-border h-5 mx-1"/>
            <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)} className="shrink-0 appearance-none rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer transition-colors">
              <option value="created">Newest</option><option value="title">A-Z</option><option value="questions">Most Q</option><option value="marks">Most Marks</option><option value="duration">Longest</option>
            </select>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in-fast shrink-0">
              <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={bulkPublish} className="rounded-lg h-7 text-[11px]">Publish</Button>
              <Button variant="destructive" size="sm" onClick={bulkDelete} className="rounded-lg h-7 text-[11px] gap-1"><span dangerouslySetInnerHTML={{ __html: I.trash.replace("w-5 h-5","w-3 h-3") }} />Delete</Button>
              <button onClick={()=>setSelectedIds(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ CONTENT ═════════════════════ */}
      {processed.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center space-y-5 animate-in fade-in">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center"><span dangerouslySetInnerHTML={{ __html: I.book.replace("w-5 h-5","w-10 h-10 text-muted-foreground/30") }} /></div>
          <div className="space-y-2 max-w-xs"><h3 className="text-lg font-bold">No exams created</h3><p className="text-sm text-muted-foreground">{search||statusFilter!=="all"?"No exams match your filters.":"Create your first examination."}</p></div>
          {(search||statusFilter!=="all")?<button onClick={()=>{setSearch("");setStatusFilter("all");}} className="text-xs text-primary hover:underline">Clear filters</button>:<Button onClick={openCreate} className="rounded-xl gap-2"><span dangerouslySetInnerHTML={{ __html: I.plus.replace("w-5 h-5","w-4 h-4") }} />Create Exam</Button>}
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {processed.map(e => {
            const selected = selectedIds.has(e.id);
            const expanded = expandedCard === e.id;
            const pct = e.total_questions > 0 && e.status === "published" ? "Ready" : e.status === "draft" ? `${e.total_questions || 0} Q` : "";
            return (
              <div key={e.id} onClick={() => setExpandedCard(expanded ? null : (e.id ?? null))}
                className={`relative rounded-2xl border p-4 transition-all duration-200 cursor-pointer group ${selected?"ring-2 ring-primary/30 bg-primary/5":"bg-card hover:shadow-md hover:-translate-y-0.5"}`}>
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <button onClick={e2 => { e2.stopPropagation(); toggleSelect(e.id); }} className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected?"bg-primary border-primary":"border-muted-foreground/30 hover:border-primary/50"}`}>
                    {selected && <span dangerouslySetInnerHTML={{ __html: I.check.replace("w-5 h-5","w-3 h-3 text-primary-foreground") }} />}
                  </button>
                  <Badge className={`text-[10px] capitalize px-2 py-0.5 ${statusColors[e.status] || ""}`}>{e.status}</Badge>
                </div>
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-bold leading-snug line-clamp-2">{e.title}</h3>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{e.description || "No description"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-muted-foreground">
                  {e.duration_seconds > 0 && <span className="flex items-center gap-0.5"><span dangerouslySetInnerHTML={{ __html: I.clock.replace("w-5 h-5","w-3 h-3") }} />{formatDuration(e.duration_seconds)}</span>}
                  <span>{e.total_questions || 0} Q</span>
                  <span>{e.total_marks || 0} M</span>
                  <span>{(e.sections || []).length} sections</span>
                </div>
                {expanded && (
                  <div className="animate-slide-down border-t mt-3 pt-3 space-y-2">
                    <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Mode</span><span className="font-medium capitalize">{e.exam_mode}</span></div>
                    <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Marks/Q</span><span className="font-medium">+{e.default_marks} / -{e.default_negative_marks}</span></div>
                    <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Sections</span><span className="font-medium">{(e.sections||[]).map(s=>s.title).join(", ") || "—"}</span></div>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                  {e.status === "draft" ? (
                    <Button size="sm" variant="secondary" onClick={e2=>{e2.stopPropagation();publishMut.mutate(e.id);}} className="rounded-lg h-7 text-[10px] px-2">Publish</Button>
                  ) : e.status === "published" ? (
                    <Button size="sm" variant="outline" onClick={e2=>{e2.stopPropagation();unpublishMut.mutate(e.id);}} className="rounded-lg h-7 text-[10px] px-2">Unpublish</Button>
                  ) : null}
                  <button onClick={e2=>{e2.stopPropagation();openEdit(e);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Edit"><span dangerouslySetInnerHTML={{ __html: I.edit.replace("w-5 h-5","w-3.5 h-3.5") }} /></button>
                  <button onClick={e2=>{e2.stopPropagation();duplicate(e);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Duplicate"><span dangerouslySetInnerHTML={{ __html: I.copy.replace("w-5 h-5","w-3.5 h-3.5") }} /></button>
                  <button onClick={e2=>{e2.stopPropagation();window.open(`/admin/exams/assign/${e.id}`, "_self");}} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Assign Questions"><span dangerouslySetInnerHTML={{ __html: I.layers.replace("w-5 h-5","w-3.5 h-3.5") }} /></button>
                  <button onClick={e2=>{e2.stopPropagation();if(window.confirm(`Delete "${e.title}"?`))delMut.mutate(e.id);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" title="Delete"><span dangerouslySetInnerHTML={{ __html: I.trash.replace("w-5 h-5","w-3.5 h-3.5") }} /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-muted/20 text-left">
                <th className="px-4 py-3"><input type="checkbox" className="rounded" onChange={e=>setSelectedIds(e.target.checked?new Set(processed.map(e2=>e2.id)):new Set())} checked={selectedIds.size>0&&selectedIds.size===processed.length}/></th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Exam</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Mode</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Q</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Time</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 w-12"></th>
              </tr></thead>
              <tbody>{processed.map(e => { const selected = selectedIds.has(e.id); return (
                <tr key={e.id} className="border-t hover:bg-muted/20 transition-colors group cursor-pointer" onClick={()=>setExpandedCard(expandedCard===e.id?null:(e.id??null))}>
                  <td className="px-4 py-3" onClick={e2=>e2.stopPropagation()}><button onClick={()=>toggleSelect(e.id)} className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected?"bg-primary border-primary":"border-muted-foreground/30 hover:border-primary/50"}`}>{selected&&<span dangerouslySetInnerHTML={{__html:I.check.replace("w-5 h-5","w-3 h-3 text-primary-foreground")}}/>}</button></td>
                  <td className="px-4 py-3"><div className="min-w-0"><p className="text-sm font-semibold truncate max-w-[200px]">{e.title}</p><p className="text-[10px] text-muted-foreground truncate max-w-[200px] hidden sm:block">{e.description||""}</p></div></td>
                  <td className="px-4 py-3 hidden md:table-cell"><Badge variant="secondary" className="text-[10px] capitalize">{e.exam_mode}</Badge></td>
                  <td className="px-4 py-3 tabular-nums text-sm font-medium">{e.total_questions||0}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{e.duration_seconds>0?formatDuration(e.duration_seconds):"—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] capitalize ${statusColors[e.status]||""}`}>{e.status}</Badge></td>
                  <td className="px-4 py-3"><button onClick={e2=>{e2.stopPropagation();e.status==="draft"?publishMut.mutate(e.id):unpublishMut.mutate(e.id);}} className="text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">{e.status==="draft"?"Publish":"Unpublish"}</button></td>
                </tr>
              );})}</tbody>
            </table>
          </div>
          <div className="border-t bg-muted/10 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{processed.length} exams</span><span>{stats.questions.toLocaleString()} total questions</span></div>
        </div>
      )}

      {/* ═══════ DRAWER — Create/Edit ════════ */}
      <SlideOver title={editing ? "Edit Exam" : "Create Exam"} open={drawerOpen} onClose={()=>{setDrawerOpen(false);setError("");}}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Exam Title</Label>
            <Input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. SSC CGL Tier 1 — Full Mock 1" className="rounded-xl h-9 text-sm" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description / Syllabus</Label>
            <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={10}
              placeholder={"Yahan exam ka pura syllabus paste karo (jaisa hai waisa - line break, gaps, list sab chalega).\n\nExample:\nSSC CHSL\nReasoning: Analogy, Coding-Decoding, Series, Blood Relation\nMaths: Percentage, Profit & Loss, Time & Work\nEnglish: Synonym, Antonym, Idiom\nGA: History, Geography, Polity\n\nSystem in subjects/chapters ko khud padh ke, jinke questions file me hain, unke tests bana dega."}
              className="w-full rounded-xl border bg-card px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/10 whitespace-pre-wrap" />
            <p className="text-[10px] text-muted-foreground">Jaisa paste karoge waisa hi dikhega (formatting preserve hoti hai). System syllabus se subjects/chapters khud detect karega.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Instructions</Label>
            <textarea value={form.instructions} onChange={e=>setForm(p=>({...p,instructions:e.target.value}))} rows={3}
              className="w-full rounded-xl border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 resize-y" placeholder="Exam instructions for students…" />
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            <b>Note:</b> Mode aur Duration har test ke liye <b>khud set</b> ho jate hain — Topic test chhota (kam time), Full test bada (real paper jitna time). Agar file me PYQ hain to test apne aap <b>PYQ</b> mode me banega, warna Mock. Niche wale sirf default hain.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Default Mode</Label><select value={form.exam_mode} onChange={e=>setForm(p=>({...p,exam_mode:e.target.value}))} className="w-full rounded-xl border bg-card h-9 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer"><option value="mock">Mock (auto)</option><option value="practice">Practice</option><option value="sectional">Sectional</option><option value="pyq">PYQ</option><option value="live">Live</option></select></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Marks / Q</Label><Input value={form.default_marks} onChange={e=>setForm(p=>({...p,default_marks:e.target.value}))} type="number" step="0.5" min="0" className="rounded-xl h-9 text-sm text-center" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Negative</Label><Input value={form.default_negative_marks} onChange={e=>setForm(p=>({...p,default_negative_marks:e.target.value}))} type="number" step="0.25" min="0" className="rounded-xl h-9 text-sm text-center" /></div>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            Tests file bank se apne aap banenge (topic / chapter / subject / full).
            Manual sections ki zarurat nahi. Exam save karte hi, jinke questions file me
            hain unke tests andar aa jayenge, baaki "Coming Soon" dikhenge.
          </div>

          {error && <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={()=>saveMut.mutate()} disabled={!form.title.trim()||saveMut.isPending} className="rounded-xl gap-1.5 h-9 flex-1">
              <span dangerouslySetInnerHTML={{__html:I.save.replace("w-5 h-5","w-4 h-4")}}/>{saveMut.isPending?"Saving…":editing?"Update Exam":"Create Exam"}
            </Button>
          </div>
        </div>
      </SlideOver>

    </div>
  );
}
