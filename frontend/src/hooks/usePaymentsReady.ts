/**
 * Is the payment gateway live yet?
 *
 * The platform stays shut for buying until Razorpay keys are configured on the
 * server — that way nobody can place a "paid" order in dummy mode and walk away
 * with a free book. The admin (and only the admin) can still walk the flow.
 */
import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

export function usePaymentsReady() {
  const { data, isLoading } = useQuery({
    queryKey: ["payments", "config"],
    queryFn: () => paymentsApi.config(),
    staleTime: 60_000,
  });
  const isAdmin = useAuthStore((s) => (s.user as any)?.role === "admin");
  return {
    /** true when a real gateway is connected, or when the viewer is the admin */
    ready: Boolean(data?.configured) || isAdmin,
    loading: isLoading,
    configured: Boolean(data?.configured),
    isAdmin,
    mode: data?.mode ?? "dummy",
  };
}
