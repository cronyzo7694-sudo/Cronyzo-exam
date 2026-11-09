import { create } from "zustand";
import {
  authApi,
  clearTokens,
  setTokens,
  type Session,
  type User,
} from "@/lib/api";

/**
 * The one identity store for the whole web app.
 *
 * Everything that needs to know "who is this person and what may they do"
 * reads from here: the router guards, the sidebar, the Sell affordances,
 * the profile page. The server resolves the role and capabilities
 * (`GET /api/auth/session`) so the client never has to re-derive them
 * from scattered role checks that can drift out of sync.
 */

type AuthState = {
  user: User | null;
  /** Authoritative server-resolved capabilities. Null until the session loads. */
  capabilities: Session["capabilities"] | null;
  /** True while the initial session probe is in flight. */
  loading: boolean;
  /** True once the session probe has settled (signed in or not). */
  initialized: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (full_name: string, email: string, password: string) => Promise<void>;
  continueAsGuest: (displayName?: string) => Promise<void>;
  /** Upgrade the current guest session into a full account, keeping its data. */
  claimGuest: (
    email: string,
    password: string,
    full_name?: string,
  ) => Promise<void>;
  /** Omit `idToken` in testing mode — the server issues a demo Google account. */
  loginWithGoogle: (idToken?: string) => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<{ dev_otp?: string; message: string }>;
  verifyPhoneOtp: (phone: string, otp: string, fullName?: string) => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
  /** Re-read the session from the server (after a role or profile change). */
  refreshSession: () => Promise<void>;
  setUser: (user: User | null) => void;

  isGuest: () => boolean;
  can: (capability: keyof Session["capabilities"]) => boolean;
};

function applySession(res: {
  user: User;
  access_token: string;
  refresh_token: string;
  is_guest?: boolean;
}) {
  setTokens(res.access_token, res.refresh_token);
  return {
    ...res.user,
    is_guest: Boolean(res.is_guest ?? res.user.is_guest ?? res.user.role === "guest"),
  };
}

/* ── Boot without waiting on the network ──────────────────────────────────
   The old boot called GET /auth/session before rendering the first screen. On
   a sleeping free-tier API that was 20-30 s of "Loading workspace…" and people
   left. Now the last known identity is restored from localStorage immediately
   (so the shell paints with the right avatar/role), and the session is verified
   in the background. A dead token still logs out — but only on a real 401, not
   on a slow network. */
const USER_CACHE_KEY = "cz_user_cache";

function readUserCache(): { user: User; capabilities: Session["capabilities"] | null } | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user) return null;
    return { user: parsed.user as User, capabilities: parsed.capabilities ?? null };
  } catch {
    return null;
  }
}

function writeUserCache(user: User | null, capabilities: Session["capabilities"] | null) {
  try {
    if (!user) localStorage.removeItem(USER_CACHE_KEY);
    else localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ user, capabilities }));
  } catch {
    /* storage full / private mode — cache is only an optimisation */
  }
}

const cachedAtBoot = typeof localStorage !== "undefined" ? readUserCache() : null;
const hasTokenAtBoot =
  typeof localStorage !== "undefined" && Boolean(localStorage.getItem("access_token"));

export const useAuthStore = create<AuthState>((set, get) => ({
  user: cachedAtBoot?.user ?? null,
  capabilities: cachedAtBoot?.capabilities ?? null,
  loading: false,
  // Instant: if we know who you are (or know nobody is signed in) there is
  // nothing to wait for. Only a token without a cache needs the server first.
  initialized: Boolean(cachedAtBoot) || !hasTokenAtBoot,

  setUser: (user) => {
    set({ user });
    writeUserCache(user, get().capabilities);
  },

  isGuest: () => {
    const u = get().user;
    return Boolean(u?.is_guest || u?.role === "guest");
  },

  can: (capability) => Boolean(get().capabilities?.[capability]),

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await authApi.login(email, password);
      set({ user: applySession(res), loading: false });
      await get().refreshSession();
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  register: async (full_name, email, password) => {
    set({ loading: true });
    try {
      const res = await authApi.register({ full_name, email, password });
      set({ user: applySession(res), loading: false });
      await get().refreshSession();
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  continueAsGuest: async (displayName) => {
    set({ loading: true });
    try {
      const res = await authApi.guest(displayName);
      set({ user: applySession(res), loading: false });
      await get().refreshSession();
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  claimGuest: async (email, password, full_name) => {
    set({ loading: true });
    try {
      const res = await authApi.claim({ email, password, full_name });
      set({ user: applySession(res), loading: false });
      await get().refreshSession();
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  loginWithGoogle: async (idToken) => {
    set({ loading: true });
    try {
      const res = await authApi.google(idToken);
      set({ user: applySession(res), loading: false });
      await get().refreshSession();
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  sendPhoneOtp: async (phone) => {
    const res = await authApi.phoneSendOtp(phone);
    return { dev_otp: res.dev_otp, message: res.message };
  },

  verifyPhoneOtp: async (phone, otp, fullName) => {
    set({ loading: true });
    try {
      const res = await authApi.phoneVerifyOtp(phone, otp, fullName);
      set({ user: applySession(res), loading: false });
      await get().refreshSession();
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  logout: () => {
    clearTokens();
    writeUserCache(null, null);
    set({ user: null, capabilities: null, initialized: true });
  },

  refreshSession: async () => {
    try {
      const session = await authApi.session();
      set({ user: session.user, capabilities: session.capabilities });
      writeUserCache(session.user, session.capabilities);
    } catch (error: any) {
      // Only a real "your token is dead" answer should sign someone out. A
      // timeout / cold start / offline phone must not wipe the session.
      const status = Number(error?.status ?? 0);
      if (status === 401 || status === 403) {
        clearTokens();
        writeUserCache(null, null);
        set({ user: null, capabilities: null });
      }
    }
  },

  bootstrap: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ user: null, capabilities: null, initialized: true });
      return;
    }
    // Cached identity → render now, verify later.
    if (!get().initialized) {
      const cached = readUserCache();
      if (cached) set({ user: cached.user, capabilities: cached.capabilities, initialized: true });
    }
    await get().refreshSession();
    set({ initialized: true });
  },
}));
