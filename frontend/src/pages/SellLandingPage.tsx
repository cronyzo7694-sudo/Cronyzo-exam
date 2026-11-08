/**
 * Sell landing — onboarding for teachers and vendors.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeIndianRupee,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { sellerApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PATHS = [
  {
    type: "teacher" as const,
    icon: GraduationCap,
    title: "Teach a course",
    body: "Build modules and lessons, publish a syllabus students can trust and track every enrolment.",
    bullets: ["Unlimited courses", "Module & lesson builder", "Instant enrolment for free courses"],
    tint: "from-indigo-500 to-violet-600",
  },
  {
    type: "seller" as const,
    icon: Store,
    title: "Sell products",
    body: "List electronics, stationery or anything else with live stock, photos and a storefront of your own.",
    bullets: ["Your own storefront", "Live stock & pricing", "Order dashboard"],
    tint: "from-emerald-500 to-teal-600",
  },
  {
    type: "both" as const,
    icon: Sparkles,
    title: "Do both",
    body: "Teach a subject you know and sell the books and gear that go with it — one account, two storefronts.",
    bullets: ["Courses + catalogue", "Cross-sell to students", "One earnings report"],
    tint: "from-amber-500 to-orange-600",
  },
];

export function SellLandingPage() {
  const user = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState<"teacher" | "seller" | "both">("seller");

  // Publishing is gated on an approved shopkeeper application, so the page
  // asks the server where this account stands instead of guessing.
  const application = useQuery({
    queryKey: ["seller", "application"],
    queryFn: () => sellerApi.application(),
    enabled: Boolean(user),
  });
  const status = application.data?.application?.status;
  const approved = status === "approved" || user?.role === "admin";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          For teachers &amp; sellers
        </div>
        <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
          Turn your knowledge and your stock into income
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Cronyzo gives you the storefront, the catalogue, the checkout and the
          earnings dashboard. You bring the expertise.
        </p>
      </div>

      {/* Paths */}
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {PATHS.map((path) => (
          <button
            key={path.type}
            onClick={() => setSelected(path.type)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-card p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl",
              selected === path.type && "border-primary ring-2 ring-primary/20",
            )}
          >
            <div
              className={cn(
                "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg",
                path.tint,
              )}
            >
              <path.icon className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{path.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {path.body}
            </p>
            <ul className="mt-4 space-y-2">
              {path.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {b}
                </li>
              ))}
            </ul>
            {selected === path.type && (
              <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-10 flex flex-col items-center gap-4">
        {!user ? (
          <Button asChild size="lg">
            <Link to="/register">
              Create a shopkeeper account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : approved ? (
          <Button asChild size="lg">
            <Link to="/sell/dashboard">
              Open your seller studio
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : status === "pending" ? (
          <Button asChild size="lg" variant="outline">
            <Link to="/sell/apply">
              Application under review
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link to="/sell/apply">
              Apply to become a shopkeeper
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}

        <p className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          {approved
            ? "Your shopkeeper application is approved — you can publish right away."
            : "Publishing opens once our team approves your shopkeeper application. It usually takes less than a day."}
        </p>
        <p className="text-xs text-muted-foreground">
          Already selling?{" "}
          <Link
            to="/sell/dashboard"
            className="font-semibold text-primary hover:underline"
          >
            Open your dashboard
          </Link>
        </p>
      </div>

      {/* Why Cronyzo */}
      <section className="mt-16 grid gap-5 md:grid-cols-3">
        {[
          {
            icon: BadgeIndianRupee,
            title: "88% is yours",
            body: "A flat, published platform fee. No listing charges, no monthly rent, no hidden cuts.",
          },
          {
            icon: Zap,
            title: "Go live in minutes",
            body: "One approval to get started, then your catalogue updates go live instantly.",
          },
          {
            icon: ShieldCheck,
            title: "Trust built in",
            body: "Verified badges, honest reviews and a single checkout that buyers already understand.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border bg-card p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </section>

      {/* Cross-sell */}
      <section className="mt-14 rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-12 text-white sm:px-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              A teacher&apos;s toolkit, all in one place
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/85">
              Publish a course, list the books your students need, and sell study
              gear — then watch enrolments, orders and payouts in one dashboard.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              { icon: GraduationCap, text: "Course builder with modules & lessons" },
              { icon: BookOpen, text: "Book listings with a table of contents" },
              { icon: Package, text: "Product catalogue with live stock" },
              { icon: Store, text: "Branded storefront page" },
            ].map((item) => (
              <li
                key={item.text}
                className="flex items-center gap-3 rounded-xl bg-white/12 px-4 py-3 text-sm font-medium backdrop-blur-sm"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
