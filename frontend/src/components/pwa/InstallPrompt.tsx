/**
 * InstallPrompt — "Cronyzo ko phone me install karo".
 *
 * Browsers only allow a real install prompt on Android/Chrome desktop, and only
 * once the manifest + service worker are in place. On iPhone the same thing is
 * done through Share → Add to Home Screen, so we show those steps instead of
 * pretending there is a button that works.
 *
 * The sheet is polite: it appears once the browser says the app is installable,
 * never inside the installed app itself, and stays away for a week after a "no".
 */

import { useCallback, useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "cz_install_dismissed_at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Boolean(at) && Date.now() - at < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());
  const [ios, setIos] = useState(false);

  useEffect(() => setIos(isIos()), []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      if (!dismissedRecently() && !isStandalone()) {
        // let the page settle first — nobody wants a sheet over the first paint
        window.setTimeout(() => setOpen(true), 6000);
      }
    };
    const onInstalled = () => {
      setInstalled(true);
      setOpen(false);
      setPromptEvent(null);
    };
    const onManualAsk = () => setOpen(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("cronyzo:show-install", onManualAsk);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("cronyzo:show-install", onManualAsk);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) {
      // iPhone, or a browser that never fires the event: show the manual steps.
      setOpen(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") {
      setOpen(false);
      setInstalled(true);
    } else {
      close();
    }
    setPromptEvent(null);
  }, [close, promptEvent]);

  if (installed || !open) return null;

  const manualOnly = !promptEvent;

  return (
    <div className="fixed inset-x-0 bottom-[72px] z-[70] px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-4 sm:left-auto sm:right-4 sm:w-[360px] sm:px-0">
      <div className="rounded-2xl border bg-card p-3 shadow-2xl">
        <div className="flex items-start gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl"
            width={44}
            height={44}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold leading-tight">Cronyzo app install karo</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Home screen par icon, poora screen test, aur slow net par bhi khulta hai.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Install suggestion band karo"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {manualOnly ? (
          <div className="mt-2.5 rounded-xl bg-muted/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {ios ? (
              <>
                <b className="text-foreground">iPhone:</b> Safari me neeche{" "}
                <Share className="mx-0.5 inline h-3.5 w-3.5" /> <b>Share</b> dabao →{" "}
                <b>Add to Home Screen</b> → Add.
              </>
            ) : (
              <>
                Browser menu (⋮) → <b>Install app</b> / <b>Add to Home screen</b> chuno — icon
                wahi se ban jaayega.
              </>
            )}
          </div>
        ) : (
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Install
            </button>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-10 items-center justify-center rounded-xl border px-3 text-[12.5px] font-semibold text-muted-foreground hover:bg-muted"
            >
              Baad me
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The drawer button that asks for the same sheet (works before/after install). */
export function requestInstall() {
  if (isStandalone()) return;
  window.dispatchEvent(new CustomEvent("cronyzo:show-install"));
}

export function InstallHintIcon({ className }: { className?: string }) {
  return <Smartphone className={className} />;
}
