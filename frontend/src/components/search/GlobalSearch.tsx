/**
 * GlobalSearch — the map of Cronyzo.
 *
 * One box that finds everything: exams, individual tests, books, courses,
 * products, stores, study topics and plain app screens. It is deliberately
 * built like a command palette (⌘K, ↑↓, Enter, Esc) because the header bar is
 * the only navigation control a student uses when they already know what they
 * want.
 *
 * Behaviour that matters:
 *   • 180 ms debounce, so the list feels instant without hammering the API.
 *   • results grouped by type, with counts — no guessing which section you meant
 *   • typo repair surfaced honestly ("'phisics' dikhaya" style hint)
 *   • empty state = recent searches + popular picks, never a dead end
 *   • zero results = closest real words to tap, plus a "search anyway" link
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Compass,
  CornerDownLeft,
  GraduationCap,
  History,
  Layers,
  Loader2,
  Lock,
  Package,
  Search as SearchIcon,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { searchApi, type SearchHit } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const RECENT_KEY = "cz_recent_searches";

const TYPE_META: Record<
  string,
  { label: string; icon: typeof Zap; tone: string }
> = {
  exam: { label: "Exams", icon: Layers, tone: "text-indigo-600 bg-indigo-500/10" },
  test: { label: "Tests", icon: Zap, tone: "text-amber-600 bg-amber-500/10" },
  book: { label: "Books", icon: BookOpen, tone: "text-violet-600 bg-violet-500/10" },
  course: { label: "Courses", icon: GraduationCap, tone: "text-blue-600 bg-blue-500/10" },
  product: { label: "Shop", icon: Package, tone: "text-teal-600 bg-teal-500/10" },
  store: { label: "Stores", icon: StoreIcon, tone: "text-emerald-600 bg-emerald-500/10" },
  subject: { label: "Subjects", icon: BookOpen, tone: "text-rose-600 bg-rose-500/10" },
  chapter: { label: "Chapters", icon: BookOpen, tone: "text-rose-600 bg-rose-500/10" },
  page: { label: "Pages", icon: Compass, tone: "text-slate-600 bg-slate-500/10" },
};

const POPULAR = ["Physics", "English", "Mathematics", "Airforce", "Books", "My attempts"];

/** Exams, tests and study topics need an account; books/courses/shop don't. */
const LOCKED_TYPES = new Set(["exam", "test", "subject", "chapter"]);
const lockedFor = (signedIn: boolean, type: string) => !signedIn && LOCKED_TYPES.has(type);

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  try {
    const next = [q, ...readRecent().filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(raw.trim()), 180);
    return () => clearTimeout(timer);
  }, [raw]);

  const signedIn = Boolean(useAuthStore((state) => state.user));
  const enabled = open && debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["search-suggest", debounced],
    queryFn: () => searchApi.suggest(debounced),
    enabled,
    staleTime: 20_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const go = useCallback(
    (url: string, query?: string) => {
      if (query) pushRecent(query);
      onClose();
      setRaw("");
      navigate({ to: url as any });
    },
    [navigate, onClose],
  );

  const submitFull = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return;
      pushRecent(q);
      onClose();
      setRaw("");
      navigate({ to: "/search", search: { q } as any });
    },
    [navigate, onClose],
  );

  // Keyboard: ↑ ↓ Enter Esc
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (!items.length) {
        if (event.key === "Enter" && raw.trim()) submitFull(raw);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const hit = items[activeIndex];
        if (hit) go(hit.url, raw);
        else submitFull(raw);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, items, activeIndex, raw, go, submitFull, onClose]);

  if (!open) return null;

  const grouped: { type: string; items: SearchHit[] }[] = [];
  for (const hit of items) {
    const bucket = grouped.find((group) => group.type === hit.type);
    if (bucket) bucket.items.push(hit);
    else grouped.push({ type: hit.type, items: [hit] });
  }

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="cz-pop relative mx-auto mt-[8vh] w-[min(94vw,660px)] overflow-hidden rounded-2xl border bg-background shadow-2xl">
        {/* Input row */}
        <div className="flex items-center gap-2 border-b px-3.5 py-3">
          <SearchIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Exam, test, book, course, topic… kuch bhi dhundo"
            className="h-7 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
            aria-label="Search Cronyzo"
            autoComplete="off"
          />
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {raw && !isFetching && (
            <button
              onClick={() => setRaw("")}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="hidden rounded-md border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground sm:block"
          >
            ESC
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[64vh] overflow-y-auto overscroll-contain">
          {/* Nothing typed yet */}
          {!enabled && (
            <div className="p-4">
              {recent.length > 0 && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <History className="h-3.5 w-3.5" /> Recent
                    </p>
                    <button
                      onClick={() => {
                        localStorage.removeItem(RECENT_KEY);
                        setRecent([]);
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" /> Clear
                    </button>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {recent.map((item) => (
                      <button
                        key={item}
                        onClick={() => setRaw(item)}
                        className="rounded-full border px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Popular
              </p>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR.map((item) => (
                  <button
                    key={item}
                    onClick={() => setRaw(item)}
                    className="rounded-full border px-2.5 py-1 text-[12px] font-medium hover:border-primary/40"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
                Tip: seedha series number bhi likh sakte ho — <b>42</b> ya <b>physics test 12</b>.
              </p>
            </div>
          )}

          {/* Results */}
          {enabled && items.length > 0 && (
            <div className="py-1.5">
              {data?.corrected && (
                <p className="mx-3 mb-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-700 dark:text-amber-400">
                  “{data.query}” kuch nahi mila → <b>{data.corrected}</b> dikha rahe hain
                </p>
              )}
              {grouped.map((group) => {
                const meta = TYPE_META[group.type] ?? TYPE_META.page;
                const Icon = meta.icon;
                return (
                  <div key={group.type} className="mb-1">
                    <p className="px-3.5 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                      <span className="ml-1.5 opacity-60">{data?.counts?.[group.type] ?? group.items.length}</span>
                    </p>
                    {group.items.map((hit) => {
                      runningIndex += 1;
                      const isActive = runningIndex === activeIndex;
                      return (
                        <button
                          key={`${hit.type}-${hit.id}-${hit.title}`}
                          onMouseEnter={() => setActiveIndex(runningIndex)}
                          onClick={() => go(hit.url, raw)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors",
                            isActive ? "bg-primary/10" : "hover:bg-muted/60",
                          )}
                        >
                          {hit.image ? (
                            <img
                              src={hit.image}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", meta.tone)}>
                              <Icon className="h-4 w-4" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold">{hit.title}</span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {hit.subtitle || meta.label}
                            </span>
                          </span>
                          {hit.meta && (
                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                              {hit.meta}
                            </span>
                          )}
                          {lockedFor(signedIn, hit.type) && (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-label="Sign in to open" />
                          )}
                          {isActive
                            ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" />
                            : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* First fetch — never claim "nothing found" while we are still looking */}
          {enabled && isFetching && items.length === 0 && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12.5px] font-semibold text-muted-foreground">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Dhoond rahe hain…
            </div>
          )}

          {/* No results */}
          {enabled && !isFetching && items.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-[13.5px] font-bold">“{debounced}” se kuch nahi mila</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Spelling check karo, ya in me se koi try karo:
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {(data?.suggestions?.length ? data.suggestions : POPULAR).map((item) => (
                  <button
                    key={item}
                    onClick={() => setRaw(item)}
                    className="rounded-full border px-2.5 py-1 text-[12px] font-semibold hover:border-primary/50 hover:text-primary"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3.5 py-2">
          <span className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1"><b>↑↓</b> choose</span>
            <span className="flex items-center gap-1"><b>↵</b> open</span>
            <span className="flex items-center gap-1"><b>esc</b> close</span>
          </span>
          <button
            onClick={() => submitFull(debounced || raw)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground"
          >
            Saare results <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small hook so any layout can own "is the palette open" + the ⌘K binding. */
export function useGlobalSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "/" && !open) {
        const target = event.target as HTMLElement | null;
        const typing =
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (!typing) {
          event.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);
  return { open, setOpen, close: () => setOpen(false) };
}

export function SearchEmptyHint() {
  return (
    <div className="rounded-2xl border border-dashed bg-card px-5 py-12 text-center">
      <Clock className="mx-auto h-6 w-6 text-muted-foreground/60" />
      <p className="mt-2 text-[13.5px] font-bold">Search shuru karo</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
        Kam se kam 2 akshar likho — exam, test, book, topic sab ek hi jagah.
      </p>
    </div>
  );
}
