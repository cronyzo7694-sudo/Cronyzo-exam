/**
 * Public layout — the marketing / browsing shell.
 *
 * Layout contract (deliberate, and the same on every public page):
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ header: logo · nav · **search (always visible)** · cart · CTA │  desktop
 *   ├─────────────────────────────────────────────────────────┤
 *   │ identity strip: waving 🇮🇳 flag + operator-editable tagline │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ page                                                     │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ footer: legal, support, contact                          │
 *   └─────────────────────────────────────────────────────────┘
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ bottom nav: Home · Learn · Shop · **Search** · You       │  mobile
 *   └─────────────────────────────────────────────────────────┘
 *
 * On desktop the search field lives in the header and is never collapsed behind
 * a menu icon. On mobile there is no top search box at all — search is a primary
 * tab in the bottom bar, which is what thumbs can actually reach.
 *
 * There is exactly **one** call to action for a signed-out visitor ("Sign in" —
 * the login page carries the register link), so the header never shows two
 * buttons that do the same thing.
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Home,
  LayoutGrid,
  Mail,
  MessageCircle,
  Search,
  ShoppingBag,
  Store,
  User as UserIcon,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSite } from "@/lib/site";
import { TopStrip } from "./TopStrip";
import { ChatWidget } from "@/components/site/ChatWidget";

/* ═══════════════════════════════════════════════════════════
   Brand mark
   ═══════════════════════════════════════════════════════════ */

export function CronyzoLogo({
  className,
  size = 32,
  showWord = true,
}: {
  className?: string;
  size?: number;
  showWord?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/25"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 24 24"
          width={size * 0.58}
          height={size * 0.58}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7.5 5.5h6a4.5 4.5 0 0 1 0 9H9.5"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M16.5 18.5h-6a4.5 4.5 0 0 1 0-9h4"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.62"
          />
          <circle cx="17.5" cy="12" r="1.6" fill="white" />
        </svg>
      </span>
      {showWord && (
        <span className="text-lg font-extrabold tracking-tight text-foreground">
          Cronyzo
        </span>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   Navigation model
   ═══════════════════════════════════════════════════════════ */

const NAV = [
  { to: "/courses", label: "Courses" },
  { to: "/books", label: "Books" },
  { to: "/shop", label: "Shop" },
  { to: "/exams", label: "Test" },
  { to: "/stores", label: "Stores" },
] as const;

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/courses", label: "Learn", icon: GraduationCap },
  { to: "/shop", label: "Shop", icon: ShoppingBag },
  // index 3 is the Search button, rendered separately
  { to: "/cart", label: "Cart", icon: ShoppingBag },
  { to: "/account", label: "You", icon: UserIcon },
] as const;

const NAV_LINKS = NAV.map((n) => n);

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      {NAV_LINKS.map((item) => {
        const active = isActive(pathname, item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Search
   ═══════════════════════════════════════════════════════════ */

/**
 * Search sends the visitor to the shop catalogue with the term applied — the
 * shop page is the only full-text surface, so every result is reachable from
 * one place instead of three near-duplicate result pages.
 */
function SearchForm({
  className,
  autoFocus,
  onDone,
}: {
  className?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { content } = useSite();
  const placeholder =
    (content.settings?.["hero.search_placeholder"] as string) ||
    "Search courses, books, products, tests…";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/shop", search: { search: query.trim() } as any });
    onDone?.();
  };

  return (
    <form onSubmit={submit} className={cn("relative", className)} role="search">
      <div className="flex h-10 items-center gap-2 rounded-xl border bg-muted/40 px-3 transition-colors focus-within:border-primary/50 focus-within:bg-card">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          aria-label="Search Cronyzo"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════
   Cart pill
   ═══════════════════════════════════════════════════════════ */

function CartPill() {
  const count = useCartStore((s) => s.totals?.item_count ?? 0);
  return (
    <Link
      to="/cart"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-foreground transition-colors hover:border-primary/40 hover:text-primary"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      <ShoppingBag className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   Public layout
   ═══════════════════════════════════════════════════════════ */

export function PublicLayout({ children }: { children: React.ReactNode }) {
  /** The bottom-bar Search tab forwards to the header's own sheet. */
  const openSearch = () =>
    window.dispatchEvent(new CustomEvent("cronyzo:open-search"));

  const { user, initialized } = useAuthStore();
  const loadCart = useCartStore((s) => s.load);

  useEffect(() => {
    if (initialized && user) void loadCart();
  }, [initialized, user, loadCart]);


  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ══ Header ══════════════════════════════════════════════ */}
      <SiteHeader />

      {/* ══ Page ══════════════════════════════════════════════ */}
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>

      {/* Bottom padding on mobile so the fixed nav never covers content */}
      <SiteFooter />

      {/* ══ Mobile bottom navigation (same tabs as the app shell) ═══ */}
      <MobileBottomNav
        onSearch={openSearch}
        cartCount={useCartStore.getState().totals?.item_count ?? 0}
      />

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Mobile bottom navigation
   ═══════════════════════════════════════════════════════════ */

export function MobileBottomNav({
  onSearch,
  cartCount,
}: {
  onSearch: () => void;
  cartCount: number;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const youTarget = user ? "/dashboard" : "/login";

  const items: {
    key: string;
    label: string;
    icon: typeof Home;
    onClick: () => void;
    active: boolean;
    badge?: number;
  }[] = [
    {
      key: "home",
      label: "Home",
      icon: Home,
      onClick: () => navigate({ to: "/" }),
      active: pathname === "/",
    },
    {
      key: "learn",
      label: "Learn",
      icon: GraduationCap,
      onClick: () => navigate({ to: "/courses" }),
      active: isActive(pathname, "/courses") || isActive(pathname, "/books"),
    },
    {
      key: "shop",
      label: "Shop",
      icon: ShoppingBag,
      onClick: () => navigate({ to: "/shop" }),
      active: isActive(pathname, "/shop") || isActive(pathname, "/stores"),
    },
    {
      key: "search",
      label: "Search",
      icon: Search,
      onClick: onSearch,
      active: false,
    },
    {
      key: "you",
      label: "You",
      icon: UserIcon,
      onClick: () => navigate({ to: youTarget as any }),
      active: isActive(pathname, "/dashboard") || isActive(pathname, "/login"),
      badge: cartCount,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Bottom navigation"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isSearch = item.key === "search";
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                onClick={item.onClick}
                aria-label={item.label}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "relative flex w-full flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition-colors",
                  item.active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn(
                      "h-[21px] w-[21px]",
                      isSearch && "rounded-full",
                    )}
                  />
                  {!!item.badge && item.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </span>
                {item.label}
                {item.active && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════
   Popular searches (shared by hero + mobile search sheet)
   ═══════════════════════════════════════════════════════════ */

export function PopularSearches({
  onPick,
  className,
}: {
  onPick?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const { content } = useSite();
  const tags: string[] = Array.isArray(content.settings?.["hero.popular_tags"])
    ? content.settings["hero.popular_tags"]
    : [];

  if (tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs font-semibold text-muted-foreground">Popular:</span>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => {
            navigate({ to: "/shop", search: { search: tag } as any });
            onPick?.();
          }}
          className="rounded-full border bg-card px-3 py-1 text-xs font-semibold text-foreground/75 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Footer
   ═══════════════════════════════════════════════════════════ */

const FOOTER_COLUMNS = [
  {
    title: "Learn",
    links: [
      { label: "All courses", to: "/courses" },
      { label: "Mock tests", to: "/exams" },
      { label: "My learning", to: "/my-courses" },
      { label: "Start selling", to: "/sell" },
    ],
  },
  {
    title: "Read",
    links: [
      { label: "Browse books", to: "/books" },
      { label: "Free e-books", to: "/books?free=1" },
      { label: "Programming", to: "/books?category=Programming" },
      { label: "Exam prep books", to: "/books?category=Exam%20Prep" },
    ],
  },
  {
    title: "Shop",
    links: [
      { label: "All products", to: "/shop" },
      { label: "Electronics", to: "/shop?category=Electronics" },
      { label: "Stationery", to: "/shop?category=Stationery" },
      { label: "Cart", to: "/cart" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Start selling", to: "/sell" },
      { label: "Seller dashboard", to: "/sell/dashboard" },
      { label: "Publish a course", to: "/sell/courses/new" },
      { label: "List a product", to: "/sell/products/new" },
    ],
  },
] as const;

const LEGAL_LINKS = [
  { label: "About Cronyzo", to: "/about" },
  { label: "Terms & Conditions", to: "/terms" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Returns & Refunds", to: "/refund" },
  { label: "Customer Support", to: "/help" },
  { label: "Contact us", to: "/contact" },
] as const;

export function SiteFooter() {
  const { content } = useSite();
  const blurb =
    (content.settings?.["footer.blurb"] as string) ||
    "One platform to learn from teachers, read books, buy gear and test yourself.";
  const copyright =
    (content.settings?.["footer.copyright"] as string) ||
    "Cronyzo Technologies Pvt. Ltd.";
  const supportEmail =
    (content.settings?.["support.email"] as string) || "cronyzo7694@gmail.com";

  return (
    <footer className="hidden border-t bg-muted/20 lg:block">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <CronyzoLogo size={36} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {blurb}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              🇮🇳 Learn · Read · Shop · Test
            </div>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              <Mail className="h-3.5 w-3.5" />
              {supportEmail}
            </a>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to as any}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Legal row — every page the user asked for is one tap away */}
        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to as any}
              className="text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {copyright}
          </p>
          <p className="text-xs text-muted-foreground">
            Payments, courses, books and gear — one account.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════
   Decorative gradient backdrop used by inner public pages
   ═══════════════════════════════════════════════════════════ */

export function PageGlow({
  className,
  variant = "indigo",
}: {
  className?: string;
  variant?: "indigo" | "violet" | "teal";
}) {
  const palettes = {
    indigo: "from-indigo-500/18 via-violet-500/10 to-transparent",
    violet: "from-violet-500/18 via-fuchsia-500/10 to-transparent",
    teal: "from-teal-500/18 via-cyan-500/10 to-transparent",
  } as const;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b",
        palettes[variant],
        className,
      )}
    />
  );
}

export { LayoutGrid };

/* ═══════════════════════════════════════════════════════════
   SiteHeader — THE header. One chrome for the whole product.

   Every page renders this: the marketing site, the signed-in
   workspace, the seller studio and the admin console. It owns the
   top bar, the flag strip, the mobile search sheet and the drawer,
   so no page can ever drift into its own navigation again.
   ═══════════════════════════════════════════════════════════ */

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isGuest } = useAuthStore();
  const { content } = useSite();
  const features = content.features;
  const signedIn = Boolean(user);
  const footerBrand =
    (content.settings?.["footer.brand"] as string) || "Cronyzo Technologies Pvt. Ltd.";

  // The bottom bar's Search tab asks the header to open its sheet, so there is
  // exactly one search UI no matter which chrome is on screen.
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener("cronyzo:open-search", open);
    return () => window.removeEventListener("cronyzo:open-search", open);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close every overlay whenever the route changes
  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Lock scroll while a sheet is open
  useEffect(() => {
    const locked = searchOpen || menuOpen;
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [searchOpen, menuOpen]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 w-full border-b transition-all duration-200",
          scrolled
            ? "border-border bg-background/85 shadow-sm backdrop-blur-xl"
            : "border-transparent bg-background",
        )}
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0" aria-label="Cronyzo home">
            <CronyzoLogo />
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            <NavLinks />
          </nav>

          {/* Search lives IN the header on desktop — never hidden */}
          <div className="ml-auto hidden w-full max-w-sm lg:block">
            <SearchForm />
          </div>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <CartPill />

            {signedIn ? (
              <Button asChild size="sm">
                <Link to="/dashboard">
                  {isGuest() ? "Continue" : "Dashboard"}
                  <ArrowRight className="ml-1.5 hidden h-3.5 w-3.5 sm:inline" />
                </Link>
              </Button>
            ) : (
              /* ONE call to action, on every width. The login page carries
                 "Create an account", so this never needs to say "Get started". */
              <Button asChild size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
            )}

            {/* Mobile: the menu drawer. Search is NOT here on purpose — it is a
                primary tab in the bottom bar, where a thumb can reach it. */}

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card lg:hidden"
              aria-label="Open menu"
            >
              <LayoutGrid className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* ══ Identity strip ══════════════════════════════════ */}
        <TopStrip />
      </header>
      {/* ══ Search overlay (mobile) ═══════════════════════════ */}
      {searchOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
            aria-hidden="true"
          />
          <div className="cz-pop relative mx-auto mt-20 w-[min(92vw,560px)] rounded-2xl border bg-card p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">Search Cronyzo</p>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SearchForm autoFocus onDone={() => setSearchOpen(false)} />
            <PopularSearches onPick={() => setSearchOpen(false)} />
          </div>
        </div>
      )}

      {/* ══ Full menu sheet (mobile) ═══════════════════════════ */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t bg-background p-5 pb-24 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <CronyzoLogo size={28} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="grid grid-cols-2 gap-2" aria-label="All sections">
              {[
                { to: "/courses", label: "Courses", icon: GraduationCap },
                { to: "/books", label: "Books", icon: BookOpen },
                { to: "/shop", label: "Shop", icon: ShoppingBag },
                { to: "/exams", label: "Mock tests", icon: Zap },
                { to: "/stores", label: "Stores", icon: Store },
                { to: "/sell", label: "Sell on Cronyzo", icon: Store },
                { to: "/help", label: "Help & support", icon: MessageCircle },
                { to: "/about", label: "About", icon: Mail },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to + item.label}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Footer links, folded into the menu — phones get an app, not a
                shrunken desktop page. */}
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Support &amp; legal
              </p>
              <nav className="grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Support and legal">
                {[
                  { to: "/about", label: "About Cronyzo" },
                  { to: "/terms", label: "Terms & Conditions" },
                  { to: "/privacy", label: "Privacy Policy" },
                  { to: "/refund", label: "Returns & Refunds" },
                  { to: "/help", label: "Customer Support" },
                  { to: "/contact", label: "Contact us" },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to as any}
                    onClick={() => setMenuOpen(false)}
                    className="truncate py-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
                © {new Date().getFullYear()} {footerBrand}
                <br />
                Payments, courses, books and gear — one account.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {signedIn ? (
                <Button asChild className="col-span-2">
                  <Link to="/dashboard" onClick={() => setMenuOpen(false)}>
                    Go to dashboard
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link to="/login" onClick={() => setMenuOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/register" onClick={() => setMenuOpen(false)}>
                      Create account
                    </Link>
                  </Button>
                </>
              )}
            </div>

            {features.guest_browsing && !signedIn && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Or keep browsing as a guest — no signup needed.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ══ Chat widget — real people, messages land on Telegram ══ */}
      <ChatWidget />
    </>
  );
}
