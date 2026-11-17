/**
 * TestFileViewer — the student's own HTML test, running inside Cronyzo.
 *
 * It takes the whole screen (so a test feels like a test, not a blog post),
 * works the same on a phone and a laptop, can go true fullscreen, and keeps the
 * attempt alive: answers, scroll position and the file's own storage are saved
 * to this browser every couple of seconds, so an accidental reload, a phone
 * call, or closing the tab does not lose the paper.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  clearProgress,
  getProgress,
  saveProgress,
  type ProgressRecord,
  type TestFileRecord,
} from "@/lib/fileVault";
import { buildSrcDoc } from "@/lib/testFileBridge";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "unavailable";

/** Only things the student actually filled count as "answers". */
function countAnswers(values: Record<string, string>): number {
  return Object.values(values).filter((v) => v === "1" || (v !== "" && v !== "0")).length;
}

export function TestFileViewer({
  file,
  onClose,
}: {
  file: TestFileRecord;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const valuesRef = useRef<Record<string, string>>({});
  const storageRef = useRef<Record<string, string>>({});
  const scrollRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [answered, setAnswered] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [fullscreenOk, setFullscreenOk] = useState(true);

  /* ---- load the file + its saved progress, then mount the frame -------- */
  useEffect(() => {
    let alive = true;
    setSrcDoc(null);
    getProgress(file.id)
      .then((progress) => {
        if (!alive) return;
        valuesRef.current = progress?.values ?? {};
        storageRef.current = progress?.storage ?? {};
        scrollRef.current = progress?.scroll ?? 0;
        setSavedAt(progress?.saved_at ?? null);
        setAnswered(countAnswers(valuesRef.current));
        setSrcDoc(
          buildSrcDoc(file.html, {
            values: valuesRef.current,
            scroll: scrollRef.current,
            storage: storageRef.current,
          }),
        );
      })
      .catch(() => {
        if (!alive) return;
        setSrcDoc(buildSrcDoc(file.html, {}));
      });
    return () => {
      alive = false;
    };
  }, [file.id, file.html]);

  /* ---- persist (debounced, flushed on unmount) ------------------------- */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const record: ProgressRecord = {
      id: file.id,
      values: valuesRef.current,
      scroll: scrollRef.current,
      storage: storageRef.current,
      saved_at: Date.now(),
    };
    setSaveState("saving");
    try {
      await saveProgress(record);
      if (!mountedRef.current) return;
      setSaveState("saved");
      setSavedAt(record.saved_at);
      setAnswered(countAnswers(valuesRef.current));
    } catch {
      if (mountedRef.current) setSaveState("unavailable");
    }
  }, [file.id]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void flush();
    }, 700);
  }, [flush]);

  /* ---- messages from the injected bridge -------------------------------- */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const kind = (event.data && (event.data as { cz?: string }).cz) || "";
      const payload = (event.data as { data?: unknown }).data;

      if (kind === "snapshot" && payload && typeof payload === "object") {
        const snap = payload as { values?: Record<string, string>; scroll?: number };
        if (snap.values) valuesRef.current = snap.values;
        if (typeof snap.scroll === "number") scrollRef.current = snap.scroll;
        scheduleSave();
      } else if (kind === "storage" && payload && typeof payload === "object") {
        storageRef.current = payload as Record<string, string>;
        scheduleSave();
      } else if (kind === "ready") {
        setSaveState((state) => (state === "idle" ? "saved" : state));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [scheduleSave]);

  /* flush once when the viewer goes away */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void flush();
    };
  }, [flush]);

  /* ---- fullscreen ------------------------------------------------------- */
  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const shell = shellRef.current;
      if (!shell || typeof shell.requestFullscreen !== "function") {
        setFullscreenOk(false);
        return;
      }
      await shell.requestFullscreen();
    } catch {
      setFullscreenOk(false);
    }
  }, []);

  const resetAttempt = useCallback(async () => {
    const ok = window.confirm(
      "Is file ke saare saved answers mit jaayenge. Test phir se shuru hoga. Pakka?",
    );
    if (!ok) return;
    valuesRef.current = {};
    storageRef.current = {};
    scrollRef.current = 0;
    setAnswered(0);
    setSavedAt(null);
    await clearProgress(file.id);
    setSrcDoc(buildSrcDoc(file.html, {}));
  }, [file.html, file.id]);

  const savedLabel =
    saveState === "saving"
      ? "Save ho raha hai…"
      : saveState === "unavailable"
        ? "Autosave band (private mode)"
        : savedAt
          ? `Saved ${new Date(savedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
          : "Autosave chalu";

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 z-[80] flex flex-col bg-background"
      role="dialog"
      aria-label={`${file.name} — test file`}
    >
      {/* toolbar */}
      <header className="flex shrink-0 items-center gap-2 border-b bg-card px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-foreground hover:bg-muted"
          aria-label="Band karo aur files ki list par jao"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Band karo</span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight">{file.name}</p>
          <p className="flex items-center gap-1 truncate text-[10.5px] font-semibold text-muted-foreground">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                saveState === "unavailable" ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            {savedLabel}
            {answered > 0 && <span className="opacity-70">· {answered} answers saved</span>}
          </p>
        </div>

        <button
          type="button"
          onClick={resetAttempt}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Saved answers reset karo"
          title="Reset attempt"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[12.5px] font-bold text-primary-foreground hover:bg-primary/90"
          aria-label={isFull ? "Fullscreen se bahar" : "Fullscreen me kholo"}
        >
          {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{isFull ? "Bahar" : "Fullscreen"}</span>
        </button>
      </header>

      {!fullscreenOk && (
        <p className="flex shrink-0 items-center gap-1.5 bg-amber-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-amber-700">
          <CloudOff className="h-3.5 w-3.5" />
          Is browser me fullscreen band hai — phone me Chrome/Safari se kholo.
        </p>
      )}

      {/* the student's own file — sandboxed, no access to our storage/token */}
      <div className="relative min-h-0 flex-1 bg-white">
        {srcDoc ? (
          <iframe
            ref={frameRef}
            title={file.name}
            srcDoc={srcDoc}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"
            allow="fullscreen; clipboard-write"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] font-semibold text-muted-foreground">
            File khol rahe hain…
          </div>
        )}
      </div>

      {/* a quiet footer keeps the "your data is on your phone" promise visible */}
      <footer className="flex shrink-0 items-center justify-center gap-1.5 border-t bg-card px-3 py-1.5 text-[10.5px] font-semibold text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        File aur answers sirf is device par save hote hain
        {(saveState === "saved" || saveState === "saving") && (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        )}
      </footer>
    </div>
  );
}
