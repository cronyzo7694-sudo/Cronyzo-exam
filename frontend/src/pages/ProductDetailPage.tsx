/**
 * Product detail — the marketplace purchase page.
 */

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Heart,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { shopApi } from "@/lib/commerce";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Price, Rating } from "@/components/commerce/Primitives";
import { ProductCard } from "@/components/commerce/Cards";
import { cn } from "@/lib/utils";

export function ProductDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { add, mutating } = useCartStore();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => shopApi.product(slug),
  });

  const addMutation = useMutation({
    mutationFn: (id: number) => add(id, qty),
    onSuccess: () => {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2600);
    },
  });

  const wishlist = useMutation({
    mutationFn: (id: number) => shopApi.toggleWishlist(id),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="animate-shimmer aspect-square w-full rounded-2xl" />
          <div className="space-y-4">
            <div className="animate-shimmer h-10 w-3/4 rounded" />
            <div className="animate-shimmer h-6 w-1/3 rounded" />
            <div className="animate-shimmer h-24 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Package className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">Product not found</h1>
        <Button asChild className="mt-6">
          <Link to="/shop">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to shop
          </Link>
        </Button>
      </div>
    );
  }

  const gallery = product.gallery?.length ? product.gallery : [product.image_url ?? ""];
  const maxQty = Math.max(1, Math.min(10, product.stock || 1));

  const handleAdd = () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    addMutation.mutate(product.id);
  };

  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-primary">
            Shop
          </Link>
          {product.category_name && (
            <>
              <span>/</span>
              <Link
                to="/shop"
                search={{ category: product.category_name }}
                className="hover:text-primary"
              >
                {product.category_name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="truncate font-medium text-foreground">{product.title}</span>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          {/* ── Gallery ─────────────────────────────────────────── */}
          <div>
            <div className="overflow-hidden rounded-2xl border bg-muted">
              {gallery[activeImage] ? (
                <img
                  src={gallery[activeImage]}
                  alt={product.title}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-primary to-violet-600">
                  <Package className="h-16 w-16 text-white/70" />
                </div>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-3">
                {gallery.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "overflow-hidden rounded-xl border-2 transition-colors",
                      activeImage === i
                        ? "border-primary"
                        : "border-transparent hover:border-primary/40",
                    )}
                  >
                    <img
                      src={img}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Info ─────────────────────────────────────────────── */}
          <div className="min-w-0">
            {product.brand && (
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                {product.brand}
              </p>
            )}

            <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
              {product.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {product.rating_count > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <span className="flex items-center gap-0.5 rounded-md bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950">
                    <Star className="h-3 w-3 fill-current" />
                    {product.rating_avg.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground">
                    {product.rating_count} ratings
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">New arrival</span>
              )}
              {product.sold_count > 0 && (
                <span className="text-muted-foreground">{product.sold_count} sold</span>
              )}
            </div>

            <div className="mt-6 rounded-2xl border bg-card p-5">
              <Price
                price={product.price}
                mrp={product.mrp}
                discountPercent={product.discount_percent}
                size="lg"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Inclusive of all taxes
              </p>
            </div>

            {/* Stock + qty */}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-bold",
                  product.in_stock ? "text-emerald-600" : "text-rose-600",
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                {product.in_stock ? "In stock" : "Out of stock"}
              </span>
              {product.in_stock && product.stock < 20 && (
                <span className="text-sm font-semibold text-amber-600">
                  Only {product.stock} left
                </span>
              )}
            </div>

            {product.in_stock && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">Qty</span>
                <div className="flex items-center rounded-xl border">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-bold text-foreground">
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={handleAdd}
                disabled={!product.in_stock || mutating}
                className="flex-1 sm:flex-none sm:min-w-[220px]"
              >
                {added ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Added to cart
                  </>
                ) : (
                  <>
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Add to cart
                  </>
                )}
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  if (!user) {
                    navigate({ to: "/login" });
                    return;
                  }
                  wishlist.mutate(product.id);
                }}
                aria-label="Save to wishlist"
              >
                <Heart className="h-4 w-4" />
                Save
              </Button>
            </div>

            {added && (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => navigate({ to: "/cart" })}
              >
                Go to cart →
              </Button>
            )}

            {/* Promise list */}
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Truck, title: "Fast delivery", body: "3–6 working days" },
                {
                  icon: ShieldCheck,
                  title: "Verified seller",
                  body: product.store_name ?? "Cronyzo seller",
                },
                { icon: Package, title: "Easy returns", body: "7-day replacement" },
                { icon: Store, title: "Safe payments", body: "UPI, card & COD" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground">{item.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {item.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Description */}
            {product.description && (
              <section className="mt-8">
                <h2 className="text-base font-bold text-foreground">Product details</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </section>
            )}

            {/* Seller */}
            {product.seller && (
              <div className="mt-7 flex items-center gap-3 rounded-2xl border bg-card p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                  {product.seller.avatar_url ? (
                    <img
                      src={product.seller.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (product.seller.full_name?.[0] ?? "S").toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">
                      {product.seller.store_name ?? product.seller.full_name}
                    </span>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {product.seller.full_name}
                    {product.seller.store_name ? " · Verified storefront" : ""}
                  </div>
                </div>
                {product.store_id && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/stores">
                      Visit store
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Reviews */}
        {(product.reviews ?? []).length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-bold text-foreground">
              Customer reviews
              {product.rating_count > 0 && (
                <span className="ml-2 text-sm font-medium text-muted-foreground">
                  {product.rating_count} reviews
                </span>
              )}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(product.reviews ?? []).map((review) => (
                <div key={review.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                      {(review.user?.full_name?.[0] ?? "L").toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {review.user?.full_name ?? "Buyer"}
                      </div>
                      <Rating value={review.rating} size="xs" showValue={false} />
                    </div>
                  </div>
                  {review.title && (
                    <div className="mt-3 text-sm font-bold text-foreground">
                      {review.title}
                    </div>
                  )}
                  {review.body && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {review.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related */}
        {product.related && product.related.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-bold text-foreground">
              More from this store
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {product.related.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
