import { create } from "zustand";
import {
  attemptsApi,
  type ExamRulesPublic,
  type PlayerPayload,
  type PlayerQuestion,
  type PlayerSection,
  type ResultPayload,
} from "@/lib/api";

export type PaletteStatus =
  | "not_visited"
  | "not_answered"
  | "answered"
  | "marked"
  | "marked_answered";

type FlatQuestion = PlayerQuestion & {
  sectionIndex: number;
  questionIndex: number;
  globalIndex: number;
};

type ExamPlayerState = {
  loaded: boolean;
  attemptId: number | null;
  examTitle: string;
  instructions: string;
  sections: PlayerSection[];
  flatQuestions: FlatQuestion[];
  currentGlobalIndex: number;
  timeRemaining: number;
  timerRunning: boolean;
  showInstructions: boolean;
  showSubmitConfirm: boolean;
  submitting: boolean;
  result: ResultPayload | null;
  error: string | null;
  tabSwitches: number;
  maxTabSwitches: number;
  /** Configuration-driven rules from backend (optional on older payloads) */
  rules: ExamRulesPublic | null;
  detectTabSwitch: boolean;
  allowMarkForReview: boolean;
  allowClearResponse: boolean;
  confirmBeforeSubmit: boolean;
  autoSubmitOnExpiry: boolean;
  requireFullscreen: boolean;
  calculatorAllowed: boolean;
  roughSheetAllowed: boolean;
  freeQuestionNavigation: boolean;

  // Actions
  loadFromPayload: (payload: PlayerPayload) => void;
  startTimer: () => void;
  tick: () => void;
  goTo: (globalIndex: number) => void;
  next: () => void;
  prev: () => void;
  selectAnswer: (answer: string | string[] | null) => Promise<void>;
  toggleMark: () => Promise<void>;
  clearResponse: () => Promise<void>;
  getStatus: (globalIndex: number) => PaletteStatus;
  getCurrent: () => FlatQuestion | null;
  openSubmit: () => void;
  closeSubmit: () => void;
  submit: (auto?: boolean) => Promise<ResultPayload>;
  recordSecurity: (type: string, message?: string) => Promise<boolean>;
  summary: () => {
    total: number;
    answered: number;
    notAnswered: number;
    marked: number;
    notVisited: number;
  };
  reset: () => void;
};

function flatten(sections: PlayerSection[]): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  let g = 0;
  sections.forEach((sec, si) => {
    sec.questions.forEach((q, qi) => {
      out.push({ ...q, sectionIndex: si, questionIndex: qi, globalIndex: g });
      g += 1;
    });
  });
  return out;
}

function deriveStatus(q: FlatQuestion): PaletteStatus {
  const a = q.answer;
  if (!a?.is_visited && !a?.is_answered) return "not_visited";
  if (a.is_marked_for_review && a.is_answered) return "marked_answered";
  if (a.is_marked_for_review) return "marked";
  if (a.is_answered) return "answered";
  return "not_answered";
}

export const useExamPlayerStore = create<ExamPlayerState>((set, get) => ({
  loaded: false,
  attemptId: null,
  examTitle: "",
  instructions: "",
  sections: [],
  flatQuestions: [],
  currentGlobalIndex: 0,
  timeRemaining: 0,
  timerRunning: false,
  showInstructions: true,
  showSubmitConfirm: false,
  submitting: false,
  result: null,
  error: null,
  tabSwitches: 0,
  maxTabSwitches: 10,
  rules: null,
  detectTabSwitch: true,
  allowMarkForReview: true,
  allowClearResponse: true,
  confirmBeforeSubmit: true,
  autoSubmitOnExpiry: true,
  requireFullscreen: false,
  calculatorAllowed: false,
  roughSheetAllowed: true,
  freeQuestionNavigation: true,

  reset: () =>
    set({
      loaded: false,
      attemptId: null,
      examTitle: "",
      instructions: "",
      sections: [],
      flatQuestions: [],
      currentGlobalIndex: 0,
      timeRemaining: 0,
      timerRunning: false,
      showInstructions: true,
      showSubmitConfirm: false,
      submitting: false,
      result: null,
      error: null,
      tabSwitches: 0,
      rules: null,
      detectTabSwitch: true,
      allowMarkForReview: true,
      allowClearResponse: true,
      confirmBeforeSubmit: true,
      autoSubmitOnExpiry: true,
      requireFullscreen: false,
      calculatorAllowed: false,
      roughSheetAllowed: true,
      freeQuestionNavigation: true,
    }),

  loadFromPayload: (payload) => {
    const flat = flatten(payload.sections);
    // mark first as visited locally
    if (flat[0]) {
      flat[0] = {
        ...flat[0],
        answer: { ...flat[0].answer, is_visited: true },
      };
    }
    const rules = payload.rules || null;
    const sec = rules?.security;
    const nav = rules?.navigation;
    const sub = rules?.submission;
    const aids = rules?.aids;
    const maxTabs =
      sec?.max_tab_switches ??
      payload.exam.max_tab_switches ??
      10;
    set({
      loaded: true,
      attemptId: payload.attempt.id,
      examTitle: payload.exam.title,
      instructions: payload.exam.instructions || "",
      sections: payload.sections,
      flatQuestions: flat,
      currentGlobalIndex: payload.attempt.current_question_index || 0,
      timeRemaining:
        payload.time_remaining_seconds ??
        rules?.timing?.overall_seconds ??
        payload.exam.duration_seconds,
      maxTabSwitches: maxTabs,
      tabSwitches: payload.attempt.tab_switch_count || 0,
      showInstructions: true,
      result: null,
      error: null,
      rules,
      detectTabSwitch: sec?.detect_tab_switch !== false,
      allowMarkForReview: nav?.allow_mark_for_review !== false,
      allowClearResponse: nav?.allow_clear_response !== false,
      confirmBeforeSubmit: sub?.confirm_before_submit !== false,
      autoSubmitOnExpiry:
        sub?.auto_submit_on_expiry !== false &&
        rules?.timing?.auto_submit_on_expiry !== false,
      requireFullscreen:
        sec?.require_fullscreen === true || payload.exam.require_fullscreen === true,
      calculatorAllowed: aids?.calculator_allowed === true,
      roughSheetAllowed: aids?.rough_sheet_allowed !== false,
      freeQuestionNavigation: nav?.free_question_navigation !== false,
    });
  },

  startTimer: () => set({ timerRunning: true, showInstructions: false }),

  tick: () => {
    const { timeRemaining, timerRunning, autoSubmitOnExpiry } = get();
    if (!timerRunning) return;
    if (timeRemaining <= 1) {
      set({ timeRemaining: 0, timerRunning: false });
      if (autoSubmitOnExpiry) {
        get().submit(true).catch(() => undefined);
      }
      return;
    }
    set({ timeRemaining: timeRemaining - 1 });
  },

  goTo: (globalIndex) => {
    const { flatQuestions, attemptId, freeQuestionNavigation, currentGlobalIndex } = get();
    if (globalIndex < 0 || globalIndex >= flatQuestions.length) return;
    // When free navigation is disabled, only allow adjacent moves
    if (!freeQuestionNavigation && Math.abs(globalIndex - currentGlobalIndex) > 1) {
      return;
    }
    const nextQ = { ...flatQuestions[globalIndex] };
    nextQ.answer = { ...nextQ.answer, is_visited: true };
    const updated = [...flatQuestions];
    updated[globalIndex] = nextQ;
    set({ flatQuestions: updated, currentGlobalIndex: globalIndex });
    if (attemptId) {
      attemptsApi
        .saveAnswer(attemptId, {
          question_id: nextQ.question_id,
          is_visited: true,
          current_question_index: globalIndex,
          current_section_index: nextQ.sectionIndex,
        })
        .catch(() => undefined);
    }
  },

  next: () => {
    const { currentGlobalIndex, flatQuestions } = get();
    if (currentGlobalIndex < flatQuestions.length - 1) {
      get().goTo(currentGlobalIndex + 1);
    }
  },

  prev: () => {
    const { currentGlobalIndex } = get();
    if (currentGlobalIndex > 0) get().goTo(currentGlobalIndex - 1);
  },

  getCurrent: () => {
    const { flatQuestions, currentGlobalIndex } = get();
    return flatQuestions[currentGlobalIndex] || null;
  },

  getStatus: (globalIndex) => {
    const q = get().flatQuestions[globalIndex];
    if (!q) return "not_visited";
    return deriveStatus(q);
  },

  selectAnswer: async (answer) => {
    const { flatQuestions, currentGlobalIndex, attemptId } = get();
    const q = flatQuestions[currentGlobalIndex];
    if (!q || !attemptId) return;
    const updatedQ = {
      ...q,
      answer: {
        ...q.answer,
        selected_answer: answer,
        is_answered: answer !== null && answer !== "" && !(Array.isArray(answer) && answer.length === 0),
        is_visited: true,
      },
    };
    const updated = [...flatQuestions];
    updated[currentGlobalIndex] = updatedQ;
    // also mirror into sections tree
    const sections = [...get().sections];
    const sec = { ...sections[updatedQ.sectionIndex] };
    const qs = [...sec.questions];
    qs[updatedQ.questionIndex] = {
      ...qs[updatedQ.questionIndex],
      answer: updatedQ.answer,
    };
    sec.questions = qs;
    sections[updatedQ.sectionIndex] = sec;
    set({ flatQuestions: updated, sections });

    await attemptsApi.saveAnswer(attemptId, {
      question_id: q.question_id,
      selected_answer: answer,
      is_visited: true,
      current_question_index: currentGlobalIndex,
      current_section_index: q.sectionIndex,
    });
  },

  clearResponse: async () => {
    if (!get().allowClearResponse) return;
    await get().selectAnswer(null);
    const { attemptId, flatQuestions, currentGlobalIndex } = get();
    const q = flatQuestions[currentGlobalIndex];
    if (attemptId && q) {
      await attemptsApi.saveAnswer(attemptId, {
        question_id: q.question_id,
        clear: true,
      });
    }
  },

  toggleMark: async () => {
    const { flatQuestions, currentGlobalIndex, attemptId, allowMarkForReview } = get();
    if (!allowMarkForReview) return;
    const q = flatQuestions[currentGlobalIndex];
    if (!q || !attemptId) return;
    const marked = !q.answer.is_marked_for_review;
    const updatedQ = {
      ...q,
      answer: { ...q.answer, is_marked_for_review: marked, is_visited: true },
    };
    const updated = [...flatQuestions];
    updated[currentGlobalIndex] = updatedQ;
    set({ flatQuestions: updated });
    await attemptsApi.saveAnswer(attemptId, {
      question_id: q.question_id,
      is_marked_for_review: marked,
      is_visited: true,
    });
  },

  openSubmit: () => {
    if (get().confirmBeforeSubmit) {
      set({ showSubmitConfirm: true });
    } else {
      void get().submit(false);
    }
  },
  closeSubmit: () => set({ showSubmitConfirm: false }),

  submit: async (auto = false) => {
    const { attemptId, flatQuestions, submitting } = get();
    if (!attemptId || submitting) throw new Error("Cannot submit");
    set({ submitting: true, timerRunning: false, showSubmitConfirm: false });
    try {
      const answers = flatQuestions.map((q) => ({
        question_id: q.question_id,
        selected_answer: q.answer.selected_answer,
        is_marked_for_review: q.answer.is_marked_for_review,
      }));
      const res = await attemptsApi.submit(attemptId, { answers, auto });
      set({ result: res.result, submitting: false });
      return res.result;
    } catch (e: any) {
      set({ submitting: false, error: e.message || "Submit failed" });
      throw e;
    }
  },

  recordSecurity: async (type, message) => {
    const { attemptId } = get();
    if (!attemptId) return false;
    try {
      const res: any = await attemptsApi.security(attemptId, { type, message });
      set({ tabSwitches: res.tab_switch_count || get().tabSwitches + 1 });
      if (res.force_submitted) {
        set({ result: res.attempt, timerRunning: false });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  },

  summary: () => {
    const qs = get().flatQuestions;
    let answered = 0;
    let notAnswered = 0;
    let marked = 0;
    let notVisited = 0;
    qs.forEach((q) => {
      const s = deriveStatus(q);
      if (s === "not_visited") notVisited += 1;
      else if (s === "answered" || s === "marked_answered") answered += 1;
      else notAnswered += 1;
      if (s === "marked" || s === "marked_answered") marked += 1;
    });
    return { total: qs.length, answered, notAnswered, marked, notVisited };
  },
}));
