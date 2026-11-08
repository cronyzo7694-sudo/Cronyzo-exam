/**
 * Floating chat + support widget.
 *
 * Two things live behind the same bubble:
 *
 * **Chat** (signed-in members)
 *   Real conversations with teachers and sellers. The thread list is polled
 *   only while the panel is open, so a closed widget costs nothing.
 *
 * **Help** (everyone, including guests)
 *   A short form. The message is stored server-side and mirrored to the
 *   operator's Telegram, so it is read on a phone within seconds — that is the
 *   "massage sidha telegram par hi ayega" behaviour. The visitor gets a ticket
 *   number they can quote back.
 *
 * The bubble is hidden on the two routes where it would cover something
 * important: the exam player and the checkout.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageCircle, Send, X, CheckCircle2 } from "lucide-react";
import { chatApi, contactApi, type ChatMessage, type ChatThread } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useSite } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HIDE_ON = ["/play/", "/checkout"];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "help">("help");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);

  // help form
  const [helpName, setHelpName] = useState("");
  const [helpContact, setHelpContact] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [helpTopic, setHelpTopic] = useState("general");
  const [helpState, setHelpState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [helpResult, setHelpResult] = useState<{ ticket?: number; error?: string; telegram?: boolean }>({});
  const [supportEmail, setSupportEmail] = useState("cronyzo7694@gmail.com");

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isGuest, initialized } = useAuthStore();
  const { content } = useSite();
  const canChat = Boolean(user) && !isGuest();
  const scroller = useRef<HTMLDivElement | null>(null);

  const title =
    (content.settings?.["chat.title"] as string) || "Talk to a real human";
  const subtitle =
    (content.settings?.["chat.subtitle"] as string) ||
    "Ask about a course, an order or becoming a seller. We reply fast.";

  /* ── Default the help form to the signed-in identity ─────────────── */
  useEffect(() => {
    if (!open) return;
    setHelpName((n) => n || user?.full_name || "");
    setHelpContact((c) => c || user?.email || user?.phone || "");
  }, [open, user]);

  /* ── Unread badge (only when signed in) ──────────────────────────── */
  useEffect(() => {
    if (!initialized || !canChat) {
      setUnread(0);
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const res = await chatApi.unread();
        if (alive) setUnread(res.unread || 0);
      } catch {
        /* badge is decorative — ignore */
      }
    };
    void poll();
    const id = window.setInterval(poll, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [initialized, canChat]);

  /* ── Load threads when chat tab opens ────────────────────────────── */
  useEffect(() => {
    if (!open || tab !== "chat" || !canChat) return;
    let alive = true;
    chatApi
      .threads()
      .then((res) => {
        if (alive) setThreads(res.threads || []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, tab, canChat]);

  /* ── Long-poll the open thread ───────────────────────────────────── */
  useEffect(() => {
    if (!open || !activeThread) return;
    let alive = true;
    let cursor = messages.length ? messages[messages.length - 1].id : 0;

    const tick = async () => {
      try {
        const res = await chatApi.messages(activeThread.id, cursor);
        if (!alive) return;
        if (res.messages.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...res.messages.filter((m) => !seen.has(m.id))];
          });
          cursor = res.cursor;
          void chatApi.markRead(activeThread.id).catch(() => undefined);
        }
      } catch {
        /* transient — retry on the next tick */
      }
    };

    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeThread?.id]);

  /* ── Keep the transcript pinned to the newest message ────────────── */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const openThread = async (thread: ChatThread) => {
    setActiveThread(thread);
    setMessages([]);
    try {
      const res = await chatApi.messages(thread.id, 0);
      setMessages(res.messages || []);
      await chatApi.markRead(thread.id);
    } catch {
      /* show the empty state */
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeThread) return;
    setBusy(true);
    try {
      const res = await chatApi.send(activeThread.id, body);
      setMessages((prev) => [...prev, res.chat_message]);
      setDraft("");
    } catch {
      /* keep the draft so nothing is lost */
    } finally {
      setBusy(false);
    }
  };

  const submitHelp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpMessage.trim()) return;
    setHelpState("sending");
    try {
      const isEmail = helpContact.includes("@");
      const res = await contactApi.submit({
        name: helpName.trim() || undefined,
        email: isEmail ? helpContact.trim() : undefined,
        phone: isEmail ? undefined : helpContact.trim() || undefined,
        topic: helpTopic,
        message: helpMessage.trim(),
      });
      setHelpResult({ ticket: res.ticket_id, telegram: res.telegram_sent });
      setHelpState("done");
      setHelpMessage("");
    } catch (err: any) {
      setHelpResult({ error: err?.message || "Could not send your message" });
      setHelpState("error");
    }
  };

  // Learn the operator's support email for the fallback line
  useEffect(() => {
    contactApi
      .config()
      .then(() => undefined)
      .catch(() => undefined);
  }, []);

  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* ══ Bubble ══════════════════════════════════════════════ */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[76px] right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30 transition-transform hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6 lg:h-14 lg:w-14"
          aria-label="Chat with Cronyzo"
        >
          <MessageCircle className="h-5 w-5 lg:h-6 lg:w-6" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* ══ Panel ═══════════════════════════════════════════════ */}
      {open && (
        <div
          className={cn(
            "cz-pop fixed inset-x-0 bottom-0 z-[70] flex flex-col overflow-hidden border bg-background shadow-2xl",
            "h-[80vh] rounded-t-3xl",
            "sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[400px] sm:rounded-3xl",
          )}
          role="dialog"
          aria-label="Chat and support"
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 px-4 py-3.5">
            {activeThread ? (
              <button
                type="button"
                onClick={() => {
                  setActiveThread(null);
                  setMessages([]);
                }}
                className="mt-0.5 rounded-lg p-1 text-muted-foreground hover:text-foreground"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                {activeThread ? activeThread.peer.full_name : title}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {activeThread ? "Usually replies within a few hours" : subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs (only when there is something to switch between) */}
          {canChat && !activeThread && (
            <div className="flex border-b">
              {(
                [
                  { key: "help", label: "Get help" },
                  { key: "chat", label: "Messages" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative flex-1 py-2.5 text-xs font-bold transition-colors",
                    tab === t.key
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.key === "chat" && unread > 0 && (
                    <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
                      {unread}
                    </span>
                  )}
                  {tab === t.key && (
                    <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Chat tab ───────────────────────────────────────── */}
          {canChat && tab === "chat" ? (
            activeThread ? (
              <>
                <div
                  ref={scroller}
                  className="flex-1 space-y-2.5 overflow-y-auto bg-muted/25 px-3 py-3"
                >
                  {messages.length === 0 && (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      No messages yet — say hello 👋
                    </p>
                  )}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        m.is_mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm",
                          m.is_mine
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-card text-foreground",
                        )}
                      >
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-2 border-t p-2.5">
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
                    placeholder="Write a message…"
                    className="max-h-24 flex-1 resize-none rounded-xl border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void send()}
                    disabled={busy || !draft.trim()}
                    aria-label="Send message"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-3">
                {threads.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      No conversations yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Open a course or a storefront and tap “Message” to start one.
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-4">
                      <Link to="/stores" onClick={() => setOpen(false)}>
                        Browse stores
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {threads.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => void openThread(t)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
                            {t.peer.full_name?.slice(0, 1).toUpperCase() || "C"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-semibold">
                                {t.peer.full_name}
                              </span>
                              {!!t.unread && t.unread > 0 && (
                                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                                  {t.unread}
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {t.last_message_preview || "No messages yet"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          ) : (
            /* ── Help tab ─────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4">
              {helpState === "done" ? (
                <div className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <p className="mt-3 text-sm font-bold text-foreground">
                    Message received
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Your ticket is{" "}
                    <span className="font-bold text-foreground">
                      #{helpResult.ticket}
                    </span>
                    . We reply by email or phone
                    {helpResult.telegram
                      ? " — and it just reached our phone."
                      : "."}
                  </p>
                  <div className="mt-5 space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setHelpState("idle")}
                    >
                      Send another message
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="w-full">
                      <Link to="/help" onClick={() => setOpen(false)}>
                        See all help topics
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitHelp} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Topic
                    </label>
                    <select
                      value={helpTopic}
                      onChange={(e) => setHelpTopic(e.target.value)}
                      className="h-9 w-full rounded-xl border bg-card px-2.5 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="general">General question</option>
                      <option value="order">Order or delivery</option>
                      <option value="course">Course access</option>
                      <option value="book">Book or e-book</option>
                      <option value="seller">Becoming a seller</option>
                      <option value="payment">Payment or refund</option>
                      <option value="bug">Something is broken</option>
                    </select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={helpName}
                      onChange={(e) => setHelpName(e.target.value)}
                      placeholder="Your name"
                      className="h-9 rounded-xl border bg-card px-2.5 text-sm outline-none focus:border-primary/50"
                      required
                    />
                    <input
                      value={helpContact}
                      onChange={(e) => setHelpContact(e.target.value)}
                      placeholder="Email or phone"
                      className="h-9 rounded-xl border bg-card px-2.5 text-sm outline-none focus:border-primary/50"
                      required
                    />
                  </div>

                  <textarea
                    value={helpMessage}
                    onChange={(e) => setHelpMessage(e.target.value)}
                    placeholder="How can we help?"
                    rows={4}
                    className="w-full resize-none rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                    required
                  />

                  {helpState === "error" && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-[11.5px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
                      {helpResult.error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={helpState === "sending" || !helpMessage.trim()}
                  >
                    {helpState === "sending" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send message
                      </>
                    )}
                  </Button>

                  <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground">
                    Goes straight to our team. Or email{" "}
                    <a
                      href={`mailto:${supportEmail}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {supportEmail}
                    </a>
                  </p>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
