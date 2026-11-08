/**
 * Admin → Support inbox.
 *
 * Every help message a visitor sends, with the Telegram delivery state so the
 * operator can tell at a glance whether it reached their phone. Replies are
 * stored and shown to the visitor in-app.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Mail, MessageSquare, Phone, Send, AlertTriangle } from "lucide-react";
import { contactApi, type ContactTicket } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOPIC_LABEL: Record<string, string> = {
  general: "General",
  order: "Order / delivery",
  course: "Course access",
  book: "Book / e-book",
  seller: "Becoming a seller",
  payment: "Payment / refund",
  bug: "Bug report",
};

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function SupportInboxPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "answered" | "">("");
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tickets", filter],
    queryFn: () => contactApi.adminTickets(filter || undefined),
    refetchInterval: 20000,
  });

  const tickets: ContactTicket[] = data?.tickets ?? [];

  const sendReply = async (ticketId: number) => {
    const body = replyText.trim();
    if (!body) return;
    setBusy(true);
    try {
      await contactApi.adminReply(ticketId, body);
      setReplyText("");
      setReplyFor(null);
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Support inbox</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {data?.open ?? 0} open · messages also land on Telegram when configured
          </p>
        </div>
        <div className="flex gap-1.5 rounded-xl border bg-muted/30 p-1">
          {(
            [
              { key: "", label: "All" },
              { key: "open", label: "Open" },
              { key: "answered", label: "Answered" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key as any)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors",
                filter === f.key
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="py-16 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-[13px] font-semibold">Nothing here yet</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Messages from the chat widget and the contact page appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
                    {t.name}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {TOPIC_LABEL[t.topic] || t.topic}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">#{t.id}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
                    {t.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {t.email}
                      </span>
                    )}
                    {t.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {t.phone}
                      </span>
                    )}
                    <span>{when(t.created_at)}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {t.telegram_sent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Telegram
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Not sent
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      t.status === "open"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.status}
                  </span>
                </div>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">
                {t.message}
              </p>

              {t.replies.length > 0 && (
                <div className="mt-3 space-y-1.5 border-l-2 border-primary/30 pl-3">
                  {t.replies.map((r) => (
                    <p key={r.id} className="text-[12.5px] leading-relaxed text-muted-foreground">
                      <span className="font-bold text-foreground">
                        {r.channel === "telegram_shop"
                          ? "You (Shop bot)"
                          : r.channel === "telegram"
                            ? "You (Telegram)"
                            : "You"}:
                      </span>{" "}
                      {r.body}
                      {(r.channel === "telegram" || r.channel === "telegram_shop") && (
                        <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                          phone
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {replyFor === t.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="Write the reply the visitor will see…"
                    className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void sendReply(t.id)} disabled={busy || !replyText.trim()}>
                      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      Send reply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setReplyFor(null); setReplyText(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => { setReplyFor(t.id); setReplyText(""); }}
                >
                  Reply
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
