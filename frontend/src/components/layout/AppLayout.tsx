import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ClipboardList, FileQuestion, BarChart3, Plug,
  LogOut, Menu, X, GraduationCap, Layers, Library,
  UserRound, Settings, Upload, Users, ChevronDown,
  ChevronLeft, ChevronRight, Search, Sun, Moon, Bell,
  BookOpen, Home, Sparkles, Trophy, Target, Zap,
  Bot, HelpCircle, FileText, Scale, ShieldCheck, Info, MessageSquare, MessageCircle,
  ShoppingBag, ShoppingCart, Store, Package, FileJson, Star,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { usePlatformStore } from "@/stores/platformStore";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";import { SiteHeader, MobileBottomNav } from "@/components/layout/PublicLayout";


/* ═══════════════════════════════════════════════════════════
   Sidebar context — shared collapse state
   ═══════════════════════════════════════════════════════════ */

type SidebarCtx = { collapsed: boolean; toggle: () => void };
const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} });
export const useSidebar = () => useContext(SidebarContext);

/* ═══════════════════════════════════════════════════════════
   Navigation definition
   ═══════════════════════════════════════════════════════════ */

type NavGroup = {
  label: string;
  items: NavItem[];
};

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  /** Only shown when the server says this account may publish/sell. */
  creatorOnly?: boolean;
  flag?: string;
  badge?: string;
  external?: boolean;
  href?: string;
  highlight?: boolean;
  bottomNav?: boolean;
};

const navigation: NavGroup[] = [
  {
    label: "Cronyzo",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/my-courses", label: "My Learning", icon: GraduationCap },
      { to: "/orders", label: "My Orders", icon: ClipboardList },
      { to: "/courses", label: "Browse Courses", icon: BookOpen },
      { to: "/books", label: "Browse Books", icon: Library },
      { to: "/shop", label: "Shop", icon: ShoppingBag },
      { to: "/cart", label: "Cart", icon: ShoppingCart },
    ],
  },
  {
    label: "Practice",
    items: [
      { to: "/exams", label: "Exams", icon: FileQuestion },
      { to: "/attempts", label: "Attempts", icon: ClipboardList },
      { to: "/chat", label: "Messages", icon: MessageCircle, highlight: true },
    ],
  },
  {
    label: "Sell",
    items: [
      { to: "/sell", label: "Start Selling", icon: Store, highlight: true },
      { to: "/sell/dashboard", label: "Seller Studio", icon: Store, creatorOnly: true },
      { to: "/sell/products/new", label: "List a Product", icon: Package, creatorOnly: true },
      { to: "/sell/courses/new", label: "Create a Course", icon: GraduationCap, creatorOnly: true },
      { to: "/sell/books/new", label: "List a Book", icon: Library, creatorOnly: true },
      { to: "/sell/courses", label: "My Courses", icon: GraduationCap, creatorOnly: true },
      { to: "/sell/books", label: "My Books", icon: Library, creatorOnly: true },
      { to: "/sell/products", label: "My Products", icon: Package, creatorOnly: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3, flag: "ENABLE_ANALYTICS" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/account", label: "My Account", icon: UserRound },
      { to: "/profile", label: "Profile", icon: UserRound },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/subjects", label: "Subjects", icon: Layers, adminOnly: true },
      { to: "/admin/chapters", label: "Chapters", icon: Library, adminOnly: true },
      { to: "/admin/questions", label: "Question Bank", icon: FileQuestion, adminOnly: true, flag: "ENABLE_QUESTION_BANK" },
      { to: "/admin/exams", label: "Exam Builder", icon: GraduationCap, adminOnly: true },
      { to: "/admin/import", label: "Import", icon: Upload, adminOnly: true, flag: "ENABLE_IMPORT" },
      { to: "/admin/question-files", label: "Question Files", icon: FileJson, adminOnly: true },
      { to: "/admin/reviews", label: "Reviews", icon: Star, adminOnly: true },
      { to: "/admin/file-bank", label: "File Bank", icon: Layers, adminOnly: true, badge: "AI" },
      { to: "/admin/users", label: "Users", icon: Users, adminOnly: true, flag: "ENABLE_ADMIN_PANEL" },
      { to: "/admin/messages", label: "Messages", icon: MessageSquare, adminOnly: true },
      { to: "/admin/support", label: "Support Inbox", icon: HelpCircle, adminOnly: true },
      { to: "/admin/site", label: "Site Content", icon: LayoutDashboard, adminOnly: true },
      { to: "/admin/sellers", label: "Seller Applications", icon: Store, adminOnly: true },
      { to: "/admin/integrations", label: "Integrations", icon: Plug, adminOnly: true },
    ],
  },
  {
    label: "Support & Legal",
    items: [
      { to: "/help", label: "Help", icon: HelpCircle },
      { to: "/about", label: "About", icon: Info },
      { to: "/terms", label: "Terms & Conditions", icon: FileText },
      { to: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
      { to: "/refund", label: "Refund / Cancellation", icon: Scale },
      { to: "/contact", label: "Contact Us", icon: MessageSquare },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════
   Inline SVG for logo / decorative icons
   ═══════════════════════════════════════════════════════════ */

function LogoIcon({ className, size = "8" }: { className?: string; size?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt="Cronyzo"
      className={cn("rounded-xl bg-white", className || `h-${size} w-${size}`)}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   AppLayout — master shell
   ═══════════════════════════════════════════════════════════ */

export function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const appName = usePlatformStore((s) => s.appName);
  const isEnabled = usePlatformStore((s) => s.isEnabled);
  const maintenanceMessage = usePlatformStore((s) => s.maintenanceMessage);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  const capabilities = useAuthStore((s) => s.capabilities);
  const isGuest = Boolean(user?.is_guest || user?.role === "guest");
  // Server-resolved — the client never re-derives permissions from a role
  // string, so nav and backend always agree on what this account may do.
  const isAdmin = Boolean(capabilities?.can_administer);
  const isCreator = Boolean(capabilities?.can_publish_courses);
  const maint = maintenanceMessage();

  /* ── Theme toggle ──────────────────────── */
  const toggleTheme = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  /* ── Keyboard: Ctrl+K for search ───────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('[data-global-search]');
        el?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* ── Close mobile sidebar on navigate ──── */
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  /* ── Filter nav items ──────────────────── */
  const filteredNav = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.creatorOnly && !isCreator) return false;
        // "Start Selling" is the entry point for people who cannot publish yet
        if (item.to === "/sell" && isCreator) return false;
        if (item.flag && !isEnabled(item.flag, true)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const onLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  const name = appName();

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      {/* Same shell as the public site: one header, one bottom bar. The
          workspace sidebar simply dock underneath the header, so moving from
          the landing page into your dashboard never changes the chrome. */}
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        {/* ── Mobile overlay ───────────────── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ═══ SIDEBAR ════════════════════════ */}
        <div className="flex flex-1 items-stretch">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r transition-all duration-300 ease-in-out",
            "lg:sticky lg:top-16 lg:z-auto lg:h-[calc(100vh-4rem)] lg:translate-x-0",
            collapsed ? "w-[72px]" : "w-[272px]",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Mobile-only close row; the brand lives in the shared header now */}
          <div className="flex h-12 items-center justify-between border-b px-3 lg:hidden">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Menu
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Nav — scrollable */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
            {filteredNav.map((group) => (
              <div key={group.label} className="space-y-1">
                {!collapsed && (
                  <h4 className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    {group.label}
                  </h4>
                )}
                {group.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  const cls = cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative",
                    collapsed && "justify-center px-2",
                    item.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  );
                  const inner = (
                    <>
                      <Icon className={cn("w-5 h-5 shrink-0", item.highlight ? "text-primary-foreground" : active && "text-primary")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <span className={cn(
                          "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          item.highlight ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
                        )}>
                          {item.badge}
                        </span>
                      )}
                      {!item.highlight && active && (
                        <span className={cn(
                          "absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full bg-primary",
                          collapsed && "right-0.5",
                        )} />
                      )}
                    </>
                  );
                  return item.external && item.href ? (
                    <a key={item.to} href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <Link key={item.to} to={item.to} className={cls}>
                      {inner}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom profile — fixed */}
          <div className={cn("border-t p-3 shrink-0", collapsed && "p-2")}>
            <div className={cn(
              "flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/50 transition-colors cursor-pointer",
              collapsed && "flex-col gap-1.5 justify-center p-2"
            )}>
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {(user?.full_name?.[0] || user?.email?.[0] || "S").toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{user?.full_name || "Student"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{user?.email || ""}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full",
                      isGuest ? "bg-amber-400" : "bg-emerald-400"
                    )} />
                    <span className="text-[9px] text-muted-foreground capitalize">
                      {isGuest ? "Guest" : (user?.role || "Student")}
                    </span>
                  </div>
                </div>
              )}
              {!collapsed && (
                <button
                  onClick={onLogout}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
            {collapsed && (
              <button
                onClick={onLogout}
                className="mt-1 w-full flex justify-center p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Collapse toggle (desktop) */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex absolute -right-3 top-[26px] w-6 h-6 rounded-full border bg-card items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors shadow-sm"
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </aside>

        {/* ═══ MAIN CONTENT AREA ════════════════ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Breadcrumb only — the header itself comes from the shared shell */}
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 sm:px-6 lg:px-8">
            <button
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else navigate({ to: "/dashboard" });
              }}
              className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Breadcrumb />
          </div>

          {/* ── Maintenance banner ────────────── */}
          {maint && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/30 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
              {maint}
            </div>
          )}

          {/* ── Page content ──────────────────── */}
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            {children}
          </main>

        </div>
        </div>

        {/* Same five tabs as the public site — one bottom bar for the product */}
        <MobileBottomNav
          onSearch={() => window.dispatchEvent(new CustomEvent("cronyzo:open-search"))}
          cartCount={useCartStore.getState().totals?.item_count ?? 0}
        />      </div>
    </SidebarContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════
   Breadcrumb — auto-generated from route
   ═══════════════════════════════════════════════════════════ */

function Breadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const segments = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((part, i) => {
      // Friendly names for the routes whose URL slug is not the label we show
      const LABELS: Record<string, string> = {
        admin: "Admin",
        site: "Site content",
        integrations: "Integrations",
        sellers: "Seller applications",
        support: "Support inbox",
        chat: "Messages",
        sell: "Seller",
        courses: "Courses",
        books: "Books",
        products: "Products",
        new: "New",
        dashboard: "Dashboard",
        earnings: "Earnings",
      };
      // Exam cards link to /exams/<id> — an id means nothing to a learner, so
      // the crumb says "Tests inside" instead of dumping a database number.
      if (/^\d+$/.test(part)) {
        return { label: "Tests inside", path: "/" + parts.slice(0, i + 1).join("/") };
      }
      const label =
        LABELS[part] ||
        part
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();
      return { label: label || "Home", path: "/" + parts.slice(0, i + 1).join("/") };
    });
  }, [pathname]);

  if (segments.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-[12.5px] sm:text-sm">
      {segments.map((seg, i) => (
        <span key={seg.path} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
          {i === segments.length - 1 ? (
            <span className="font-semibold text-foreground">{seg.label}</span>
          ) : (
            <Link to={seg.path} className="text-muted-foreground hover:text-foreground transition-colors">
              {seg.label}
            </Link>
          )}
        </span>
      ))}
    </div>
  );
}
