/**
 * Platform configuration store — Feature Flag + Config Engine client.
 * Loads once at boot; routes/UI read flags without hardcoding product rules.
 */
import { create } from "zustand";
import { platformApi, type PlatformPublicConfig } from "@/lib/api";

type PlatformState = {
  config: PlatformPublicConfig | null;
  features: Record<string, boolean>;
  loaded: boolean;
  loadError: string | null;
  bootstrap: () => Promise<void>;
  isEnabled: (flag: string, defaultValue?: boolean) => boolean;
  appName: () => string;
  maintenanceMessage: () => string | null;
};

function normalizeFlag(name: string): string {
  const n = (name || "").trim();
  if (!n) return "";
  if (n.startsWith("ENABLE_")) return n.toUpperCase();
  return `ENABLE_${n.toUpperCase().replace(/\s+/g, "_")}`;
}

/* ── Never block the first paint on this call ────────────────────────────
   Feature flags are "nice to have": the app works with defaults. So the last
   successful config is restored from localStorage instantly, the network call
   gets a short deadline, and failure is silent. */
const CONFIG_CACHE_KEY = "cz_platform_config";
const CONFIG_TIMEOUT_MS = 6000;

function readConfigCache(): PlatformPublicConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.app_name || parsed?.features ? (parsed as PlatformPublicConfig) : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("config timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const cachedConfig = typeof localStorage !== "undefined" ? readConfigCache() : null;

export const usePlatformStore = create<PlatformState>((set, get) => ({
  config: cachedConfig,
  features: cachedConfig?.features || {},
  // With a cache we are "loaded" before the first frame.
  loaded: Boolean(cachedConfig),
  loadError: null,

  bootstrap: async () => {
    // Mark loaded immediately so nothing waits for the network this frame.
    set({ loaded: true });
    try {
      const cfg = await withTimeout(platformApi.config(), CONFIG_TIMEOUT_MS);
      set({
        config: cfg,
        features: cfg.features || {},
        loaded: true,
        loadError: null,
      });
      try {
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg));
      } catch {
        /* ignore quota errors */
      }
    } catch (e: any) {
      // Platform config is additive — app must still boot if endpoint missing
      set({
        config: null,
        features: {},
        loaded: true,
        loadError: e?.message || "config unavailable",
      });
    }
  },

  isEnabled: (flag, defaultValue = true) => {
    const key = normalizeFlag(flag);
    const features = get().features;
    if (key && key in features) return Boolean(features[key]);
    // Also accept bare key
    if (flag in features) return Boolean(features[flag]);
    return defaultValue;
  },

  appName: () => get().config?.app?.name || "Cronyzo",

  maintenanceMessage: () => {
    const m = get().config?.maintenance;
    if (m?.enabled) return m.message || "Maintenance in progress";
    return null;
  },
}));
