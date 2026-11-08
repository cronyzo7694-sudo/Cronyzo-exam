/**
 * Books catalog — filterable grid of every listed title.
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { booksApi } from "@/lib/commerce";
import { BookCard } from "@/components/commerce/Cards";
import { EmptyState, GridSkeleton } from "@/components/commerce/Primitives";
import { PageGlow } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FORMATS = ["paperback", "hardcover", "ebook", "pdf"] as const;
const SORTS = [
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest first" },
  { value: "rating", label: "Highest rated" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
];

export function BooksPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    unknown
  >;

  const [term, setTerm] = useState((search.search as string) || "");
  const [category, setCategory] = useState((search.category as string) || "all");
  const [format, setFormat] = useState((search.format as string) || "all");
  const [sort, setSort] = useState((search.sort as string) || "popular");
  const [mobileFilters, setMobileFilters] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["books", "categories"],
    queryFn: () => booksApi.categories(),
  });

  const query = useMemo(
    () => ({
      search: term || undefined,
      category: category !== "all" ? category : undefined,
      format: format !== "all" ? format : undefined,
      sort,
      per_page: 24,
    }),
    [term, category, format, sort],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["books", "list", query],
    queryFn: () => booksApi.list(query),
  });

  const items = data?.items ?? [];
  const categoryList = categories?.items ?? [];
  const activeFilters =
    (category !== "all" ? 1 : 0) + (format !== "all" ? 1 : 0) + (term ? 1 : 0);

  const clearFilters = () => {
    setTerm("");
    setCategory("all");
    setFormat("all");
    navigate({ to: "/books" });
  };

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Category
        </h3>
        <div className="space-y-1">
          {[{ name: "All categories", slug: "all" }, ...categoryList.map((c) => ({ name: c, slug: c }))].map(
            (item) => (
              <button
                key={item.slug}
                onClick={() => setCategory(item.slug)}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  category === item.slug
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.name}
              </button>
            ),
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Format
        </h3>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((item) => (
            <button
              key={item}
              onClick={() => setFormat(format === item ? "all" : item)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                format === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
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
        <PageGlow variant="teal" />
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-600/25 bg-emerald-600/8 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <BookOpen className="h-3.5 w-3.5" />
                Read
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                The Cronyzo library
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Programming, exam prep and self-development titles — print and
                e-book, listed by booksellers and authors with the contents up
                front.
              </p>
            </div>

            <div className="flex h-11 w-full max-w-sm items-center gap-2 rounded-xl border bg-card px-3.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search by title or author…"
                className="w-full bg-transparent text-sm outline-none"
                aria-label="Search books"
              />
            </div>
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
                {isFetching && !isLoading ? "Updating…" : `${data?.total ?? 0} books`}
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
                <span className="font-bold text-foreground">{data?.total ?? 0}</span> books
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
              <GridSkeleton count={9} aspect="3 / 4" />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No books found"
                description="Nothing matches that search. Try a different author, category or format."
                action={
                  <Button onClick={clearFilters}>
                    Clear filters
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
                {items.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/25">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-4 py-10 sm:px-6 lg:px-8">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Are you a book seller?
            </h3>
            <p className="text-sm text-muted-foreground">
              List your catalogue on Cronyzo and reach learners who already
              bought the course.
            </p>
          </div>
          <Button asChild>
            <Link to="/sell/books/new">
              List your books
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
