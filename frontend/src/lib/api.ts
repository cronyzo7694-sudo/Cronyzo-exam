/**
 * API client — all backend calls go through here.
 * --------------------------------------------
 * EXTENSION POINT: Add interceptors / offline queue here
 * --------------------------------------------
 */

const API_BASE = (import.meta.env.VITE_API_URL?.trim() || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem("access_token", access);
  if (refresh) localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method || "GET";
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, {
    ...options,
    headers,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      res.statusText ||
      "Request failed";
    if (res.status === 401) {
      // token dead — clear (router will bounce to login)
      if (!path.includes("/auth/login")) {
        clearTokens();
      }
    }
    throw new ApiError(String(msg), res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---------- Auth ----------
export type User = {
  id: number;
  email: string | null;
  full_name: string;
  role: "admin" | "student" | "guest" | "teacher" | "seller";
  is_active: boolean;
  avatar_url?: string | null;
  phone?: string | null;
  is_guest?: boolean;
  auth_provider?: string | null;
  /** Creator profile — present for teachers / sellers */
  is_verified?: boolean;
  headline?: string | null;
  bio?: string | null;
  city?: string | null;
  expertise?: string[];
  qualifications?: string | null;
  creator_type?: "teacher" | "seller" | "both" | null;
};

/** Capabilities the server resolves — the client never re-derives them. */
export type SessionCapabilities = {
  can_publish_courses: boolean;
  can_publish_books: boolean;
  can_sell_products: boolean;
  can_take_exams: boolean;
  can_manage_exams: boolean;
  can_administer: boolean;
};

/** How Google sign-in is currently wired on the server. */
export type GoogleMode = "firebase" | "gis" | "demo";

export type Session = {
  user: User;
  role: User["role"];
  creator_type: "teacher" | "seller" | "both" | null;
  is_guest: boolean;
  is_authenticated: boolean;
  capabilities: SessionCapabilities;
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{
      user: User;
      access_token: string;
      refresh_token: string;
      message: string;
    }>("/auth/login", { email, password }),
  register: (payload: { email: string; password: string; full_name: string }) =>
    api.post<{
      user: User;
      access_token: string;
      refresh_token: string;
    }>("/auth/register", payload),
  /** Anonymous session — no email/password */
  guest: (display_name?: string) =>
    api.post<{
      user: User;
      access_token: string;
      refresh_token: string;
      message: string;
      is_guest?: boolean;
    }>("/auth/guest", display_name ? { display_name } : {}),
  /**
   * Google sign-in. Pass a Firebase ID token / Google credential when keys are
   * configured; omit it in testing mode and the server signs in a demo account.
   */
  google: (id_token?: string) =>
    api.post<{
      user: User;
      access_token: string;
      refresh_token: string;
      message: string;
      google_mode?: GoogleMode;
      google_message?: string;
    }>("/auth/google", id_token ? { id_token } : {}),
  phoneSendOtp: (phone: string) =>
    api.post<{
      message: string;
      phone_hint?: string;
      expires_in?: number;
      dev_otp?: string;
    }>("/auth/phone/send-otp", { phone }),
  phoneVerifyOtp: (phone: string, otp: string, full_name?: string) =>
    api.post<{
      user: User;
      access_token: string;
      refresh_token: string;
      message: string;
    }>("/auth/phone/verify-otp", { phone, otp, full_name }),
  methods: () =>
    api.get<{
      guest: boolean;
      email_password: boolean;
      google: boolean;
      google_mode?: GoogleMode;
      google_client_id: string;
      firebase_project_id?: string;
      phone_otp: boolean;
    }>("/auth/methods"),
  me: () => api.get<{ user: User }>("/auth/me"),
  /**
   * The single authoritative identity for the whole web app.
   * Everything — nav, guards, "Sell" buttons — is derived from this.
   */
  session: () => api.get<Session>("/auth/session"),
  /**
   * Turn the current guest session into a full account **in place** so the
   * guest's attempts, cart and progress follow them. Same user row.
   */
  claim: (payload: { email: string; password: string; full_name?: string }) =>
    api.post<{
      message: string;
      user: User;
      access_token: string;
      refresh_token: string;
    }>("/auth/claim", payload),
  updateMe: (data: {
    full_name?: string;
    phone?: string | null;
    avatar_url?: string | null;
    password?: string;
  }) =>
    api.put<{ message: string; user: User }>("/auth/me", data),
  /** Change password — the server asks for the current one first. */
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ message: string; user: User }>("/auth/change-password", {
      current_password,
      new_password,
    }),
};

// ---------- Images (covers, product photos, avatars) ----------
export type UploadedImage = {
  id: string;
  url: string;
  mime: string;
  size_bytes: number;
  width: number;
  height: number;
  deduplicated?: boolean;
};

/**
 * One image, straight from the phone's gallery or the desktop's file picker.
 * The server resizes it to a web-safe JPEG (long edge 1600 px) before storing
 * it, so a 6 MB camera photo comes back as ~150 KB and pages stay fast.
 */
export const uploadsApi = {
  image: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<UploadedImage>("/uploads/image", form);
  },
};

// ---------- Subjects / Chapters ----------
export type Subject = {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  icon?: string;
  color?: string;
  order_index: number;
  is_active: boolean;
  chapter_count?: number;
  question_count?: number;
};

export type Chapter = {
  id: number;
  subject_id: number;
  name: string;
  description?: string | null;
  order_index: number;
  is_active: boolean;
  question_count?: number;
  subject_name?: string;
};

export const subjectsApi = {
  list: (params?: string) =>
    api.get<{ items: Subject[]; total: number }>(`/subjects${params ? `?${params}` : ""}`),
  get: (id: number) => api.get<Subject & { chapters: Chapter[] }>(`/subjects/${id}`),
  create: (data: Partial<Subject>) => api.post<{ item: Subject }>("/subjects", data),
  update: (id: number, data: Partial<Subject>) =>
    api.put<{ item: Subject }>(`/subjects/${id}`, data),
  remove: (id: number) => api.delete(`/subjects/${id}`),
};

export const chaptersApi = {
  list: (params?: string) =>
    api.get<{ items: Chapter[]; total: number }>(`/chapters${params ? `?${params}` : ""}`),
  create: (data: Partial<Chapter> & { name: string; subject_id: number }) =>
    api.post<{ item: Chapter }>("/chapters", data),
  update: (id: number, data: Partial<Chapter>) =>
    api.put<{ item: Chapter }>(`/chapters/${id}`, data),
  remove: (id: number) => api.delete(`/chapters/${id}`),
};

// ---------- Questions ----------
export type QuestionOption = {
  id?: number;
  option_key: string;
  option_text: string;
  option_html?: string | null;
  image_url?: string | null;
  order_index?: number;
};

export type Question = {
  id: number;
  subject_id?: number | null;
  chapter_id?: number | null;
  subject_name?: string | null;
  chapter_name?: string | null;
  question_type: string;
  difficulty: string;
  question_text: string;
  question_html?: string | null;
  paragraph_text?: string | null;
  paragraph_html?: string | null;
  image_url?: string | null;
  media?: Record<string, unknown>;
  marks: number;
  negative_marks: number;
  time_seconds?: number | null;
  tags?: string[];
  language?: string;
  is_active: boolean;
  options: QuestionOption[];
  correct_answer?: string | string[];
  explanation?: string | null;
  explanation_html?: string | null;
};

export const questionsApi = {
  list: (params?: string) =>
    api.get<{ items: Question[]; total: number; page: number; per_page: number }>(
      `/questions${params ? `?${params}` : ""}`,
    ),
  get: (id: number) => api.get<Question>(`/questions/${id}?include_answer=true`),
  types: () =>
    api.get<{ question_types: string[]; difficulties: string[] }>("/questions/types"),
  create: (data: Record<string, unknown>) =>
    api.post<{ item: Question }>("/questions", data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put<{ item: Question }>(`/questions/${id}`, data),
  remove: (id: number) => api.delete(`/questions/${id}`),
};

// ---------- Exams ----------
export type ExamSection = {
  id: number;
  exam_id: number;
  title: string;
  description?: string | null;
  order_index: number;
  duration_seconds?: number | null;
  subject_id?: number | null;
  question_count?: number;
  questions?: ExamQuestion[];
};

export type ExamQuestion = {
  id: number;
  exam_id: number;
  section_id?: number | null;
  question_id: number;
  order_index: number;
  marks: number;
  negative_marks: number;
  question?: Question;
};

export type Exam = {
  id: number;
  title: string;
  description?: string | null;
  instructions?: string | null;
  exam_mode: string;
  status: string;
  duration_seconds: number;
  strict_sections: boolean;
  default_marks: number;
  default_negative_marks: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  require_fullscreen: boolean;
  max_tab_switches: number;
  show_result_immediately: boolean;
  total_questions: number;
  total_marks: number;
  parent_exam_id?: number | null;
  children?: Exam[];
  sections: ExamSection[];
  created_at?: string;
  /** Additive from Rule Engine — optional */
  resolved_rules?: ExamRulesPublic;
  rules?: ExamRulesPublic;
};

export const examsApi = {
  list: (params?: string) =>
    api.get<{ items: Exam[]; total: number }>(`/exams${params ? `?${params}` : ""}`),
  /** Fetch EVERY exam across all pages (unlimited) by looping pagination.
   *  NOTE: the backend clamps per_page to 100, so we page in 100s and loop
   *  until we've collected the reported total (or a page returns nothing). */
  listAll: async (params?: string): Promise<Exam[]> => {
    const perPage = 100; // backend hard cap
    const seen = new Map<number, Exam>();
    let page = 1;
    for (;;) {
      const base = params ? `${params}&` : "";
      const res = await api.get<{ items: Exam[]; total: number }>(
        `/exams?${base}per_page=${perPage}&page=${page}`
      );
      const items = res.items || [];
      for (const it of items) seen.set(it.id, it);
      const total = res.total ?? 0;
      if (items.length === 0 || seen.size >= total || page * perPage >= total) break;
      page++;
    }
    return Array.from(seen.values());
  },
  get: (id: number, includeQuestions = false) =>
    api.get<Exam>(`/exams/${id}${includeQuestions ? "?include_questions=true" : ""}`),
  create: (data: Record<string, unknown>) => api.post<{ item: Exam }>("/exams", data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put<{ item: Exam }>(`/exams/${id}`, data),
  remove: (id: number) => api.delete(`/exams/${id}`),
  addSection: (examId: number, data: Record<string, unknown>) =>
    api.post<{ item: ExamSection }>(`/exams/${examId}/sections`, data),
  updateSection: (examId: number, sectionId: number, data: Record<string, unknown>) =>
    api.put<{ item: ExamSection }>(`/exams/${examId}/sections/${sectionId}`, data),
  deleteSection: (examId: number, sectionId: number) =>
    api.delete(`/exams/${examId}/sections/${sectionId}`),
  assignQuestions: (examId: number, data: Record<string, unknown>) =>
    api.post<{ item: Exam; added: number[] }>(`/exams/${examId}/questions`, data),
  removeQuestion: (examId: number, examQuestionId: number) =>
    api.delete(`/exams/${examId}/questions/${examQuestionId}`),
  publish: (examId: number) => api.post<{ item: Exam }>(`/exams/${examId}/publish`),
  unpublish: (examId: number) => api.post<{ item: Exam }>(`/exams/${examId}/unpublish`),
  // File bank + auto test generation
  fileBankStats: () => api.get<any>("/exams/file-bank/stats"),
  reloadFileBank: () => api.post<any>("/exams/file-bank/reload", {}),
  factoryReset: () => api.post<any>("/exams/admin/factory-reset", { confirm: "DELETE EVERYTHING" }),
  rebuildAllTests: () => api.post<any>("/exams/admin/rebuild-all-tests", {}),
  generateTests: (examId: number) => api.post<any>(`/exams/${examId}/generate-tests`, {}),
  rebuildExamTests: (examId: number) => api.post<any>(`/exams/${examId}/rebuild-tests`, {}),
};

// ---------- Attempts ----------
export type Attempt = {
  id: number;
  exam_id: number;
  user_id: number;
  status: string;
  started_at?: string;
  submitted_at?: string;
  expires_at?: string;
  duration_seconds: number;
  time_spent_seconds: number;
  total_questions: number;
  attempted_count: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  score: number;
  max_score: number;
  percentage: number;
  negative_marks_total: number;
  tab_switch_count: number;
  section_results?: unknown[];
  exam_title?: string;
  user_name?: string;
  current_section_index?: number;
  current_question_index?: number;
};

export type PlayerQuestion = {
  exam_question_id: number;
  question_id: number;
  order_index: number;
  marks: number;
  negative_marks: number;
  section_id?: number | null;
  question: Question;
  answer: {
    selected_answer: string | string[] | null;
    is_answered: boolean;
    is_marked_for_review: boolean;
    is_visited: boolean;
    time_spent_seconds: number;
  };
};

export type PlayerSection = {
  id: number | null;
  title: string;
  description?: string | null;
  order_index: number;
  duration_seconds?: number | null;
  questions: PlayerQuestion[];
};

/** Configuration-driven exam rules from backend Rule Engine (additive). */
export type ExamRulesPublic = {
  version?: number;
  timing?: {
    overall_seconds?: number;
    auto_submit_on_expiry?: boolean;
    allow_pause?: boolean;
    max_pauses?: number;
    section_timers?: boolean;
    section_auto_submit_on_expiry?: boolean;
    warnings?: unknown[];
  };
  sections?: {
    strict_order?: boolean;
    lock_on_complete?: boolean;
    allow_previous_section?: boolean;
    allow_next_section?: boolean;
    show_section_tabs?: boolean;
  };
  navigation?: {
    allow_skip?: boolean;
    allow_review?: boolean;
    allow_mark_for_review?: boolean;
    allow_clear_response?: boolean;
    free_question_navigation?: boolean;
    resume_allowed?: boolean;
  };
  questions?: {
    shuffle_questions?: boolean;
    shuffle_options?: boolean;
    mandatory_question_ids?: number[];
    optional_question_ids?: number[];
  };
  marking?: {
    negative_marking?: boolean;
    default_marks?: number;
    default_negative_marks?: number;
    partial_marking?: boolean;
  };
  language?: {
    allowed?: string[];
    default?: string;
    allow_switch?: boolean;
  };
  security?: {
    require_fullscreen?: boolean;
    detect_tab_switch?: boolean;
    max_tab_switches?: number;
    force_submit_on_max_tab_switches?: boolean;
    prevent_copy?: boolean;
    prevent_paste?: boolean;
    prevent_right_click?: boolean;
  };
  aids?: {
    calculator_allowed?: boolean;
    rough_sheet_allowed?: boolean;
  };
  modes?: {
    exam_mode?: string;
    show_answer_after_each?: boolean;
    show_solution_after_submit?: boolean;
    allow_multiple_attempts?: boolean;
    max_attempts_per_user?: number;
  };
  submission?: {
    confirm_before_submit?: boolean;
    warn_unanswered?: boolean;
    warn_marked_review?: boolean;
    auto_submit_on_expiry?: boolean;
  };
  result?: {
    show_immediate?: boolean;
    show_correct_answers?: boolean;
    show_explanations?: boolean;
    show_section_breakdown?: boolean;
    show_time_analysis?: boolean;
    show_percentile?: boolean;
    show_rank_prediction?: boolean;
  };
  ui?: Record<string, unknown>;
};

export type PlayerPayload = {
  attempt: Attempt;
  exam: {
    id: number;
    title: string;
    instructions?: string | null;
    duration_seconds: number;
    strict_sections: boolean;
    require_fullscreen: boolean;
    max_tab_switches: number;
    show_result_immediately: boolean;
    total_questions: number;
    total_marks: number;
    exam_mode?: string;
  };
  /** Present when backend Rule Engine is active — optional for older payloads */
  rules?: ExamRulesPublic;
  sections: PlayerSection[];
  time_remaining_seconds: number | null;
};

export type ResultPayload = {
  attempt_id: number;
  exam_id: number;
  exam_title?: string;
  status: string;
  score: number;
  max_score: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  attempted_count: number;
  total_questions: number;
  negative_marks_total: number;
  time_spent_seconds: number;
  section_results?: unknown[];
  submitted_at?: string;
};

export type AttemptAnalytics = {
  attempt_id?: number;
  accuracy?: number;
  attempt_rate?: number;
  speed_qpm?: number;
  avg_time_per_question?: number;
  median_time_per_question?: number;
  total_time_seconds?: number;
  guess_count?: number;
  guess_rate?: number;
  attempt_quality?: number;
  percentile?: number | null;
  rank_prediction?: number | null;
  peer_count?: number;
  wrong_pattern?: Record<string, number>;
  score_loss?: {
    total?: number;
    from_wrong?: number;
    from_negative?: number;
    from_skipped?: number;
  };
  weak_subjects?: Array<Record<string, unknown>>;
  strong_subjects?: Array<Record<string, unknown>>;
  weak_chapters?: Array<Record<string, unknown>>;
  by_subject?: Array<Record<string, unknown>>;
  by_section?: Array<Record<string, unknown>>;
  by_difficulty?: Record<string, Record<string, unknown>>;
  ai_coach?: {
    summary?: string;
    focus_areas?: string[];
    suggestions?: string[];
    next_best_action?: string;
  };
  suggestions?: string[];
  mistakes?: Array<Record<string, unknown>>;
  revision_queue?: Array<Record<string, unknown>>;
  question_timing?: Array<Record<string, unknown>>;
};

export const attemptsApi = {
  start: (examId: number) =>
    api.post<PlayerPayload>("/attempts/start", { exam_id: examId }),
  questionExplanation: (questionId: number, lang: "hi" | "en") =>
    api.post<{ lang: string; explanation: string }>(
      `/attempts/questions/${questionId}/explanation`,
      { lang }
    ),
  translateQuestion: (questionId: number, lang: "hi" | "en") =>
    api.post<{
      lang: string;
      question_text: string;
      paragraph_text?: string | null;
      explanation?: string | null;
      options: { option_key: string; option_text: string }[];
    }>(`/attempts/questions/${questionId}/translate`, { lang }),
  get: (id: number) => api.get<PlayerPayload | Attempt>(`/attempts/${id}`),
  list: (params?: string) =>
    api.get<{ items: Attempt[]; total: number }>(`/attempts${params ? `?${params}` : ""}`),
  saveAnswer: (attemptId: number, data: Record<string, unknown>) =>
    api.post(`/attempts/${attemptId}/answer`, data),
  bulkAnswers: (attemptId: number, answers: unknown[]) =>
    api.post(`/attempts/${attemptId}/answers/bulk`, { answers }),
  security: (attemptId: number, data: Record<string, unknown>) =>
    api.post(`/attempts/${attemptId}/security`, data),
  submit: (attemptId: number, data?: Record<string, unknown>) =>
    api.post<{ attempt: Attempt; result: ResultPayload; message: string }>(
      `/attempts/${attemptId}/submit`,
      data || {},
    ),
  result: (attemptId: number) => api.get<ResultPayload>(`/attempts/${attemptId}/result`),
  review: (attemptId: number) =>
    api.get<{
      result: ResultPayload;
      items: any[];
      analytics?: AttemptAnalytics;
      message?: string;
    }>(`/attempts/${attemptId}/review`),
};

// ---------- Analytics / Import / Admin ----------
export const analyticsApi = {
  dashboard: () => api.get<any>("/analytics/dashboard"),
  exam: (examId: number) => api.get<any>(`/analytics/exams/${examId}`),
  attempt: (attemptId: number) => api.get<AttemptAnalytics>(`/analytics/attempts/${attemptId}`),
};

// AI Knowledge Engine types
export type KnowledgeQuestion = {
  id: string;
  qid: string;
  raw_text: string;
  normalized_question: string;
  semantic_summary: string;
  question_text: string;
  question_type: string;
  options: { option_key: string; option_text: string; is_correct?: boolean }[];
  correct_answer: string | string[] | null;
  explanation: string | null;
  classification: {
    subject: string | null;
    chapter: string | null;
    topic: string | null;
    subtopic?: string | null;
    micro_topic?: string | null;
    concepts?: string[];
    pattern?: string | null;
    question_family?: string | null;
    bloom_taxonomy?: string | null;
    difficulty: string;
    difficulty_score?: number;
    expected_time_seconds?: number;
  };
  metadata: {
    exam_name?: string | null;
    exam_year?: number | null;
    shift?: string | null;
    source_book?: string | null;
    page_number?: number | null;
    source_type?: string;
  };
  tags: string[];
  keywords: string[];
  duplicate_info: {
    is_duplicate: boolean;
    duplicate_of: number | null;
    fingerprint_hash: string;
    semantic_hash: string;
    similarity_score: number | null;
  };
  appearance_history: any[];
  confidence_score: number;
  needs_human_review?: boolean;
  needs_review?: boolean;
  review_reasons?: string[];
  frontend_compatible?: any;
};

export type KnowledgeImportResult = {
  message: string;
  knowledge_job?: any;
  job?: any;
  total_blocks_found: number;
  questions_created: number;
  duplicates_found: number;
  needs_review: number;
  created_ids?: number[];
  duplicate_ids?: number[];
  needs_review_ids?: number[];
  errors: any[];
  success_count: number;
  error_count: number;
  duplicate_count: number;
  questions?: KnowledgeQuestion[];
  preview?: any[];
  filename?: string;
  extracted_preview?: string;
};

export const importsApi = {
  json: (payload: Record<string, unknown>) =>
    api.post<any>("/imports/questions/json", payload),
  csv: (form: FormData) => api.post<any>("/imports/questions/csv", form),
  template: () => api.get<{ content: string; filename: string }>("/imports/questions/template"),
  jobs: () => api.get<{ items: any[]; total: number }>("/imports/jobs"),
  // Knowledge Engine - Internal Brain - ANY format
  aiText: (payload: {
    raw_text: string;
    source_book?: string;
    exam_name?: string;
    exam_year?: number;
    source_type?: string;
    marks?: number;
    negative_marks?: number;
    skip_duplicates?: boolean;
    preview?: boolean;
  }) => api.post<KnowledgeImportResult>("/imports/questions/ai", payload),
  aiTextPreview: (payload: {
    raw_text: string;
    source_book?: string;
    exam_name?: string;
    source_type?: string;
  }) => api.post<KnowledgeImportResult>("/imports/questions/ai/preview", { ...payload, preview: true }),
  aiFile: (form: FormData) => api.post<KnowledgeImportResult>("/imports/questions/ai/file", form),
  knowledgeJobs: () => api.get<{ items: any[]; total: number }>("/imports/knowledge/jobs"),
  knowledgeJob: (id: number) => api.get<any>(`/imports/knowledge/jobs/${id}`),
  questionAppearances: (questionId: number) =>
    api.get<{ question_id: number; qid: string | null; items: any[]; total: number }>(
      `/imports/knowledge/question/${questionId}/appearances`
    ),
  knowledgeStats: () => api.get<any>("/imports/knowledge/stats"),
};

export const adminApi = {
  users: (params?: string) =>
    api.get<{ items: User[]; total: number }>(`/admin/users${params ? `?${params}` : ""}`),
  createUser: (data: Record<string, unknown>) =>
    api.post<{ item: User }>("/admin/users", data),
  updateUser: (id: number, data: Record<string, unknown>) =>
    api.put<{ item: User }>(`/admin/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
};

// ---------- Platform (configuration / flags / monetization) ----------
export type PlatformPublicConfig = {
  app?: {
    name?: string;
    version?: string;
    environment?: string;
    timezone?: string;
    default_theme?: string;
    default_locale?: string;
  };
  features?: Record<string, boolean>;
  monetization?: {
    mode?: string;
    currency?: string;
    trial_days?: number;
  };
  ads?: {
    enabled?: boolean;
    provider?: string;
    client_id?: string;
    slots?: Record<string, boolean>;
    show_for_free_users?: boolean;
    hide_for_premium?: boolean;
    disable_during_exam?: boolean;
    disable_during_review?: boolean;
  };
  subscriptions?: {
    enabled?: boolean;
    plans?: Array<Record<string, unknown>>;
  };
  payments?: {
    enabled?: boolean;
    provider?: string;
    currency?: string;
  };
  localization?: {
    default?: string;
    allowed?: string[];
  };
  maintenance?: {
    enabled?: boolean;
    message?: string;
  };
  theme?: string;
};

export const platformApi = {
  config: () => api.get<PlatformPublicConfig>("/platform/config"),
  features: () => api.get<{ features: Record<string, boolean> }>("/platform/features"),
  monetization: () => api.get<Record<string, unknown>>("/platform/monetization"),
  ads: (placement = "dashboard") =>
    api.get<Record<string, unknown>>(`/platform/ads?placement=${encodeURIComponent(placement)}`),
  entitlements: () =>
    api.get<{
      plan_code?: string;
      is_premium?: boolean;
      status?: string;
      features?: string[];
      permissions?: Record<string, boolean>;
    }>("/platform/me/entitlements"),
};

export const banksApi = {
  list: () => api.get<{ items: Array<{ id: number; name: string; code?: string; question_count?: number }>; total: number }>("/banks"),
  create: (data: Record<string, unknown>) => api.post<{ item: any }>("/banks", data),
};

// ---------- Notifications ----------
export type AppNotification = {
  id: number;
  user_id?: number | null;
  category: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: string;
  status?: string;
  channels?: string[];
  created_at?: string;
  read_at?: string | null;
  is_read?: boolean;
};

export type NotificationPreferences = {
  user_id?: number;
  channels: {
    in_app: boolean;
    email: boolean;
    telegram: boolean;
    push: boolean;
    whatsapp: boolean;
    sms: boolean;
  };
  categories: {
    exam_alerts: boolean;
    result_alerts: boolean;
    reminders: boolean;
    marketing: boolean;
    system: boolean;
    security: boolean;
  };
  telegram_chat_id?: string | null;
};

export const notificationsApi = {
  list: (params?: string) =>
    api.get<{ items: AppNotification[]; total: number; unread: number; page: number }>(
      `/notifications${params ? `?${params}` : ""}`,
    ),
  unreadCount: () => api.get<{ unread: number }>("/notifications/unread-count"),
  markRead: (id: number) => api.post<{ item: AppNotification }>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<{ count: number }>("/notifications/read-all", {}),
  getPreferences: () => api.get<NotificationPreferences>("/notifications/preferences"),
  updatePreferences: (data: Partial<NotificationPreferences> & Record<string, unknown>) =>
    api.put<{ item: NotificationPreferences }>("/notifications/preferences", data),
  adminStatus: () => api.get<Record<string, unknown>>("/notifications/admin/status"),
  adminTemplates: () =>
    api.get<{ items: Array<Record<string, unknown>>; total: number }>("/notifications/admin/templates"),
  adminBroadcast: (data: Record<string, unknown>) =>
    api.post<{ recipients: number }>("/notifications/admin/broadcast", data),
  adminHistory: (params?: string) =>
    api.get<{ items: AppNotification[]; total: number }>(
      `/notifications/admin/history${params ? `?${params}` : ""}`,
    ),
  adminProcessQueue: () => api.post<{ processed: number }>("/notifications/admin/process-queue", {}),
};

export type UserMessage = {
  id: number;
  user_id?: number | null;
  name?: string | null;
  email?: string | null;
  message_type: string;
  message: string;
  status: string;
  created_at?: string;
};

export const messagesApi = {
  send: (data: { message: string; message_type?: string; name?: string; email?: string }) =>
    api.post<{ message: string; item: UserMessage }>("/messages", data),
  listAdmin: (params?: string) =>
    api.get<{ items: UserMessage[]; total: number }>(`/messages/admin${params ? `?${params}` : ""}`),
  setStatus: (id: number, status: string) =>
    api.post<{ item: UserMessage }>(`/messages/admin/${id}/status`, { status }),
};

/* ═══════════════════════════════════════════════════════════════════════
   Site content — every word on the landing page is operator-editable
   ═══════════════════════════════════════════════════════════════════════ */

export type HeroSlide = {
  id: number;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  image_alt: string;
  cta_label: string | null;
  cta_url: string | null;
  accent: string;
  sort_order: number;
  is_active: boolean;
};

export type PillarCard = {
  id: number;
  icon: string;
  title: string;
  description: string | null;
  bullets: string[];
  link_url: string;
  link_label: string;
  accent: string;
  sort_order: number;
  is_active: boolean;
};

export type Testimonial = {
  id: number;
  author_name: string;
  author_role: string | null;
  quote: string;
  avatar_url: string | null;
  initials: string;
  accent: string;
  sort_order: number;
  is_active: boolean;
};

export type StatsCard = { value: string; label: string; icon: string };

export type SiteStats = {
  learners: number;
  courses: number;
  books: number;
  products: number;
  stores: number;
  categories: number;
  enrollments: number;
  orders: number;
  rating_avg: number;
  seller_payout_percent: number;
  commission_percent: number;
  mock_tests: string;
  cards: StatsCard[];
};

export type SiteFeatures = {
  guest_browsing: boolean;
  guest_can_purchase: boolean;
  show_hero_carousel: boolean;
  flag_enabled: boolean;
};

export type SiteContent = {
  /** Dotted key → decoded value. Always populated from server defaults. */
  settings: Record<string, any>;
  hero_slides: HeroSlide[];
  pillars: PillarCard[];
  testimonials: Testimonial[];
  features: SiteFeatures;
  /** Only present on GET /site/home */
  stats?: SiteStats;
  featured?: { courses: any[]; books: any[]; products: any[] };
};

export const siteApi = {
  /** Editorial content only — cheap and cacheable. */
  content: () => api.get<SiteContent>("/site/content"),
  /** Content + real counters + catalogue previews in one round trip. */
  home: () => api.get<SiteContent>("/site/home"),
  stats: () => api.get<SiteStats>("/site/stats"),
  featured: (limit = 4) =>
    api.get<{ courses: any[]; books: any[]; products: any[] }>(
      `/site/featured?limit=${limit}`,
    ),
};

/* ═══════════════════════════════════════════════════════════════════════
   Admin — site content editor
   ═══════════════════════════════════════════════════════════════════════ */

export type AdminSitePayload = SiteContent & {
  all_slides: HeroSlide[];
  all_pillars: PillarCard[];
  all_testimonials: Testimonial[];
  definitions: {
    key: string;
    value_type: string;
    group: string;
    label: string | null;
    default: any;
  }[];
};

/* ── Shopkeeper applications ───────────────────────────────────────────── */

export type SellerApplication = {
  id: number;
  shop_name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  sells: "products" | "books" | "both";
  gstin: string | null;
  about: string | null;
  document_url: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  admin_note: string | null;
  created_at: string | null;
  applicant?: { id: number; full_name: string; email: string | null; role: string } | null;
};

export const sellerApi = {
  application: () =>
    api.get<{
      application: SellerApplication | null;
      is_seller: boolean;
      can_publish: boolean;
      is_admin: boolean;
      role: string;
    }>("/seller/application"),
  apply: (payload: Record<string, unknown>) =>
    api.post<{ message: string; application: SellerApplication }>("/seller/apply", payload),
};

export const adminSellerApi = {
  list: (status?: string) =>
    api.get<{ items: SellerApplication[]; total: number; pending: number }>(
      `/admin/seller/applications${status ? `?status=${status}` : ""}`,
    ),
  review: (id: number, action: "approve" | "reject" | "suspend", note?: string) =>
    api.post<{ message: string; application: SellerApplication }>(
      `/admin/seller/applications/${id}/review`,
      { action, note },
    ),
};

/* ── Payments ──────────────────────────────────────────────────────────── */

export type PaymentsConfig = {
  mode: "dummy" | "razorpay";
  configured: boolean;
  key_id: string;
  currency: string;
  test_keys: boolean;
  dummy_reason: string;
  checkout_script: string;
};

export type PaymentOrder = {
  message: string;
  mode: "dummy" | "razorpay";
  amount: number;
  amount_rupees: number;
  currency: string;
  order: {
    id: string;
    amount: number;
    currency: string;
    receipt?: string;
    mode: "dummy" | "razorpay";
    key_id: string;
  };
};

export const paymentsApi = {
  /** Which gateway is active right now (dummy until keys are pasted). */
  config: () => api.get<PaymentsConfig>("/payments/config"),
  /** Create the gateway order for whatever is in the server-side cart. */
  createOrder: () => api.post<PaymentOrder>("/payments/order", {}),
  /** Verify the signature the checkout handed back. */
  verify: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    amount_rupees: number;
  }) =>
    api.post<{ message: string; verified: boolean; mode: string }>(
      "/payments/verify",
      payload,
    ),
};

/* ── Integrations health ───────────────────────────────────────────────── */

export type IntegrationStatus = "live" | "demo" | "missing" | "error";

export type IntegrationItem = {
  key: string;
  label: string;
  status: IntegrationStatus;
  detail: string;
  env: string[];
  fix: string;
  checked_at: string;
};

export type IntegrationsPayload = {
  summary: {
    headline: string;
    live: number;
    demo: number;
    missing: number;
    error: number;
    all_green: boolean;
  } | null;
  items: IntegrationItem[];
  checked_at?: string;
};

export const adminSiteApi = {
  content: () => api.get<AdminSitePayload>("/admin/site/content"),
  saveSettings: (settings: Record<string, any>) =>
    api.put<{ message: string; saved: string[]; settings: Record<string, any> }>(
      "/admin/site/settings",
      { settings },
    ),
  status: () =>
    api.get<{
      telegram: {
        configured: boolean;
        has_token: boolean;
        has_chat_id: boolean;
        public_handle: string;
      };
    }>("/admin/site/status"),

  /** Live health of every external service — "is Google real yet?" answered. */
  integrations: () => api.get<IntegrationsPayload>("/admin/site/integrations"),
  testIntegration: (key: string) =>
    api.post<IntegrationsPayload>("/admin/site/integrations/test", { key }),

  /** Fire a test message to the operator's Telegram chat. */
  testTelegram: () =>
    api.post<{ ok: boolean; detail: string }>("/admin/site/telegram/test"),

  createSlide: (payload: Partial<HeroSlide>) =>
    api.post<{ message: string; slide: HeroSlide }>("/admin/site/hero", payload),
  updateSlide: (id: number, payload: Partial<HeroSlide>) =>
    api.put<{ message: string; slide: HeroSlide }>(`/admin/site/hero/${id}`, payload),
  deleteSlide: (id: number) => api.delete<{ message: string }>(`/admin/site/hero/${id}`),

  createPillar: (payload: Partial<PillarCard>) =>
    api.post<{ message: string; pillar: PillarCard }>("/admin/site/pillars", payload),
  updatePillar: (id: number, payload: Partial<PillarCard>) =>
    api.put<{ message: string; pillar: PillarCard }>(`/admin/site/pillars/${id}`, payload),
  deletePillar: (id: number) =>
    api.delete<{ message: string }>(`/admin/site/pillars/${id}`),

  createTestimonial: (payload: Partial<Testimonial>) =>
    api.post<{ message: string; testimonial: Testimonial }>(
      "/admin/site/testimonials",
      payload,
    ),
  updateTestimonial: (id: number, payload: Partial<Testimonial>) =>
    api.put<{ message: string; testimonial: Testimonial }>(
      `/admin/site/testimonials/${id}`,
      payload,
    ),
  deleteTestimonial: (id: number) =>
    api.delete<{ message: string }>(`/admin/site/testimonials/${id}`),
};

/* ═══════════════════════════════════════════════════════════════════════
   Chat — real 1:1 messaging between users
   ═══════════════════════════════════════════════════════════════════════ */

export type ChatPeer = {
  id: number;
  full_name: string;
  avatar_url: string | null;
  role: User["role"];
  is_verified: boolean;
};

export type ChatThread = {
  id: number;
  peer: ChatPeer;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread?: number;
};

export type ChatMessage = {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  attachment_url: string | null;
  is_mine: boolean;
  read_at: string | null;
  created_at: string | null;
};

export const chatApi = {
  threads: () => api.get<{ threads: ChatThread[] }>("/chat/threads"),
  startThread: (payload: { peer_id: number; message?: string }) =>
    api.post<{ message: string; created: boolean; thread: ChatThread }>(
      "/chat/threads",
      payload,
    ),
  messages: (threadId: number, after = 0) =>
    api.get<{
      thread: ChatThread;
      messages: ChatMessage[];
      cursor: number;
    }>(`/chat/threads/${threadId}/messages?after=${after}`),
  send: (threadId: number, body: string) =>
    api.post<{ message: string; chat_message: ChatMessage }>(
      `/chat/threads/${threadId}/messages`,
      { body },
    ),
  markRead: (threadId: number) =>
    api.post<{ message: string; updated: number }>(
      `/chat/threads/${threadId}/read`,
      {},
    ),
  unread: () => api.get<{ unread: number; threads: number }>("/chat/unread"),
};

/* ═══════════════════════════════════════════════════════════════════════
   Contact / helpdesk — messages land on the operator's Telegram
   ═══════════════════════════════════════════════════════════════════════ */

export type ContactReply = {
  id: number;
  body: string;
  /** "panel" = typed in the admin inbox, "telegram" = answered from a phone */
  channel?: "panel" | "telegram" | string;
  created_at: string | null;
};

export type ContactTicket = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  topic: string;
  message: string;
  status: "open" | "answered" | "closed";
  telegram_sent: boolean;
  /** True when the Telegram notification can be swipe-replied to */
  telegram_linked?: boolean;
  created_at: string | null;
  replies: ContactReply[];
};

export const contactApi = {
  config: () =>
    api.get<{
      telegram_configured: boolean;
      telegram_two_way?: boolean;
      public_handle: string;
      reply_window: string;
    }>("/contact/config"),
  submit: (payload: {
    name?: string;
    email?: string;
    phone?: string;
    topic?: string;
    message: string;
  }) =>
    api.post<{ message: string; ticket_id: number; telegram_sent: boolean }>(
      "/contact",
      payload,
    ),
  mine: () => api.get<{ tickets: ContactTicket[] }>("/contact/mine"),
  lookup: (payload: { ticket_id: number; email?: string; phone?: string }) =>
    api.post<{ ticket: ContactTicket }>("/contact/lookup", payload),
  adminTickets: (status?: string) =>
    api.get<{ tickets: ContactTicket[]; open: number }>(
      `/contact/admin/tickets${status ? `?status=${status}` : ""}`,
    ),
  adminReply: (ticketId: number, body: string) =>
    api.post<{ message: string; ticket: ContactTicket }>(
      `/contact/admin/tickets/${ticketId}/reply`,
      { body },
    ),
};

/* ═══════════════════════════════════════════════════════════════════════
   Teaching — live classes, PDF library, announcements, uploads
   ═══════════════════════════════════════════════════════════════════════ */

export type LiveProvider = "youtube" | "zoom" | "meet" | "internal" | "other";

export type LiveClass = {
  id: number;
  course_id: number;
  course_title: string | null;
  course_slug: string | null;
  host_id: number;
  host_name: string | null;
  title: string;
  description: string | null;
  provider: LiveProvider;
  preview_url: string | null;
  join_url?: string | null;
  starts_at: string;
  duration_minutes: number;
  status: "scheduled" | "live" | "ended" | "cancelled";
  is_free: boolean;
  is_upcoming: boolean;
};

export type LessonFile = {
  id: number;
  lesson_id: number | null;
  course_id: number | null;
  title: string;
  file_url: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number;
  is_preview: boolean;
  download_count: number;
  created_at: string | null;
};

export type Announcement = {
  id: number;
  course_id: number | null;
  course_title: string | null;
  author_name: string;
  title: string;
  body: string;
  level: "info" | "important" | "live";
  is_active: boolean;
  created_at: string | null;
};

export type UploadedFile = {
  url: string;
  file_name: string;
  size_bytes: number;
  mime_type: string;
  backend: string;
};

export const teachingApi = {
  /** Upload a PDF or image. Returns the stored URL to attach to a listing. */
  upload: (file: File, kind: "pdf" | "image" = "pdf") => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ message: string; file: UploadedFile }>(
      `/teaching/upload?kind=${kind}`,
      form,
    );
  },

  createLiveClass: (courseId: number, payload: Partial<LiveClass>) =>
    api.post<{ message: string; live_class: LiveClass }>(
      `/teaching/courses/${courseId}/live`,
      payload,
    ),
  listLiveClasses: (courseId: number) =>
    api.get<{ live_classes: LiveClass[]; can_join: boolean }>(
      `/teaching/courses/${courseId}/live`,
    ),
  updateLiveClass: (classId: number, payload: Partial<LiveClass>) =>
    api.put<{ message: string; live_class: LiveClass }>(
      `/teaching/live/${classId}`,
      payload,
    ),
  deleteLiveClass: (classId: number) =>
    api.delete<{ message: string }>(`/teaching/live/${classId}`),
  upcoming: () => api.get<{ live_classes: LiveClass[] }>("/teaching/live/upcoming"),

  addCourseFile: (
    courseId: number,
    payload: {
      title: string;
      file_url: string;
      file_name?: string;
      size_bytes?: number;
      lesson_id?: number;
      is_preview?: boolean;
    },
  ) =>
    api.post<{ message: string; file: LessonFile }>(
      `/teaching/courses/${courseId}/files`,
      payload,
    ),
  courseFiles: (courseId: number) =>
    api.get<{ files: LessonFile[]; can_download_all: boolean }>(
      `/teaching/courses/${courseId}/files`,
    ),
  deleteCourseFile: (fileId: number) =>
    api.delete<{ message: string }>(`/teaching/files/${fileId}`),

  postAnnouncement: (
    courseId: number,
    payload: { title: string; body: string; level?: string },
  ) =>
    api.post<{ message: string; announcement: Announcement }>(
      `/teaching/courses/${courseId}/announcements`,
      payload,
    ),
  courseAnnouncements: (courseId: number) =>
    api.get<{ announcements: Announcement[] }>(
      `/teaching/courses/${courseId}/announcements`,
    ),
  platformAnnouncements: () =>
    api.get<{ announcements: Announcement[] }>("/teaching/announcements"),
};
