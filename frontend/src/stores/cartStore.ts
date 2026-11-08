/**
 * Cart store — the buyer's basket, shared by the header badge, the cart
 * drawer and the checkout page.
 *
 * The server is the source of truth: every mutation returns the recalculated
 * cart from the API and we replace local state with it. That keeps totals
 * (shipping, tax, free-shipping gap) identical everywhere.
 */

import { create } from "zustand";
import { cartApi, type Cart, type CartItem } from "@/lib/commerce";

type CartState = {
  items: CartItem[];
  totals: Cart | null;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (productId: number, qty?: number) => Promise<void>;
  update: (itemId: number, qty: number) => Promise<void>;
  remove: (itemId: number) => Promise<void>;
  clear: () => Promise<void>;
  count: () => number;
  amount: () => number;
};

const EMPTY: Cart = {
  items: [],
  total: 0,
  subtotal: 0,
  shipping_fee: 0,
  tax: 0,
  discount: 0,
  item_count: 0,
  total_qty: 0,
  free_shipping_threshold: 999,
  free_shipping_gap: 999,
};

function apply(cart: Cart) {
  return {
    items: cart.items ?? [],
    totals: {
      ...EMPTY,
      ...cart,
      items: cart.items ?? [],
    },
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  totals: null,
  loading: false,
  mutating: false,
  error: null,

  load: async () => {
    // Not signed in — nothing to load
    if (!localStorage.getItem("access_token")) {
      set({ items: [], totals: null, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const cart = await cartApi.get();
      set({ ...apply(cart), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Could not load cart" });
    }
  },

  add: async (productId, qty = 1) => {
    set({ mutating: true, error: null });
    try {
      const cart = await cartApi.add(productId, qty);
      set({ ...apply(cart), mutating: false });
    } catch (e) {
      set({
        mutating: false,
        error: e instanceof Error ? e.message : "Could not add to cart",
      });
      throw e;
    }
  },

  update: async (itemId, qty) => {
    set({ mutating: true, error: null });
    try {
      const cart = await cartApi.update(itemId, qty);
      set({ ...apply(cart), mutating: false });
    } catch (e) {
      set({
        mutating: false,
        error: e instanceof Error ? e.message : "Could not update cart",
      });
    }
  },

  remove: async (itemId) => {
    set({ mutating: true, error: null });
    try {
      const cart = await cartApi.remove(itemId);
      set({ ...apply(cart), mutating: false });
    } catch (e) {
      set({
        mutating: false,
        error: e instanceof Error ? e.message : "Could not remove item",
      });
    }
  },

  clear: async () => {
    set({ mutating: true, error: null });
    try {
      const cart = await cartApi.clear();
      set({ ...apply(cart), mutating: false });
    } catch (e) {
      set({
        mutating: false,
        error: e instanceof Error ? e.message : "Could not clear cart",
      });
    }
  },

  count: () => get().totals?.item_count ?? 0,
  amount: () => get().totals?.total ?? 0,
}));
