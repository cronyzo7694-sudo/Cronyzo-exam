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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  capabilities: null,
  loading: false,
  initialized: false,

  setUser: (user) => set({ user }),

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
    set({ user: null, capabilities: null, initialized: true });
  },

  refreshSession: async () => {
    try {
      const session = await authApi.session();
      set({ user: session.user, capabilities: session.capabilities });
    } catch {
      // The session endpoint is the source of truth; if it fails the token
      // is dead, so drop it rather than keep a half-signed-in shell.
      clearTokens();
      set({ user: null, capabilities: null });
    }
  },

  bootstrap: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ user: null, capabilities: null, initialized: true });
      return;
    }
    await get().refreshSession();
    set({ initialized: true });
  },
}));
