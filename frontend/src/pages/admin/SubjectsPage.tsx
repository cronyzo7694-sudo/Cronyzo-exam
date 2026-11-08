import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { subjectsApi, type Subject } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/* ══════════════════════════════════════════════════════════
   Inline SVG icons
   ══════════════════════════════════════════════════════════ */

const si = (d: string) =>
  `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${d}</svg>`;

const I = {
  search:   si('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  plus:     si('<path d="M12 5v14M5 12h14"/>'),
  edit:     si('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  trash:    si('<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
  copy:     si('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'),
  archive:  si('<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>'),
  book:     si('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  layers:   si('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  check:    si('<path d="M5 13l4 4L19 7"/>'),
  xmark:    si('<path d="M6 18L18 6M6 6l12 12"/>'),
  arrowUp:  si('<path d="M19 9l-7 7-7-7"/>'),
  arrowDown:si('<path d="M19 15l-7-7-7 7"/>'),
  more:     si('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  menu:     si('<path d="M3 12h18M3 6h18M3 18h18"/>'),
  filter:   si('<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>'),
  sortAsc:  si('<path d="M11 5h10M11 9h7M11 13h4"/><path d="M3 4l3 3 3-3"/>'),
  grid:     si('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  list:     si('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  eye:      si('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  save:     si('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  target:   si('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  clock:    si('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  import:   si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  export:   si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
};

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

type SortKey = "name" | "chapters" | "questions" | "updated" | "created";
type SortDir = "asc" | "desc";

const subjectColors: Record<string, string> = {
  "General Intelligence & Reasoning": "#7c3aed",
  "General Awareness": "#ea580c",
  "Quantitative Aptitude": "#2563eb",
  "English Language": "#059669",
  "English Comprehension": "#059669",
  "Mathematics": "#2563eb",
  "Numerical Ability": "#2563eb",
  "General Science": "#0d9488",
  "Reasoning Ability": "#7c3aed",
  "Elementary Mathematics": "#2563eb",
  "Environmental Studies": "#0d9488",
  "Child Development & Pedagogy": "#dc2626",
};

function subColor(name: string): string {
  return subjectColors[name] || "#6b7280";
}

function sortChevron(key: SortKey, current: SortKey, dir: SortDir) {
  if (key !== current) return "";
  return `<span class="ml-1 inline-block text-[10px]">${dir === "asc" ? "▲" : "▼"}</span>`;
}

/* ══════════════════════════════════════════════════════════
   KPI Pill
   ══════════════════════════════════════════════════════════ */

function Kpi({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="min-w-0">
        <div className="text-lg font-bold tabular-nums tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   EditableRow — inline table row with edit mode
   ══════════════════════════════════════════════════════════ */

function EditableRow({
  subject,
  onSave,
  onDelete,
  onDuplicate,
}: {
  subject: Subject;
  onSave: (s: Subject, data: { name: string; code: string; description: string }) => Promise<void>;
  onDelete: (s: Subject) => void;
  onDuplicate: (s: Subject) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [code, setCode] = useState(subject.code || "");
  const [description, setDescription] = useState(subject.description || "");
  const [saving, setSaving] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextOpen(false);
    };
    if (contextOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextOpen]);

  const color = subject.color || subColor(subject.name);

  if (editing) {
    return (
      <tr className="bg-primary/5">
        <td className="px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm rounded-lg" autoFocus />
          </div>
        </td>
        <td className="px-4 py-2"><Input value={code} onChange={e => setCode(e.target.value)} className="h-8 text-sm rounded-lg" placeholder="e.g. REASON" /></td>
        <td className="px-4 py-2 hidden md:table-cell"><Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 text-sm rounded-lg" placeholder="Short description" /></td>
        <td className="px-4 py-2 tabular-nums text-sm text-muted-foreground">{subject.chapter_count ?? 0}</td>
        <td className="px-4 py-2 tabular-nums text-sm text-muted-foreground">{subject.question_count ?? 0}</td>
        <td className="px-4 py-2 hidden lg:table-cell"><Badge variant={subject.is_active ? "secondary" : "outline"} className="text-[10px]">{subject.is_active ? "Active" : "Draft"}</Badge></td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1">
            <button onClick={async () => { setSaving(true); await onSave(subject, { name, code, description }); setSaving(false); setEditing(false); }}
              disabled={!name.trim() || saving}
              className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity" title="Save">
              <span dangerouslySetInnerHTML={{ __html: I.check.replace("w-5 h-5","w-3.5 h-3.5") }} />
            </button>
            <button onClick={() => { setName(subject.name); setCode(subject.code||""); setDescription(subject.description||""); setEditing(false); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Cancel">
              <span dangerouslySetInnerHTML={{ __html: I.xmark.replace("w-5 h-5","w-3.5 h-3.5") }} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t hover:bg-muted/20 transition-colors group cursor-pointer" onDoubleClick={() => setEditing(true)}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{subject.name}</p>
            {subject.description && (
              <p className="text-[10px] text-muted-foreground truncate max-w-[220px] hidden sm:block">{subject.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground tabular-nums">{subject.code || "—"}</td>
      <td className="px-4 py-3 text-[11px] text-muted-foreground truncate max-w-[180px] hidden md:table-cell">{subject.description || "—"}</td>
      <td className="px-4 py-3 tabular-nums text-sm font-medium">{subject.chapter_count ?? 0}</td>
      <td className="px-4 py-3 tabular-nums text-sm font-medium">{subject.question_count ?? 0}</td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <Badge variant={subject.is_active ? "secondary" : "outline"} className="text-[10px]">
          {subject.is_active ? "Active" : "Draft"}
        </Badge>
      </td>
      <td className="px-4 py-3 relative">
        <button onClick={(e) => { e.stopPropagation(); setContextOpen(!contextOpen); }}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
          title="Actions">
          <span dangerouslySetInnerHTML={{ __html: I.more.replace("w-5 h-5","w-4 h-4") }} />
        </button>
        {contextOpen && (
          <div ref={menuRef}
            className="absolute right-0 top-full mt-1 z-50 w-48 rounded-2xl border bg-card shadow-xl animate-in-fast origin-top-right"
            onClick={(e) => e.stopPropagation()}>
            <div className="p-1.5 space-y-0.5">
              <button onClick={() => { setEditing(true); setContextOpen(false); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs hover:bg-muted transition-colors text-left">
                <span dangerouslySetInnerHTML={{ __html: I.edit.replace("w-5 h-5","w-3.5 h-3.5") }} /> Edit
              </button>
              <button onClick={() => { onDuplicate(subject); setContextOpen(false); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs hover:bg-muted transition-colors text-left">
                <span dangerouslySetInnerHTML={{ __html: I.copy.replace("w-5 h-5","w-3.5 h-3.5") }} /> Duplicate
              </button>
              <hr className="my-1" />
              <button onClick={() => { if (window.confirm(`Delete "${subject.name}"?`)) onDelete(subject); setContextOpen(false); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left">
                <span dangerouslySetInnerHTML={{ __html: I.trash.replace("w-5 h-5","w-3.5 h-3.5") }} /> Delete
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════
   Slide-over drawer
   ══════════════════════════════════════════════════════════ */

function SlideOver({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />}
      <div className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] bg-card border-l shadow-2xl transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <span dangerouslySetInnerHTML={{ __html: I.xmark.replace("w-5 h-5","w-5 h-5") }} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 h-[calc(100%-65px)]">{children}</div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */

const emptyForm = { name: "", code: "", description: "", color: "#2563eb", icon: "book" };

export function SubjectsPage() {
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "draft">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Subject | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => subjectsApi.list("active_only=false"),
  });

  const items: Subject[] = useMemo(() => data?.items || [], [data]);

  /* ── Stats ──────────────────────────── */
  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter(s => s.is_active).length,
    chapters: items.reduce((s, i) => s + (i.chapter_count || 0), 0),
    questions: items.reduce((s, i) => s + (i.question_count || 0), 0),
  }), [items]);

  /* ── Filtered & sorted ─────────────── */
  const processed = useMemo(() => {
    let arr = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
    }
    if (filter === "active") arr = arr.filter(s => s.is_active);
    if (filter === "draft") arr = arr.filter(s => !s.is_active);
    arr.sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "chapters": return (a.chapter_count || 0) - (b.chapter_count || 0);
          case "questions": return (a.question_count || 0) - (b.question_count || 0);
          default: return a.name.localeCompare(b.name);
        }
      })();
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [items, search, filter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  /* ── Mutations ──────────────────────── */
  const saveMut = useMutation({
    mutationFn: async (s: Subject | null) => {
      const payload = { name: form.name, code: form.code, description: form.description, color: form.color, icon: form.icon };
      if (s) return subjectsApi.update(s.id, payload);
      return subjectsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      setDrawerOpen(false);
      setSelected(null);
      setForm(emptyForm);
    },
    onError: (e: any) => setError(e.message || "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => subjectsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects"] }),
  });

  /* ── Keyboard shortcuts ─────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") { e.preventDefault(); openCreate(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  /* ── Actions ───────────────────────── */
  const openCreate = () => { setSelected(null); setForm(emptyForm); setError(""); setDrawerOpen(true); };
  const openEdit = (s: Subject) => {
    setSelected(s);
    setForm({ name: s.name, code: s.code || "", description: s.description || "", color: s.color || "#2563eb", icon: s.icon || "book" });
    setError("");
    setDrawerOpen(true);
  };
  const duplicate = useCallback(async (s: Subject) => {
    try {
      await subjectsApi.create({ name: `${s.name} (Copy)`, code: s.code ? `${s.code}_COPY` : "", description: s.description, color: s.color, icon: s.icon });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    } catch {}
  }, [qc]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} subjects?`)) return;
    selectedIds.forEach(id => delMut.mutate(id));
    setSelectedIds(new Set());
  };

  /* ── Loading ────────────────────────── */
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 animate-in fade-in duration-300 space-y-6">
        <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-96 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5 animate-in fade-in duration-300">

      {/* ═══════ HEADER ═══════════════════════════ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Subjects</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all exam subjects and their chapters</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex">
            <span dangerouslySetInnerHTML={{ __html: I.import.replace("w-5 h-5","w-3.5 h-3.5") }} />Import
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex">
            <span dangerouslySetInnerHTML={{ __html: I.export.replace("w-5 h-5","w-3.5 h-3.5") }} />Export
          </Button>
          <Button onClick={openCreate} size="sm" className="rounded-xl gap-1.5 h-9">
            <span dangerouslySetInnerHTML={{ __html: I.plus.replace("w-5 h-5","w-4 h-4") }} />Add Subject
            <kbd className="hidden lg:inline-flex ml-1.5 rounded-md border border-primary-foreground/30 px-1 py-0 text-[9px]">⌘N</kbd>
          </Button>
        </div>
      </header>

      {/* ═══════ KPIs ═════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi icon={I.layers} label="Total Subjects" value={stats.total} />
        <Kpi icon={I.check} label="Active" value={stats.active} />
        <Kpi icon={I.book} label="Chapters" value={stats.chapters} />
        <Kpi icon={I.target} label="Questions" value={stats.questions.toLocaleString()} />
      </div>

      {/* ═══════ TOOLBAR — sticky ═══════════════ */}
      <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" dangerouslySetInnerHTML={{ __html: I.search.replace("w-5 h-5","w-4 h-4") }} />
            <input ref={searchRef} type="text" placeholder="Search subjects, codes or chapters…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-muted/30 pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all" />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/60">⌘K</kbd>
          </div>
        </div>

        {/* Filters + bulk actions */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {(["all","active","draft"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                  filter === f ? "bg-foreground text-background" : "border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
                {f === "all" ? "All" : f === "active" ? "Active" : "Draft"}
                {f !== "all" && <span className="ml-1 text-[10px] opacity-60">{items.filter(s => f === "active" ? s.is_active : !s.is_active).length}</span>}
              </button>
            ))}
          </div>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in-fast">
              <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="destructive" size="sm" onClick={bulkDelete} className="rounded-lg h-7 text-[11px] gap-1">
                <span dangerouslySetInnerHTML={{ __html: I.trash.replace("w-5 h-5","w-3 h-3") }} />Delete
              </Button>
              <button onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ TABLE ════════════════════════════ */}
      {processed.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center py-20 text-center space-y-5 animate-in fade-in">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
            <span dangerouslySetInnerHTML={{ __html: I.layers.replace("w-5 h-5","w-10 h-10 text-muted-foreground/30") }} />
          </div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-lg font-bold">No subjects yet</h3>
            <p className="text-sm text-muted-foreground">
              {search ? "No subjects match your search." : "Create your first subject to start building exams."}
            </p>
          </div>
          {search ? (
            <button onClick={() => setSearch("")} className="text-xs text-primary hover:underline">Clear search</button>
          ) : (
            <Button onClick={openCreate} className="rounded-xl gap-2">
              <span dangerouslySetInnerHTML={{ __html: I.plus.replace("w-5 h-5","w-4 h-4") }} />Create Subject
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/20 text-left">
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" onChange={e => setSelectedIds(e.target.checked ? new Set(processed.map(s => s.id)) : new Set())}
                        checked={selectedIds.size > 0 && selectedIds.size === processed.length} />
                      <button onClick={() => toggleSort("name")} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors flex items-center gap-1">
                        Name <span dangerouslySetInnerHTML={{ __html: sortChevron("name", sortKey, sortDir) }} />
                      </button>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Description</th>
                  <th className="px-4 py-3">
                    <button onClick={() => toggleSort("chapters")} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors flex items-center gap-1">
                      Chapters <span dangerouslySetInnerHTML={{ __html: sortChevron("chapters", sortKey, sortDir) }} />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button onClick={() => toggleSort("questions")} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors flex items-center gap-1">
                      Questions <span dangerouslySetInnerHTML={{ __html: sortChevron("questions", sortKey, sortDir) }} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Status</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {processed.map(s => (
                  <EditableRow
                    key={s.id}
                    subject={s}
                    onSave={async (subj, data) => {
                      await subjectsApi.update(subj.id, data);
                      qc.invalidateQueries({ queryKey: ["subjects"] });
                    }}
                    onDelete={s => { if (window.confirm(`Delete "${s.name}"? This removes all associated chapters and questions.`)) delMut.mutate(s.id); }}
                    onDuplicate={duplicate}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {/* Footer */}
          <div className="border-t bg-muted/10 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{processed.length} subjects</span>
            <span>{stats.questions.toLocaleString()} total questions</span>
          </div>
        </div>
      )}

      {/* ═══════ SLIDE-OVER DRAWER ══════════════ */}
      <SlideOver title={selected ? "Edit Subject" : "New Subject"} open={drawerOpen} onClose={() => { setDrawerOpen(false); setError(""); }}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Subject Name</Label>
            <Input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
              placeholder="e.g. General Intelligence & Reasoning" className="rounded-xl h-9 text-sm" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Code</Label>
            <Input value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))}
              placeholder="e.g. REASON, QUANT, GA" className="rounded-xl h-9 text-sm font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description</Label>
            <Input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
              placeholder="Brief description of this subject" className="rounded-xl h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Color</Label>
              <div className="flex gap-2">
                <input type="color" value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))}
                  className="w-9 h-9 rounded-xl border cursor-pointer" />
                <Input value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))}
                  className="rounded-xl h-9 text-sm font-mono flex-1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Icon</Label>
              <Input value={form.icon} onChange={e => setForm(p => ({...p, icon: e.target.value}))}
                placeholder="book" className="rounded-xl h-9 text-sm font-mono" />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-2xl border p-4 flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: form.color || "#2563eb" }} />
            <div>
              <p className="text-sm font-semibold">{form.name || "Subject Name"}</p>
              <p className="text-[10px] text-muted-foreground">{form.code || "CODE"} · {form.description || "Description"}</p>
            </div>
          </div>

          {error && <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => saveMut.mutate(selected)} disabled={!form.name.trim() || saveMut.isPending}
              className="rounded-xl gap-1.5 h-9 flex-1">
              <span dangerouslySetInnerHTML={{ __html: I.save.replace("w-5 h-5","w-4 h-4") }} />
              {saveMut.isPending ? "Saving…" : selected ? "Update Subject" : "Create Subject"}
            </Button>
            {!selected && (
              <Button variant="outline" onClick={() => { saveMut.mutate(null); }}
                disabled={!form.name.trim() || saveMut.isPending}
                className="rounded-xl gap-1.5 h-9">
                Save & Add Another
              </Button>
            )}
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
