/**
 * Site content — one fetch, one cache, shared by every surface.
 *
 * The landing page, the top strip, the footer and the chat widget all need the
 * operator's copy. Rather than firing four requests, this module owns a single
 * module-level cache and a tiny subscription so any component can read the
 * content synchronously after the first load.
 *
 * If the request fails the DEFAULTS below are used, so the site renders with
 * sensible words even while the backend is booting or the network is flaky —
 * an operator should never see an empty headline because of a 500.
 */

import { useEffect, useState } from "react";
import { siteApi, type SiteContent, type SiteStats } from "./api";

/* ── Fallback copy (mirrors the server defaults) ──────────────────────── */
export const SITE_DEFAULTS: SiteContent = {
  settings: {
    "strip.tagline": "Made in India · Built for every Indian learner, teacher and seller",
    "strip.flag_enabled": true,
    "hero.eyebrow": "One platform · Learn, Read, Shop & Test",
    "hero.title": "Learn from the best. Read, buy and test.",
    "hero.subtitle":
      "Cronyzo brings teachers, authors, vendors and mock tests into one place. Take a course from an engineer who actually ships code, buy the books you need, order study gear, then prove what you learnt.",
    "hero.search_placeholder": "Search courses, books, products, tests…",
    "hero.popular_tags": ["SSC CGL", "React", "Python", "Stationery"],
    "pillars.heading": "Everything a learner actually needs",
    "pillars.subheading":
      "Cronyzo removes the tab-hopping. Classes, books, gear and practice tests live in one account with one checkout.",
    "courses.heading": "Learn something that pays you back",
    "courses.subheading":
      "Hand-picked courses with structured modules, downloadable notes and honest reviews from learners.",
    "sell.heading": "Teach a course. Sell your gear. Get paid every week.",
    "sell.subheading":
      "Cronyzo gives you a course builder with modules and lessons, live classes on YouTube, a PDF library, a product catalogue, a storefront and a real earnings dashboard — all from one dashboard.",
    "sell.benefits": [
      "Keep 88% of every sale — commission shown transparently",
      "Verified storefront badge once your catalogue is reviewed",
      "Your own shop page with catalogue, reviews and live stock",
      "Instant payouts and a clean earnings dashboard",
    ],
    "testimonials.heading": "Loved by learners and sellers",
    "testimonials.subheading": "One account, three kinds of people",
    "chat.title": "Talk to a real human",
    "chat.subtitle": "Ask about a course, an order or becoming a seller. We reply fast.",
    "support.email": "cronyzo7694@gmail.com",
    "footer.blurb":
      "One platform to learn from teachers, read books, buy gear and test yourself — built for the Indian learner.",
    "footer.copyright":
      "Cronyzo Technologies Pvt. Ltd. Built for learners, teachers and sellers.",
  },
  hero_slides: [],
  pillars: [],
  testimonials: [],
  features: {
    guest_browsing: true,
    guest_can_purchase: false,
    show_hero_carousel: true,
    flag_enabled: true,
  },
};

export type SiteState = {
  content: SiteContent;
  stats: SiteStats | null;
  featured: { courses: any[]; books: any[]; products: any[] } | null;
  loading: boolean;
  error: string | null;
  /** True once a real payload has been received (even if partial). */
  loaded: boolean;
};

let state: SiteState = {
  content: SITE_DEFAULTS,
  stats: null,
  featured: null,
  loading: false,
  error: null,
  loaded: false,
};

const listeners = new Set<(s: SiteState) => void>();
let inflight: Promise<void> | null = null;

function emit() {
  for (const fn of listeners) fn(state);
}

function set(patch: Partial<SiteState>) {
  state = { ...state, ...patch };
  emit();
}

/**
 * Load (or reuse) the site payload. Safe to call from any number of components:
 * concurrent calls share one request.
 */
export function loadSite(force = false): Promise<void> {
  if (inflight) return inflight;
  if (state.loaded && !force) return Promise.resolve();

  set({ loading: true, error: null });
  inflight = siteApi
    .home()
    .then((payload) => {
      set({
        content: {
          settings: { ...SITE_DEFAULTS.settings, ...(payload.settings || {}) },
          hero_slides: payload.hero_slides?.length
            ? payload.hero_slides
            : SITE_DEFAULTS.hero_slides,
          pillars: payload.pillars ?? [],
          testimonials: payload.testimonials ?? [],
          features: { ...SITE_DEFAULTS.features, ...(payload.features || {}) },
        },
        stats: payload.stats ?? null,
        featured: payload.featured ?? null,
        loading: false,
        loaded: true,
        error: null,
      });
    })
    .catch((err: any) => {
      // Keep the defaults on screen — never blank the marketing copy.
      set({
        loading: false,
        loaded: true,
        error: err?.message || "Could not load site content",
      });
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Read the current payload without subscribing. */
export function getSite(): SiteState {
  return state;
}

/** Subscribe to the site payload; triggers the first load automatically. */
export function useSite(): SiteState {
  const [local, setLocal] = useState<SiteState>(state);

  useEffect(() => {
    listeners.add(setLocal);
    void loadSite();
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  return local;
}

/* ── Convenience selectors ────────────────────────────────────────────── */

/** Read one setting with a fallback chain: server → defaults → literal. */
export function useSetting<T = string>(key: string, fallback?: T): T {
  const { content } = useSite();
  const value = content.settings?.[key];
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    return (SITE_DEFAULTS.settings[key] ?? "") as T;
  }
  return value as T;
}

/** Operator-editable text with per-call fallback (no hook, for one-offs). */
export function settingText(key: string, fallback = ""): string {
  const value = state.content.settings?.[key];
  if (typeof value === "string" && value.trim()) return value;
  const def = SITE_DEFAULTS.settings[key];
  return typeof def === "string" && def.trim() ? def : fallback;
}
