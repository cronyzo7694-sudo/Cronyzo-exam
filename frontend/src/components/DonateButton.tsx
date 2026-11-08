import { useEffect, useRef } from "react";

/**
 * Razorpay Donation Button embed.
 * Set your button id in VITE_RAZORPAY_BUTTON_ID (build env) OR pass `buttonId`.
 * Until an id is set, we show a UPI/link fallback so nothing looks broken.
 */
export function DonateButton({ buttonId }: { buttonId?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const id =
    buttonId ||
    (import.meta as any).env?.VITE_RAZORPAY_BUTTON_ID ||
    "pl_TGUYMtSPnvooLb"; // Razorpay donation button id

  useEffect(() => {
    if (!id || !ref.current) return;
    // avoid double-injecting
    if (ref.current.querySelector("script")) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/payment-button.js";
    s.async = true;
    s.setAttribute("data-payment_button_id", id);
    ref.current.appendChild(s);
  }, [id]);

  if (!id) {
    // Fallback until Razorpay button id is added
    return (
      <span className="inline-flex items-center rounded-xl bg-white/90 px-4 py-2 text-sm font-bold text-emerald-700 shadow">
        💛 Donate (link coming soon)
      </span>
    );
  }

  return <form ref={ref} className="inline-block" />;
}

export default DonateButton;
