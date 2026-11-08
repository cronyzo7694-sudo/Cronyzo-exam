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

export const usePlatformStore = create<PlatformState>((set, get) => ({
  config: null,
  features: {},
  loaded: false,
  loadError: null,

  bootstrap: async () => {
    try {
      const cfg = await platformApi.config();
      set({
        config: cfg,
        features: cfg.features || {},
        loaded: true,
        loadError: null,
      });
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
