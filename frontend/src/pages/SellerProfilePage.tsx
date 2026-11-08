/**
 * Public creator profile — a teacher or vendor's public page with their
 * published courses, books and products.
 */

import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  GraduationCap,
  MapPin,
  Package,
  Sparkles,
  Users,
} from "lucide-react";
import { profilesApi } from "@/lib/commerce";
import { BookCard, CourseCard, ProductCard } from "@/components/commerce/Cards";
import { GridSkeleton, StatPill } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";

export function SellerProfilePage() {
  const { sellerId } = useParams({ strict: false }) as { sellerId: string };

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", sellerId],
    queryFn: () => profilesApi.get(Number(sellerId)),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-shimmer h-28 w-full rounded-2xl" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-foreground">Profile not found</h1>
        <Button asChild className="mt-6">
          <Link to="/courses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to courses
          </Link>
        </Button>
      </div>
    );
  }

  const { user, stats } = data;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Banner */}
      <div className="relative h-32 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 sm:h-40">
        <div className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, white 0, transparent 45%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)",
          }}
        />
      </div>

      {/* Profile header */}
      <div className="relative -mt-12 flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-extrabold text-white shadow-xl">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            user.full_name?.[0]?.toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {user.full_name}
            </h1>
            {user.is_verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            )}
          </div>
          {user.headline && (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {user.headline}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {user.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {user.city}
              </span>
            )}
            {user.expertise.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                {user.expertise.join(" · ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {user.bio && (
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {user.bio}
        </p>
      )}

      {/* Stats */}
      <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatPill value={stats.courses} label="Courses" icon={GraduationCap} />
        <StatPill value={stats.books} label="Books" icon={BookOpen} />
        <StatPill value={stats.products} label="Products" icon={Package} />
        <StatPill value={stats.students} label="Learners" icon={Users} />
        <StatPill value={stats.sold} label="Items sold" icon={Sparkles} />
      </div>

      {/* Courses */}
      {data.courses.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">
            Courses by {user.full_name.split(" ")[0]}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {data.courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      )}

      {/* Books */}
      {data.books.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Books</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {data.books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      {data.products.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Products</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {data.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {data.courses.length === 0 &&
        data.books.length === 0 &&
        data.products.length === 0 && (
          <div className="mt-12 rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              Nothing published yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This creator has not listed anything publicly so far.
            </p>
          </div>
        )}
    </div>
  );
}
