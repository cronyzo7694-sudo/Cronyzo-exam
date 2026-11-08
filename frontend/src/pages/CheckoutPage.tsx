/**
 * Checkout page — address, payment and the final order.
 *
 * Handles three entry points:
 *   * the cart (default) — everything currently in the basket
 *   * a direct course purchase — `/checkout?type=course&id=<id>`
 *   * a direct book purchase  — `/checkout?type=book&id=<id>`
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Landmark,
  MapPin,
  Package,
  Percent,
  ShoppingBag,
  Smartphone,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { accountApi, booksApi, coursesApi, ordersApi, type Address } from "@/lib/commerce";
import { paymentsApi } from "@/lib/api";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/commerce/Primitives";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI", body: "GPay, PhonePe, Paytm", icon: Smartphone },
  { value: "card", label: "Card", body: "Visa, Mastercard, RuPay", icon: CreditCard },
  { value: "cod", label: "Cash on delivery", body: "Pay when it arrives", icon: Landmark },
] as const;

export function CheckoutPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    unknown
  >;

  const directType = (search.type as string) || "";
  const directId = Number(search.id || 0);

  const { items, totals, load, clear } = useCartStore();
  const [selectedAddress, setSelectedAddress] = useState<number | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [form, setForm] = useState({
    label: "Home",
    full_name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
    landmark: "",
  });

  useEffect(() => {
    void load();
  }, [load]);

  const { data: addresses } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => accountApi.addresses(),
  });

  useEffect(() => {
    if (addresses?.items?.length && selectedAddress === null) {
      const def =
        addresses.items.find((a) => a.is_default) ?? addresses.items[0];
      setSelectedAddress(def.id);
    }
  }, [addresses, selectedAddress]);

  // Direct-purchase lookups
  const { data: directCourse } = useQuery({
    queryKey: ["checkout", "course", directId],
    queryFn: () => coursesApi.list({ per_page: 100 }),
    enabled: directType === "course" && directId > 0,
  });
  const { data: directBook } = useQuery({
    queryKey: ["checkout", "book", directId],
    queryFn: () => booksApi.list({ per_page: 100 }),
    enabled: directType === "book" && directId > 0,
  });

  const directItem = useMemo(() => {
    if (directType === "course" && directId > 0) {
      const found = directCourse?.items?.find((c) => c.id === directId);
      return found
        ? {
            item_type: "course",
            item_id: found.id,
            title: found.title,
            image_url: found.thumbnail_url ?? null,
            unit_price: found.price,
            qty: 1,
          }
        : null;
    }
    if (directType === "book" && directId > 0) {
      const found = directBook?.items?.find((b) => b.id === directId);
      return found
        ? {
            item_type: "book",
            item_id: found.id,
            title: found.title,
            image_url: found.cover_url ?? null,
            unit_price: found.price,
            qty: 1,
          }
        : null;
    }
    return null;
  }, [directType, directId, directCourse, directBook]);

  const isDirect = Boolean(directItem);

  const lineItems = isDirect
    ? [directItem!]
    : items.map((i) => ({
        item_type: "product",
        item_id: i.product_id,
        title: i.product?.title ?? "Product",
        image_url: i.product?.image_url ?? null,
        unit_price: i.unit_price,
        qty: i.qty,
      }));

  const subtotal = lineItems.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  const hasPhysical = lineItems.some((i) => i.item_type === "product");
  const shippingFee = !hasPhysical ? 0 : subtotal >= 999 ? 0 : 49;
  const discount = appliedCoupon ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = Math.max(0, subtotal - discount + shippingFee);

  /**
   * Online payment, if a gateway is connected.
   *
   * The server decides the mode (`/payments/config`). With no keys it reports
   * `dummy` and this is a no-op, so today's flow is untouched; paste Razorpay
   * keys and the very same click opens the real Razorpay sheet — no code change
   * on either side.
   */
  const collectOnlinePayment = async (): Promise<{ paid: boolean; note?: string }> => {
    let cfg;
    try {
      cfg = await paymentsApi.config();
    } catch {
      return { paid: false };
    }
    if (!cfg.configured) return { paid: false };

    const created = await paymentsApi.createOrder();
    const Script = (window as any).Razorpay;
    if (!Script) {
      await new Promise<void>((resolve, reject) => {
        const el = document.createElement("script");
        el.src = cfg.checkout_script;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error("Could not load the payment window"));
        document.body.appendChild(el);
      });
    }

    return await new Promise((resolve) => {
      const rzp = new (window as any).Razorpay({
        key: created.order.key_id || cfg.key_id,
        amount: created.amount,
        currency: created.currency,
        name: "Cronyzo",
        description: "Courses, books & study gear",
        order_id: created.order.id,
        theme: { color: "#4f46e5" },
        handler: async (resp: any) => {
          try {
            await paymentsApi.verify({
              ...resp,
              amount_rupees: created.amount_rupees,
            });
            resolve({ paid: true });
          } catch {
            resolve({ paid: false, note: "Payment made but not verified — contact support." });
          }
        },
        modal: { ondismiss: () => resolve({ paid: false, note: "Payment cancelled" }) },
      });
      rzp.open();
    });
  };

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (paymentMethod !== "cod") {
        const result = await collectOnlinePayment();
        if (!result.paid && result.note) throw new Error(result.note);
      }
      return ordersApi.checkout({
        items: lineItems.map((i) => ({
          item_type: i.item_type,
          item_id: i.item_id,
          qty: i.qty,
        })),
        address_id: selectedAddress ?? undefined,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon ?? undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      if (!isDirect) void clear();
      navigate({ to: "/orders" });
    },
  });

  const saveAddress = useMutation({
    mutationFn: () => accountApi.addAddress(form),
    onSuccess: (res) => {
      setSelectedAddress(res.item.id);
      setShowAddressForm(false);
      setForm({
        label: "Home",
        full_name: "",
        phone: "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        pincode: "",
        landmark: "",
      });
    },
  });

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    const known = ["WELCOME10", "CRONYZO50", "STUDENT15"];
    if (!known.includes(code)) {
      setCouponError("That code is not valid right now.");
      setAppliedCoupon(null);
      return;
    }
    setCouponError(null);
    setAppliedCoupon(code);
  };

  const address = addresses?.items?.find((a) => a.id === selectedAddress);

  if (!isDirect && items.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold text-foreground">
            Nothing to check out
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your cart is empty — add something first.
          </p>
          <Button asChild className="mt-6">
            <Link to="/shop">Browse the shop</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to={isDirect ? "/shop" : "/cart"}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {isDirect ? "Continue shopping" : "Back to cart"}
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        Checkout
      </h1>

      {placeOrder.isError && (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          {(placeOrder.error as Error)?.message ?? "Could not place the order"}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* ── Address ─────────────────────────────────────────── */}
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                Delivery address
              </h2>
              {(addresses?.items?.length ?? 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddressForm((v) => !v)}
                >
                  {showAddressForm ? "Cancel" : "Add new"}
                </Button>
              )}
            </div>

            {(addresses?.items?.length ?? 0) === 0 && !showAddressForm && (
              <div className="mt-4 rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  No address saved yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add one so we know where to deliver.
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowAddressForm(true)}
                >
                  Add address
                </Button>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(addresses?.items ?? []).map((a: Address) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAddress(a.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    selectedAddress === a.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-primary">
                      {a.label}
                    </span>
                    {selectedAddress === a.id && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="mt-2 text-sm font-bold text-foreground">
                    {a.full_name}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                    <br />
                    {a.city}
                    {a.state ? `, ${a.state}` : ""} — {a.pincode}
                    <br />
                    {a.phone}
                  </div>
                </button>
              ))}
            </div>

            {showAddressForm && (
              <form
                className="mt-5 grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAddress.mutate();
                }}
              >
                <input
                  required
                  placeholder="Full name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50 sm:col-span-2"
                />
                <input
                  required
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
                />
                <input
                  placeholder="Label (Home / Office)"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
                />
                <input
                  required
                  placeholder="Address line 1"
                  value={form.line1}
                  onChange={(e) => setForm({ ...form, line1: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50 sm:col-span-2"
                />
                <input
                  placeholder="Address line 2"
                  value={form.line2}
                  onChange={(e) => setForm({ ...form, line2: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50 sm:col-span-2"
                />
                <input
                  required
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
                />
                <input
                  placeholder="State"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
                />
                <input
                  required
                  placeholder="PIN code"
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
                />
                <input
                  placeholder="Landmark (optional)"
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  className="h-10 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
                />
                <div className="flex items-center justify-end gap-2 sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddressForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saveAddress.isPending}>
                    Save address
                  </Button>
                </div>
                {saveAddress.isError && (
                  <p className="text-xs font-medium text-destructive sm:col-span-2">
                    {(saveAddress.error as Error)?.message}
                  </p>
                )}
              </form>
            )}
          </section>

          {/* ── Payment ─────────────────────────────────────────── */}
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                2
              </span>
              Payment method
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const active = paymentMethod === method.value;
                return (
                  <button
                    key={method.value}
                    onClick={() => setPaymentMethod(method.value)}
                    className={cn(
                      "flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/40",
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      {method.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {method.body}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="mt-5 block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Delivery notes (optional)
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Landmark, preferred delivery time…"
                className="mt-1.5 w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </label>
          </section>
        </div>

        {/* ── Summary ───────────────────────────────────────────── */}
        <aside>
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border bg-card p-6 shadow-lg">
              <h2 className="text-base font-bold text-foreground">
                Order summary
                {isDirect && (
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    direct purchase
                  </span>
                )}
              </h2>

              <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                {lineItems.map((item, i) => (
                  <div key={`${item.item_type}-${item.item_id}-${i}`} className="flex gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-xs font-semibold text-foreground">
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                        {item.item_type} · qty {item.qty}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-bold text-foreground">
                      ₹{(item.unit_price * item.qty).toLocaleString("en-IN")}
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon */}
              <div className="mt-5 border-t pt-4">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Coupon
                </label>
                <div className="mt-1.5 flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border bg-card px-3">
                    <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value)}
                      placeholder="WELCOME10"
                      className="h-10 w-full bg-transparent text-sm uppercase outline-none"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyCoupon}
                    disabled={!coupon.trim()}
                  >
                    Apply
                  </Button>
                </div>
                {couponError && (
                  <p className="mt-1.5 text-xs font-medium text-destructive">
                    {couponError}
                  </p>
                )}
                {appliedCoupon && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {appliedCoupon} applied
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-2.5 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold text-foreground">
                    ₹{subtotal.toLocaleString("en-IN")}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-semibold text-emerald-600">
                      −₹{discount.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span
                    className={
                      shippingFee === 0
                        ? "font-semibold text-emerald-600"
                        : "font-semibold text-foreground"
                    }
                  >
                    {shippingFee === 0
                      ? "FREE"
                      : `₹${shippingFee.toLocaleString("en-IN")}`}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-3 text-base">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-extrabold text-foreground">
                    ₹{total.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              <Button
                className="mt-5 w-full"
                size="lg"
                disabled={placeOrder.isPending || (!address && !isDirect)}
                onClick={() => placeOrder.mutate()}
              >
                {placeOrder.isPending ? "Placing order…" : `Pay ₹${total.toLocaleString("en-IN")}`}
              </Button>

              {!address && !isDirect && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Add a delivery address to continue
                </p>
              )}

              <div className="mt-4 space-y-2 border-t pt-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  Dispatched within 24 hours
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  7-day easy replacement on physical items
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
