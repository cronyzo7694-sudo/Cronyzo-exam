/**
 * Seller catalogue — manage the courses / books / products you have published.
 */

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  GraduationCap,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { booksApi, coursesApi, shopApi } from "@/lib/commerce";
import { EmptyState, Price, Rating } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";

type Kind = "courses" | "books" | "products";

const CONFIG = {
  courses: {
    title: "My courses",
    icon: GraduationCap,
    emptyTitle: "You have not published a course yet",
    emptyBody:
      "Build a course with modules and lessons — it can be free or paid.",
    cta: "Create a course",
    to: "/sell/courses/new",
  },
  books: {
    title: "My books",
    icon: BookOpen,
    emptyTitle: "You have not listed a book yet",
    emptyBody: "List the books your students need with a table of contents.",
    cta: "List a book",
    to: "/sell/books/new",
  },
  products: {
    title: "My products",
    icon: Package,
    emptyTitle: "Your catalogue is empty",
    emptyBody: "Add a product with live stock and it goes straight on sale.",
    cta: "List a product",
    to: "/sell/products/new",
  },
} as const;

export function SellerCatalogPage({ kind }: { kind: Kind }) {
  const config = CONFIG[kind];
  const queryClient = useQueryClient();

  const { data: courses } = useQuery({
    queryKey: ["creator", "courses", "mine"],
    queryFn: () => coursesApi.list({ per_page: 100, sort: "newest", mine: "true" }),
    enabled: kind === "courses",
  });
  const { data: books } = useQuery({
    queryKey: ["creator", "books", "mine"],
    queryFn: () => booksApi.list({ per_page: 100, sort: "newest", mine: "true" }),
    enabled: kind === "books",
  });
  const { data: products } = useQuery({
    queryKey: ["creator", "products", "mine"],
    queryFn: () => shopApi.products({ per_page: 100, sort: "newest", mine: "true" }),
    enabled: kind === "products",
  });

  const removeProduct = useMutation({
    mutationFn: (id: number) => shopApi.removeProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator", "products"] });
      queryClient.invalidateQueries({ queryKey: ["creator", "dashboard"] });
    },
  });
  const removeBook = useMutation({
    mutationFn: (id: number) => booksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator", "books"] });
      queryClient.invalidateQueries({ queryKey: ["creator", "dashboard"] });
    },
  });

  /** Two-step delete — an accidental click must never drop a live listing. */
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const askDelete = (id: number) => {
    if (confirmId === id) {
      setConfirmId(null);
      if (kind === "books") removeBook.mutate(id);
      else removeProduct.mutate(id);
    } else {
      setConfirmId(id);
    }
  };

  const rows =
    kind === "courses"
      ? (courses?.items ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.subtitle ?? c.category,
          image: c.thumbnail_url,
          price: c.price,
          mrp: c.mrp,
          discount: c.discount_percent,
          rating: c.rating_avg,
          ratingCount: c.rating_count,
          meta: `${c.lesson_count} lessons · ${c.student_count} learners`,
          href: `/courses/${c.slug}`,
        }))
      : kind === "books"
        ? (books?.items ?? []).map((b) => ({
            id: b.id,
            title: b.title,
            subtitle: b.author ?? b.category,
            image: b.cover_url,
            price: b.price,
            mrp: b.mrp,
            discount: b.discount_percent,
            rating: b.rating_avg,
            ratingCount: b.rating_count,
            meta: `${b.format} · ${b.stock} in stock`,
            href: `/books/${b.slug}`,
          }))
        : (products?.items ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            subtitle: p.brand ?? p.category_name ?? "",
            image: p.image_url,
            price: p.price,
            mrp: p.mrp,
            discount: p.discount_percent,
            rating: p.rating_avg,
            ratingCount: p.rating_count,
            meta: `${p.stock} in stock · ${p.sold_count} sold`,
            href: `/shop/${p.slug}`,
          }));

  const Icon = config.icon;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/sell/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {config.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} published
            </p>
          </div>
        </div>

        <Button asChild size="sm">
          <Link to={config.to}>
            <Plus className="mr-2 h-4 w-4" />
            {config.cta}
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Icon}
            title={config.emptyTitle}
            description={config.emptyBody}
            action={
              <Button asChild>
                <Link to={config.to}>
                  {config.cta}
                  <Plus className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {row.image ? (
                  <img src={row.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-foreground">
                  {row.title}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.subtitle}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">
                    {row.meta}
                  </span>
                  {row.ratingCount > 0 && (
                    <Rating value={row.rating} size="xs" />
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <Price
                  price={row.price}
                  mrp={row.mrp}
                  discountPercent={row.discount}
                  size="sm"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {confirmId === row.id && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                    Remove?
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-[11px]"
                      disabled={
                        kind === "books"
                          ? removeBook.isPending
                          : removeProduct.isPending
                      }
                      onClick={() => askDelete(row.id)}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setConfirmId(null)}
                    >
                      No
                    </Button>
                  </span>
                )}
                <Button asChild variant="ghost" size="icon" title="View">
                  <Link to={row.href}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
                {kind === "products" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove listing"
                    aria-label={`Remove ${row.title}`}
                    disabled={removeProduct.isPending}
                    onClick={() => askDelete(row.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {kind === "books" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove listing"
                    aria-label={`Remove ${row.title}`}
                    disabled={removeBook.isPending}
                    onClick={() => askDelete(row.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
