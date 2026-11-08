/**
 * Shop catalog — the marketplace grid with category rail and filters.
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { shopApi } from "@/lib/commerce";
import { ProductCard } from "@/components/commerce/Cards";
import { EmptyState, GridSkeleton } from "@/components/commerce/Primitives";
import { PageGlow } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest first" },
  { value: "rating", label: "Highest rated" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
];

export function ShopPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    unknown
  >;

  const [term, setTerm] = useState((search.search as string) || "");
  const [category, setCategory] = useState((search.category as string) || "all");
  const [sort, setSort] = useState((search.sort as string) || "popular");
  const [inStock, setInStock] = useState(search.in_stock === "true");
  const [maxPrice, setMaxPrice] = useState((search.max_price as string) || "");
  const [mobileFilters, setMobileFilters] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["shop", "categories"],
    queryFn: () => shopApi.categories(),
  });
  const { data: stats } = useQuery({
    queryKey: ["shop", "stats"],
    queryFn: () => shopApi.stats(),
  });

  const query = useMemo(
    () => ({
      search: term || undefined,
      category: category !== "all" ? category : undefined,
      sort,
      in_stock: inStock ? "true" : undefined,
      max_price: maxPrice || undefined,
      per_page: 24,
    }),
    [term, category, sort, inStock, maxPrice],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["shop", "products", query],
    queryFn: () => shopApi.products(query),
  });

  const items = data?.items ?? [];
  const categoryList = categories?.items ?? [];
  const activeFilters =
    (category !== "all" ? 1 : 0) + (inStock ? 1 : 0) + (maxPrice ? 1 : 0) + (term ? 1 : 0);

  const clearFilters = () => {
    setTerm("");
    setCategory("all");
    setInStock(false);
    setMaxPrice("");
    navigate({ to: "/shop" });
  };

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Category
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
              category === "all"
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            All categories
            {stats && <span className="text-[11px]">{stats.products}</span>}
          </button>
          {categoryList.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.name)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                category === cat.name
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{cat.name}</span>
              {typeof cat.product_count === "number" && (
                <span className="text-[11px] text-muted-foreground">{cat.product_count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Price
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max ₹"
            className="h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Availability
        </h3>
        <button
          onClick={() => setInStock((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
            inStock
              ? "border-primary/40 bg-primary/5 font-semibold text-primary"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          In stock only
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-md border",
              inStock ? "border-primary bg-primary text-white" : "bg-muted",
            )}
          >
            {inStock && <span className="text-[10px] font-bold">✓</span>}
          </span>
        </button>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Sort by
        </h3>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 w-full appearance-none rounded-lg border bg-card px-3 pr-9 text-sm font-medium outline-none focus:border-primary/50"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {activeFilters > 0 && (
        <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
          <X className="mr-2 h-3.5 w-3.5" />
          Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <PageGlow variant="violet" />
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-600/25 bg-violet-600/8 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-400">
                <ShoppingBag className="h-3.5 w-3.5" />
                Shop
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                Everything you need to study
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm text-muted-foreground sm:text-base">
                From a geometry box to a laptop —{" "}
                {(stats?.stores ?? 0) > 0
                  ? `sourced from ${stats?.stores} verified storefronts with live stock, honest pricing and free delivery over ₹999.`
                  : "listed by verified shopkeepers, with live stock, honest pricing and free delivery over ₹999. New stock lands here as shops get approved."}
              </p>
            </div>

            <div className="flex h-11 w-full max-w-sm items-center gap-2 rounded-xl border bg-card px-3.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search products…"
                className="w-full bg-transparent text-sm outline-none"
                aria-label="Search products"
              />
            </div>
          </div>

          {/* Promise strip */}
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Truck, title: "Free delivery over ₹999", body: "Across 19,000+ pin codes" },
              {
                icon: ShieldCheck,
                title: "Verified storefronts",
                body: "Every seller reviewed before they sell",
              },
              {
                icon: Package,
                title: "Live stock counts",
                body: "No more ordering what is out of stock",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-foreground">
                    {item.title}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {item.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border bg-card p-5">{filterPanel}</div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
              <p className="text-sm text-muted-foreground">
                {isFetching && !isLoading ? "Updating…" : `${data?.total ?? 0} products`}
              </p>
              <Button variant="outline" size="sm" onClick={() => setMobileFilters((v) => !v)}>
                <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                Filters
                {activeFilters > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </div>

            {mobileFilters && (
              <div className="mb-6 rounded-2xl border bg-card p-5 lg:hidden">{filterPanel}</div>
            )}

            <div className="mb-5 hidden items-center justify-between lg:flex">
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{data?.total ?? 0}</span> products
                {category !== "all" && (
                  <>
                    {" "}in{" "}
                    <span className="font-semibold text-primary">{category}</span>
                  </>
                )}
              </p>
              {activeFilters > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>

            {isLoading ? (
              <GridSkeleton count={12} aspect="1 / 1" />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nothing here yet"
                description="No products match your filters. Try widening the price range or picking another category."
                action={
                  <Button onClick={clearFilters}>
                    Clear filters
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/25">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Sell on Cronyzo</h3>
              <p className="text-sm text-muted-foreground">
                Open a storefront in minutes and keep 88% of every order.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link to="/sell">
              Open your store
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
