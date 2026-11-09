import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CronyzoDashboardPage } from "@/pages/CronyzoDashboardPage";
import { SellerApplyPage } from "@/pages/SellerApplyPage";
import { ExamsPage } from "@/pages/ExamsPage";
import { SearchPage } from "@/pages/SearchPage";
import { ExamDetailPage } from "@/pages/ExamDetailPage";
import { ExamPlayerPage } from "@/pages/ExamPlayerPage";
import { ResultPage } from "@/pages/ResultPage";
import { AttemptsPage } from "@/pages/AttemptsPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { SubjectsPage } from "@/pages/admin/SubjectsPage";
import { ChaptersPage } from "@/pages/admin/ChaptersPage";
import { QuestionsPage } from "@/pages/admin/QuestionsPage";
import { AdminExamsPage } from "@/pages/admin/AdminExamsPage";
import { QuestionFilesPage } from "@/pages/admin/QuestionFilesPage";
import { ReviewsModerationPage } from "@/pages/admin/ReviewsModerationPage";
import { ImportPage } from "@/pages/admin/ImportPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { FileBankPage } from "@/pages/admin/FileBankPage";
import { LegalPage } from "@/pages/LegalPages";
import { ContactPage, HelpPage } from "@/pages/HelpPage";
import { SiteContentPage } from "@/pages/admin/SiteContentPage";
import { IntegrationsPage } from "@/pages/admin/IntegrationsPage";
import { SellerApplicationsPage } from "@/pages/admin/SellerApplicationsPage";
import { SupportInboxPage } from "@/pages/admin/SupportInboxPage";
import { CourseStudioPage } from "@/pages/CourseStudioPage";
import { ChatPage } from "@/pages/ChatPage";
import { MessagesPage } from "@/pages/admin/MessagesPage";
import { AccountPage } from "@/pages/AccountPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { SettingsPage } from "@/pages/SettingsPage";

/* ── Cronyzo commerce pages ─────────────────────────────── */
import { LandingPage } from "@/pages/LandingPage";
import { CoursesPage } from "@/pages/CoursesPage";
import { CourseDetailPage } from "@/pages/CourseDetailPage";
import { BooksPage } from "@/pages/BooksPage";
import { BookDetailPage } from "@/pages/BookDetailPage";
import { ShopPage } from "@/pages/ShopPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { StoresPage } from "@/pages/StoresPage";
import { StorefrontPage } from "@/pages/StorefrontPage";
import { SellerProfilePage } from "@/pages/SellerProfilePage";
import { SellLandingPage } from "@/pages/SellLandingPage";
import { SellerDashboardPage } from "@/pages/SellerDashboardPage";
import {
  CreateBookPage,
  CreateCoursePage,
  CreateProductPage,
} from "@/pages/SellerStudioPages";
import { CartPage } from "@/pages/CartPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { MyCoursesPage } from "@/pages/MyCoursesPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { EarningsPage } from "@/pages/EarningsPage";
import { SellerCatalogPage } from "@/pages/SellerCatalogPage";

/* ═══════════════════════════════════════════════════════════
   Guards
   ───────────────────────────────────────────────────────────
   The session is resolved once (GET /api/auth/session) and every
   guard reads the same store. Guards are async so they wait for
   that probe to settle — otherwise a hard reload or a direct URL
   hit could evaluate them against a half-loaded store and let
   the wrong person through (or bounce the right person out).
   ═══════════════════════════════════════════════════════════ */

/** Make sure the session has been resolved at least once. */
async function ensureSession(): Promise<void> {
  const store = useAuthStore.getState();
  if (!store.initialized) {
    await store.bootstrap();
  }
}

async function requireAuth(): Promise<void> {
  await ensureSession();
  const { user } = useAuthStore.getState();
  if (!user) {
    throw redirect({ to: "/login" });
  }
}

async function requireAdmin(): Promise<void> {
  await requireAuth();
  const { user, capabilities } = useAuthStore.getState();
  const isAdmin = capabilities?.can_administer ?? user?.role === "admin";
  if (!isAdmin) {
    throw redirect({ to: "/dashboard" });
  }
}

/**
 * Signed-in creators. A plain student is sent to the Sell onboarding
 * page instead of a dead end.
 */
async function requireCreator(): Promise<void> {
  await requireAuth();
  const { user, capabilities } = useAuthStore.getState();
  const canPublish =
    capabilities?.can_publish_courses ??
    (user?.role === "teacher" ||
      user?.role === "seller" ||
      user?.role === "admin");
  if (!canPublish) {
    throw redirect({ to: "/sell" });
  }
}

/**
 * Signed-out visitors. A *guest* session is allowed through so they can
 * turn it into a full account without losing their progress.
 */
async function requireGuest(): Promise<void> {
  await ensureSession();
  const { user } = useAuthStore.getState();
  if (user && !user.is_guest && user.role !== "guest") {
    throw redirect({ to: "/dashboard" });
  }
}

/* ═══════════════════════════════════════════════════════════
   Search schemas
   ═══════════════════════════════════════════════════════════ */

type CatalogSearch = {
  search?: string;
  category?: string;
  level?: string;
  format?: string;
  sort?: string;
  in_stock?: string;
  max_price?: string;
};

/** Pull a single string value out of an unknown search-param blob. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

const catalogSearch = (s: Record<string, unknown>): CatalogSearch => ({
  search: str(s.search),
  category: str(s.category),
  level: str(s.level),
  format: str(s.format),
  sort: str(s.sort),
  in_stock: str(s.in_stock),
  max_price: str(s.max_price),
});

/* ═══════════════════════════════════════════════════════════
   Route tree
   ═══════════════════════════════════════════════════════════ */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

/* ── Auth (standalone, full-screen) ─────────────────────── */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => requireGuest(),
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  beforeLoad: () => requireGuest(),
  component: RegisterPage,
});

/* ── Public (marketing + browsing) ───────────────────────── */
const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "public",
  component: () => (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  ),
});

const landingRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/",
  component: LandingPage,
});

const coursesRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/courses",
  validateSearch: catalogSearch,
  component: CoursesPage,
});

const courseDetailRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/courses/$slug",
  component: CourseDetailPage,
});

const booksRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/books",
  validateSearch: catalogSearch,
  component: BooksPage,
});

const bookDetailRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/books/$slug",
  component: BookDetailPage,
});

const shopRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/shop",
  validateSearch: catalogSearch,
  component: ShopPage,
});

const productDetailRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/shop/$slug",
  component: ProductDetailPage,
});

const storesRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/stores",
  component: StoresPage,
});

const storefrontRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/stores/$slug",
  component: StorefrontPage,
});

const sellerProfileRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/seller/$sellerId",
  component: SellerProfilePage,
});

const sellLandingRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/sell",
  component: SellLandingPage,
});

/* ── Index redirect ──────────────────────────────────────── */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/home",
  beforeLoad: async () => {
    await ensureSession();
    const { user } = useAuthStore.getState();
    if (!user) {
      throw redirect({ to: "/" });
    }
    // Everyone lands in the same workspace: a guest sees the same dashboard,
    // just with purchasing switched off.
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});

/* ── Signed-in workspace ─────────────────────────────────── */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => requireAuth(),
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: CronyzoDashboardPage,
});

/** The legacy exam-first dashboard, kept reachable at /dashboard/exams. */
const legacyDashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/exams",
  component: DashboardPage,
});

/* Public: search is the map of the site — a visitor who has not signed in
   must still be able to find a book or a test. */
const searchRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/search",
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
});

const examsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/exams",
  component: ExamsPage,
});

const examDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/exams/$examId",
  /* `?series=12` is how a search hit for one particular test lands on that
     test instead of the top of a 100-card list. */
  validateSearch: (s: Record<string, unknown>): { series?: string } => ({
    series:
      typeof s.series === "string" || typeof s.series === "number"
        ? String(s.series)
        : undefined,
  }),
  component: ExamDetailPage,
});

const attemptsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/attempts",
  component: AttemptsPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/account",
  // Signed in is enough here — a guest can still rename their session, and the
  // page itself explains how to turn it into a permanent account.
  beforeLoad: () => requireAuth(),
  component: AccountPage,
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile",
  component: ProfilePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: SettingsPage,
});

const resultsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/results/$attemptId",
  component: ResultPage,
});

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/play/$attemptId",
  beforeLoad: () => requireAuth(),
  component: ExamPlayerPage,
});

/* ── Commerce — signed-in ────────────────────────────────── */
const cartRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/cart",
  component: CartPage,
});

const checkoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/checkout",
  component: CheckoutPage,
});

const myCoursesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/my-courses",
  component: MyCoursesPage,
});

const ordersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/orders",
  component: OrdersPage,
});

/* ── Seller studio — signed-in creators ──────────────────── */
const sellerDashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/dashboard",
  beforeLoad: () => requireCreator(),
  component: SellerDashboardPage,
});

const createProductRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/products/new",
  // Signed in is enough here: the page itself shows the shopkeeper gate and
  // explains the next step, which beats bouncing the member back to /sell.
  beforeLoad: () => requireAuth(),
  component: CreateProductPage,
});

const createCourseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/courses/new",
  beforeLoad: () => requireCreator(),
  component: CreateCoursePage,
});

const createBookRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/books/new",
  // Signed in is enough here: the page itself shows the shopkeeper gate and
  // explains the next step, which beats bouncing the member back to /sell.
  beforeLoad: () => requireAuth(),
  component: CreateBookPage,
});

const sellerEarningsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/earnings",
  beforeLoad: () => requireCreator(),
  component: EarningsPage,
});

const sellerCoursesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/courses",
  beforeLoad: () => requireCreator(),
  component: () => <SellerCatalogPage kind="courses" />,
});

const sellerBooksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/books",
  beforeLoad: () => requireCreator(),
  component: () => <SellerCatalogPage kind="books" />,
});

const sellerProductsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/products",
  beforeLoad: () => requireCreator(),
  component: () => <SellerCatalogPage kind="products" />,
});

/* ── Admin ───────────────────────────────────────────────── */
const adminSubjectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/subjects",
  beforeLoad: () => requireAdmin(),
  component: SubjectsPage,
});
const adminChaptersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/chapters",
  beforeLoad: () => requireAdmin(),
  component: ChaptersPage,
});
const adminQuestionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/questions",
  beforeLoad: () => requireAdmin(),
  component: QuestionsPage,
});
const adminExamsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/exams",
  beforeLoad: () => requireAdmin(),
  component: AdminExamsPage,
});
const adminReviewsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/reviews",
  beforeLoad: () => requireAdmin(),
  component: ReviewsModerationPage,
});
const adminQuestionFilesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/question-files",
  beforeLoad: () => requireAdmin(),
  component: QuestionFilesPage,
});
const adminImportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/import",
  beforeLoad: () => requireAdmin(),
  component: ImportPage,
});
const fileBankRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/file-bank",
  beforeLoad: () => requireAdmin(),
  component: FileBankPage,
});
const adminUsersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/users",
  beforeLoad: () => requireAdmin(),
  component: UsersPage,
});
const adminSiteRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/site",
  beforeLoad: () => requireAdmin(),
  component: SiteContentPage,
});
const adminIntegrationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/integrations",
  beforeLoad: () => requireAdmin(),
  component: IntegrationsPage,
});
const adminSellerAppsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/sellers",
  beforeLoad: () => requireAdmin(),
  component: SellerApplicationsPage,
});
const adminSupportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/support",
  beforeLoad: () => requireAdmin(),
  component: SupportInboxPage,
});

/** Teacher/seller course studio: modules, lessons, live classes, PDFs. */
const sellerApplyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/apply",
  component: SellerApplyPage,
});
const courseStudioRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sell/courses/$courseId/studio",
  beforeLoad: () => requireCreator(),
  component: () => {
    const { courseId } = courseStudioRoute.useParams();
    return <CourseStudioPage courseId={Number(courseId)} />;
  },
});

const adminMessagesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin/messages",
  beforeLoad: () => requireAdmin(),
  component: MessagesPage,
});

/* ── Static legal/support pages ──────────────────────────── */
/* Public by design: payment-gateway and app-store compliance both require
   Terms / Privacy / Refund / Contact to be readable without an account. */
const helpRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/help",
  component: HelpPage,
});

/** The contact form. `?topic=order` pre-selects the topic tile. */
const contactRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/contact",
  // `topic` is always present (possibly undefined) so links may omit `search`
  validateSearch: (s: Record<string, unknown>): { topic?: string } => ({
    topic: typeof s.topic === "string" ? s.topic : undefined,
  }),
  component: () => {
    const { topic } = contactRoute.useSearch();
    return <ContactPage initialTopic={topic} />;
  },
});
const aboutRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/about",
  component: () => <LegalPage path="/about" />,
});
const termsRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/terms",
  component: () => <LegalPage path="/terms" />,
});
const privacyRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/privacy",
  component: () => <LegalPage path="/privacy" />,
});
const refundRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/refund",
  component: () => <LegalPage path="/refund" />,
});
const chatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/chat",
  component: ChatPage,
});

/* ═══════════════════════════════════════════════════════════
   Assemble
   ═══════════════════════════════════════════════════════════ */

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  playRoute,
  publicRoute.addChildren([
    landingRoute,
    coursesRoute,
    courseDetailRoute,
    booksRoute,
    bookDetailRoute,
    shopRoute,
    productDetailRoute,
    storesRoute,
    storefrontRoute,
    sellerProfileRoute,
    sellLandingRoute,
    helpRoute,
    contactRoute,
    aboutRoute,
    termsRoute,
    privacyRoute,
    refundRoute,
    searchRoute,
  ]),
  appRoute.addChildren([
    dashboardRoute,
    legacyDashboardRoute,
    examsRoute,
    examDetailRoute,
    attemptsRoute,
    analyticsRoute,
    accountRoute,
  profileRoute,
    settingsRoute,
    resultsRoute,
    cartRoute,
    checkoutRoute,
    myCoursesRoute,
    ordersRoute,
    sellerDashboardRoute,
    sellerEarningsRoute,
    sellerCoursesRoute,
    sellerBooksRoute,
    sellerProductsRoute,
    createProductRoute,
    createCourseRoute,
    createBookRoute,
    adminSubjectsRoute,
    adminChaptersRoute,
    adminQuestionsRoute,
    adminExamsRoute,
    adminQuestionFilesRoute,
    adminReviewsRoute,
    adminImportRoute,
    fileBankRoute,
    adminUsersRoute,
    chatRoute,
    adminMessagesRoute,
    adminSiteRoute,
    adminIntegrationsRoute,
    adminSellerAppsRoute,
    adminSupportRoute,
    courseStudioRoute,
    sellerApplyRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
