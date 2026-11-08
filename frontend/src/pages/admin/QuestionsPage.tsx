import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { chaptersApi, questionsApi, subjectsApi, type Question, type Subject, type Chapter } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
  book: si('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  layers: si('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  check: si('<path d="M5 13l4 4L19 7"/>'),
  xmark: si('<path d="M6 18L18 6M6 6l12 12"/>'),
  more: si('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  target: si('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  eye: si('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  save: si('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  import: si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  export: si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  filter: si('<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>'),
  grid: si('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  list: si('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  clock: si('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  play: si('<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/>'),
  arrowLeft: si('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  arrowRight: si('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  chevronDown: si('<path d="M6 9l6 6 6-6"/>'),
  chevronUp: si('<path d="M18 15l-6-6-6 6"/>'),
  zap: si('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
  sparkle: si('<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>'),
};

/* ══════════════════════════════════════════════════════════
   Constants & Helpers
   ══════════════════════════════════════════════════════════ */
const QTYPES = ["single_choice","multiple_choice","integer","paragraph","image","math"];
const DIFFS = ["easy","medium","hard"];
const diffColors: Record<string, string> = { easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400", medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400", hard: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" };
const typeLabels: Record<string, string> = { single_choice:"MCQ", multiple_choice:"Multi", integer:"Integer", paragraph:"Para", image:"Image", math:"Math" };

function stripHtml(s: string): string { return s.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").trim(); }
function truncate(s: string, n = 120): string { return s.length > n ? s.slice(0, n) + "…" : s; }

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

type FormState = {
  question_text: string; question_html: string; question_type: string; difficulty: string;
  subject_id: string; chapter_id: string; correct_answer: string; explanation: string;
  paragraph_text: string; image_url: string; marks: string; negative_marks: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
};

const emptyForm = (): FormState => ({
  question_text: "", question_html: "", question_type: "single_choice", difficulty: "medium",
  subject_id: "", chapter_id: "", correct_answer: "A", explanation: "",
  paragraph_text: "", image_url: "", marks: "2", negative_marks: "0.5",
  option_a: "", option_b: "", option_c: "", option_d: "",
});

export function QuestionsPage() {
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Filters ─────────────────────────── */
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");

  /* ── Data ────────────────────────────── */
  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page)); p.set("per_page", "20");
    p.set("include_answer", "true"); p.set("active_only", "false");
    if (search) p.set("search", search);
    if (typeFilter !== "all") p.set("question_type", typeFilter);
    if (diffFilter !== "all") p.set("difficulty", diffFilter);
    if (subjectFilter !== "all") p.set("subject_id", subjectFilter);
    return p.toString();
  }, [page, search, typeFilter, diffFilter, subjectFilter]);

  const { data, isLoading } = useQuery({ queryKey: ["questions", params], queryFn: () => questionsApi.list(params) });
  const { data: subjectsData } = useQuery({ queryKey: ["subjects"], queryFn: () => subjectsApi.list() });
  const subjects: Subject[] = useMemo(() => subjectsData?.items || [], [subjectsData]);
  const { data: chaptersData } = useQuery({ queryKey: ["chapters-for", form.subject_id], queryFn: () => chaptersApi.list(`subject_id=${form.subject_id}`), enabled: !!form.subject_id });
  const chapters: Chapter[] = useMemo(() => chaptersData?.items || [], [chaptersData]);

  const items: Question[] = useMemo(() => data?.items || [], [data]);
  const total = data?.total || 0;
  const perPage = 20;
  const totalPages = Math.ceil(total / perPage);

  /* ── Stats ───────────────────────────── */
  const stats = useMemo(() => ({
    total, single: items.filter(q => q.question_type==="single_choice").length,
    multi: items.filter(q => q.question_type==="multiple_choice").length,
    para: items.filter(q => q.question_type==="paragraph").length,
  }), [items, total]);

  /* ── Mutations ───────────────────────── */
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        question_text: form.question_text, question_html: form.question_html || null,
        question_type: form.question_type, difficulty: form.difficulty,
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        chapter_id: form.chapter_id ? Number(form.chapter_id) : null,
        correct_answer: form.question_type === "multiple_choice" ? form.correct_answer.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean) : form.correct_answer.trim(),
        explanation: form.explanation, paragraph_text: form.paragraph_text || null,
        image_url: form.image_url || null, marks: Number(form.marks) || 1,
        negative_marks: Number(form.negative_marks) || 0,
        options: form.question_type==="integer" ? [] : [
          {option_key:"A",option_text:form.option_a},{option_key:"B",option_text:form.option_b},
          {option_key:"C",option_text:form.option_c},{option_key:"D",option_text:form.option_d},
        ].filter(o=>o.option_text.trim()),
      };
      if (editing) return questionsApi.update(editing.id, payload);
      return questionsApi.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({queryKey:["questions"]}); setDrawerOpen(false); setEditing(null); setForm(emptyForm()); },
    onError: (e: any) => setError(e.message || "Save failed"),
  });

  const delMut = useMutation({ mutationFn: (id: number) => questionsApi.remove(id), onSuccess: () => qc.invalidateQueries({queryKey:["questions"]}) });

  /* ── Actions ─────────────────────────── */
  const openCreate = useCallback(() => { setEditing(null); setForm(emptyForm()); setError(""); setDrawerOpen(true); }, []);
  const openEdit = useCallback((q: Question) => {
    setEditing(q);
    const opts = Object.fromEntries((q.options||[]).map(o=>[o.option_key, o.option_text]));
    setForm({
      question_text: q.question_text, question_html: q.question_html||"", question_type: q.question_type,
      difficulty: q.difficulty, subject_id: q.subject_id?String(q.subject_id):"",
      chapter_id: q.chapter_id?String(q.chapter_id):"",
      correct_answer: Array.isArray(q.correct_answer)?q.correct_answer.join(","):String(q.correct_answer??""),
      explanation: q.explanation||"", paragraph_text: q.paragraph_text||"", image_url: q.image_url||"",
      marks: String(q.marks), negative_marks: String(q.negative_marks),
      option_a: opts.A||"", option_b: opts.B||"", option_c: opts.C||"", option_d: opts.D||"",
    }); setError(""); setDrawerOpen(true);
  }, []);
  const duplicate = useCallback(async (q: Question) => {
    try {
      const opts = (q.options||[]).map(o=>({option_key:o.option_key,option_text:o.option_text}));
      await questionsApi.create({
        question_text: q.question_text+" (Copy)", question_type: q.question_type,
        difficulty: q.difficulty, subject_id: q.subject_id, chapter_id: q.chapter_id,
        correct_answer: q.correct_answer, explanation: q.explanation,
        marks: q.marks, negative_marks: q.negative_marks, options: opts,
      }); qc.invalidateQueries({queryKey:["questions"]});
    } catch {}
  }, [qc]);

  const toggleExpand = (id: number) => { setExpandedCards(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); };
  const toggleSelect = (id: number) => { setSelectedIds(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); };
  const bulkDelete = () => { if(selectedIds.size===0)return; if(!window.confirm(`Delete ${selectedIds.size} questions?`))return; selectedIds.forEach(id=>delMut.mutate(id)); setSelectedIds(new Set()); };

  /* ── Keyboard ────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();searchRef.current?.focus();} if((e.metaKey||e.ctrlKey)&&e.key==="n"){e.preventDefault();openCreate();} };
    document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h);
  }, [openCreate]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5 animate-in fade-in duration-300">

      {/* ═══════ HEADER ═══════════════════ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Question Bank</h1>
          <p className="text-sm text-muted-foreground mt-1">Create, manage and organize questions for all exams</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex"><span dangerouslySetInnerHTML={{__html:I.import.replace("w-5 h-5","w-3.5 h-3.5")}}/>Import</Button>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex"><span dangerouslySetInnerHTML={{__html:I.export.replace("w-5 h-5","w-3.5 h-3.5")}}/>Export</Button>
          <Button onClick={openCreate} size="sm" className="rounded-xl gap-1.5 h-9"><span dangerouslySetInnerHTML={{__html:I.plus.replace("w-5 h-5","w-4 h-4")}}/>Add Question<kbd className="hidden lg:inline-flex ml-1.5 rounded-md border border-primary-foreground/30 px-1 py-0 text-[9px]">⌘N</kbd></Button>
        </div>
      </header>

      {/* ═══════ KPIs ══════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi icon={I.book} label="Total Questions" value={total.toLocaleString()} />
        <Kpi icon={I.check} label="MCQ" value={stats.single} />
        <Kpi icon={I.grid} label="Multi-Select" value={stats.multi} />
        <Kpi icon={I.layers} label="Paragraph" value={stats.para} />
      </div>

      {/* ═══════ TOOLBAR — sticky ══════════ */}
      <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" dangerouslySetInnerHTML={{__html:I.search.replace("w-5 h-5","w-4 h-4")}}/>
            <input ref={searchRef} type="text" placeholder="Search question, keyword, option, explanation…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              className="w-full rounded-xl border bg-muted/30 pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all"/>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/60">⌘K</kbd>
          </div>
          <div className="hidden sm:flex rounded-xl border bg-muted/30 p-0.5">
            {([{k:"cards",i:I.grid},{k:"compact",i:I.list}] as const).map(v=>(
              <button key={v.k} onClick={()=>setViewMode(v.k)} className={`p-1.5 rounded-lg transition-colors ${viewMode===v.k?"bg-card text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}
                dangerouslySetInnerHTML={{__html:v.i.replace("w-5 h-5","w-4 h-4")}} title={v.k}/>
            ))}
          </div>
        </div>
        {/* Filter chips */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none items-center">
            {/* Type filter */}
            <button onClick={()=>{setTypeFilter("all");setPage(1);}} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${typeFilter==="all"?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>All Types</button>
            {QTYPES.slice(0,4).map(t=>(
              <button key={t} onClick={()=>{setTypeFilter(t);setPage(1);}} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${typeFilter===t?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>{typeLabels[t]||t}</button>
            ))}
            <span className="w-px bg-border h-5 mx-1"/>
            {/* Difficulty filter */}
            <button onClick={()=>{setDiffFilter("all");setPage(1);}} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${diffFilter==="all"?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>All Difficulty</button>
            {DIFFS.map(d=>(
              <button key={d} onClick={()=>{setDiffFilter(d);setPage(1);}} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize transition-all duration-150 ${diffFilter===d?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>{d}</button>
            ))}
            <span className="w-px bg-border h-5 mx-1"/>
            {/* Subject filter dropdown */}
            <select value={subjectFilter} onChange={e=>{setSubjectFilter(e.target.value);setPage(1);}} className="shrink-0 appearance-none rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer transition-colors">
              <option value="all">All Subjects</option>
              {subjects.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in-fast shrink-0">
              <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="destructive" size="sm" onClick={bulkDelete} className="rounded-lg h-7 text-[11px] gap-1"><span dangerouslySetInnerHTML={{__html:I.trash.replace("w-5 h-5","w-3 h-3")}}/>Delete</Button>
              <button onClick={()=>setSelectedIds(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ RESULTS COUNT ═══════════════ */}
      {!isLoading && items.length > 0 && (
        <p className="text-[11px] text-muted-foreground -mt-2">Showing {items.length} of {total.toLocaleString()} questions · Page {page} of {totalPages}</p>
      )}

      {/* ═══════ CONTENT ═════════════════════ */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5,6].map(i=><div key={i} className="h-24 bg-muted rounded-2xl animate-pulse"/>)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center space-y-5 animate-in fade-in">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center"><span dangerouslySetInnerHTML={{__html:I.book.replace("w-5 h-5","w-10 h-10 text-muted-foreground/30")}}/></div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-lg font-bold">{search||typeFilter!=="all"||diffFilter!=="all"||subjectFilter!=="all"?"No questions found":"No questions yet"}</h3>
            <p className="text-sm text-muted-foreground">{search?"Try a different search term.":"Start building your question bank."}</p>
          </div>
          {(search||typeFilter!=="all"||diffFilter!=="all"||subjectFilter!=="all")?<button onClick={()=>{setSearch("");setTypeFilter("all");setDiffFilter("all");setSubjectFilter("all");}} className="text-xs text-primary hover:underline">Clear all filters</button>:<Button onClick={openCreate} className="rounded-xl gap-2"><span dangerouslySetInnerHTML={{__html:I.plus.replace("w-5 h-5","w-4 h-4")}}/>Create First Question</Button>}
        </div>
      ) : (
        <>
          <div className={viewMode==="cards"?"space-y-3":"space-y-1.5"}>
            {items.map(q=>{
              const expanded = expandedCards.has(q.id);
              const selected = selectedIds.has(q.id);
              const txt = stripHtml(q.question_text);
              const ans = Array.isArray(q.correct_answer)?q.correct_answer.join(", "):q.correct_answer;
              return (
                <div key={q.id}
                  className={`rounded-2xl border transition-all duration-200 group ${selected?"ring-2 ring-primary/30 bg-primary/5":viewMode==="cards"?"bg-card hover:shadow-md hover:-translate-y-0.5":"bg-card hover:bg-muted/10"}`}>
                  <div className={viewMode==="cards"?"p-4":"px-4 py-2.5 flex items-center gap-3"}>
                    {/* Checkbox */}
                    <button onClick={(e)=>{e.stopPropagation();toggleSelect(q.id);}} className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected?"bg-primary border-primary":"border-muted-foreground/30 hover:border-primary/50"}`}>
                      {selected && <span dangerouslySetInnerHTML={{__html:I.check.replace("w-5 h-5","w-3 h-3 text-primary-foreground")}}/>}
                    </button>
                    {/* ID + badges */}
                    <div className="flex items-center gap-2 shrink-0 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">#{q.id}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5">{typeLabels[q.question_type]||q.question_type}</Badge>
                      <Badge className={`text-[9px] px-1.5 ${diffColors[q.difficulty]||""}`}>{q.difficulty}</Badge>
                      {q.subject_name && <Badge variant="outline" className="text-[9px] px-1.5 truncate max-w-[100px]">{q.subject_name}</Badge>}
                    </div>
                    {/* Text preview */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>toggleExpand(q.id)}>
                      <p className="text-sm truncate">{truncate(txt, viewMode==="compact"?80:120)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {q.marks>0&&`+${q.marks} `}{q.negative_marks>0&&`/ -${q.negative_marks} `}· Ans: {ans}
                        {q.chapter_name&&` · ${q.chapter_name}`}
                      </p>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e)=>{e.stopPropagation();openEdit(q);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Edit"><span dangerouslySetInnerHTML={{__html:I.edit.replace("w-5 h-5","w-3.5 h-3.5")}}/></button>
                      <button onClick={(e)=>{e.stopPropagation();duplicate(q);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Duplicate"><span dangerouslySetInnerHTML={{__html:I.copy.replace("w-5 h-5","w-3.5 h-3.5")}}/></button>
                      <button onClick={(e)=>{e.stopPropagation();if(window.confirm(`Delete #${q.id}?`))delMut.mutate(q.id);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" title="Delete"><span dangerouslySetInnerHTML={{__html:I.trash.replace("w-5 h-5","w-3.5 h-3.5")}}/></button>
                      <button onClick={(e)=>{e.stopPropagation();toggleExpand(q.id);}} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={expanded?"Collapse":"Expand"}>
                        <span dangerouslySetInnerHTML={{__html:(expanded?I.chevronUp:I.chevronDown).replace("w-5 h-5","w-3.5 h-3.5")}}/>
                      </button>
                    </div>
                  </div>
                  {/* Expanded content */}
                  {expanded && viewMode==="cards" && (
                    <div className="animate-slide-down border-t px-4 py-3 space-y-3 text-sm">
                      {q.question_text && <div className="bg-muted/30 rounded-xl p-3 leading-relaxed" dangerouslySetInnerHTML={{__html:q.question_text}}/>}
                      {q.options.length>0 && (
                        <div className="grid sm:grid-cols-2 gap-1.5">
                          {q.options.filter(o=>o.option_text).map(o=>(<div key={o.option_key} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] ${String(ans).includes(o.option_key)?"bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-semibold":"bg-muted/20"}`}><span className="font-mono font-bold shrink-0">{o.option_key}.</span><span>{o.option_text}</span></div>))}
                        </div>
                      )}
                      {q.explanation && <div className="text-[12px] text-muted-foreground bg-muted/20 rounded-xl p-3 leading-relaxed"><span className="font-semibold text-foreground">Explanation: </span>{q.explanation}</div>}
                      <Button size="sm" variant="outline" onClick={()=>openEdit(q)} className="rounded-lg h-7 text-[11px] gap-1"><span dangerouslySetInnerHTML={{__html:I.edit.replace("w-5 h-5","w-3 h-3")}}/>Edit Question</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-lg h-8 text-xs gap-1"><span dangerouslySetInnerHTML={{__html:I.arrowLeft.replace("w-5 h-5","w-3 h-3")}}/>Previous</Button>
              <span className="text-xs text-muted-foreground tabular-nums">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-lg h-8 text-xs gap-1">Next<span dangerouslySetInnerHTML={{__html:I.arrowRight.replace("w-5 h-5","w-3 h-3")}}/></Button>
            </div>
          )}
        </>
      )}

      {/* ═══════ DRAWER ═══════════════════════ */}
      <SlideOver title={editing ? "Edit Question" : "New Question"} open={drawerOpen} onClose={()=>{setDrawerOpen(false);setError("");}}>
        <div className="space-y-4">
          {/* Subject + Chapter */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Subject</Label>
              <select value={form.subject_id} onChange={e=>setForm(p=>({...p,subject_id:e.target.value,chapter_id:""}))} className="w-full rounded-xl border bg-card h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer">
                <option value="" disabled>Select subject…</option>
                {subjects.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Chapter</Label>
              <select value={form.chapter_id} onChange={e=>setForm(p=>({...p,chapter_id:e.target.value}))} className="w-full rounded-xl border bg-card h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer">
                <option value="">None</option>
                {chapters.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {/* Question text */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Question Text</Label>
            <textarea value={form.question_text} onChange={e=>setForm(p=>({...p,question_text:e.target.value}))}
              rows={3} className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 resize-y" placeholder="Enter your question…"/>
          </div>
          {/* Type + Difficulty + Marks */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Type</Label>
              <select value={form.question_type} onChange={e=>setForm(p=>({...p,question_type:e.target.value}))} className="w-full rounded-xl border bg-card h-9 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer">
                {QTYPES.map(t=><option key={t} value={t}>{typeLabels[t]||t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Difficulty</Label>
              <select value={form.difficulty} onChange={e=>setForm(p=>({...p,difficulty:e.target.value}))} className="w-full rounded-xl border bg-card h-9 px-2 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer">
                {DIFFS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Marks</Label>
              <Input value={form.marks} onChange={e=>setForm(p=>({...p,marks:e.target.value}))} className="rounded-xl h-9 text-sm text-center" type="number" step="0.5" min="0"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Negative</Label>
              <Input value={form.negative_marks} onChange={e=>setForm(p=>({...p,negative_marks:e.target.value}))} className="rounded-xl h-9 text-sm text-center" type="number" step="0.25" min="0"/>
            </div>
          </div>
          {/* Options */}
          {form.question_type !== "integer" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Options</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {(["A","B","C","D"] as const).map(k=>(
                  <div key={k} className="flex items-center gap-2">
                    <span className="shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-bold font-mono">{k}</span>
                    <Input value={form[`option_${k.toLowerCase()}` as keyof FormState] as string}
                      onChange={e=>setForm(p=>({...p,[`option_${k.toLowerCase()}`]:e.target.value}))}
                      placeholder={`Option ${k}`} className="rounded-xl h-9 text-sm flex-1"/>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Correct answer + Explanation */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{form.question_type==="multiple_choice"?"Correct (comma-separated)":"Correct Answer"}</Label>
              <Input value={form.correct_answer} onChange={e=>setForm(p=>({...p,correct_answer:e.target.value}))} placeholder={form.question_type==="multiple_choice"?"A,C,D":"A"} className="rounded-xl h-9 text-sm font-mono"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Explanation</Label>
              <Input value={form.explanation} onChange={e=>setForm(p=>({...p,explanation:e.target.value}))} placeholder="Why this answer is correct…" className="rounded-xl h-9 text-sm"/>
            </div>
          </div>
          {error && <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={()=>saveMut.mutate()} disabled={!form.question_text.trim()||saveMut.isPending} className="rounded-xl gap-1.5 h-9 flex-1">
              <span dangerouslySetInnerHTML={{__html:I.save.replace("w-5 h-5","w-4 h-4")}}/>{saveMut.isPending?"Saving…":editing?"Update Question":"Create Question"}
            </Button>
            {!editing && <Button variant="outline" onClick={()=>{saveMut.mutate();}} disabled={!form.question_text.trim()||saveMut.isPending} className="rounded-xl gap-1.5 h-9">Save & Add Another</Button>}
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
