/**
 * Stores — the public directory of verified storefronts.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Package, Search, Store as StoreIcon } from "lucide-react";
import { useState } from "react";
import { storesApi } from "@/lib/commerce";
import { EmptyState, GridSkeleton, Rating } from "@/components/commerce/Primitives";
import { PageGlow } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";

export function StoresPage() {
  const [term, setTerm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["stores", term],
    queryFn: () => storesApi.list({ search: term || undefined, per_page: 24 }),
  });

  const items = data?.items ?? [];

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <PageGlow variant="violet" />
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary">
                <StoreIcon className="h-3.5 w-3.5" />
                Sellers
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                Verified storefronts
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Every seller on Cronyzo has a storefront you can browse before
                you buy — real catalogues, honest descriptions, live stock.
              </p>
            </div>

            <div className="flex h-11 w-full max-w-sm items-center gap-2 rounded-xl border bg-card px-3.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search stores…"
                className="w-full bg-transparent text-sm outline-none"
                aria-label="Search stores"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
        {isLoading ? (
          <GridSkeleton count={6} aspect="16 / 9" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={StoreIcon}
            title="No stores found"
            description="Try a different search — or open your own storefront."
            action={
              <Button asChild>
                <Link to="/sell">Start selling</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((store) => (
              <Link
                key={store.id}
                to="/stores/$slug"
                params={{ slug: store.slug }}
                className="group overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                {/* Banner */}
                <div className="relative h-28 overflow-hidden bg-muted">
                  {store.banner_url ? (
                    <img
                      src={store.banner_url}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-violet-600" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>

                <div className="relative px-5 pb-5 pt-0">
                  <div className="-mt-9 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-extrabold text-white shadow-lg">
                    {store.logo_url ? (
                      <img
                        src={store.logo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      store.name[0]?.toUpperCase()
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-foreground transition-colors group-hover:text-primary">
                      {store.name}
                    </h3>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  </div>

                  {store.tagline && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {store.tagline}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" />
                      {store.product_count} products
                    </span>
                    {store.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {store.city}
                      </span>
                    )}
                    {store.rating_count > 0 && (
                      <Rating value={store.rating_avg} size="xs" showValue />
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
