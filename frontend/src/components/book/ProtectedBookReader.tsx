/**
 * ProtectedBookReader — the only way an e-book is read on Cronyzo.
 *
 * Feels like a real e-book app (cream paper, one-tap page turn, chrome that
 * slides away) while staying impossible to walk off with:
 *
 *   • the server renders one watermarked JPEG per page — no file ever reaches
 *     the browser, so there is nothing to download, copy, hot-link or re-share,
 *   • every page carries the reader's identity (email · phone · Cronyzo) plus a
 *     printed footer, so a screenshot points back at the account that took it,
 *   • copy / save / print shortcuts are blocked, printing is blocked outright,
 *     and the page blurs the moment the tab loses focus.
 *
 * Controls hide themselves after a moment, so the page gets the whole screen;
 * a small floating button (or a tap in the middle) brings them back. While the
 * reader is open the site's bottom navigation and chat bubble are hidden too.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  Eye,
  EyeOff,
  Maximize2,
  Rows3,
  SunMedium,
  Minimize2,
  Lock,
  Loader2,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { booksApi, type BookReaderInfo } from "../../lib/commerce";

type Props = {
  bookId: number;
  /** open the free sample instead of the full book */
  sample?: boolean;
  onClose: () => void;
  /** called when the reader needs money/login — the page decides what to show */
  onNeedsPurchase?: () => void;
  title?: string;
};

const PAGE_KEY = (id: number) => `cz_reader_page_${id}`;
const THEME_KEY = "cz_reader_theme";
const MAX_CACHED = 14;

type Theme = "cream" | "night";

export function ProtectedBookReader({ bookId, sample = false, onClose, onNeedsPurchase, title }: Props) {
  const [info, setInfo] = useState<BookReaderInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "blocked">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  /** chrome (bars + buttons) — auto-hides so the page owns the screen */
  const [chrome, setChrome] = useState(true);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme) || "cream",
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tick, setTick] = useState(0);
  const cache = useRef<Map<number, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  /** gesture bookkeeping — page turns must be deliberate, never accidental */
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastScroll = useRef(0);
  const [turnChip, setTurnChip] = useState<string | null>(null);
  // archive.org lets a reader choose: one page at a time, or one long scroll.
  const [view, setView] = useState<"single" | "scroll">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("cz_reader_view") === "scroll"
      ? "scroll"
      : "single",
  );
  const [dim, setDim] = useState<number>(() =>
    Math.min(70, Math.max(0, Number(localStorage.getItem("cz_reader_dim") || 0))),
  );
  const [fit, setFit] = useState<"page" | "width">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("cz_reader_fit") === "width"
      ? "width"
      : "page",
  );

  /* ── 1. what may this caller read? ─────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await booksApi.readerInfo(bookId);
        if (!alive) return;
        const data = res.data;
        if (!data) {
          setStatus("blocked");
          setMessage(res.message || "Ye book nahi khul payi");
          return;
        }
        setInfo(sample ? { ...data, mode: data.has_sample ? "sample" : data.mode } : data);
        const usable = data.mode === "full" || data.has_sample || (sample && data.has_sample);
        setStatus(usable ? "ready" : "blocked");
        if (usable) {
          const saved = Number(localStorage.getItem(PAGE_KEY(bookId)) || 0);
          const last = saved > 0 && saved <= (data.pages || 0) ? saved : 1;
          setPage(sample ? 1 : last);
        } else {
          setMessage(
            data.code === "login_required"
              ? "Padhne ke liye sign in karein."
              : "Poori e-book kharidne ke baad hi padhi ja sakti hai.",
          );
        }
      } catch (err: any) {
        if (!alive) return;
        setStatus("blocked");
        setMessage(err?.message || "Reader nahi khul paya");
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookId, sample]);

  const sampleMode = info?.mode === "sample";
  const total = Math.max(1, Number(info?.pages || 1));
  const paper = theme === "cream" ? "bg-[#f6efe1] text-[#2e2a24]" : "bg-[#14161a] text-slate-200";

  /* ── 2. one page at a time, neighbours prefetched (smooth turning) ── */
  const loadPage = useCallback(
    async (n: number) => {
      if (cache.current.has(n)) return;
      setLoadingPage(true);
      try {
        const blob = await booksApi.pageImage(bookId, n, { sample: sampleMode });
        cache.current.set(n, URL.createObjectURL(blob));
        // keep memory sane on long books
        if (cache.current.size > MAX_CACHED && view !== "scroll") {
          const keep = [page, page + 1, page - 1, page + 2];
          for (const [key, url] of cache.current) {
            if (!keep.includes(key) && cache.current.size > MAX_CACHED) {
              URL.revokeObjectURL(url);
              cache.current.delete(key);
            }
          }
        }
        setTick((t) => t + 1);
      } catch (err: any) {
        setFlash(err?.message || "Page load nahi hua");
        window.setTimeout(() => setFlash(null), 2600);
      } finally {
        setLoadingPage(false);
      }
    },
    [bookId, sampleMode, page, view],
  );

  useEffect(() => {
    if (status !== "ready") return;
    void loadPage(page);
    for (const n of [page + 1, page + 2, page - 1]) {
      if (n >= 1 && n <= total) void loadPage(n);
    }
    if (!sampleMode) localStorage.setItem(PAGE_KEY(bookId), String(page));
  }, [page, status, total, sampleMode, bookId, loadPage]);

  useEffect(
    () => () => {
      cache.current.forEach((url) => URL.revokeObjectURL(url));
      cache.current.clear();
    },
    [],
  );

  /* ── 3. chrome auto-hide ───────────────────────────────────────────── */
  const revealChrome = useCallback(() => {
    setChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 3600);
  }, []);

  /* ── 3b. continuous scroll mode ───────────────────────────────────────
     One observer loads pages just before they reach the screen, a second one
     tracks which page the reader is on, and anything scrolled far away is
     released so a 400-page book never eats the phone's memory. */
  useEffect(() => {
    if (status !== "ready" || view !== "scroll") return;
    const root = scrollRef.current;
    if (!root) return;
    const slots = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));

    const loader = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (n >= 1 && n <= total) void loadPage(n);
        });
      },
      { root, rootMargin: "1400px 0px" },
    );
    const tracker = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (n >= 1 && n <= total) setPage(n);
        });
      },
      { root, threshold: 0.45 },
    );
    const reaper = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) return;
          const n = Number((entry.target as HTMLElement).dataset.page);
          const url = cache.current.get(n);
          if (url && Math.abs(n - page) > 20) {
            URL.revokeObjectURL(url);
            cache.current.delete(n);
            setTick((t) => t + 1);
          }
        });
      },
      { root, rootMargin: "3200px 0px" },
    );

    slots.forEach((el) => {
      loader.observe(el);
      tracker.observe(el);
      reaper.observe(el);
    });
    return () => {
      loader.disconnect();
      tracker.disconnect();
      reaper.disconnect();
    };
  }, [status, view, total, loadPage, page]);

  // land on the page the reader left off at when switching into scroll view
  useEffect(() => {
    if (view !== "scroll" || status !== "ready") return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (el) el.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!localStorage.getItem("cz_reader_hint")) {
      localStorage.setItem("cz_reader_hint", "1");
      setFlash("⬅➡ arrows ya swipe se page — ya neeche 'Scroll' dabakar poori book ek saath padhein");
      window.setTimeout(() => setFlash(null), 4200);
    }
  }, [status]);

  useEffect(() => {
    if (status === "ready") revealChrome();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [status, revealChrome]);

  /* ── 4. deterrence: shortcuts, menus, printing, tab switching ─────── */
  const warn = useCallback((text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(null), 2600);
  }, []);

  const go = useCallback(
    (n: number) => {
      const next = Math.min(total, Math.max(1, n));
      setPage((prev) => (next === prev ? prev : next));
      if (view === "scroll") {
        scrollRef.current
          ?.querySelector<HTMLElement>(`[data-page="${next}"]`)
          ?.scrollIntoView({ block: "start" });
      } else {
        scrollRef.current?.scrollTo({ top: 0 });
      }
      revealChrome();
    },
    [total, revealChrome],
  );

  const flashTurn = useCallback((label: string) => {
    setTurnChip(label);
    window.setTimeout(() => setTurnChip(null), 1100);
  }, []);

  /** the only way a page changes from a gesture — never from a stray tap */
  const turn = useCallback(
    (delta: number) => {
      setPage((prev) => {
        const next = Math.min(total, Math.max(1, prev + delta));
        if (next !== prev) flashTurn(`Page ${next} / ${total}`);
        return next === prev ? prev : next;
      });
      revealChrome();
    },
    [total, revealChrome, flashTurn],
  );

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      warn("Is browser me fullscreen nahi khul paya");
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const setThemePersisted = (next: Theme) => {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && ["s", "p", "c", "a", "u"].includes(key)) {
        e.preventDefault();
        warn("Copy / save / print band hai — ye book sirf padhne ke liye hai.");
        return;
      }
      if (e.key === "PrintScreen") {
        warn("Screenshot par aapki ID chhapi hui hai — leak trackable hai.");
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        turn(1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        turn(-1);
      }
      if (e.key === "Home") go(1);
      if (e.key === "End") go(total);
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setChrome((c) => !c);
      }
    };
    const block = (e: Event) => e.preventDefault();
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(false);

    window.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    const style = document.createElement("style");
    style.id = "cz-reader-print-guard";
    style.textContent = "@media print{body{display:none !important}}";
    document.head.appendChild(style);

    // Site chrome (bottom nav, chat bubble) would sit under the reader anyway —
    // hide it so nothing steals taps while a student is reading.
    const hiddenNodes: { el: HTMLElement; display: string }[] = [];
    const selector = 'nav[aria-label="Bottom navigation"], button[aria-label="Chat with Cronyzo"]';
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      hiddenNodes.push({ el, display: el.style.display });
      el.style.display = "none";
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.getElementById("cz-reader-print-guard")?.remove();
      hiddenNodes.forEach(({ el, display }) => {
        el.style.display = display;
      });
      document.body.style.overflow = prevOverflow;
    };
  }, [page, total, onClose, warn, go, turn]);

  /* ── 5. gestures — deliberately conservative (archive.org style) ────
     A page only turns when the reader *means* it:
       • the edge arrow buttons (always visible, out of the text),
       • a long, mostly-horizontal swipe (≥70px and clearly sideways),
       • the arrow keys, or the page field / slider.
     A plain tap never turns a page — it only shows/hides the controls — and a
     tap right after scrolling is ignored, so reading down a tall page cannot
     flip it by accident. */
  const onScroll = () => {
    lastScroll.current = Date.now();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    gesture.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = gesture.current;
    gesture.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const dt = Date.now() - start.t;
    const horizontal = Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.8;
    const quick = dt < 900;

    if (horizontal && quick) {
      turn(dx < 0 ? 1 : -1);
      return;
    }
    // a tap (no real movement) only toggles the bars — and never counts as a
    // tap if the page was being scrolled a moment ago
    const still = Math.abs(dx) < 12 && Math.abs(dy) < 12;
    if (still && Date.now() - lastScroll.current > 350) {
      setChrome((c) => !c);
    }
  };

  /** mouse click on the paper behaves like a tap: controls only, no paging */
  const onSurfaceClick = () => {
    if (Date.now() - lastScroll.current > 350) setChrome((c) => !c);
  };

  const currentUrl = cache.current.get(page);
  const pct = useMemo(() => Math.round((page / total) * 100), [page, total]);

  return (
    <div
      className={`fixed inset-0 z-[120] flex flex-col transition-colors duration-300 ${paper}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onMouseMove={revealChrome}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      {/* ── top bar (auto-hides, transparent) ─────────────────────────── */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2.5 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))] transition-all duration-300 ${
          chrome ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        }`}
        style={{
          background:
            theme === "cream"
              ? "linear-gradient(to bottom, rgba(246,239,225,0.96), rgba(246,239,225,0))"
              : "linear-gradient(to bottom, rgba(10,12,16,0.94), rgba(10,12,16,0))",
        }}
      >
        <button
          onClick={onClose}
          className={`pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-95 ${
            theme === "cream" ? "bg-[#2e2a24]/10 hover:bg-[#2e2a24]/20" : "bg-white/12 hover:bg-white/20"
          }`}
          aria-label="Reader band karein"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-extrabold">{info?.title || title || "E-book"}</p>
          <p className="truncate text-[10px] opacity-60">
            {sampleMode ? "Free sample · " : ""}Page {page} / {total} · {pct}%
            {total > 1 ? ` · ~${Math.max(1, Math.round(((total - page) * 40) / 60))} min baaki` : ""}
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-full ${
            theme === "cream" ? "bg-[#2e2a24]/10" : "bg-white/12"
          }`}
          aria-label="Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setThemePersisted(theme === "cream" ? "night" : "cream")}
          className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-full ${
            theme === "cream" ? "bg-[#2e2a24]/10" : "bg-white/12"
          }`}
          aria-label="Theme badlein"
        >
          {theme === "cream" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      {/* ── the page itself ───────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto overscroll-contain"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onSurfaceClick}
        onScroll={onScroll}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className={`mx-auto flex min-h-full w-full items-start justify-center px-2 py-2 transition-all duration-200 ${
            hidden ? "blur-2xl" : ""
          }`}
        >
          {status === "loading" && (
            <div className="flex h-64 items-center justify-center gap-2 text-sm opacity-60">
              <Loader2 className="h-4 w-4 animate-spin" /> Book khul rahi hai…
            </div>
          )}

          {status === "blocked" && (
            <div
              className={`pointer-events-auto mt-10 max-w-sm rounded-2xl p-6 text-center ${
                theme === "cream" ? "bg-[#2e2a24]/5" : "bg-white/5"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <Lock className="mx-auto mb-3 h-6 w-6 text-amber-500" />
              <p className="text-sm font-semibold">{message}</p>
              {onNeedsPurchase && (
                <button
                  onClick={() => {
                    onClose();
                    onNeedsPurchase();
                  }}
                  className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
                >
                  {info?.code === "login_required" ? "Sign in karein" : "Book kharidein"}
                </button>
              )}
            </div>
          )}

          {status === "ready" && view === "single" && currentUrl && (
            <div className="relative w-full">
              <img
                key={currentUrl}
                src={currentUrl}
                alt={`Page ${page}`}
                draggable={false}
                className="mx-auto h-auto select-none rounded-md bg-white shadow-[0_10px_40px_rgba(0,0,0,0.16)]"
                style={
                  fit === "width"
                    ? {
                        width: `${Math.round(zoom * 100)}%`,
                        maxWidth: zoom > 1 ? "none" : "100%",
                        animation: "fade-in 180ms ease-out",
                      }
                    : {
                        maxHeight: "calc(100dvh - 24px)",
                        width: "auto",
                        maxWidth: "100%",
                        animation: "fade-in 180ms ease-out",
                      }
                }
              />
              {/* last page of a sample → soft CTA, not a wall */}
              {sampleMode && page >= total && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    onNeedsPurchase?.();
                  }}
                  className="mx-auto mt-3 mb-6 block w-full max-w-sm rounded-xl bg-primary px-4 py-3 text-[12.5px] font-bold text-white shadow-lg"
                >
                  Sample khatam — poori e-book kharidein, yahin padhein →
                </button>
              )}
            </div>
          )}

          {status === "ready" && view === "single" && !currentUrl && (
            <div className="flex h-64 items-center justify-center gap-2 text-sm opacity-60">
              <Loader2 className="h-4 w-4 animate-spin" /> Page {page} load ho raha hai…
            </div>
          )}

          {/* ── continuous scroll: the whole book, one smooth strip ───── */}
          {status === "ready" && view === "scroll" && (
            <div className="mx-auto w-full max-w-[900px] space-y-1.5 pb-24">
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
                const url = cache.current.get(n) ?? null;
                return (
                  <div
                    key={n}
                    data-page={n}
                    className="flex w-full flex-col items-center justify-start"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`Page ${n}`}
                        draggable={false}
                        className="h-auto w-full select-none rounded-sm bg-white shadow-[0_2px_14px_rgba(0,0,0,0.12)]"
                        style={{
                          animation: "fade-in 200ms ease-out",
                          maxWidth: fit === "width" ? "none" : "860px",
                        }}
                      />
                    ) : (
                      <div
                        className={`flex w-full max-w-[860px] items-center justify-center rounded-sm ${
                          theme === "cream" ? "bg-[#2e2a24]/5" : "bg-white/5"
                        }`}
                        style={{ aspectRatio: "1 / 1.414" }}
                      >
                        <Loader2 className="h-4 w-4 animate-spin opacity-40" />
                      </div>
                    )}
                    {sampleMode && n === total && (
                      <div className="mt-2 w-full max-w-sm rounded-xl bg-primary px-4 py-3 text-center text-[12.5px] font-bold text-white shadow-lg">
                        Sample khatam — poori e-book kharidein, yahin padhein →
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {dim > 0 && (
          <div
            className="pointer-events-none absolute inset-0 z-[12] bg-black"
            style={{ opacity: dim / 100 }}
          />
        )}

        {hidden && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60">
            <div className="rounded-xl bg-white/10 px-4 py-3 text-center text-xs font-semibold text-white">
              Padhai pause
              <p className="mt-1 text-[10.5px] font-normal text-white/70">
                Wapas aane par page khud khul jayega
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── edge arrows: the deliberate way to turn a page ────────────── */}
      <button
        onClick={() => turn(-1)}
        disabled={page <= 1}
        className={`absolute left-0 top-1/2 z-20 grid h-24 w-9 -translate-y-1/2 place-items-center rounded-r-xl border-y border-r backdrop-blur transition-all duration-300 disabled:pointer-events-none disabled:opacity-0 ${
          theme === "cream"
            ? "border-[#2e2a24]/10 bg-[#f6efe1]/55 text-[#2e2a24]/70"
            : "border-white/10 bg-black/35 text-white/70"
        } ${chrome ? "opacity-100" : "opacity-30 hover:opacity-80"}`}
        aria-label="Pichla page"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={() => turn(1)}
        disabled={page >= total}
        className={`absolute right-0 top-1/2 z-20 grid h-24 w-9 -translate-y-1/2 place-items-center rounded-l-xl border-y border-l backdrop-blur transition-all duration-300 disabled:pointer-events-none disabled:opacity-0 ${
          theme === "cream"
            ? "border-[#2e2a24]/10 bg-[#f6efe1]/55 text-[#2e2a24]/70"
            : "border-white/10 bg-black/35 text-white/70"
        } ${chrome ? "opacity-100" : "opacity-30 hover:opacity-80"}`}
        aria-label="Agla page"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* the eye moves down so it never sits under the right arrow */}
      {/* ── floating show/hide control (always reachable) ─────────────── */}
      <button
        onClick={() => setChrome((c) => !c)}
        className={`absolute bottom-24 right-2 z-30 grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition-all duration-300 ${
          theme === "cream"
            ? "border-[#2e2a24]/15 bg-[#f6efe1]/70 text-[#2e2a24]"
            : "border-white/15 bg-black/45 text-white"
        } ${chrome ? "opacity-0" : "opacity-80 hover:opacity-100"}`}
        aria-label={chrome ? "Controls chhupayein" : "Controls dikhayein"}
      >
        {chrome ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>

      {/* ── bottom controls (auto-hide, transparent) ──────────────────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-8 transition-all duration-300 ${
          chrome ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
        style={{
          background:
            theme === "cream"
              ? "linear-gradient(to top, rgba(246,239,225,0.97), rgba(246,239,225,0))"
              : "linear-gradient(to top, rgba(10,12,16,0.95), rgba(10,12,16,0))",
        }}
      >
        {/* page slider — drag to jump anywhere in the book */}
        <div className="mx-auto mb-1 flex max-w-md items-center gap-2 px-1">
          <span className="w-8 text-right text-[10px] font-bold tabular-nums opacity-60">{page}</span>
          <input
            type="range"
            min={1}
            max={total}
            value={page}
            onChange={(e) => go(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-current/20 accent-primary"
            aria-label="Page slider"
            style={{ accentColor: "#4f46e5" }}
          />
          <span className="w-8 text-[10px] font-bold tabular-nums opacity-60">{total}</span>
        </div>

        <div className="mx-auto flex max-w-md items-center justify-between gap-1">
          <button
            onClick={() => go(1)}
            className={`grid h-10 w-10 place-items-center rounded-full ${
              theme === "cream" ? "bg-[#2e2a24]/8" : "bg-white/10"
            }`}
            aria-label="Pehla page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => turn(-1)}
            disabled={page <= 1}
            className={`grid h-11 w-11 place-items-center rounded-full disabled:opacity-30 ${
              theme === "cream" ? "bg-[#2e2a24]/12" : "bg-white/14"
            }`}
            aria-label="Pichla page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* type a page number and go — like archive.org's page field */}
          <label
            className={`flex h-11 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[12px] font-bold tabular-nums ${
              theme === "cream" ? "bg-[#2e2a24]/8" : "bg-white/10"
            }`}
          >
            {loadingPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={total}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1 && n <= total) go(n);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-10 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Page number"
            />
            <span className="opacity-50">/ {total}</span>
          </label>

          <button
            onClick={() => turn(1)}
            disabled={page >= total}
            className={`grid h-11 w-11 place-items-center rounded-full disabled:opacity-30 ${
              theme === "cream" ? "bg-[#2e2a24]/12" : "bg-white/14"
            }`}
            aria-label="Agla page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => go(total)}
            className={`grid h-10 w-10 place-items-center rounded-full ${
              theme === "cream" ? "bg-[#2e2a24]/8" : "bg-white/10"
            }`}
            aria-label="Aakhri page"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>

        {/* reading comfort: view, fit, text size, brightness */}
        <div className="mx-auto mt-1 flex max-w-md items-center justify-between gap-1 px-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
            className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold opacity-60"
            aria-label="Chhota karein"
          >
            A−
          </button>

          <button
            onClick={() => {
              const next = view === "single" ? "scroll" : "single";
              setView(next);
              localStorage.setItem("cz_reader_view", next);
            }}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-bold ${
              theme === "cream" ? "bg-[#2e2a24]/8" : "bg-white/10"
            }`}
            aria-label="Padhne ka tarika badlein"
          >
            {view === "single" ? <BookOpen className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
            {view === "single" ? "Ek page" : "Scroll"}
          </button>

          <button
            onClick={() => {
              const next = fit === "page" ? "width" : "page";
              setFit(next);
              localStorage.setItem("cz_reader_fit", next);
            }}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-bold ${
              theme === "cream" ? "bg-[#2e2a24]/8" : "bg-white/10"
            }`}
            aria-label="Page ka size badlein"
          >
            {fit === "page" ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {fit === "page" ? "Poora" : "Chauda"}
          </button>

          <button
            onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.15).toFixed(2)))}
            className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold opacity-60"
            aria-label="Bada karein"
          >
            A+
          </button>
        </div>

        {/* night comfort: gentle screen dim, saved for next time */}
        <div className="mx-auto mt-1 flex max-w-md items-center gap-2 px-3">
          <SunMedium className="h-3.5 w-3.5 shrink-0 opacity-45" />
          <input
            type="range"
            min={0}
            max={70}
            value={dim}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDim(v);
              localStorage.setItem("cz_reader_dim", String(v));
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-current/20"
            aria-label="Screen brightness"
          />
          <span className="w-9 text-right text-[9px] font-bold tabular-nums opacity-45">
            {Math.round(((70 - dim) / 70) * 100)}%
          </span>
        </div>
      </div>

      {/* tiny corner watermark note (always visible, never in the way) */}
      <span
        className={`pointer-events-none absolute bottom-1 left-2 z-10 text-[8.5px] transition-opacity duration-300 ${
          chrome ? "opacity-0" : "opacity-40"
        }`}
      >
        {info?.watermark || "Cronyzo"}
      </span>

      {turnChip && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/55 px-4 py-2 text-[12px] font-bold text-white backdrop-blur">
          {turnChip}
        </div>
      )}

      {flash && (
        <div className="pointer-events-none absolute inset-x-3 bottom-28 z-30 mx-auto max-w-sm rounded-xl bg-slate-900/92 px-3 py-2 text-center text-[11.5px] font-bold text-white shadow-xl">
          {flash}
        </div>
      )}
    </div>
  );
}
