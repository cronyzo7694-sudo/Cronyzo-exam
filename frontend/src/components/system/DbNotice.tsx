/**
 * DbNotice — the honest banner for a server-side database problem.
 *
 * When the backend cannot reach its database (a Neon quota pause, a locked
 * SQLite file, a network blip) every page used to look simply empty, which
 * reads as "mera poora data gayab ho gaya". This strip says the truth instead:
 * the server is not answering, the data is safe, and it retries by itself.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Health = {
  status?: string;
  database?: string;
  database_error?: string;
  boot_error?: string;
};

const API_BASE = (import.meta.env.VITE_API_URL?.trim() || "/api").replace(/\/$/, "");

export function DbNotice() {
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    try {
      setChecking(true);
      const res = await fetch(`${API_BASE}/health/deep`, { headers: { Accept: "application/json" } });
      const data: Health = await res.json();
      const broken =
        !res.ok ||
        data.status === "degraded" ||
        data.database === "error" ||
        Boolean(data.boot_error);
      setDown(broken);
    } catch {
      // the API itself is unreachable — that is worth telling the reader too
      setDown(true);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 45_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!down) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-amber-500/40 bg-amber-50 px-3 py-2.5 text-amber-900 shadow-[0_-6px_24px_rgba(0,0,0,0.12)] dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-[1100px] items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold leading-snug">
            Server abhi database se connect nahi ho pa raha
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
            Aapka data safe hai — kuch bhi delete nahi hua. Thodi der me apne aap theek ho
            jayega; tab tak naye order/booking nahi honge.
          </p>
        </div>
        <button
          onClick={() => void check()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-700/30 bg-white/70 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 active:scale-95 dark:bg-amber-900/40 dark:text-amber-100"
        >
          <RefreshCw className={checking ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Retry
        </button>
      </div>
    </div>
  );
}
