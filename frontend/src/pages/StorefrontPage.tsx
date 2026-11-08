/**
 * Storefront — a vendor's public shop page with their catalogue.
 */

import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  Package,
  ShoppingBag,
  Store as StoreIcon,
} from "lucide-react";
import { shopApi, storesApi, type Product } from "@/lib/commerce";
import { ProductCard } from "@/components/commerce/Cards";
import { GridSkeleton, Rating } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";

export function StorefrontPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };

  const { data: store, isLoading, error } = useQuery({
    queryKey: ["store", slug],
    queryFn: () => storesApi.get(slug),
  });

  const { data: products } = useQuery({
    queryKey: ["store", slug, "products"],
    queryFn: () => shopApi.products({ store_id: store?.id, per_page: 100 }),
    enabled: Boolean(store?.id),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="animate-shimmer h-40 w-full rounded-2xl" />
        <div className="mt-8">
          <GridSkeleton count={8} aspect="1 / 1" />
        </div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <StoreIcon className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">Store not found</h1>
        <Button asChild className="mt-6">
          <Link to="/stores">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All stores
          </Link>
        </Button>
      </div>
    );
  }

  // The store detail returns a sample; the list endpoint gives the full set.
  const catalogue: Product[] =
    products?.items?.length
      ? products.items
      : (store.products ?? []);

  return (
    <>
      {/* Banner */}
      <div className="relative h-40 overflow-hidden bg-muted sm:h-52">
        {store.banner_url ? (
          <img
            src={store.banner_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-8">
        {/* Store header */}
        <div className="relative -mt-14 flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-extrabold text-white shadow-xl">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              store.name[0]?.toUpperCase()
            )}
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                {store.name}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            </div>
            {store.tagline && (
              <p className="mt-1 text-sm text-muted-foreground">{store.tagline}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                <Rating value={store.rating_avg} count={store.rating_count} size="xs" />
              )}
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="sm:mb-1">
            <Link to="/shop">Browse all products</Link>
          </Button>
        </div>

        {store.description && (
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {store.description}
          </p>
        )}

        {/* Catalogue */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Catalogue
          </h2>

          {catalogue.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                This store has not listed anything yet
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
              {catalogue.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
