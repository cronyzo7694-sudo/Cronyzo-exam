/**
 * Messages — real 1:1 conversations between Cronyzo users.
 *
 * A learner asking a teacher about a module, a buyer asking a seller about
 * stock, a student asking another student for notes — all the same primitive:
 * a thread between two accounts, polled against a cursor.
 *
 * Design borrowed from the BhashaSetu messenger: a two-pane layout on desktop
 * (list left, transcript right), a single pane with a back button on mobile,
 * bubble alignment that makes "mine" vs "theirs" obvious at a glance.
 *
 * Everything is server-backed, so a message written on a phone shows up on a
 * laptop within a few seconds.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  Loader2,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { chatApi, type ChatMessage, type ChatThread } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ChatPage() {
  const { user, isGuest } = useAuthStore();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [active, setActive] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("");

  const scroller = useRef<HTMLDivElement | null>(null);
  const guest = isGuest();

  /* ── Thread list ─────────────────────────────────────────────── */
  useEffect(() => {
    if (guest || !user) {
      setLoadingThreads(false);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await chatApi.threads();
        if (alive) setThreads(res.threads || []);
      } catch {
        /* keep whatever is on screen */
      } finally {
        if (alive) setLoadingThreads(false);
      }
    };
    void load();
    const id = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [user, guest]);

  /* ── Open a thread ───────────────────────────────────────────── */
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setMessages([]);
    chatApi
      .messages(active.id, 0)
      .then((res) => {
        if (!alive) return;
        setMessages(res.messages || []);
        void chatApi.markRead(active.id).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active?.id]);

  /* ── Poll the open thread ────────────────────────────────────── */
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = async () => {
      const cursor = messages.length ? messages[messages.length - 1].id : 0;
      try {
        const res = await chatApi.messages(active.id, cursor);
        if (!alive || !res.messages.length) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...res.messages.filter((m) => !seen.has(m.id))];
        });
        void chatApi.markRead(active.id).catch(() => undefined);
      } catch {
        /* transient */
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [active?.id, messages]);

  /* ── Pin to newest ───────────────────────────────────────────── */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, active?.id]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      const res = await chatApi.send(active.id, body);
      setMessages((prev) => [...prev, res.chat_message]);
      setDraft("");
      setThreads((prev) =>
        prev.map((t) =>
          t.id === active.id
            ? { ...t, last_message_preview: body.slice(0, 200), last_message_at: new Date().toISOString() }
            : t,
        ),
      );
    } catch {
      /* keep the draft */
    } finally {
      setSending(false);
    }
  };

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter(
      (t) =>
        t.peer.full_name.toLowerCase().includes(term) ||
        (t.last_message_preview || "").toLowerCase().includes(term),
    );
  }, [threads, filter]);

  /* ── Guest gate ──────────────────────────────────────────────── */
  if (guest || !user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <MessageCircle className="mx-auto h-12 w-12 text-primary/40" />
        <h1 className="mt-4 text-xl font-extrabold tracking-tight">Save your account to chat</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Guest sessions can browse and take tests. Messages need a saved account so
          people know who they are talking to — and so your replies are waiting when
          you come back.
        </p>
        <Button asChild className="mt-6">
          <Link to="/login">Save my account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-0 sm:px-6 lg:px-8">
      <div className="grid h-[calc(100vh-4rem)] overflow-hidden border-x-0 sm:h-[calc(100vh-8rem)] sm:rounded-2xl sm:border lg:grid-cols-[320px_1fr]">
        {/* ══ Thread list ═══════════════════════════════════════ */}
        <aside
          className={cn(
            "flex flex-col border-r bg-muted/20",
            active && "hidden lg:flex",
          )}
        >
          <div className="border-b px-4 py-3.5">
            <h1 className="flex items-center gap-2 text-base font-extrabold tracking-tight">
              <MessageCircle className="h-4 w-4 text-primary" />
              Messages
            </h1>
            <div className="mt-2.5 flex h-9 items-center gap-2 rounded-xl border bg-card px-2.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-[13px] outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingThreads ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-[13px] font-semibold">No conversations yet</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                  Open a course or a storefront and tap “Message” to start one.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link to="/stores">Find a seller</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActive(t)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                        active?.id === t.id ? "bg-primary/10" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[11px] font-bold text-white">
                        {t.peer.full_name?.slice(0, 1).toUpperCase() || "C"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-1.5">
                          <span className="flex min-w-0 items-center gap-1 truncate text-[13px] font-bold">
                            {t.peer.full_name}
                            {t.peer.is_verified && (
                              <ShieldCheck className="h-3 w-3 shrink-0 text-primary" />
                            )}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {timeLabel(t.last_message_at)}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-[11.5px] text-muted-foreground">
                            {t.last_message_preview || "No messages yet"}
                          </span>
                          {!!t.unread && t.unread > 0 && (
                            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                              {t.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ══ Transcript ════════════════════════════════════════ */}
        <section className={cn("flex flex-col bg-background", !active && "hidden lg:flex")}>
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b px-3 py-3 sm:px-4">
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <Link
                  to="/seller/$sellerId"
                  params={{ sellerId: String(active.peer.id) }}
                  className="flex min-w-0 items-center gap-2.5 hover:opacity-80"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[11px] font-bold text-white">
                    {active.peer.full_name?.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-[13.5px] font-bold">
                      {active.peer.full_name}
                      {active.peer.is_verified && (
                        <ShieldCheck className="h-3 w-3 text-primary" />
                      )}
                    </span>
                    <span className="block text-[11px] capitalize text-muted-foreground">
                      {active.peer.role}
                    </span>
                  </span>
                </Link>
              </header>

              <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-muted/20 px-3 py-4 sm:px-5">
                {messages.length === 0 && (
                  <p className="py-16 text-center text-xs text-muted-foreground">
                    No messages yet — say hello 👋
                  </p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.is_mine ? "justify-end" : "justify-start")}>
                    <div className="max-w-[78%]">
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm",
                          m.is_mine
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border bg-card text-foreground",
                        )}
                      >
                        {m.body}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 px-1 text-[10px] text-muted-foreground",
                          m.is_mine ? "text-right" : "text-left",
                        )}
                      >
                        {timeLabel(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-end gap-2 border-t p-2.5 sm:p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Write a message…  (Enter to send)"
                  className="max-h-32 flex-1 resize-none rounded-xl border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                />
                <Button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  className="shrink-0"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Send</span>
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
                <MessageCircle className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-lg font-extrabold tracking-tight">
                Pick a conversation
              </h2>
              <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                Messages are private between you and the other person. Nobody else on
                Cronyzo can read them.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-5">
                <Link to="/stores">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Browse stores to start one
                </Link>
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
