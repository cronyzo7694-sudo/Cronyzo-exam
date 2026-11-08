/**
 * Seller dashboard — earnings, catalogue and recent sales for the signed-in
 * creator (teacher or vendor).
 */

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeIndianRupee,
  BookOpen,
  Boxes,
  GraduationCap,
  IndianRupee,
  Package,
  Plus,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { creatorApi, shopApi } from "@/lib/commerce";
import { useAuthStore } from "@/stores/authStore";
import { EmptyState, StatPill } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SellerDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, error } = useQuery({
    queryKey: ["creator", "dashboard"],
    queryFn: () => creatorApi.dashboard(),
  });

  const { data: myProducts } = useQuery({
    queryKey: ["creator", "products"],
    queryFn: () => shopApi.products({ per_page: 100, sort: "newest" }),
  });

  const becomeCreator = useMutation({
    mutationFn: () => creatorApi.becomeCreator({ creator_type: "seller" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["creator"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          icon={Store}
          title="You need a creator account to sell"
          description="Upgrade your profile to a seller or teacher and your dashboard unlocks instantly."
          action={
            <Button
              onClick={() => becomeCreator.mutate()}
              disabled={becomeCreator.isPending}
            >
              Become a seller
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-shimmer h-9 w-56 rounded" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-20 w-full rounded-xl" />
          ))}
        </div>
        <div className="mt-6 animate-shimmer h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const earnings = data?.earnings;
  const counts = data?.counts;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary">
            <Store className="h-3.5 w-3.5" />
            Seller studio
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Namaste{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your catalogue, your students and your earnings — all here.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/sell/products/new">
              <Plus className="mr-2 h-4 w-4" />
              List product
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/sell/courses/new">
              <Plus className="mr-2 h-4 w-4" />
              New course
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/sell/books/new">
              <Plus className="mr-2 h-4 w-4" />
              List book
            </Link>
          </Button>
        </div>
      </div>

      {/* Earnings */}
      <section className="mt-8">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
                Your earnings
              </div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight">
                ₹{(earnings?.payout ?? 0).toLocaleString("en-IN")}
              </div>
              <div className="mt-1.5 text-sm text-white/80">
                {earnings?.orders ?? 0} order{earnings?.orders === 1 ? "" : "s"} ·{" "}
                {earnings?.units ?? 0} units sold
              </div>
            </div>
            <div className="grid gap-2 text-xs sm:text-right">
              <div className="rounded-xl bg-white/12 px-4 py-2.5 backdrop-blur-sm">
                <div className="text-white/70">Gross sales</div>
                <div className="text-base font-bold">
                  ₹{(earnings?.gross ?? 0).toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-xl bg-white/12 px-4 py-2.5 backdrop-blur-sm">
                <div className="text-white/70">
                  Platform fee ({earnings?.commission_percent ?? 12}%)
                </div>
                <div className="text-base font-bold">
                  −₹{(earnings?.commission ?? 0).toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Counts */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatPill
          value={counts?.courses ?? 0}
          label="Courses published"
          icon={GraduationCap}
        />
        <StatPill value={counts?.books ?? 0} label="Books listed" icon={BookOpen} />
        <StatPill value={counts?.products ?? 0} label="Products live" icon={Package} />
        <StatPill
          value={counts?.students ?? 0}
          label="Enrolled students"
          icon={Users}
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Recent sales */}
        <section className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              Recent sales
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sell/earnings">
                Full report
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {(data?.recent_sales ?? []).length === 0 ? (
            <div className="px-5 py-12 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                No sales yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Publish something and share the link — sales show up here live.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {(data?.recent_sales ?? []).map((sale, i) => (
                <div key={`${sale.order_number}-${i}`} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {sale.item_type === "course" ? (
                      <GraduationCap className="h-4 w-4" />
                    ) : sale.item_type === "book" ? (
                      <BookOpen className="h-4 w-4" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {sale.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {sale.order_number} · qty {sale.qty}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold text-foreground">
                      ₹{sale.line_total.toLocaleString("en-IN")}
                    </div>
                    <div
                      className={cn(
                        "text-[11px] font-semibold capitalize",
                        sale.status === "paid" ? "text-emerald-600" : "text-muted-foreground",
                      )}
                    >
                      {sale.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top items */}
        <section className="rounded-2xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Boxes className="h-4 w-4 text-primary" />
              Best performers
            </h2>
          </div>

          {(data?.top_items ?? []).length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nothing sold yet — your top items will appear here.
            </div>
          ) : (
            <div className="divide-y">
              {(data?.top_items ?? []).map((item) => (
                <div key={`${item.item_type}-${item.item_id}`} className="px-5 py-3.5">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {item.title}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">
                      {item.item_type} · {item.units} sold
                    </span>
                    <span className="font-bold text-emerald-600">
                      ₹{item.revenue.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Catalogue */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Your catalogue</h2>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/sell/products/new" })}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add product
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(counts?.courses ?? 0) > 0 && (
            <Link
              to="/sell/courses"
              className="group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">
                  {counts?.courses} course{counts?.courses === 1 ? "" : "s"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {counts?.published_courses} published
                </div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          )}

          {(counts?.books ?? 0) > 0 && (
            <Link
              to="/sell/books"
              className="group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">
                  {counts?.books} book{counts?.books === 1 ? "" : "s"}
                </div>
                <div className="text-xs text-muted-foreground">listed for sale</div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          )}

          <Link
            to="/sell/products"
            className="group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground">
                {counts?.products} product{counts?.products === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-muted-foreground">in your catalogue</div>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* Payout note */}
      <section className="mt-8 flex items-start gap-4 rounded-2xl border bg-muted/25 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BadgeIndianRupee className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">
            How payouts work
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Cronyzo takes a flat {earnings?.commission_percent ?? 12}% platform fee on
            every sale — the rest is yours. Weekly payouts to your bank account
            start as soon as your first sale clears.
          </p>
        </div>
      </section>
    </div>
  );
}
