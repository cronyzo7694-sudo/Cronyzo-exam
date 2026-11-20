/**
 * ProtectedBookReader — the only way an e-book is read on Cronyzo.
 *
 * The PDF stays on the server: the API renders one page at a time into a
 * JPEG that already carries the reader's own identity (email · phone ·
 * "Cronyzo"). That means
 *
 *   • nothing to download — there is no file, only pictures of a page,
 *   • nothing to copy — no text layer, no selection, no right-click menu,
 *   • nothing to hot-link — pages need a signed-in session per request,
 *   • a screenshot is still possible (no browser can block it) but it comes
 *     out watermarked with the account that took it.
 *
 * On top of the watermark the reader also blanks itself when the tab loses
 * focus (so screen-recorders/side-by-side photo apps get a blurred page),
 * refuses printing/saving shortcuts, and never renders in a print stylesheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Lock, Minus, Plus, X } from "lucide-react";
import { booksApi, type BookReaderInfo } from "../../lib/commerce";

type Props = {
  bookId: number;
  /** open the free sample instead of the full book */
  sample?: boolean;
  onClose: () => void;
  /** called when the reader needs money/login — the page decides what to show */
  onNeedsPurchase?: () => void;
  /** used to jump back to where the reader stopped */
  title?: string;
};

const PAGE_KEY = (id: number) => `cz_reader_page_${id}`;

export function ProtectedBookReader({ bookId, sample = false, onClose, onNeedsPurchase, title }: Props) {
  const [info, setInfo] = useState<BookReaderInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "blocked">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const cache = useRef<Map<number, string>>(new Map());
  const [tick, setTick] = useState(0);

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
        if (sample && data.has_sample && data.mode !== "sample") {
          // force the sample view even when the book is unlocked
          setInfo({ ...data, mode: "sample", pages: data.pages });
        } else {
          setInfo(data);
        }
        const usable = data.mode === "full" || data.mode === "sample" || (sample && data.has_sample);
        setStatus(usable ? "ready" : "blocked");
        if (!usable) {
          setMessage(
            data.code === "login_required"
              ? "Padhne ke liye sign in karein."
              : "Poori e-book kharidne ke baad hi padhi ja sakti hai.",
          );
        } else {
          const saved = Number(localStorage.getItem(PAGE_KEY(bookId)) || 0);
          const last = saved > 0 && saved <= (data.pages || 0) ? saved : 1;
          setPage(data.mode === "sample" || sample ? 1 : last);
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

  const sampleMode = (info?.mode === "sample") || sample;
  const total = Math.max(1, Number(info?.pages || 1));

  /* ── 2. one page at a time, prefetch the neighbours ────────────────── */
  const loadPage = useCallback(
    async (n: number) => {
      if (cache.current.has(n)) return;
      setLoadingPage(true);
      try {
        const blob = await booksApi.pageImage(bookId, n, { sample: sampleMode });
        cache.current.set(n, URL.createObjectURL(blob));
        setTick((t) => t + 1);
      } catch (err: any) {
        setFlash(err?.message || "Page load nahi hua");
      } finally {
        setLoadingPage(false);
      }
    },
    [bookId, sampleMode],
  );

  useEffect(() => {
    if (status !== "ready") return;
    void loadPage(page);
    if (page + 1 <= total) void loadPage(page + 1);
    if (page - 1 >= 1) void loadPage(page - 1);
    if (!sampleMode) localStorage.setItem(PAGE_KEY(bookId), String(page));
  }, [page, status, total, sampleMode, bookId, loadPage]);

  useEffect(
    () => () => {
      cache.current.forEach((url) => URL.revokeObjectURL(url));
      cache.current.clear();
    },
    [],
  );

  /* ── 3. deterrence: shortcuts, menus, printing, tab switching ─────── */
  const warn = useCallback((text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(null), 2600);
  }, []);

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
        warn("Screenshot par aapki ID chhap chuki hai — leak trackable hai.");
      }
      if (e.key === "ArrowRight") setPage((p) => Math.min(total, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(1, p - 1));
      if (e.key === "Escape") onClose();
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
      document.body.style.overflow = prevOverflow;
    };
  }, [total, onClose, warn]);

  /* swipe on phones */
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 60) return;
    setPage((p) => Math.min(total, Math.max(1, p + (dx < 0 ? 1 : -1))));
  };

  const currentUrl = cache.current.get(page);
  const go = (n: number) => setPage(Math.min(total, Math.max(1, n)));
  const canNext = sampleMode ? true : page < total;
  const pct = useMemo(() => Math.round((page / total) * 100), [page, total]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950 text-slate-100"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          aria-label="Reader band karein"
        >
          <X className="h-4.5 w-4.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">{info?.title || title || "E-book"}</p>
          <p className="truncate text-[10.5px] text-slate-400">
            {sampleMode ? "Free sample · " : ""}Page {page} / {total} · sirf padhne ke liye
          </p>
        </div>
        <span className="hidden items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300 sm:inline-flex">
          <Lock className="h-3 w-3" /> Protected
        </span>
      </div>

      {/* page area */}
      <div
        className="relative flex-1 overflow-auto overscroll-contain bg-slate-900"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`mx-auto flex min-h-full w-full items-start justify-center p-3 transition-all duration-200 ${
            hidden ? "blur-2xl" : ""
          }`}
        >
          {status === "loading" && (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Book khul rahi hai…
            </div>
          )}

          {status === "blocked" && (
            <div className="mt-10 max-w-sm rounded-2xl bg-white/5 p-6 text-center">
              <Lock className="mx-auto mb-3 h-6 w-6 text-amber-300" />
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

          {status === "ready" && currentUrl && (
            <img
              src={currentUrl}
              alt={`Page ${page}`}
              draggable={false}
              className="mx-auto h-auto select-none rounded-lg bg-white shadow-2xl"
              style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: zoom > 1 ? "none" : "820px" }}
            />
          )}

          {status === "ready" && !currentUrl && (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Page {page} load ho raha hai…
            </div>
          )}
        </div>

        {hidden && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/80">
            <div className="rounded-xl bg-white/10 px-4 py-3 text-center text-xs font-semibold text-slate-200">
              Padhai pause
              <p className="mt-1 text-[10.5px] font-normal text-slate-400">
                Wapas aane par page khud khul jayega
              </p>
            </div>
          </div>
        )}
      </div>

      {/* sample paywall strip */}
      {sampleMode && (
        <button
          onClick={() => {
            onClose();
            onNeedsPurchase?.();
          }}
          className="border-t border-amber-400/30 bg-amber-500/15 px-4 py-2 text-[11.5px] font-bold text-amber-200"
        >
          Sample khatam? Poori e-book kharidein — phir yahin, Cronyzo par padhein →
        </button>
      )}

      {/* bottom controls */}
      <div className="border-t border-white/10 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 disabled:opacity-35"
            aria-label="Pichla page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="number"
            value={page}
            min={1}
            max={total}
            onChange={(e) => go(Number(e.target.value) || 1)}
            className="h-9 w-14 rounded-lg bg-white/10 text-center text-[12px] font-bold outline-none"
            aria-label="Page number"
          />
          <span className="text-[11px] text-slate-400">/ {total}</span>
          <button
            onClick={() => go(page + 1)}
            disabled={!canNext && page >= total}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 disabled:opacity-35"
            aria-label="Agla page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mx-1 h-6 w-px bg-white/10" />
          <button
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
            aria-label="Chhota karein"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
            aria-label="Bada karein"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 truncate text-center text-[9.5px] text-slate-500">
          {loadingPage ? "loading…" : `Watermark: ${info?.watermark || "Cronyzo"}`} · screenshot band nahi ho sakta, par trackable hai
        </p>
      </div>

      {flash && (
        <div className="pointer-events-none absolute inset-x-3 bottom-24 mx-auto max-w-sm rounded-xl bg-slate-100 px-3 py-2 text-center text-[11.5px] font-bold text-slate-900 shadow-lg">
          {flash}
        </div>
      )}
    </div>
  );
}
