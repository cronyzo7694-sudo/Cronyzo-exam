import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { adminApi, type User } from "@/lib/api";
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
  check: si('<path d="M5 13l4 4L19 7"/>'),
  xmark: si('<path d="M6 18L18 6M6 6l12 12"/>'),
  more: si('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  user: si('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  users: si('<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>'),
  target: si('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  clock: si('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  book: si('<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
  layers: si('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  mail: si('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  phone: si('<path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 018.63 18.93 19.5 19.5 0 012.63 12.93 19.79 19.79 0 01-.56 4.26 2 2 0 011.72-2.26h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>'),
  eye: si('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  save: si('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  import: si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  export: si('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  filter: si('<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>'),
  grid: si('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  list: si('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  shield: si('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  alert: si('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'),
  activity: si('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
};

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */
function avatarColor(name: string): string {
  const c = ["bg-blue-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-teal-500"];
  let h = 0; for (let i = 0; i < (name || "U").length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return c[Math.abs(h) % c.length];
}
function initials(name: string): string { return (name || "U").charAt(0).toUpperCase(); }

type ViewMode = "table" | "cards";
type RoleFilter = "all" | "student" | "guest" | "admin";

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
      <div className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[520px] bg-card border-l shadow-2xl transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
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

export function UsersPage() {
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "student" });
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  /* ── Data ────────────────────────────── */
  const { data, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => adminApi.users() });
  const items: User[] = useMemo(() => data?.items || [], [data]);

  /* ── Stats ───────────────────────────── */
  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter(u => u.is_active).length,
    students: items.filter(u => u.role === "student").length,
    admins: items.filter(u => u.role === "admin").length,
    guests: items.filter(u => u.role === "guest" || u.is_guest).length,
  }), [items]);

  /* ── Filtered & sorted ──────────────── */
  const processed = useMemo(() => {
    let arr = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(u => u.full_name.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.phone || "").includes(q) || String(u.id).includes(q));
    }
    if (roleFilter !== "all") arr = arr.filter(u => roleFilter === "guest" ? (u.role === "guest" || u.is_guest) : u.role === roleFilter);
    if (statusFilter === "active") arr = arr.filter(u => u.is_active);
    if (statusFilter === "inactive") arr = arr.filter(u => !u.is_active);
    arr.sort((a, b) => {
      if (sort === "name") return a.full_name.localeCompare(b.full_name);
      return (b.id || 0) - (a.id || 0);
    });
    return arr;
  }, [items, search, roleFilter, statusFilter, sort]);

  /* ── Mutations ────────────────────────── */
  const createMut = useMutation({
    mutationFn: () => adminApi.createUser(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setInviteOpen(false); setForm({ full_name: "", email: "", password: "", role: "student" }); },
    onError: (e: any) => setError(e.message || "Failed"),
  });
  const toggleMut = useMutation({ mutationFn: (u: User) => adminApi.updateUser(u.id, { is_active: !u.is_active } as any), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }) });
  const roleMut = useMutation({ mutationFn: ({ id, role }: { id: number; role: string }) => adminApi.updateUser(id, { role } as any), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }) });

  const toggleSelect = (id: number) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkSuspend = () => { if (selectedIds.size === 0) return; selectedIds.forEach(id => { const u = items.find(i => i.id === id); if (u && u.is_active) toggleMut.mutate(u); }); setSelectedIds(new Set()); };
  const bulkActivate = () => { if (selectedIds.size === 0) return; selectedIds.forEach(id => { const u = items.find(i => i.id === id); if (u && !u.is_active) toggleMut.mutate(u); }); setSelectedIds(new Set()); };

  /* ── Keyboard ────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h);
  }, []);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6 animate-in fade-in">
        <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">{[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}</div>
        <div className="h-96 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5 animate-in fade-in duration-300">

      {/* ═══════ HEADER ═══════════════════ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage students, admins and platform accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex"><span dangerouslySetInnerHTML={{ __html: I.import.replace("w-5 h-5","w-3.5 h-3.5") }} />Import</Button>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 hidden sm:inline-flex"><span dangerouslySetInnerHTML={{ __html: I.export.replace("w-5 h-5","w-3.5 h-3.5") }} />Export</Button>
          <Button onClick={() => { setForm({ full_name: "", email: "", password: "", role: "student" }); setError(""); setInviteOpen(true); }} size="sm" className="rounded-xl gap-1.5 h-9">
            <span dangerouslySetInnerHTML={{ __html: I.plus.replace("w-5 h-5","w-4 h-4") }} />Add User
          </Button>
        </div>
      </header>

      {/* ═══════ KPIs ══════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <Kpi icon={I.users} label="Total Users" value={stats.total.toLocaleString()} />
        <Kpi icon={I.check} label="Active" value={stats.active} />
        <Kpi icon={I.user} label="Students" value={stats.students} />
        <Kpi icon={I.shield} label="Admins" value={stats.admins} />
        <Kpi icon={I.eye} label="Guests" value={stats.guests} />
      </div>

      {/* ═══════ TOOLBAR — sticky ══════════ */}
      <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" dangerouslySetInnerHTML={{ __html: I.search.replace("w-5 h-5","w-4 h-4") }} />
            <input ref={searchRef} type="text" placeholder="Search by name, email, phone or user ID…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-muted/30 pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all" />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/60">⌘K</kbd>
          </div>
          {/* View toggle */}
          <div className="hidden sm:flex rounded-xl border bg-muted/30 p-0.5">
            {([{k:"table" as const,i:I.list},{k:"cards" as const,i:I.grid}] as const).map(v => (
              <button key={v.k} onClick={() => setViewMode(v.k)} className={`p-1.5 rounded-lg transition-colors ${viewMode===v.k?"bg-card text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`} dangerouslySetInnerHTML={{ __html: v.i.replace("w-5 h-5","w-4 h-4") }} title={v.k} />
            ))}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {/* Role filter */}
            <span className="text-[10px] text-muted-foreground self-center mr-1">Role:</span>
            {([
              { k: "all" as const, l: "All" }, { k: "student" as const, l: "Students" },
              { k: "admin" as const, l: "Admins" }, { k: "guest" as const, l: "Guests" }
            ]).map(f => (
              <button key={f.k} onClick={() => setRoleFilter(f.k)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${roleFilter===f.k?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>{f.l}</button>
            ))}
            <span className="w-px bg-border h-5 mx-1" />
            {/* Status filter */}
            <span className="text-[10px] text-muted-foreground self-center mr-1">Status:</span>
            {(["all","active","inactive"] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize transition-all duration-150 ${statusFilter===f?"bg-foreground text-background":"border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>{f}</button>
            ))}
            {/* Sort */}
            <span className="w-px bg-border h-5 mx-1" />
            <select value={sort} onChange={e => setSort(e.target.value as any)} className="shrink-0 appearance-none rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer transition-colors">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">A-Z</option>
            </select>
          </div>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in-fast shrink-0">
              <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={bulkActivate} className="rounded-lg h-7 text-[11px]">Activate</Button>
              <Button variant="outline" size="sm" onClick={bulkSuspend} className="rounded-lg h-7 text-[11px]">Suspend</Button>
              <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ CONTENT ═════════════════════ */}
      {processed.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center space-y-5 animate-in fade-in">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center"><span dangerouslySetInnerHTML={{ __html: I.users.replace("w-5 h-5","w-10 h-10 text-muted-foreground/30") }} /></div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-lg font-bold">{search || roleFilter !== "all" || statusFilter !== "all" ? "No users found" : "No users yet"}</h3>
            <p className="text-sm text-muted-foreground">{search ? "Try a different search term." : "Invite your first student or admin."}</p>
          </div>
          {(search || roleFilter !== "all" || statusFilter !== "all") ? (
            <button onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }} className="text-xs text-primary hover:underline">Clear all filters</button>
          ) : (
            <Button onClick={() => { setForm({ full_name: "", email: "", password: "", role: "student" }); setError(""); setInviteOpen(true); }} className="rounded-xl gap-2">
              <span dangerouslySetInnerHTML={{ __html: I.plus.replace("w-5 h-5","w-4 h-4") }} />Invite User
            </Button>
          )}
        </div>
      ) : viewMode === "table" ? (
        /* ═══════ TABLE ═══════════════════════ */
        <div className="rounded-2xl border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/20 text-left">
                  <th className="px-4 py-3"><input type="checkbox" className="rounded" onChange={e => setSelectedIds(e.target.checked ? new Set(processed.map(u => u.id)) : new Set())} checked={selectedIds.size > 0 && selectedIds.size === processed.length} /></th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Status</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {processed.map(u => {
                  const selected = selectedIds.has(u.id);
                  return (
                    <tr key={u.id} onClick={() => { setSelectedUser(u); setDrawerOpen(true); }}
                      className="border-t hover:bg-muted/20 transition-colors cursor-pointer group">
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleSelect(u.id)} className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary/50"}`}>
                          {selected && <span dangerouslySetInnerHTML={{ __html: I.check.replace("w-5 h-5","w-3 h-3 text-primary-foreground") }} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`shrink-0 w-8 h-8 rounded-full ${avatarColor(u.full_name)} flex items-center justify-center text-white text-xs font-bold`}>{initials(u.full_name)}</div>
                          <div className="min-w-0"><p className="text-sm font-semibold truncate">{u.full_name}</p><p className="text-[10px] text-muted-foreground">ID: {u.id}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[180px] hidden sm:table-cell">{u.email || "—"}</td>
                      <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px] capitalize">{u.role}</Badge></td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] ${u.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />{u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 relative">
                        <button onClick={(e) => { e.stopPropagation(); toggleMut.mutate(u); }}
                          className="shrink-0 p-1.5 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all text-[10px] font-medium">
                          {u.is_active ? "Suspend" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-muted/10 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{processed.length} users</span>
            <span>{stats.active} active</span>
          </div>
        </div>
      ) : (
        /* ═══════ CARDS ═══════════════════════ */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {processed.map(u => {
            const selected = selectedIds.has(u.id);
            return (
              <div key={u.id} onClick={() => { setSelectedUser(u); setDrawerOpen(true); }}
                className={`relative rounded-2xl border p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${selected ? "ring-2 ring-primary/30 bg-primary/5" : "bg-card"}`}>
                <button onClick={e => { e.stopPropagation(); toggleSelect(u.id); }} className={`absolute top-3 right-3 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary/50"}`}>
                  {selected && <span dangerouslySetInnerHTML={{ __html: I.check.replace("w-5 h-5","w-3 h-3 text-primary-foreground") }} />}
                </button>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`shrink-0 w-10 h-10 rounded-full ${avatarColor(u.full_name)} flex items-center justify-center text-white text-sm font-bold`}>{initials(u.full_name)}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{u.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{u.email || "No email"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] capitalize">{u.role}</Badge>
                  <span className={`inline-flex items-center gap-1 text-[10px] ${u.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />{u.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">ID: {u.id}</span>
                  <button onClick={(e) => { e.stopPropagation(); toggleMut.mutate(u); }} className="text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">
                    {u.is_active ? "Suspend" : "Activate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ DRAWER — User Profile ══════════ */}
      <SlideOver title="User Profile" open={drawerOpen} onClose={() => { setDrawerOpen(false); setSelectedUser(null); }}>
        {selectedUser && (
          <div className="space-y-6">
            {/* Avatar + Identity */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className={`w-16 h-16 rounded-full ${avatarColor(selectedUser.full_name)} flex items-center justify-center text-white text-2xl font-bold ring-4 ring-background shadow-lg`}>{initials(selectedUser.full_name)}</div>
              <div>
                <h3 className="text-lg font-bold">{selectedUser.full_name}</h3>
                <p className="text-sm text-muted-foreground">{selectedUser.email || "No email"}</p>
                <div className="flex justify-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-[10px] capitalize">{selectedUser.role}</Badge>
                  <Badge variant={selectedUser.is_active ? "secondary" : "outline"} className="text-[10px]">{selectedUser.is_active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm py-1.5 border-b"><span className="text-muted-foreground">User ID</span><span className="font-medium tabular-nums">{selectedUser.id}</span></div>
              <div className="flex justify-between text-sm py-1.5 border-b"><span className="text-muted-foreground">Email</span><span className="font-medium">{selectedUser.email || "—"}</span></div>
              <div className="flex justify-between text-sm py-1.5 border-b"><span className="text-muted-foreground">Phone</span><span className="font-medium">{selectedUser.phone || "—"}</span></div>
              <div className="flex justify-between text-sm py-1.5 border-b"><span className="text-muted-foreground">Role</span><span className="font-medium capitalize">{selectedUser.role}</span></div>
              <div className="flex justify-between text-sm py-1.5 border-b"><span className="text-muted-foreground">Auth Provider</span><span className="font-medium">{selectedUser.auth_provider || "password"}</span></div>
              <div className="flex justify-between text-sm py-1.5"><span className="text-muted-foreground">Status</span><span className={`font-medium ${selectedUser.is_active ? "text-emerald-600" : "text-red-500"}`}>{selectedUser.is_active ? "Active" : "Inactive"}</span></div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-3 border-t">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => { roleMut.mutate({ id: selectedUser.id, role: selectedUser.role === "admin" ? "student" : "admin" }); }} className="rounded-lg h-8 text-[11px]">
                  {selectedUser.role === "admin" ? "Demote to Student" : "Promote to Admin"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleMut.mutate(selectedUser)} className="rounded-lg h-8 text-[11px]">
                  {selectedUser.is_active ? "Suspend User" : "Activate User"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* ═══════ INVITE DRAWER ════════════════ */}
      <SlideOver title="Add User" open={inviteOpen} onClose={() => { setInviteOpen(false); setError(""); }}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Full Name</Label><Input value={form.full_name} onChange={e => setForm(p => ({...p, full_name: e.target.value}))} placeholder="Student name" className="rounded-xl h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Email</Label><Input value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} type="email" placeholder="student@example.com" className="rounded-xl h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Password</Label><Input value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} type="password" placeholder="Min 6 characters" className="rounded-xl h-9 text-sm" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Role</Label>
            <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))} className="w-full rounded-xl border bg-card h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer">
              <option value="student">Student</option><option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => createMut.mutate()} disabled={!form.full_name.trim() || !form.email.trim() || !form.password.trim() || createMut.isPending} className="rounded-xl gap-1.5 h-9 flex-1">
              <span dangerouslySetInnerHTML={{ __html: I.save.replace("w-5 h-5","w-4 h-4") }} />{createMut.isPending ? "Creating…" : "Create User"}
            </Button>
          </div>
        </div>
      </SlideOver>

    </div>
  );
}
