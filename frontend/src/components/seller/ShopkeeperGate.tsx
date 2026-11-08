/**
 * ShopkeeperGate — publishing is a privilege, not a default.
 *
 * Wraps every "create / list something" screen. The server already refuses
 * `POST /api/books` and `POST /api/shop/products` with 403
 * `seller_application_required`; this stops the user filling a whole form
 * only to be rejected at submit time, and points them at the application.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Loader2, ShieldCheck, Store } from "lucide-react";
import type { ReactNode } from "react";
import { sellerApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";

export function ShopkeeperGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const application = useQuery({
    queryKey: ["seller", "application"],
    queryFn: () => sellerApi.application(),
    enabled: Boolean(user) && !isAdmin,
  });

  if (!user) {
    return (
      <GateShell
        icon={<Store className="h-6 w-6" />}
        title="Sign in to publish on Cronyzo"
        body="Books and products are listed under your own shop. Sign in and send us a short shopkeeper application — approval usually lands the same day."
        cta={
          <Button asChild size="lg">
            <Link to="/login">
              Sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
        secondary={
          <Link to="/register" className="text-sm font-semibold text-primary hover:underline">
            Create an account instead
          </Link>
        }
      />
    );
  }

  if (isAdmin) return <>{children}</>;

  if (application.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-16 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your shopkeeper status…
      </div>
    );
  }

  const status = application.data?.application?.status;

  if (status === "approved") return <>{children}</>;

  if (status === "pending") {
    return (
      <GateShell
        icon={<Clock className="h-6 w-6" />}
        title="Your application is under review"
        body="We have your shopkeeper application and our team is looking at it now. Your book and product forms unlock the moment it is approved — no need to apply again."
        cta={
          <Button asChild size="lg" variant="outline">
            <Link to="/sell/apply">
              View application status
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />
    );
  }

  const rejected = status === "rejected" || status === "suspended";

  return (
    <GateShell
      icon={<ShieldCheck className="h-6 w-6" />}
      title={rejected ? "Your shopkeeper application needs attention" : "Become a shopkeeper to publish"}
      body={
        rejected
          ? "Applications have to be approved before anything can be listed. Open your application to see the reviewer's note and re-submit."
          : "Anyone can buy on Cronyzo — but only approved shopkeepers can list a course, a book or a product. It takes two minutes and one review."
      }
      cta={
        <Button asChild size="lg">
          <Link to="/sell/apply">
            {rejected ? "Review my application" : "Apply to become a shopkeeper"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      }
      secondary={
        <Link to="/sell" className="text-sm font-semibold text-primary hover:underline">
          Why sell on Cronyzo?
        </Link>
      }
    />
  );
}

function GateShell({
  icon,
  title,
  body,
  cta,
  secondary,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  cta: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-3xl border bg-card p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h1 className="mt-5 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          {cta}
          {secondary}
        </div>
      </div>
    </div>
  );
}
