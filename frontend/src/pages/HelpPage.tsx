/**
 * Help & support, plus the standalone contact form (`/contact`).
 *
 * Why a page AND the floating widget: the widget is for a quick question while
 * browsing; this page is for someone who searched "cronyzo customer care" and
 * wants proof there is a human behind it. Both post to the same endpoint, so a
 * message sent here also lands on the operator's Telegram.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Send,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { contactApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useSetting } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOPICS = [
  {
    value: "order",
    label: "Order or delivery",
    icon: Truck,
    blurb: "Tracking, delays, wrong or damaged item",
  },
  {
    value: "course",
    label: "Course access",
    icon: GraduationCap,
    blurb: "Can't open a lesson, live class or certificate",
  },
  {
    value: "book",
    label: "Book or e-book",
    icon: BookOpen,
    blurb: "PDF download, free sample, print edition",
  },
  {
    value: "seller",
    label: "Becoming a seller",
    icon: Store,
    blurb: "Payouts, verification, catalogue review",
  },
  {
    value: "payment",
    label: "Payment or refund",
    icon: CreditCard,
    blurb: "Failed payment, duplicate charge, refund status",
  },
  {
    value: "general",
    label: "Something else",
    icon: MessageCircle,
    blurb: "Anything not covered above",
  },
] as const;

const FAQ = [
  {
    q: "Do I need an account to take a test?",
    a: "No. Tap “Continue as guest” and you can sit a full mock exam immediately. Your attempt, answers and score are saved to your guest session — and when you add an email and password later, everything moves into that account with you.",
  },
  {
    q: "Can a guest buy something?",
    a: "Not while we are in testing. Guests can add to cart and see totals, but checkout asks you to save the account first. Nothing is lost — the cart is already tied to your session row.",
  },
  {
    q: "How do I download my e-book?",
    a: "Open the book page. If it is free to download, the “Download PDF” button is there for everyone. If it is paid, the same button appears after your order is marked paid. Sellers can also attach a free sample that anybody can read.",
  },
  {
    q: "How do teachers run live classes?",
    a: "From the course studio: pick a date, paste a YouTube Live (or Zoom/Meet) link, and students who own the course see a “Join” button when it starts. The link is never exposed to people who haven't enrolled.",
  },
  {
    q: "How much does Cronyzo keep?",
    a: "12% of each marketplace sale. Sellers keep 88%, and the split is shown on the earnings dashboard before anything is published.",
  },
  {
    q: "How fast do you reply?",
    a: "Messages reach our phone instantly, so usually within a few hours during the day. Include your order number or course name to get a faster answer.",
  },
];

export function HelpPage() {
  const supportEmail = useSetting<string>("support.email", "cronyzo7694@gmail.com");
  const telegramHandle = useSetting<string>("support.telegram", "");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <Link to="/" className="text-xs font-semibold text-muted-foreground hover:text-primary">
        ← Back to home
      </Link>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Help &amp; Support
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Real people read every message. Pick a topic below, or write to us directly —
        it reaches our phone the moment you hit send.
      </p>

      {/* Topics */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOPICS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.value}
              to="/contact"
              search={{ topic: t.value } as any}
              className="group rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-[13.5px] font-bold text-foreground">{t.label}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {t.blurb}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Direct lines */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <a
          href={`mailto:${supportEmail}`}
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Mail className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[13px] font-bold">Email us</span>
            <span className="block text-[12px] text-muted-foreground">{supportEmail}</span>
          </span>
        </a>
        <Link
          to="/contact"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[13px] font-bold">Send a message</span>
            <span className="block text-[12px] text-muted-foreground">
              {telegramHandle ? `or find us on Telegram ${telegramHandle}` : "Goes straight to our team"}
            </span>
          </span>
        </Link>
      </div>

      {/* FAQ */}
      <h2 className="mt-12 text-xl font-extrabold tracking-tight">Common questions</h2>
      <div className="mt-4 divide-y rounded-2xl border bg-card">
        {FAQ.map((item, i) => (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              aria-expanded={openFaq === i}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
            >
              <span className="text-[13.5px] font-bold text-foreground">{item.q}</span>
              <span
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform",
                  openFaq === i && "rotate-45",
                )}
              >
                +
              </span>
            </button>
            {openFaq === i && (
              <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Still stuck?{" "}
        <Link to="/contact" className="font-semibold text-primary hover:underline">
          Write to us
        </Link>{" "}
        — we answer every message.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Contact form
   ═══════════════════════════════════════════════════════════ */

export function ContactPage({ initialTopic }: { initialTopic?: string }) {
  const { user } = useAuthStore();
  const supportEmail = useSetting<string>("support.email", "cronyzo7694@gmail.com");

  const [topic, setTopic] = useState(initialTopic || "general");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [result, setResult] = useState<{ ticket?: number; telegram?: boolean; error?: string }>({});
  const [telegramOn, setTelegramOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    setName((n) => n || user?.full_name || "");
    setContact((c) => c || user?.email || user?.phone || "");
  }, [user]);

  useEffect(() => {
    contactApi
      .config()
      .then((cfg) => setTelegramOn(cfg.telegram_configured))
      .catch(() => setTelegramOn(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !name.trim() || !contact.trim()) return;
    setState("sending");
    try {
      const isEmail = contact.includes("@");
      const res = await contactApi.submit({
        name: name.trim(),
        email: isEmail ? contact.trim() : undefined,
        phone: isEmail ? undefined : contact.trim(),
        topic,
        message: message.trim(),
      });
      setResult({ ticket: res.ticket_id, telegram: res.telegram_sent });
      setState("done");
      setMessage("");
    } catch (err: any) {
      setResult({ error: err?.message || "Could not send your message" });
      setState("error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:px-8">
      <Link to="/help" className="text-xs font-semibold text-muted-foreground hover:text-primary">
        ← Help centre
      </Link>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Contact us</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Tell us what is going on. Include an order number or course name if you have
        one — it makes the first reply useful instead of a question.
      </p>

      {state === "done" ? (
        <div className="mt-8 rounded-2xl border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-500" />
          <h2 className="mt-3 text-lg font-extrabold">Message received</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Your ticket is <span className="font-bold text-foreground">#{result.ticket}</span>.
            {result.telegram
              ? " It has already reached our team's phone."
              : " We will reply to the contact details you gave."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setState("idle")}>
              Send another
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              What is this about?
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TOPICS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTopic(t.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11.5px] font-semibold transition-colors",
                      topic === t.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:border-primary/40",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Your name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary/50"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Email or phone
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary/50"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              How can we help?
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
              placeholder="Tell us what happened, and what you expected."
              required
            />
          </div>

          {state === "error" && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {result.error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={state === "sending" || !message.trim()}>
              {state === "sending" ? (
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
            <span className="text-[11px] text-muted-foreground">
              {telegramOn === false
                ? "Saved to our inbox — we reply by email or phone."
                : telegramOn
                  ? "Delivered straight to our team's Telegram."
                  : `Or email ${supportEmail}`}
            </span>
          </div>
        </form>
      )}

      <div className="mt-6 flex items-center gap-2 rounded-xl border bg-muted/30 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        <Package className="h-3.5 w-3.5 shrink-0" />
        For order issues, add your order number (it starts with CZ-) so we can look it
        up immediately.
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-xl border bg-muted/30 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        Sellers and teachers: mention your store or course name and we will open it
        while we read.
      </div>
    </div>
  );
}
