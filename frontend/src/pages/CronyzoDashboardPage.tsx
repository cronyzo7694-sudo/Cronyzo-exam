/**
 * The Cronyzo dashboard.
 *
 * This is the home a signed-in person lands on. It is built from the four things
 * the platform actually sells — courses, books, gear and mock tests — using only
 * real rows from the API:
 *
 *   • Continue learning      enrolled courses with real progress
 *   • Your basket            live cart with a working checkout link
 *   • Recent orders          last three orders and their status
 *   • Recommended            featured catalogue (hidden while empty)
 *   • Mock tests             a real entry point into the exam engine
 *
 * A guest sees exactly the same page. The only difference is a "keep what you
 * did" card and the fact that checkout refuses guests (server-side, by design).
 *
 * Nothing here is a placeholder: every card collapses when its list is empty,
 * so a brand-new account never sees a wall of zeros.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  LayoutGrid,
  PlayCircle,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  UserRound,
  Zap,
} from "lucide-react";
import { learningApi, ordersApi, type Enrollment, type Order } from "@/lib/commerce";
import { siteApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { cn } from "@/lib/utils";

const money = (value: unknown) => {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

function SectionHeading({
  title,
  linkTo,
  linkLabel = "View all",
  icon: Icon,
}: {
  title: string;
  linkTo?: string;
  linkLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      {linkTo && (
        <Link
          to={linkTo as any}
          className="inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
        >
          {linkLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export function CronyzoDashboardPage() {
  const { user, isGuest } = useAuthStore();
  const cart = useCartStore();

  const learning = useQuery({
    queryKey: ["dashboard", "learning"],
    queryFn: () => learningApi.myCourses(),
    staleTime: 60_000,
  });

  const orders = useQuery({
    queryKey: ["dashboard", "orders"],
    queryFn: () => ordersApi.mine(),
    staleTime: 60_000,
  });

  const featured = useQuery({
    queryKey: ["dashboard", "featured"],
    queryFn: () => siteApi.featured(4),
    staleTime: 5 * 60_000,
  });

  const courseList = (learning.data?.items || []) as Enrollment[];
  const activeCourses = courseList.filter((e) => !e.is_completed);
  const orderList = (orders.data?.items || []) as Order[];
  const guest = user?.is_guest || user?.role === "guest" || isGuest();
  const firstName = (user?.full_name || "there").split(" ")[0];

  const cartCount = cart.totals?.item_count ?? cart.items.length ?? 0;
  const cartTotal = cart.totals?.total ?? 0;

  const rec = featured.data || { courses: [], books: [], products: [] };
  const hasRecommended =
    (rec.courses?.length || 0) + (rec.books?.length || 0) + (rec.products?.length || 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      {/* ══ Test-first CTA ═════════════════════════════════════════════════
          Most people come here to sit a test, so the fastest path to one sits
          above everything else — on the phone it is the first thing under the
          greeting. */}
      <section className="mb-4 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-extrabold leading-tight">Test dena shuru karo</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              Live mock tests, full-length papers aur aapke attempts — ek tap me.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Link
              to="/exams"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground shadow-sm transition hover:brightness-110 sm:flex-none"
            >
              <Zap className="h-4 w-4" />
              Take a test
            </Link>
            <Link
              to="/attempts"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-[13px] font-bold transition hover:bg-muted sm:flex-none"
            >
              My attempts
            </Link>
          </div>
        </div>
      </section>

      {/* ══ Welcome ══════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-50 via-violet-50 to-white p-6 dark:from-indigo-950/40 dark:via-violet-950/20 dark:to-background sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              <UserRound className="h-3.5 w-3.5" />
              {guest ? "Guest session" : user?.role === "admin" ? "Admin" : user?.role}
            </p>
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
              {greeting()}, {firstName} 👋
            </h1>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
              Courses, books, study gear and mock tests — all in one account.
              {guest && " You're browsing as a guest, so your cart is saved on this device."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/courses"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-sm transition hover:brightness-110"
              >
                <GraduationCap className="h-4 w-4" />
                Browse courses
              </Link>
              <Link
                to="/exams"
                className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2 text-[13px] font-bold text-foreground transition hover:bg-muted"
              >
                <ClipboardList className="h-4 w-4" />
                Take a mock test
              </Link>
              <Link
                to="/shop"
                className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2 text-[13px] font-bold text-foreground transition hover:bg-muted"
              >
                <ShoppingBag className="h-4 w-4" />
                Shop gear
              </Link>
            </div>
          </div>

          {/* Live snapshot */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Courses", value: activeCourses.length, icon: PlayCircle },
              { label: "In basket", value: cartCount, icon: ShoppingBag },
              { label: "Orders", value: orderList.length, icon: Receipt },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border bg-card/80 px-3 py-3 text-center backdrop-blur-sm"
              >
                <item.icon className="mx-auto h-4 w-4 text-primary/70" />
                <p className="mt-1.5 text-xl font-extrabold leading-none">{item.value}</p>
                <p className="mt-1 text-[10.5px] font-semibold text-muted-foreground">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Guest: keep your work ════════════════════════════════════════ */}
      {guest && (
        <section className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
            Save your progress and unlock buying — it stays the same account, nothing is lost.
          </p>
          <Link
            to="/login"
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white hover:brightness-110"
          >
            Keep this account
            <ArrowRight className="h-3 w-3" />
          </Link>
        </section>
      )}

      {/* ══ Continue learning ════════════════════════════════════════════ */}
      {activeCourses.length > 0 && (
        <section className="mt-8">
          <SectionHeading
            title="Continue learning"
            linkTo="/my-courses"
            icon={PlayCircle}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeCourses.slice(0, 3).map((e) => {
              const course = e.course;
              const pct = Math.round(Number(e.progress || 0));
              return (
                <Link
                  key={e.id}
                  to="/courses/$slug"
                  params={{ slug: course?.slug || "" }}
                  className="group flex gap-3 rounded-2xl border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/5"
                >
                  <img
                    src={course?.thumbnail_url || ""}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-bold leading-snug">
                      {course?.title || "Course"}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {course?.teacher?.full_name || course?.teacher_name || "Cronyzo"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                        />
                      </div>
                      <span className="text-[10.5px] font-bold text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ══ Basket ═══════════════════════════════════════════════════════ */}
      {cartCount > 0 && (
        <section className="mt-8">
          <SectionHeading title="Your basket" linkTo="/cart" linkLabel="Open cart" icon={ShoppingBag} />
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold">
                {cartCount} item{cartCount === 1 ? "" : "s"} waiting
              </p>
              <p className="text-[12px] text-muted-foreground">
                Total {money(cartTotal)} — free shipping over ₹999
              </p>
            </div>
            <Link
              to="/checkout"
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground hover:brightness-110"
            >
              Checkout
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* ══ Recent orders ════════════════════════════════════════════════ */}
      {orderList.length > 0 && (
        <section className="mt-8">
          <SectionHeading title="Recent orders" linkTo="/orders" icon={Receipt} />
          <div className="overflow-hidden rounded-2xl border bg-card">
            {orderList.slice(0, 3).map((o, i) => (
              <div
                key={o.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <span className="rounded-lg bg-muted px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                  {o.status}
                </span>
                <p className="text-[13px] font-bold">{o.order_number}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {o.items?.length || 0} item{o.items?.length === 1 ? "" : "s"}
                  {o.placed_at ? ` · ${new Date(o.placed_at).toLocaleDateString("en-IN")}` : ""}
                </p>
                <p className="ml-auto text-[13px] font-extrabold">{money(o.total)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══ Recommended ══════════════════════════════════════════════════ */}
      {hasRecommended && (
        <section className="mt-8">
          <SectionHeading title="Recommended for you" linkTo="/courses" icon={LayoutGrid} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ...(rec.courses || []).slice(0, 2).map((c: any) => ({
                key: `c${c.id}`,
                title: c.title,
                sub: c.teacher?.full_name || "Course",
                price: c.is_free ? "Free" : money(c.price),
                image: c.thumbnail_url,
                to: "/courses/$slug",
                slug: c.slug,
                tag: "Course",
              })),
              ...(rec.books || []).slice(0, 1).map((b: any) => ({
                key: `b${b.id}`,
                title: b.title,
                sub: b.author || "Book",
                price: b.is_free_download ? "Free PDF" : money(b.price),
                image: b.cover_url,
                to: "/books/$slug",
                slug: b.slug,
                tag: "Book",
              })),
              ...(rec.products || []).slice(0, 1).map((p: any) => ({
                key: `p${p.id}`,
                title: p.name,
                sub: p.store_name || "Store",
                price: money(p.price),
                image: p.image_url,
                to: "/shop/$slug",
                slug: p.slug,
                tag: "Gear",
              })),
            ].map((item) => (
              <Link
                key={item.key}
                to={item.to as any}
                params={{ slug: item.slug } as any}
                className="group overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/5"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white backdrop-blur">
                    {item.tag}
                  </span>
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-[12.5px] font-bold leading-snug">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.sub}
                  </p>
                  <p className="mt-1.5 text-[13px] font-extrabold text-primary">{item.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ══ Shortcuts ════════════════════════════════════════════════════ */}
      <section className="mt-8">
        <SectionHeading title="Jump to" icon={Boxes} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { to: "/exams", label: "Mock tests", icon: ClipboardList },
            { to: "/my-courses", label: "My learning", icon: PlayCircle },
            { to: "/books", label: "Books & PDFs", icon: BookOpen },
            { to: "/stores", label: "Stores", icon: Store },
            { to: "/attempts", label: "My attempts", icon: TrendingUp },
            { to: "/sell", label: "Start selling", icon: Boxes },
          ].map((s) => (
            <Link
              key={s.to}
              to={s.to as any}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-[11.5px] font-bold leading-tight">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ Search nudge ═════════════════════════════════════════════════ */}
      <section className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <p className="text-[12.5px] font-semibold text-muted-foreground">
          Looking for something specific?
        </p>
        <Link
          to="/shop"
          className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-bold text-primary hover:underline"
        >
          Search the catalogue
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* Footer strip: proves the account is real */}
      <p className="mt-6 flex items-center justify-center gap-2 text-[11px] font-semibold text-muted-foreground">
        <CalendarCheck className="h-3.5 w-3.5" />
        Signed in as {user?.email || user?.full_name || "guest"} · one account for courses, books, gear and tests
      </p>
    </div>
  );
}

export default CronyzoDashboardPage;
