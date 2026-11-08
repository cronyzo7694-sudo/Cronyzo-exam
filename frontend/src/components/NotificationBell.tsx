import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { notificationsApi, type AppNotification } from "@/lib/api";
import { usePlatformStore } from "@/stores/platformStore";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const on =
    isEnabled("NOTIFICATIONS_ENABLED", true) || isEnabled("ENABLE_NOTIFICATIONS", true);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: countData } = useQuery({
    queryKey: ["notif-unread"],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: on,
    refetchInterval: 60_000,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => notificationsApi.list("per_page=15"),
    enabled: on && open,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!on) return null;

  const unread = countData?.unread ?? 0;
  const items: AppNotification[] = listData?.items || [];

  const onRead = async (n: AppNotification) => {
    if (n.is_read || n.read_at) return;
    try {
      await notificationsApi.markRead(n.id);
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    } catch {
      /* ignore */
    }
  };

  const onReadAll = async () => {
    try {
      await notificationsApi.markAllRead();
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative p-1.5 rounded hover:bg-slate-100 text-slate-600"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-[10px] text-white flex items-center justify-center font-semibold">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-14 sm:top-auto sm:mt-1 w-auto sm:w-80 max-h-[70vh] sm:max-h-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl z-[60] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
            <span className="text-xs font-semibold text-slate-700">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                className="text-[11px] text-[#2f6fed] hover:underline"
                onClick={onReadAll}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-4 text-xs text-slate-500">Loading…</div>
            ) : !items.length ? (
              <div className="p-4 text-xs text-slate-500">No notifications yet.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onRead(n)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50",
                    !n.is_read && !n.read_at ? "bg-blue-50/40" : "",
                  )}
                >
                  <div className="text-xs font-medium text-slate-900 line-clamp-1">{n.title}</div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{n.body}</div>
                  <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">
                    {n.category}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
