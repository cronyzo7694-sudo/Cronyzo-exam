/**
 * SellerOrdersPage — the delivery desk.
 *
 * Every order that contains one of the seller's own listings lands here with
 * the address, the phone number and one button for the next step:
 *
 *     confirmed → packed → shipped → out for delivery → delivered
 *
 * The buyer sees each tap appear instantly on their order timeline, so nobody
 * has to ask "mera order kahan hai". Courier + tracking id are optional but
 * once filled they show up on the buyer's page too.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  Package,
  Phone,
  Truck,
} from "lucide-react";
import { ordersApi, type Order } from "../lib/commerce";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

const NEXT_STEP: Record<string, { status: string; label: string } | null> = {
  pending: { status: "confirmed", label: "Order confirm karein" },
  confirmed: { status: "packed", label: "Pack ho gaya" },
  packed: { status: "shipped", label: "Courier ko diya" },
  shipped: { status: "out_for_delivery", label: "Delivery ke liye nikla" },
  out_for_delivery: { status: "delivered", label: "Deliver ho gaya" },
  delivered: null,
  cancelled: null,
  refunded: null,
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  confirmed: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  packed: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400",
  shipped: "bg-violet-500/12 text-violet-700 dark:text-violet-400",
  out_for_delivery: "bg-orange-500/12 text-orange-700 dark:text-orange-400",
  delivered: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/12 text-destructive",
};

const FILTERS = ["all", "confirmed", "packed", "shipped", "delivered"] as const;

export function SellerOrdersPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tracking, setTracking] = useState<Record<number, { courier: string; awb: string }>>({});
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["orders", "seller", filter],
    queryFn: () => ordersApi.forSeller(filter === "all" ? undefined : filter),
    staleTime: 10_000,
  });

  const rows = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const open = rows.filter((o) => !["delivered", "cancelled", "refunded"].includes(o.status));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  const advance = async (order: Order, status: string) => {
    setBusyId(order.id);
    setError(null);
    setNote(null);
    try {
      const res = await ordersApi.setStatus(order.id, status);
      setNote(`${order.order_number}: ${res.message}`);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Status update nahi hua");
    } finally {
      setBusyId(null);
    }
  };

  const saveTracking = async (order: Order) => {
    const entry = tracking[order.id] || { courier: "", awb: "" };
    if (!entry.courier.trim() && !entry.awb.trim()) return;
    setBusyId(order.id);
    setError(null);
    try {
      await ordersApi.setTracking(order.id, {
        courier: entry.courier.trim(),
        tracking_id: entry.awb.trim(),
      });
      setNote(`${order.order_number}: tracking save ho gayi`);
      setTracking((prev) => ({ ...prev, [order.id]: { courier: "", awb: "" } }));
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Tracking save nahi hui");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <Truck className="h-5 w-5 text-primary" /> Orders &amp; delivery
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Packing se delivery tak — har step par buyer ko timeline dikhti hai.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/sell/products"
            className="rounded-xl border px-3 py-2 text-[12px] font-bold hover:border-primary/50"
          >
            My listings
          </Link>
          <Link
            to="/orders"
            className="rounded-xl border px-3 py-2 text-[12px] font-bold hover:border-primary/50"
          >
            Meri kharidari
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Chal rahe
          </p>
          <p className="text-lg font-extrabold">{open.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Delivered
          </p>
          <p className="text-lg font-extrabold">
            {rows.filter((o) => o.status === "delivered").length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Aaj ki kamai
          </p>
          <p className="text-lg font-extrabold">
            ₹
            {rows
              .filter((o) => o.status !== "cancelled")
              .reduce((sum, o) => sum + Number(o.total || 0), 0)
              .toFixed(0)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11.5px] font-bold capitalize",
              filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:border-primary/40",
            )}
          >
            {f === "all" ? "Sab" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      {note && (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
          {note}
        </p>
      )}

      {orders.isLoading && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Orders la rahe hain…
        </div>
      )}

      {!orders.isLoading && rows.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed p-8 text-center">
          <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-[13px] font-bold">Abhi koi order nahi</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Jab koi aapki book ya product kharidega, wo seedha yahan aayega.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {rows.map((order) => {
          const addr = order.address || {};
          const step = NEXT_STEP[order.status] ?? null;
          const entry = tracking[order.id] || { courier: "", awb: "" };
          return (
            <div key={order.id} className="rounded-2xl border bg-card p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[12.5px] font-extrabold">{order.order_number}</p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {order.placed_at ? new Date(order.placed_at).toLocaleString("en-IN") : ""} ·{" "}
                    {order.payment_method === "cod" ? "Cash on delivery" : `Paid (${order.payment_method})`}
                    {" · "}₹{Number(order.total || 0).toFixed(0)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase",
                    STATUS_STYLE[order.status] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {order.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="mt-2 space-y-1">
                {order.items.map((item) => (
                  <p key={item.id} className="flex items-center gap-1.5 text-[11.5px]">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">{item.title}</span>
                    <span className="text-muted-foreground">× {item.qty}</span>
                  </p>
                ))}
              </div>

              {(addr.line1 || addr.full_name) && (
                <div className="mt-2 rounded-lg bg-muted/50 p-2 text-[11px] leading-relaxed">
                  <p className="flex items-start gap-1.5 font-semibold">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span>
                      {addr.full_name} · {addr.line1}
                      {addr.line2 ? `, ${addr.line2}` : ""}
                      {addr.city ? `, ${addr.city}` : ""}
                      {addr.state ? `, ${addr.state}` : ""} — {addr.pincode}
                    </span>
                  </p>
                  {addr.phone && (
                    <a
                      href={`tel:${addr.phone}`}
                      className="mt-1 inline-flex items-center gap-1.5 font-bold text-primary"
                    >
                      <Phone className="h-3 w-3" /> {addr.phone}
                    </a>
                  )}
                </div>
              )}

              {step && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void advance(order, step.status)}
                    disabled={busyId === order.id}
                  >
                    {busyId === order.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {step.label}
                  </Button>
                  {order.status !== "confirmed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => void advance(order, "cancelled")}
                      disabled={busyId === order.id}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}

              {["packed", "shipped", "out_for_delivery"].includes(order.status) && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    value={entry.courier}
                    onChange={(e) =>
                      setTracking((prev) => ({
                        ...prev,
                        [order.id]: { ...entry, courier: e.target.value },
                      }))
                    }
                    placeholder={order.courier || "Courier (Delhivery…)"}
                    className="h-9 rounded-lg border bg-background px-2 text-[11.5px]"
                  />
                  <input
                    value={entry.awb}
                    onChange={(e) =>
                      setTracking((prev) => ({
                        ...prev,
                        [order.id]: { ...entry, awb: e.target.value },
                      }))
                    }
                    placeholder={order.tracking_id || "Tracking / AWB"}
                    className="h-9 rounded-lg border bg-background px-2 text-[11.5px]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveTracking(order)}
                    disabled={busyId === order.id}
                  >
                    Save
                  </Button>
                </div>
              )}

              {order.events && order.events.length > 0 && (
                <ol className="mt-2.5 space-y-1 border-l border-dashed pl-3">
                  {order.events.map((event) => (
                    <li key={event.id} className="text-[10.5px] text-muted-foreground">
                      <span className="font-bold text-foreground">
                        {event.status.replace(/_/g, " ")}
                      </span>{" "}
                      · {event.note}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
