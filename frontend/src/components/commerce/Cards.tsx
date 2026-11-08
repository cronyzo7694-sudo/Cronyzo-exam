/**
 * Catalog cards — one for each buyable vertical.
 *
 * CourseCard  → Learn
 * BookCard    → Read
 * ProductCard → Shop
 *
 * All three share the same hover lift, media aspect and metadata rhythm so
 * a mixed grid (homepage "Trending") still reads as one system.
 */

import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Clock,
  GraduationCap,
  Package,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Book, Course, Product } from "@/lib/commerce";
import { DiscountPill, Price, Rating } from "@/components/commerce/Primitives";

/* ═══════════════════════════════════════════════════════════
   Course card
   ═══════════════════════════════════════════════════════════ */

export function CourseCard({
  course,
  className,
}: {
  course: Course;
  className?: string;
}) {
  return (
    <Link
      to="/courses/$slug"
      params={{ slug: course.slug }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/80 to-violet-500/80">
            <GraduationCap className="h-10 w-10 text-white/70" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {course.discount_percent > 0 && <DiscountPill percent={course.discount_percent} />}
          {course.is_featured && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow-sm">
              Featured
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {course.category}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
          {course.title}
        </h3>
        {course.subtitle && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
            {course.subtitle}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" />
            {course.teacher?.full_name ?? "Cronyzo"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {course.duration_hours}h
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            {course.lesson_count} lessons
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Rating value={course.rating_avg} count={course.rating_count} size="xs" />
          {course.student_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {course.student_count}
            </span>
          )}
        </div>

        <div className="mt-auto pt-4">
          <Price
            price={course.price}
            mrp={course.mrp}
            discountPercent={course.discount_percent}
          />
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   Book card
   ═══════════════════════════════════════════════════════════ */

export function BookCard({
  book,
  className,
}: {
  book: Book;
  className?: string;
}) {
  return (
    <Link
      to="/books/$slug"
      params={{ slug: book.slug }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5",
        className,
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500/80 to-primary/80">
            <BookOpen className="h-10 w-10 text-white/70" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          {book.discount_percent > 0 && <DiscountPill percent={book.discount_percent} />}
        </div>
        {book.format === "ebook" && (
          <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            E-BOOK
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          {book.author || "Unknown Author"}
        </p>
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
          {book.title}
        </h3>

        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium capitalize">
            {book.format}
          </span>
          {book.pages > 0 && <span>{book.pages} pages</span>}
        </div>

        <div className="mt-2.5">
          <Rating value={book.rating_avg} count={book.rating_count} size="xs" />
        </div>

        <div className="mt-auto pt-4">
          <Price price={book.price} mrp={book.mrp} discountPercent={book.discount_percent} />
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   Product card
   ═══════════════════════════════════════════════════════════ */

export function ProductCard({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const soldOut = !product.in_stock;

  return (
    <Link
      to="/shop/$slug"
      params={{ slug: product.slug }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5",
        soldOut && "opacity-70",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/80 to-violet-500/80">
            <Package className="h-10 w-10 text-white/70" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.discount_percent > 0 && <DiscountPill percent={product.discount_percent} />}
          {soldOut && (
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
              SOLD OUT
            </span>
          )}
        </div>

        {product.sold_count > 20 && (
          <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {product.sold_count}+ sold
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {product.brand && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {product.brand}
          </p>
        )}
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
          {product.title}
        </h3>

        <div className="mt-2.5 flex items-center gap-2">
          {product.rating_count > 0 ? (
            <>
              <Rating value={product.rating_avg} size="xs" showValue={false} />
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-foreground">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {product.rating_avg.toFixed(1)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                ({product.rating_count})
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">New arrival</span>
          )}
        </div>

        <div className="mt-auto pt-4">
          <Price price={product.price} mrp={product.mrp} discountPercent={product.discount_percent} />
          {product.store_name && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShoppingBag className="h-3 w-3" />
              <span className="truncate">{product.store_name}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
