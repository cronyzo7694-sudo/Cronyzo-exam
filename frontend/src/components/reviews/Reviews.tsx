/**
 * Review UI — write one, read them all.
 *
 * One component family for both places reviews appear: a book listing and the
 * site itself (the landing page's "Loved by learners and sellers" wall). Only
 * real, signed-in people can post; every review can be edited by its author,
 * and the admin can hide or delete any of them.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Loader2, MessageSquare, Pencil, Star } from "lucide-react";
import { reviewsApi, type Review } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { StarPicker, StarRating } from "@/components/reviews/StarRating";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return (name || "C")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function ago(iso: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function ReviewCard({ review, compact }: { review: Review; compact?: boolean }) {
  const name = review.user?.full_name || "Cronyzo user";
  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4",
        compact ? "sm:p-4" : "sm:p-5",
      )}
    >
      <StarRating value={review.rating} size="sm" />
      {review.title && (
        <p className="mt-2 text-[13px] font-bold leading-snug">{review.title}</p>
      )}
      <blockquote className="mt-1.5 flex-1 text-[13px] leading-relaxed text-foreground/80">
        “{review.body}”
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-2.5">
        {review.user?.avatar_url ? (
          <img
            src={review.user.avatar_url}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
            {initials(name)}
          </span>
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[12.5px] font-bold">
            <span className="truncate">{name}</span>
            {review.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {review.user?.role ? `${review.user.role} · ` : ""}
            {ago(review.created_at)}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

type Target = { type: "site"; id?: undefined } | { type: "book"; id: number };

export function ReviewForm({
  target,
  onSaved,
  className,
}: {
  target: Target;
  onSaved?: () => void;
  className?: string;
}) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mine = useQuery({
    queryKey: ["my-review", target.type, target.id ?? "site", user?.id],
    queryFn: () => reviewsApi.mine(target.type, target.id),
    enabled: Boolean(user),
  });

  const existing = mine.data?.items?.[0];

  useEffect(() => {
    if (existing) {
      setRating(existing.rating || 5);
      setTitle(existing.title || "");
      setBody(existing.body || "");
    }
  }, [existing?.id, existing?.rating, existing?.title, existing?.body]);

  const save = useMutation({
    mutationFn: () =>
      target.type === "site"
        ? reviewsApi.writeSite({ rating, title: title || undefined, body })
        : reviewsApi.writeBook(target.id as number, {
            rating,
            title: title || undefined,
            body,
          }),
    onSuccess: (res) => {
      setMsg({ ok: true, text: res.message });
      qc.invalidateQueries({ queryKey: ["site-reviews"] });
      qc.invalidateQueries({ queryKey: ["book-reviews", target.id] });
      qc.invalidateQueries({ queryKey: ["my-review"] });
      qc.invalidateQueries({ queryKey: ["book", "detail"] });
      onSaved?.();
    },
    onError: (err: any) => setMsg({ ok: false, text: err?.message || "Could not save your review" }),
  });

  if (!user) {
    return (
      <div className={cn("rounded-2xl border border-dashed bg-muted/20 p-4 text-center", className)}>
        <p className="text-[13px] font-bold">Sign in to write a review</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Only real accounts can rate — that is why the ratings here mean something.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button asChild size="sm" className="rounded-xl">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-xl">
            <Link to="/register">Create account</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={cn("rounded-2xl border bg-card p-4", className)}
      onSubmit={(event) => {
        event.preventDefault();
        setMsg(null);
        save.mutate();
      }}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-bold">
        {existing ? <Pencil className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
        {existing ? "Edit your review" : target.type === "site" ? "Write a review about Cronyzo" : "Rate this book"}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <StarPicker value={rating} onChange={setRating} size="sm" />
        <span className="text-[11.5px] font-semibold text-muted-foreground">{rating} / 5</span>
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="One line (optional) — e.g. “Exactly what I needed”"
        className="mt-3 h-9 w-full rounded-xl border bg-card px-3 text-[12.5px] outline-none focus:border-primary/60"
      />
      <textarea
        required
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          target.type === "site"
            ? "What worked for you? Your words show up on the home page."
            : "How was the content, the quality, the value for money?"
        }
        className="mt-2 w-full rounded-xl border bg-card px-3 py-2 text-[12.5px] outline-none focus:border-primary/60"
      />

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" className="rounded-xl" disabled={save.isPending}>
          {save.isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : existing ? (
            "Update review"
          ) : (
            "Post review"
          )}
        </Button>
        {msg && (
          <span
            className={cn(
              "text-[11.5px] font-semibold",
              msg.ok ? "text-emerald-600" : "text-destructive",
            )}
          >
            {msg.text}
          </span>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">
        Reviews are public. The operator can hide or remove anything abusive — editing yours puts it
        back.
      </p>
    </form>
  );
}

/** Rating summary bars — 5★→1★ with counts. */
export function ReviewSummaryBar({
  summary,
}: {
  summary: { average: number; count: number; buckets: Record<string, number> };
}) {
  const total = Math.max(1, summary.count);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="text-center sm:text-left">
        <p className="text-3xl font-extrabold leading-none">{(summary.average || 0).toFixed(1)}</p>
        <div className="mt-1 flex justify-center sm:justify-start">
          <StarRating value={summary.average} size="sm" />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {summary.count} review{summary.count === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex-1 space-y-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.buckets?.[String(star)] ?? 0;
          return (
            <div key={star} className="flex items-center gap-2">
              <span className="flex w-8 items-center gap-0.5 text-[10.5px] font-semibold text-muted-foreground">
                {star}
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.round((count / total) * 100)}%` }}
                />
              </span>
              <span className="w-6 text-right text-[10.5px] text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
