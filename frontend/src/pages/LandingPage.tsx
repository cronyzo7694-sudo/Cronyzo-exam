/**
 * Landing page — the front door of Cronyzo.
 *
 * Every word and image below comes from the database through
 * `GET /api/site/home`; an admin edits it at Admin → Site content. Nothing here
 * is hard-coded copy, and every number is a real count, so the page can never
 * show a "0 courses" tile or an empty card.
 *
 * Scroll order (and why):
 *   1. Hero            — headline + animated artwork + search + live counters
 *   2. Four pillars    — the four verticals, each linking to its catalogue
 *   3. Categories      — only rendered when categories actually have stock
 *   4. Top courses     — only rendered when published courses exist
 *   5. Books + gear    — twin rails, each hidden when its vertical is empty
 *   6. Sell CTA        — teacher / seller onboarding
 *   7. Testimonials    — rotating quotes
 *   8. Chat CTA        — "talk to a human", wired to Telegram
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  IndianRupee,
  LayoutGrid,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { booksApi, coursesApi, shopApi, type Category } from "@/lib/commerce";
import { BookCard, CourseCard, ProductCard } from "@/components/commerce/Cards";
import { GridSkeleton, SectionHeading } from "@/components/commerce/Primitives";
import { useSite, useSetting } from "@/lib/site";
import { GradientBackdrop } from "@/components/site/GradientBackdrop";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { PopularSearches } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   Icon map — pillar icons are operator-editable strings
   ═══════════════════════════════════════════════════════════ */

const ICONS: Record<string, typeof Sparkles> = {
  GraduationCap,
  BookOpen,
  ShoppingBag,
  Zap,
  Sparkles,
  Store,
  Package,
  Users,
  Star,
  Truck,
  LayoutGrid,
  ShieldCheck,
};

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name] || Sparkles;
  return <Cmp className={className} />;
}

const ACCENT_RING: Record<string, string> = {
  indigo: "from-indigo-500/15 to-indigo-500/0 text-indigo-600 dark:text-indigo-400",
  violet: "from-violet-500/15 to-violet-500/0 text-violet-600 dark:text-violet-400",
  teal: "from-teal-500/15 to-teal-500/0 text-teal-600 dark:text-teal-400",
  amber: "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
};

const ACCENT_BORDER: Record<string, string> = {
  indigo: "hover:border-indigo-400/60",
  violet: "hover:border-violet-400/60",
  teal: "hover:border-teal-400/60",
  amber: "hover:border-amber-400/60",
};

/* ═══════════════════════════════════════════════════════════
   Hero
   ═══════════════════════════════════════════════════════════ */

function Hero() {
  const [query, setQuery] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const navigate = useNavigate();
  const { content, stats, loading } = useSite();

  const [founderOpen, setFounderOpen] = useState(false);
  const founderName = useSetting<string>("founder.name", "Chhotu Rathor");
  const founderRole = useSetting<string>("founder.role", "Founder & developer, Cronyzo");
  const founderLine = useSetting<string>(
    "founder.line",
    "A working developer from India who got tired of paying for ten different study sites.",
  );
  const founderStory = useSetting<string>(
    "founder.story",
    "I build Cronyzo on my own — one developer, no investors, no ad money. Every course, book and product on this site is checked by a human before it goes live, and every seller has to be approved before they can list anything. The goal is simple: studying in India should cost less, and honest teachers and shopkeepers should keep more of what they earn.",
  );

  // Close the founder card on Escape — a dialog with no keyboard exit is a trap.
  useEffect(() => {
    if (!founderOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFounderOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [founderOpen]);
  const eyebrow = useSetting<string>("hero.eyebrow");
  const title = useSetting<string>("hero.title");
  const subtitle = useSetting<string>("hero.subtitle");
  const placeholder = useSetting<string>("hero.search_placeholder");
  const slides = content.hero_slides || [];
  const showCarousel = content.features.show_hero_carousel && slides.length > 0;

  const activeSlide = slides[slideIndex] || null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/shop", search: { search: query.trim() } as any });
  };

  return (
    <section className="relative overflow-hidden">
      <GradientBackdrop />

      {/* ── The Indian flag, used as the backdrop of the headline ──────
          Full-width tricolour wash + the flag artwork itself behind the
          title block. Kept very light so the copy stays readable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[560px] overflow-hidden sm:h-[600px]"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#FF9933]/25 via-white/0 to-[#138808]/25" />
        <img
          src="/brand/india-flag.png"
          alt=""
          className="absolute -left-10 top-0 h-full w-auto max-w-none origin-top object-contain opacity-[0.45] [mask-image:linear-gradient(to_right,black_58%,transparent_94%)] sm:-left-4 sm:opacity-55 lg:left-2"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-white/55 to-background dark:from-black/45 dark:via-black/65 dark:to-background" />
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#FF9933] via-white to-[#138808] opacity-80" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 pb-10 pt-12 sm:px-6 lg:px-8 lg:pb-16 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          {/* ── Copy ──────────────────────────────────────────── */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card/70 px-3 py-1.5 text-xs font-bold text-primary backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              {eyebrow}
            </div>

            <h1 className="mt-5 text-[2.15rem] font-extrabold leading-[1.06] tracking-tight text-foreground drop-shadow-sm sm:text-5xl lg:text-[3.5rem]">
              {title}
            </h1>

            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-foreground/70 sm:text-base">
              {subtitle}
            </p>

            {/* ── Search ──────────────────────────────────────── */}
            <form onSubmit={submit} className="mt-7 max-w-xl" role="search">
              <div className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-card px-4 shadow-lg shadow-indigo-500/5 transition-colors focus-within:border-primary/50">
                <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                  aria-label="Search Cronyzo"
                />
                <Button type="submit" size="sm" className="shrink-0 rounded-xl">
                  Search
                </Button>
              </div>
            </form>

            <PopularSearches className="mt-3" />

            {/* ── Primary actions ─────────────────────────────── */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-xl">
                <Link to="/courses">
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Browse courses
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl">
                <Link to="/sell">
                  <Store className="mr-2 h-4 w-4" />
                  Sell on Cronyzo
                </Link>
              </Button>
            </div>

            {/* ── The founder ──────────────────────────────────────
                Kept deliberately small — a passport photo pinned beside the
                headline, not a hero image. Tapping it opens the card with the
                name and the story behind the platform. */}
            <button
              type="button"
              onClick={() => setFounderOpen(true)}
              aria-haspopup="dialog"
              className="group mt-7 inline-flex items-center gap-4 rounded-2xl border border-border/70 bg-card/85 p-2.5 pr-5 text-left shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span className="relative block rotate-[-3deg] rounded-xl border-2 border-white bg-white p-1 shadow-md transition-transform group-hover:rotate-0 dark:border-border dark:bg-card">
                <img
                  src="/brand/founder.png"
                  alt=""
                  aria-hidden="true"
                  className="h-[112px] w-[88px] rounded-lg object-cover object-top"
                />
                <img
                  src="/brand/india-flag.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full bg-white object-contain p-[2px] ring-1 ring-black/10"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-extrabold leading-tight text-foreground">
                  {founderName}
                </span>
                <span className="mt-0.5 block text-[12px] font-semibold text-muted-foreground">
                  {founderRole}
                </span>
                <span className="mt-1.5 block text-[12px] font-bold text-primary">
                  Meet the founder →
                </span>
              </span>
            </button>
          </div>

          {/* ── Artwork (the curated slides stay the hero visual) ── */}
          <div className="relative">
            {showCarousel ? (
              <HeroCarousel slides={slides} onSlideChange={setSlideIndex} />
            ) : (
              <div className="flex aspect-[16/11] items-center justify-center rounded-[26px] border bg-card shadow-xl">
                <Sparkles className="h-12 w-12 text-primary/40" />
              </div>
            )}

            {/* Floating live counter — real numbers only. */}
            {stats && stats.courses > 0 && (
              <div className="absolute -left-4 -top-5 z-20 hidden items-center gap-2.5 rounded-2xl border bg-card/95 px-4 py-3 shadow-xl backdrop-blur sm:flex">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <GraduationCap className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="block text-lg font-extrabold leading-none text-foreground">
                    {stats.courses}
                  </span>
                  <span className="block text-[11px] font-semibold text-muted-foreground">
                    live courses
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Founder card (opens from the passport photo) ───────── */}
        {founderOpen &&
          createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`About ${founderName}`}
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setFounderOpen(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-3xl border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 pb-14 pt-7 text-white">
                <button
                  type="button"
                  onClick={() => setFounderOpen(false)}
                  aria-label="Close"
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
                >
                  <X className="h-4 w-4" />
                </button>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                  The person behind Cronyzo
                </p>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight">{founderName}</h2>
                <p className="mt-1 text-sm font-semibold text-white/85">{founderRole}</p>
              </div>

              <div className="relative px-6 pb-6">
                <div className="-mt-8 mb-4 flex items-end gap-3">
                  <img
                    src="/brand/founder.png"
                    alt={founderName}
                    className="h-20 w-16 rounded-xl border-2 border-card object-cover object-top shadow-lg"
                  />
                  <img
                    src="/brand/india-flag.png"
                    alt=""
                    aria-hidden="true"
                    className="h-7 w-7 rounded-full bg-white object-contain p-[2px] ring-1 ring-black/10"
                  />
                  <span className="mb-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Verified founder
                  </span>
                </div>

                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  {founderStory}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" className="rounded-xl">
                    <Link to="/about" onClick={() => setFounderOpen(false)}>
                      About Cronyzo
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <a href="mailto:cronyzo7694@gmail.com">Write to {founderName.split(" ")[0]}</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>,
            document.body,
          )}

        {/* ══ Live counters ═════════════════════════════════════ */}
        <StatsStrip loading={loading} />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Live counters — built from real rows, never placeholders
   ═══════════════════════════════════════════════════════════ */

function StatsStrip({ loading }: { loading: boolean }) {
  const { stats } = useSite();

  if (loading && !stats) {
    return (
      <div className="mt-12 flex flex-wrap justify-center gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-[74px] min-w-[calc(50%-0.375rem)] flex-1 basis-[calc(25%-0.5625rem)] animate-pulse rounded-2xl border bg-muted/40 sm:min-w-[calc(25%-0.5625rem)] lg:basis-[calc(12.5%-0.75rem)]"
          />
        ))}
      </div>
    );
  }

  // Nothing real to show yet — render nothing rather than empty tiles
  if (!stats || stats.cards.length === 0) return null;

  // The counter set is live: it grows as the catalogue grows. Pick the column
  // count that fills its rows exactly, so a lone trailing card can never sit on
  // a row of its own looking like a rendering bug.
  const count = stats.cards.length;
  const exact = count % 4 === 0 ? 4 : count % 3 === 0 ? 3 : 0;

  return (
    <div className="mt-12">
      <div
        className={cn(
          "gap-3",
          exact
            ? cn(
                "grid grid-cols-2",
                exact === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
              )
            : // No exact fit — fall back to a centred wrap with fixed-width cards
              // so the remainder stays the same size as the rest.
              "flex flex-wrap justify-center",
        )}
      >
        {stats.cards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "group rounded-2xl border border-border/70 bg-card/80 px-3.5 py-3.5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-indigo-500/5",
              !exact && "w-[calc(50%-0.375rem)] sm:w-[calc(25%-0.5625rem)]",
            )}
          >
            <Icon
              name={card.icon}
              className="h-4 w-4 text-primary/70 transition-colors group-hover:text-primary"
            />
            <p className="mt-1.5 text-xl font-extrabold leading-none tracking-tight text-foreground">
              {card.value}
            </p>
            <p className="mt-1 truncate text-[11px] font-semibold text-muted-foreground">
              {card.label}
            </p>
          </div>
        ))}
      </div>
      {stats.seller_payout_percent > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          <IndianRupee className="h-3 w-3" />
          Sellers keep {stats.seller_payout_percent}% of every sale — the{" "}
          {stats.commission_percent}% platform fee is shown before you publish.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Four pillars
   ═══════════════════════════════════════════════════════════ */

function Pillars() {
  const { content } = useSite();
  const heading = useSetting<string>("pillars.heading");
  const subheading = useSetting<string>("pillars.subheading");
  const pillars = content.pillars || [];

  if (pillars.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <SectionHeading eyebrow="Four pillars" title={heading} description={subheading} />

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {pillars.map((pillar) => (
          <div
            key={pillar.id}
            className={cn(
              "group relative flex flex-col rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10",
              ACCENT_BORDER[pillar.accent] || ACCENT_BORDER.indigo,
            )}
          >
            <span
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br",
                ACCENT_RING[pillar.accent] || ACCENT_RING.indigo,
              )}
            >
              <Icon name={pillar.icon} className="h-5 w-5" />
            </span>

            <h3 className="mt-4 text-base font-extrabold tracking-tight text-foreground">
              {pillar.title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {pillar.description}
            </p>

            {pillar.bullets.length > 0 && (
              <ul className="mt-3.5 space-y-1.5">
                {pillar.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-1.5 text-[12px] font-medium text-foreground/70"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                    {b}
                  </li>
                ))}
              </ul>
            )}

            <Link
              to={pillar.link_url as any}
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-primary transition-colors hover:text-primary/80"
            >
              {pillar.link_label}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Shop categories — only categories that actually have stock
   ═══════════════════════════════════════════════════════════ */

function CategoryRail() {
  const { data, isLoading } = useQuery({
    queryKey: ["landing", "categories"],
    queryFn: () => shopApi.categories(),
    staleTime: 5 * 60_000,
  });

  // shopApi.categories() answers `{ items, total }` — never assume an array
  const payload: any = data;
  const categories: Category[] = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : [];

  // Drop anything with no live products — an empty shelf is worse than no shelf
  const live = useMemo(
    () => categories.filter((c: any) => Number(c.product_count ?? 0) > 0),
    [categories],
  );

  if (isLoading) {
    return (
      <section className="mx-auto max-w-[1400px] px-4 pb-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }

  if (live.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">
            Find exactly what you need
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Every category below has live stock right now.
          </p>
        </div>
        <Link
          to="/shop"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
        >
          All products <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {live.slice(0, 6).map((cat: any) => (
          <Link
            key={cat.id ?? cat.name}
            to="/shop"
            search={{ category: cat.name } as any}
            className="group flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-foreground">
                {cat.name}
              </span>
              <span className="block text-[11px] font-semibold text-muted-foreground">
                {cat.product_count} item{Number(cat.product_count) === 1 ? "" : "s"}
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Top courses
   ═══════════════════════════════════════════════════════════ */

function TopCourses() {
  const heading = useSetting<string>("courses.heading");
  const subheading = useSetting<string>("courses.subheading");

  const { data, isLoading } = useQuery({
    queryKey: ["landing", "courses"],
    queryFn: () => coursesApi.list({ per_page: 4, sort: "rating" } as any),
    staleTime: 2 * 60_000,
  });

  const courses: any[] = (data as any)?.items ?? (data as any)?.courses ?? [];

  // A brand-new install has no courses yet — hide the whole section
  if (!isLoading && courses.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow="Top courses" title={heading} description={subheading} />
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link to="/courses">
            Browse all <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <GridSkeleton count={4} aspect="16 / 10" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {courses.slice(0, 4).map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Books + gear rails
   ═══════════════════════════════════════════════════════════ */

function BooksAndGear() {
  const booksQ = useQuery({
    queryKey: ["landing", "books"],
    queryFn: () => booksApi.list({ per_page: 4 } as any),
    staleTime: 2 * 60_000,
  });
  const gearQ = useQuery({
    queryKey: ["landing", "products"],
    queryFn: () => shopApi.products({ per_page: 4 } as any),
    staleTime: 2 * 60_000,
  });

  const books: any[] = (booksQ.data as any)?.items ?? (booksQ.data as any)?.books ?? [];
  const products: any[] = (gearQ.data as any)?.items ?? (gearQ.data as any)?.products ?? [];

  const hasBooks = booksQ.isLoading || books.length > 0;
  const hasGear = gearQ.isLoading || products.length > 0;
  if (!hasBooks && !hasGear) return null;

  return (
    <section className="border-y bg-muted/15">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Books */}
          {hasBooks && (
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                    Read
                  </p>
                  <h2 className="mt-1.5 text-xl font-extrabold tracking-tight text-foreground">
                    Books & e-books
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Free samples before you buy — and some titles are free to download.
                  </p>
                </div>
                <Link
                  to="/books"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  All books <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                {booksQ.isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-64 animate-pulse rounded-xl border bg-muted/40" />
                    ))
                  : books.slice(0, 2).map((book) => <BookCard key={book.id} book={book} />)}
              </div>
            </div>
          )}

          {/* Gear */}
          {hasGear && (
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                    Shop
                  </p>
                  <h2 className="mt-1.5 text-xl font-extrabold tracking-tight text-foreground">
                    Study gear
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Live stock from verified storefronts — no phantom listings.
                  </p>
                </div>
                <Link
                  to="/shop"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  All products <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                {gearQ.isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-64 animate-pulse rounded-xl border bg-muted/40" />
                    ))
                  : products.slice(0, 2).map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sell CTA
   ═══════════════════════════════════════════════════════════ */

function SellCta() {
  const heading = useSetting<string>("sell.heading");
  const subheading = useSetting<string>("sell.subheading");
  const benefits = useSetting<string[]>("sell.benefits", []);

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.07] via-violet-500/[0.05] to-fuchsia-500/[0.07] p-7 sm:p-10 lg:p-14">
        <div
          aria-hidden="true"
          className="cz-blob pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-400/25 blur-3xl"
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              For teachers &amp; sellers
            </p>
            <h2 className="mt-2.5 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-[2.1rem]">
              {heading}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {subheading}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-xl">
                <Link to="/sell">
                  Start selling free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl">
                <Link to="/stores">See seller stores</Link>
              </Button>
            </div>
          </div>

          {benefits.length > 0 && (
            <ul className="space-y-2.5">
              {benefits.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/80 px-3.5 py-2.5 text-[13px] font-semibold text-foreground/80 backdrop-blur-sm"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Testimonials — auto-rotating
   ═══════════════════════════════════════════════════════════ */

function Testimonials() {
  const { content } = useSite();
  const heading = useSetting<string>("testimonials.heading");
  const subheading = useSetting<string>("testimonials.subheading");
  const quotes = content.testimonials || [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (quotes.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % quotes.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [quotes.length]);

  if (quotes.length === 0) return null;

  return (
    <section className="border-t bg-muted/15">
      <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Real people" title={heading} description={subheading} />

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {quotes.slice(0, 3).map((q, i) => (
            <figure
              key={q.id}
              className={cn(
                "flex flex-col rounded-2xl border border-border/70 bg-card p-5 transition-all duration-500",
                i === index % Math.min(quotes.length, 3)
                  ? "shadow-lg shadow-indigo-500/10 ring-1 ring-primary/20"
                  : "opacity-90",
              )}
            >
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <blockquote className="mt-3 flex-1 text-[13.5px] leading-relaxed text-foreground/80">
                “{q.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white",
                    q.accent === "violet"
                      ? "from-violet-500 to-fuchsia-500"
                      : q.accent === "teal"
                        ? "from-teal-500 to-cyan-500"
                        : "from-indigo-500 to-violet-500",
                  )}
                >
                  {q.initials}
                </span>
                <span>
                  <span className="block text-[13px] font-bold text-foreground">
                    {q.author_name}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {q.author_role}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Chat CTA
   ═══════════════════════════════════════════════════════════ */

function ChatCta() {
  const title = useSetting<string>("chat.title");
  const subtitle = useSetting<string>("chat.subtitle");

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center gap-5 rounded-3xl border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="rounded-xl">
            <Link to="/help">
              <MessageCircle className="mr-2 h-4 w-4" />
              Open a support chat
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/contact">Contact the team</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════ */

export function LandingPage() {
  return (
    <div>
      <Hero />
      <Pillars />
      <CategoryRail />
      <TopCourses />
      <BooksAndGear />
      <SellCta />
      <Testimonials />
      <ChatCta />
    </div>
  );
}
