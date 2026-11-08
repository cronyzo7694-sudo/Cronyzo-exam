/**
 * Admin → Site content.
 *
 * One screen that owns the whole marketing surface:
 *   • the identity strip tagline + flag switch
 *   • hero headline, paragraph, search placeholder, popular tags
 *   • every section heading in between
 *   • hero slides (image URL, caption, CTA) with add / edit / reorder / hide
 *   · the four pillar cards
 *   · the testimonial carousel
 *   · footer copy and the support email
 *
 * Saves are explicit and scoped: the copy form saves every text field it owns in
 * one PUT, and each slide / card / quote saves itself. Nothing is optimistic —
 * the row you see is what the server accepted.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  Type,
} from "lucide-react";
import { adminSiteApi, type AdminSitePayload, type HeroSlide, type PillarCard, type Testimonial } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Group labels for the copy editor ─────────────────────────────────── */
const GROUP_LABELS: Record<string, string> = {
  strip: "Identity strip (under the nav)",
  hero: "Hero",
  pillars: "Four pillars section",
  sections: "Section headings",
  chat: "Chat widget",
  support: "Support",
  footer: "Footer",
  features: "Feature switches",
  custom: "Custom keys",
};

const GROUP_ORDER = [
  "strip",
  "hero",
  "pillars",
  "sections",
  "chat",
  "support",
  "footer",
  "features",
  "custom",
];

const ICON_CHOICES = [
  "GraduationCap",
  "BookOpen",
  "ShoppingBag",
  "Zap",
  "Sparkles",
  "Store",
  "Package",
  "Users",
  "Star",
  "Truck",
  "LayoutGrid",
  "ShieldCheck",
];

const ACCENT_CHOICES = ["indigo", "violet", "teal", "amber"];

/* ═══════════════════════════════════════════════════════════
   Small field components
   ═══════════════════════════════════════════════════════════ */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors",
        checked ? "border-primary/40 bg-primary/5 text-primary" : "text-foreground/70",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════ */

export function SiteContentPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "site"],
    queryFn: () => adminSiteApi.content(),
  });

  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"copy" | "hero" | "pillars" | "quotes" | "status">("copy");

  // Hydrate the editable copy from the server once
  useEffect(() => {
    if (data?.settings) setDraft({ ...data.settings });
  }, [data?.settings]);

  const grouped = useMemo(() => {
    const definitions = data?.definitions ?? [];
    const map = new Map<string, typeof definitions>();
    for (const def of definitions) {
      const list = map.get(def.group) || [];
      list.push(def);
      map.set(def.group, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      label: GROUP_LABELS[g] || g,
      items: map.get(g)!,
    }));
  }, [data?.definitions]);

  const dirty = useMemo(() => {
    if (!data?.settings) return false;
    return Object.keys(draft).some((k) => {
      const a = JSON.stringify(draft[k]);
      const b = JSON.stringify(data.settings[k]);
      return a !== b;
    });
  }, [draft, data?.settings]);

  const saveCopy = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await adminSiteApi.saveSettings(draft);
      setSaved(res.message);
      await refetch();
      qc.invalidateQueries({ queryKey: ["site"] });
      window.setTimeout(() => setSaved(null), 3000);
    } catch (e: any) {
      setError(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Site content</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Everything a visitor reads on the landing page. Changes go live on the next
          page load — no deploy.
        </p>
      </header>

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-1">
        {(
          [
            { key: "copy", label: "Words" },
            { key: "hero", label: "Hero slides" },
            { key: "pillars", label: "Pillars" },
            { key: "quotes", label: "Testimonials" },
            { key: "status", label: "Integrations" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors",
              tab === t.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {saved}
        </p>
      )}

      {/* ══ Words ══════════════════════════════════════════════ */}
      {tab === "copy" && (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.group} className="rounded-2xl border bg-card p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-foreground/80">
                <Type className="h-3.5 w-3.5 text-primary" />
                {group.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((def) => (
                  <div
                    key={def.key}
                    className={cn(
                      def.value_type === "longtext" || def.value_type === "json"
                        ? "sm:col-span-2"
                        : "",
                    )}
                  >
                    <Field label={def.label || def.key} hint={def.key}>
                      {def.value_type === "boolean" ? (
                        <Toggle
                          checked={Boolean(draft[def.key])}
                          onChange={(v) => setDraft((d) => ({ ...d, [def.key]: v }))}
                          label={Boolean(draft[def.key]) ? "On" : "Off"}
                        />
                      ) : def.value_type === "longtext" ? (
                        <textarea
                          value={String(draft[def.key] ?? "")}
                          onChange={(e) => setDraft((d) => ({ ...d, [def.key]: e.target.value }))}
                          rows={3}
                          className={cn(inputCls, "resize-y")}
                        />
                      ) : def.value_type === "json" ? (
                        <textarea
                          value={
                            Array.isArray(draft[def.key])
                              ? (draft[def.key] as string[]).join("\n")
                              : String(draft[def.key] ?? "")
                          }
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [def.key]: e.target.value
                                .split("\n")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            }))
                          }
                          rows={4}
                          placeholder="One per line"
                          className={cn(inputCls, "resize-y")}
                        />
                      ) : (
                        <input
                          value={String(draft[def.key] ?? "")}
                          onChange={(e) => setDraft((d) => ({ ...d, [def.key]: e.target.value }))}
                          className={inputCls}
                        />
                      )}
                    </Field>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="sticky bottom-4 flex items-center gap-3 rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            <Button onClick={() => void saveCopy()} disabled={saving || !dirty}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {dirty ? "Save changes" : "Saved"}
            </Button>
            {dirty && (
              <span className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      )}

      {/* ══ Hero slides ════════════════════════════════════════ */}
      {tab === "hero" && (
        <SlideEditor
          slides={data?.all_slides ?? []}
          onChanged={() => {
            void refetch();
            qc.invalidateQueries({ queryKey: ["site"] });
          }}
        />
      )}

      {/* ══ Pillars ════════════════════════════════════════════ */}
      {tab === "pillars" && (
        <PillarEditor
          pillars={data?.all_pillars ?? []}
          onChanged={() => {
            void refetch();
            qc.invalidateQueries({ queryKey: ["site"] });
          }}
        />
      )}

      {/* ══ Testimonials ═══════════════════════════════════════ */}
      {tab === "quotes" && (
        <QuoteEditor
          quotes={data?.all_testimonials ?? []}
          onChanged={() => {
            void refetch();
            qc.invalidateQueries({ queryKey: ["site"] });
          }}
        />
      )}

      {/* ══ Integrations ═══════════════════════════════════════ */}
      {tab === "status" && <IntegrationStatus />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Hero slides
   ═══════════════════════════════════════════════════════════ */

function SlideEditor({
  slides,
  onChanged,
}: {
  slides: HeroSlide[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Partial<HeroSlide> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing?.title?.trim()) return;
    setBusy(true);
    try {
      if (editing.id) {
        await adminSiteApi.updateSlide(editing.id, editing);
      } else {
        await adminSiteApi.createSlide(editing);
      }
      setEditing(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Remove this slide? The image file stays on disk.")) return;
    await adminSiteApi.deleteSlide(id);
    onChanged();
  };

  const toggle = async (slide: HeroSlide) => {
    await adminSiteApi.updateSlide(slide.id, { is_active: !slide.is_active });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          The hero rotates through these in order. Put a PNG/JPG somewhere public and
          paste its path or full URL.
        </p>
        <Button size="sm" onClick={() => setEditing({ accent: "indigo", is_active: true, sort_order: slides.length + 1 })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add slide
        </Button>
      </div>

      {editing && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input
                value={editing.title ?? ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Eyebrow (small label)">
              <input
                value={editing.eyebrow ?? ""}
                onChange={(e) => setEditing({ ...editing, eyebrow: e.target.value })}
                className={inputCls}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Subtitle">
                <textarea
                  value={editing.subtitle ?? ""}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                  rows={2}
                  className={cn(inputCls, "resize-y")}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Image URL" hint="e.g. /hero/slide-1.jpg — or a full https:// URL">
                <div className="flex gap-2">
                  <input
                    value={editing.image_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                    className={inputCls}
                    placeholder="/hero/slide-1.jpg"
                  />
                  {editing.image_url && (
                    <img
                      src={editing.image_url}
                      alt=""
                      className="h-9 w-14 shrink-0 rounded-md border object-cover"
                    />
                  )}
                </div>
              </Field>
            </div>
            <Field label="CTA label">
              <input
                value={editing.cta_label ?? ""}
                onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="CTA link">
              <input
                value={editing.cta_url ?? ""}
                onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })}
                className={inputCls}
                placeholder="/courses"
              />
            </Field>
            <Field label="Accent">
              <select
                value={editing.accent ?? "indigo"}
                onChange={(e) => setEditing({ ...editing, accent: e.target.value })}
                className={inputCls}
              >
                {ACCENT_CHOICES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order">
              <input
                type="number"
                value={editing.sort_order ?? 0}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy || !editing.title?.trim()}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save slide
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {slides.map((slide) => (
          <div
            key={slide.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-card p-2.5",
              !slide.is_active && "opacity-55",
            )}
          >
            {slide.image_url ? (
              <img src={slide.image_url} alt="" className="h-12 w-20 shrink-0 rounded-lg border object-cover" />
            ) : (
              <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{slide.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                #{slide.sort_order} · {slide.image_url || "no image"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggle(slide)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-primary"
              aria-label={slide.is_active ? "Hide slide" : "Show slide"}
            >
              {slide.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <Button size="sm" variant="outline" onClick={() => setEditing(slide)}>
              Edit
            </Button>
            <button
              type="button"
              onClick={() => void remove(slide.id)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-red-600"
              aria-label="Remove slide"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {slides.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-[13px] text-muted-foreground">
            No slides yet — add one and the hero carousel switches on.
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Pillars
   ═══════════════════════════════════════════════════════════ */

function PillarEditor({ pillars, onChanged }: { pillars: PillarCard[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Partial<PillarCard> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing?.title?.trim()) return;
    setBusy(true);
    try {
      const payload = {
        ...editing,
        bullets: Array.isArray(editing.bullets) ? editing.bullets.join("\n") : editing.bullets,
      } as any;
      if (editing.id) await adminSiteApi.updatePillar(editing.id, payload);
      else await adminSiteApi.createPillar(payload);
      setEditing(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          Four cards, one per vertical. Keep exactly four for the grid to line up.
        </p>
        <Button
          size="sm"
          onClick={() =>
            setEditing({ icon: "Sparkles", accent: "indigo", is_active: true, link_url: "/", link_label: "Explore", sort_order: pillars.length + 1 })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add card
        </Button>
      </div>

      {editing && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Icon">
              <select value={editing.icon ?? "Sparkles"} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} className={inputCls}>
                {ICON_CHOICES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} className={cn(inputCls, "resize-y")} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Bullets" hint="One per line">
                <textarea
                  value={Array.isArray(editing.bullets) ? editing.bullets.join("\n") : (editing.bullets ?? "")}
                  onChange={(e) => setEditing({ ...editing, bullets: e.target.value.split("\n") })}
                  rows={3}
                  className={cn(inputCls, "resize-y")}
                />
              </Field>
            </div>
            <Field label="Link">
              <input value={editing.link_url ?? ""} onChange={(e) => setEditing({ ...editing, link_url: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Link label">
              <input value={editing.link_label ?? ""} onChange={(e) => setEditing({ ...editing, link_label: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Accent">
              <select value={editing.accent ?? "indigo"} onChange={(e) => setEditing({ ...editing, accent: e.target.value })} className={inputCls}>
                {ACCENT_CHOICES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Order">
              <input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} className={inputCls} />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy || !editing.title?.trim()}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save card
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {pillars.map((p) => (
          <div key={p.id} className={cn("rounded-xl border bg-card p-3", !p.is_active && "opacity-55")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold">{p.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {p.icon} · {p.link_url}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Remove "${p.title}"?`)) return;
                    await adminSiteApi.deletePillar(p.id);
                    onChanged();
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-red-600"
                  aria-label="Remove card"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Testimonials
   ═══════════════════════════════════════════════════════════ */

function QuoteEditor({ quotes, onChanged }: { quotes: Testimonial[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Partial<Testimonial> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing?.author_name?.trim() || !editing?.quote?.trim()) return;
    setBusy(true);
    try {
      if (editing.id) await adminSiteApi.updateTestimonial(editing.id, editing);
      else await adminSiteApi.createTestimonial(editing);
      setEditing(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          Real quotes only — invented praise is the fastest way to lose trust.
        </p>
        <Button size="sm" onClick={() => setEditing({ accent: "indigo", is_active: true, sort_order: quotes.length + 1 })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add quote
        </Button>
      </div>

      {editing && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Author name">
              <input value={editing.author_name ?? ""} onChange={(e) => setEditing({ ...editing, author_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Author role">
              <input value={editing.author_role ?? ""} onChange={(e) => setEditing({ ...editing, author_role: e.target.value })} className={inputCls} placeholder="Banking aspirant · Delhi" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Quote">
                <textarea value={editing.quote ?? ""} onChange={(e) => setEditing({ ...editing, quote: e.target.value })} rows={3} className={cn(inputCls, "resize-y")} />
              </Field>
            </div>
            <Field label="Accent">
              <select value={editing.accent ?? "indigo"} onChange={(e) => setEditing({ ...editing, accent: e.target.value })} className={inputCls}>
                {ACCENT_CHOICES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Order">
              <input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} className={inputCls} />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save quote
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {quotes.map((q) => (
          <div key={q.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-bold text-white">
              {q.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-relaxed text-foreground/80">“{q.quote}”</p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {q.author_name} — {q.author_role}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(q)}>Edit</Button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Remove the quote from ${q.author_name}?`)) return;
                await adminSiteApi.deleteTestimonial(q.id);
                onChanged();
              }}
              className="mt-1 rounded-lg p-1.5 text-muted-foreground hover:text-red-600"
              aria-label="Remove quote"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Integrations
   ═══════════════════════════════════════════════════════════ */

function IntegrationStatus() {
  const { data } = useQuery({
    queryKey: ["admin", "site", "status"],
    queryFn: () => adminSiteApi.status(),
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await adminSiteApi.testTelegram());
    } catch (e: any) {
      setTestResult({
        ok: false,
        detail: e?.data?.detail || e?.message || "Could not reach Telegram",
      });
    } finally {
      setTesting(false);
    }
  };

  const telegram = data?.telegram;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Send className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13.5px] font-extrabold">Telegram delivery</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Every support message is mirrored to a Telegram chat so it reaches a phone
              immediately.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-bold">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5",
                  telegram?.configured
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                )}
              >
                {telegram?.configured ? "Connected" : "Not configured"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                token: {telegram?.has_token ? "set" : "missing"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                chat id: {telegram?.has_chat_id ? "set" : "missing"}
              </span>
            </div>

            {!telegram?.configured && (
              <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-foreground/80">
{`# backend environment
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789

# optional: the handle shown in the UI
TELEGRAM_PUBLIC_HANDLE=@cronyzohelp`}
              </pre>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Without these, messages are still saved here and shown in the admin support
              inbox — nothing is lost.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runTest()}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Send a test message
              </Button>
              {testResult && (
                <span
                  className={cn(
                    "text-[11.5px] font-semibold",
                    testResult.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {testResult.ok ? "Sent — check your phone." : testResult.detail}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-[13.5px] font-extrabold">Google sign-in</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          The Google button works today in <strong>testing mode</strong> (it signs in a
          demo Google account). To switch to real Google / Firebase accounts, set these
          and restart the API — the frontend needs no change:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-foreground/80">
{`# backend — verify Firebase ID tokens
FIREBASE_PROJECT_ID=your-project-id

# ...or plain Google Identity Services
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com`}
        </pre>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-[13.5px] font-extrabold">File storage</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          PDFs and images are stored on local disk today and served from{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/api/files/…</code>.
          Set the Cloudinary variables and every new upload goes to Cloudinary instead —
          no code change:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-foreground/80">
{`CLOUDINARY_URL=cloudinary://key:secret@cloud-name
# then: pip install cloudinary`}
        </pre>
      </div>
    </div>
  );
}
