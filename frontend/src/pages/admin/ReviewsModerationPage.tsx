/**
 * Reviews moderation — hide, un-hide or delete anything a member posted.
 *
 * Hiding keeps the text (in case it was a mistake) and removes it from the
 * public wall and from every average; deleting is permanent. Both are one tap
 * here, so spam never survives a day on the site.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ShieldCheck, Star, Trash2 } from "lucide-react";
import { reviewsApi, type Review } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "", label: "All" },
  { key: "site", label: "Site reviews" },
  { key: "book", label: "Book reviews" },
] as const;

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "h-3 w-3",
            index < value ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

export function ReviewsModerationPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"" | "site" | "book">("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["admin-reviews", tab],
    queryFn: () => reviewsApi.adminList(tab || undefined),
  });

  const toggle = useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) =>
      reviewsApi.adminSetHidden(id, hidden),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-reviews"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => reviewsApi.adminDelete(id),
    onSuccess: () => {
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["site-reviews"] });
    },
  });

  const items: Review[] = list.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Reviews</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Everything members wrote, on the site and on books. Hide keeps it (and removes it from the
          averages); delete removes it for good.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
              tab === item.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {list.data?.total ?? 0} total · {list.data?.hidden ?? 0} hidden
        </span>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-[13px] font-bold">Nothing to moderate yet</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Reviews appear here the moment a member posts one.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((review) => (
            <li
              key={review.id}
              className={cn(
                "rounded-2xl border bg-card p-3.5",
                review.is_hidden && "border-dashed opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-bold">{review.user.full_name}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {review.target_type === "site" ? "site" : review.book_title || `book #${review.target_id}`}
                    </span>
                    <Stars value={review.rating} />
                    {review.is_hidden && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        HIDDEN
                      </span>
                    )}
                  </div>
                  {review.title && (
                    <p className="mt-1 text-[12.5px] font-semibold">{review.title}</p>
                  )}
                  <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">{review.body}</p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    {review.user.email || "—"} ·{" "}
                    {review.created_at ? new Date(review.created_at).toLocaleString("en-IN") : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg px-2 text-[11px]"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: review.id, hidden: !review.is_hidden })}
                  >
                    {review.is_hidden ? (
                      <>
                        <Eye className="mr-1 h-3 w-3" /> Show
                      </>
                    ) : (
                      <>
                        <EyeOff className="mr-1 h-3 w-3" /> Hide
                      </>
                    )}
                  </Button>
                  {confirmId === review.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 rounded-lg px-2 text-[11px]"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(review.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-lg px-2 text-[11px]"
                        onClick={() => setConfirmId(null)}
                      >
                        No
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-lg px-2 text-[11px] text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmId(review.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
