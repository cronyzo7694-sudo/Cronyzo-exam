/**
 * Commerce API client — Cronyzo Learn / Read / Shop.
 * --------------------------------------------
 * Every marketplace call goes through the shared `api` helper so auth
 * headers, error normalisation and the 401 token-clearing behaviour stay
 * identical to the exam domain.
 */

import { api } from "@/lib/api";

/* ═══════════════════════════════════════════════════════════
   Shared shapes
   ═══════════════════════════════════════════════════════════ */

export type Money = number;

export type SellerRef = {
  id: number;
  full_name?: string | null;
  avatar_url?: string | null;
  store_name?: string | null;
};

export type TeacherRef = {
  id: number;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

/* ── Courses ─────────────────────────────────────────────── */

export type Lesson = {
  id: number;
  module_id: number;
  title: string;
  content_type: "video" | "article" | "quiz" | "live" | "download";
  video_url?: string | null;
  content?: string | null;
  duration_minutes: number;
  is_preview: boolean;
  is_locked: boolean;
  sort_order: number;
  accessible?: boolean;
};

export type CourseModule = {
  id: number;
  course_id: number;
  title: string;
  description?: string | null;
  sort_order: number;
  lesson_count: number;
  lessons?: Lesson[];
};

export type Course = {
  id: number;
  title: string;
  slug: string;
  subtitle?: string | null;
  description?: string | null;
  category: string;
  level: "beginner" | "intermediate" | "advanced";
  language: string;
  thumbnail_url?: string | null;
  trailer_url?: string | null;
  status: string;
  price: Money;
  mrp: Money;
  discount_percent: number;
  is_free: boolean;
  delivery_mode: string;
  duration_hours: number;
  lesson_count: number;
  student_count: number;
  rating_avg: number;
  rating_count: number;
  is_featured: boolean;
  created_at?: string | null;
  teacher?: TeacherRef;
  modules?: CourseModule[];
  enrolled?: boolean;
  has_free_preview?: boolean;
  reviews?: Review[];
};

export type Enrollment = {
  id: number;
  course_id: number;
  progress: number;
  completed_lessons: number;
  last_lesson_id?: number | null;
  is_completed: boolean;
  rating?: number | null;
  review_text?: string | null;
  enrolled_at?: string | null;
  course?: Course & { teacher_name?: string | null };
};

/* ── Books ───────────────────────────────────────────────── */

export type BookChapter = {
  id: number;
  book_id: number;
  title: string;
  page_start?: number | null;
  page_end?: number | null;
  preview_text?: string | null;
  sort_order: number;
};

export type Book = {
  id: number;
  title: string;
  slug: string;
  author?: string | null;
  publisher?: string | null;
  isbn?: string | null;
  edition?: string | null;
  language: string;
  category: string;
  pages: number;
  cover_url?: string | null;
  description?: string | null;
  highlights: string[];
  price: Money;
  mrp: Money;
  discount_percent: number;
  format: "paperback" | "hardcover" | "ebook" | "pdf";
  stock: number;
  in_stock: boolean;
  status: string;
  is_featured: boolean;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  created_at?: string | null;
  seller?: SellerRef;
  chapters?: BookChapter[];
  /* ── Digital edition ── */
  has_pdf?: boolean;
  pdf_name?: string | null;
  pdf_size_bytes?: number;
  has_preview?: boolean;
  preview_pdf_url?: string | null;
  preview_pages?: number;
  is_free_download?: boolean;
  download_count?: number;
  is_digital?: boolean;
};

/* ── Shop ────────────────────────────────────────────────── */

export type Category = {
  id: number;
  name: string;
  slug: string;
  parent_id?: number | null;
  icon?: string | null;
  image_url?: string | null;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  product_count?: number;
};

export type Product = {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  price: Money;
  mrp: Money;
  discount_percent: number;
  stock: number;
  in_stock: boolean;
  condition: string;
  fulfillment: string;
  image_url?: string | null;
  gallery: string[];
  category_id?: number | null;
  category_name?: string | null;
  store_id?: number | null;
  store_name?: string | null;
  is_active: boolean;
  is_featured: boolean;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  created_at?: string | null;
  seller?: SellerRef;
  reviews?: Review[];
  related?: Product[];
};

export type Review = {
  id: number;
  rating: number;
  title?: string | null;
  body?: string | null;
  is_verified: boolean;
  user?: { id: number; full_name?: string | null; avatar_url?: string | null };
  created_at?: string | null;
};

export type Store = {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  city?: string | null;
  status: string;
  is_active: boolean;
  rating_avg: number;
  rating_count: number;
  product_count: number;
  owner?: { id: number; full_name?: string | null; avatar_url?: string | null; headline?: string | null };
  products?: Product[];
};

/* ── Cart & orders ───────────────────────────────────────── */

export type CartItem = {
  id: number;
  product_id: number;
  qty: number;
  unit_price: Money;
  line_total: Money;
  product?: Product | null;
};

export type Cart = {
  items: CartItem[];
  total: number;
  subtotal: Money;
  shipping_fee: Money;
  tax: Money;
  discount: Money;
  item_count: number;
  total_qty: number;
  free_shipping_threshold: number;
  free_shipping_gap: number;
};

export type OrderItem = {
  id: number;
  item_type: "course" | "book" | "product";
  item_id: number;
  title: string;
  image_url?: string | null;
  unit_price: Money;
  qty: number;
  line_total: Money;
  seller_id?: number | null;
};

export type Order = {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: Money;
  discount: Money;
  shipping_fee: Money;
  tax: Money;
  total: Money;
  currency: string;
  notes?: string | null;
  tracking_id?: string | null;
  placed_at?: string | null;
  items: OrderItem[];
};

export type Address = {
  id: number;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  pincode: string;
  landmark?: string | null;
  is_default: boolean;
};

/* ── Seller / creator ────────────────────────────────────── */

export type Earnings = {
  gross: Money;
  commission: Money;
  commission_percent: number;
  payout: Money;
  currency: string;
};

export type CreatorDashboard = {
  role: string;
  creator_type?: string | null;
  profile: Record<string, unknown>;
  counts: {
    courses: number;
    books: number;
    products: number;
    published_courses: number;
    students: number;
  };
  earnings: Earnings & { orders: number; units: number };
  top_items: Array<{
    item_type: string;
    item_id: number;
    title: string;
    units: number;
    revenue: Money;
  }>;
  recent_sales: Array<{
    order_number: string;
    title: string;
    item_type: string;
    qty: number;
    line_total: Money;
    status: string;
    placed_at?: string | null;
  }>;
};

export type CreatorProfile = {
  user: {
    id: number;
    full_name: string;
    avatar_url?: string | null;
    headline?: string | null;
    bio?: string | null;
    city?: string | null;
    expertise: string[];
    qualifications?: string | null;
    creator_type?: string | null;
    is_verified: boolean;
    role: string;
    joined_at?: string | null;
  };
  stats: {
    courses: number;
    books: number;
    products: number;
    students: number;
    sold: number;
  };
  courses: Course[];
  books: Book[];
  products: Product[];
};

/* ═══════════════════════════════════════════════════════════
   Paged list helper
   ═══════════════════════════════════════════════════════════ */

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
};

function qs(params?: Record<string, unknown>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "" && v !== "all",
  );
  if (!entries.length) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

/* ═══════════════════════════════════════════════════════════
   Courses
   ═══════════════════════════════════════════════════════════ */

export const coursesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<Paged<Course>>(`/courses${qs(params)}`),
  get: (slug: string) => api.get<Course>(`/courses/${slug}`),
  categories: () => api.get<{ items: string[]; total: number }>("/courses/meta/categories"),
  stats: () =>
    api.get<{ courses: number; students: number; lessons: number }>(
      "/courses/meta/stats",
    ),
  create: (data: Record<string, unknown>) =>
    api.post<{ message: string; item: Course }>("/courses", data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put<{ message: string; item: Course }>(`/courses/${id}`, data),
  remove: (id: number) => api.delete<{ message: string }>(`/courses/${id}`),
  addModule: (courseId: number, data: Record<string, unknown>) =>
    api.post<{ message: string; item: CourseModule }>(
      `/courses/${courseId}/modules`,
      data,
    ),
  addLesson: (courseId: number, moduleId: number, data: Record<string, unknown>) =>
    api.post<{ message: string; item: Lesson }>(
      `/courses/${courseId}/modules/${moduleId}/lessons`,
      data,
    ),
  enroll: (courseId: number) =>
    api.post<{ message: string; item: Enrollment }>(`/courses/${courseId}/enroll`),
  reviews: (courseId: number) =>
    api.get<{ items: Review[]; total: number }>(`/courses/${courseId}/reviews`),
  review: (courseId: number, data: { rating: number; title?: string; body?: string }) =>
    api.post<{ message: string; item: Review }>(`/courses/${courseId}/reviews`, data),
};

/* ═══════════════════════════════════════════════════════════
   Books
   ═══════════════════════════════════════════════════════════ */

export const booksApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<Paged<Book>>(`/books${qs(params)}`),
  get: (slug: string) => api.get<Book>(`/books/${slug}`),
  categories: () => api.get<{ items: string[]; total: number }>("/books/meta/categories"),
  stats: () => api.get<{ books: number; sold: number }>("/books/meta/stats"),
  create: (data: Record<string, unknown>) =>
    api.post<{ message: string; item: Book }>("/books", data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put<{ message: string; item: Book }>(`/books/${id}`, data),
  remove: (id: number) => api.delete<{ message: string }>(`/books/${id}`),

  /* ── Digital edition ──────────────────────────────────────────────────
     The PDF itself is never in the public payload: the API hands out a
     download URL only when the book is free or the caller has paid. */
  uploadPdf: (
    bookId: number,
    file: File,
    opts?: { isFreeDownload?: boolean; price?: number },
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("is_free_download", opts?.isFreeDownload ? "true" : "false");
    if (opts?.price !== undefined) form.append("price", String(opts.price));
    return api.post<{ message: string; item: Book }>(`/books/${bookId}/pdf`, form);
  },
  uploadPreviewPdf: (bookId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ message: string; item: Book }>(
      `/books/${bookId}/preview-pdf`,
      form,
    );
  },
  /** Returns a download URL, or 402 when the e-book has not been bought. */
  downloadPdf: (bookId: number) =>
    api.get<{
      message: string;
      url: string;
      file_name: string;
      title: string;
      free: boolean;
    }>(`/books/${bookId}/download`),
  /** Free sample — public, no account needed. */
  preview: (bookId: number) =>
    api.get<{ url: string; pages: number; title: string }>(
      `/books/${bookId}/preview`,
    ),
};

/* ═══════════════════════════════════════════════════════════
   Shop
   ═══════════════════════════════════════════════════════════ */

export const shopApi = {
  products: (params?: Record<string, unknown>) =>
    api.get<Paged<Product>>(`/shop/products${qs(params)}`),
  product: (slug: string) => api.get<Product>(`/shop/products/${slug}`),
  categories: () => api.get<{ items: Category[]; total: number }>("/shop/categories"),
  stats: () =>
    api.get<{ products: number; stores: number; sellers: number }>("/shop/stats"),
  createProduct: (data: Record<string, unknown>) =>
    api.post<{ message: string; item: Product }>("/shop/products", data),
  updateProduct: (id: number, data: Record<string, unknown>) =>
    api.put<{ message: string; item: Product }>(`/shop/products/${id}`, data),
  removeProduct: (id: number) =>
    api.delete<{ message: string }>(`/shop/products/${id}`),
  review: (productId: number, data: { rating: number; title?: string; body?: string }) =>
    api.post<{ message: string; item: Review }>(`/shop/products/${productId}/reviews`, data),
  toggleWishlist: (productId: number) =>
    api.post<{ message: string; liked: boolean; wishlist_count: number }>(
      `/shop/products/${productId}/like`,
    ),
  wishlist: () => api.get<{ items: Array<{ id: number; product?: Product }>; total: number }>(
    "/shop/wishlist",
  ),
};

/* ═══════════════════════════════════════════════════════════
   Cart, checkout & orders
   ═══════════════════════════════════════════════════════════ */

export const cartApi = {
  get: () => api.get<Cart>("/cart"),
  add: (product_id: number, qty = 1) =>
    api.post<Cart & { message: string }>("/cart", { product_id, qty }),
  update: (itemId: number, qty: number) =>
    api.patch<Cart & { message: string }>(`/cart/${itemId}`, { qty }),
  remove: (itemId: number) => api.delete<Cart & { message: string }>(`/cart/${itemId}`),
  clear: () => api.delete<Cart & { message: string }>("/cart"),
};

export const ordersApi = {
  checkout: (data: {
    items?: Array<{ item_type: string; item_id: number; qty?: number }>;
    address_id?: number;
    address?: Record<string, string>;
    payment_method: string;
    coupon_code?: string;
    notes?: string;
  }) =>
    api.post<{ message: string; order: Order; coupon?: unknown; warnings?: string[] }>(
      "/orders/checkout",
      data,
    ),
  mine: (status?: string) => api.get<{ items: Order[]; total: number }>(`/orders/my${qs({ status })}`),
  get: (orderNumber: string) => api.get<Order>(`/orders/${orderNumber}`),
  cancel: (orderId: number) => api.post<{ message: string; item: Order }>(`/orders/${orderId}/cancel`),
};

export const accountApi = {
  addresses: () => api.get<{ items: Address[]; total: number }>("/account/addresses"),
  addAddress: (data: Partial<Address>) =>
    api.post<{ message: string; item: Address }>("/account/addresses", data),
  removeAddress: (id: number) => api.delete<{ message: string }>(`/account/addresses/${id}`),
};

/* ═══════════════════════════════════════════════════════════
   Creator & learning
   ═══════════════════════════════════════════════════════════ */

export const creatorApi = {
  becomeCreator: (data: {
    creator_type: "teacher" | "seller" | "both";
    headline?: string;
    bio?: string;
    city?: string;
    expertise?: string[] | string;
    qualifications?: string;
  }) =>
    api.post<{
      message: string;
      user: Record<string, unknown>;
      /** Re-issued session — the role claim changes with the account. */
      access_token: string;
      refresh_token: string;
    }>("/creator/become-creator", data),
  dashboard: () => api.get<CreatorDashboard>("/creator/dashboard"),
  earnings: () =>
    api.get<{
      gross: Money;
      commission: Money;
      payout: Money;
      commission_percent: number;
      currency: string;
      entries: Array<{
        order_number: string;
        title: string;
        item_type: string;
        qty: number;
        gross: Money;
        commission: Money;
        payout: Money;
        status: string;
        placed_at?: string | null;
      }>;
      total: number;
    }>("/creator/earnings"),
};

export const storesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<Paged<Store>>(`/stores${qs(params)}`),
  get: (slug: string) => api.get<Store>(`/stores/${slug}`),
  create: (data: Record<string, unknown>) =>
    api.post<{ message: string; item: Store }>("/stores", data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put<{ message: string; item: Store }>(`/stores/${id}`, data),
};

export const profilesApi = {
  get: (userId: number) => api.get<CreatorProfile>(`/profiles/${userId}`),
};

export const learningApi = {
  myCourses: () => api.get<{ items: Enrollment[]; total: number }>("/my/courses"),
  updateProgress: (courseId: number, lessonId: number, completed = true) =>
    api.put<{ message: string; item: Enrollment }>(
      `/my/courses/${courseId}/progress`,
      { lesson_id: lessonId, completed },
    ),
};
