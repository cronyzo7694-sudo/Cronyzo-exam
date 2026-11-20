/**
 * Book detail — purchase page for a single title.
 */

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { usePaymentsReady } from "@/hooks/usePaymentsReady";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Globe,
  Hash,
  Layers,
  Package,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";

import { ProtectedBookReader } from "../components/book/ProtectedBookReader";
import { booksApi } from "@/lib/commerce";
import { reviewsApi } from "@/lib/api";
import { ReviewCard, ReviewForm, ReviewSummaryBar } from "@/components/reviews/Reviews";
import { Button } from "@/components/ui/button";
import { Price, Rating } from "@/components/commerce/Primitives";
import { BookCard } from "@/components/commerce/Cards";

export function BookDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const navigate = useNavigate();

  const { data: book, isLoading, error } = useQuery({
    queryKey: ["book", slug],
    queryFn: () => booksApi.get(slug),
  });

  const { data: related } = useQuery({
    queryKey: ["book", "related", book?.category],
    queryFn: () => booksApi.list({ category: book?.category, sort: "popular", per_page: 5 }),
    enabled: Boolean(book?.category),
  });

  /** Real reviews — the only thing that moves the stars on this page. */
  const reviewsQuery = useQuery({
    queryKey: ["book-reviews", book?.id],
    queryFn: () => reviewsApi.book(book!.id),
    enabled: Boolean(book?.id),
  });

  /**
   * E-book actions — all of them go through the protected reader.
   *
   * There is no download path for a paid title any more: the API refuses even
   * a buyer a file (`code: "reading_only"`), because the only place an e-book
   * is allowed to live is this reader.
   */
  const payments = usePaymentsReady(); // hook order must not depend on the query
  const [readerBusy, setReaderBusy] = useState<null | "full" | "sample">(null);
  const [readerOpen, setReaderOpen] = useState<null | "full" | "sample">(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);

  const openReader = async (mode: "full" | "sample") => {
    if (!book) return;
    setReaderBusy(mode);
    setPdfNote(null);
    try {
      const res = await booksApi.readerInfo(book.id);
      const data = res.data;
      if (data?.mode === "full" && mode === "full") {
        setReaderOpen("full");
        return;
      }
      if (data?.has_sample) {
        setReaderOpen("sample");
        if (mode === "full" && data.mode !== "full") {
          setPdfNote(
            data.code === "login_required"
              ? "Poori e-book padhne ke liye sign in karein — sample khula hai."
              : "Poori e-book kharidne ke baad hi khulegi — abhi free sample padh lein.",
          );
        }
        return;
      }
      setPdfNote(
        data?.code === "login_required"
          ? "Padhne ke liye sign in karein."
          : res.message || "Ye e-book is listing par available nahi hai.",
      );
    } catch (err: any) {
      setPdfNote(err?.message || "Reader nahi khul paya");
    } finally {
      setReaderBusy(null);
    }
  };

  /** Only a title the seller marked "free to download" still hands out a file. */
  const openDownload = async () => {
    if (!book) return;
    setPdfNote(null);
    try {
      const res = await booksApi.downloadPdf(book.id);
      if (res.hosted) {
        const blob = await booksApi.readBlob(book.id, "file");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.file_name || `${book.slug}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      setPdfNote(
        err?.code === "reading_only"
          ? "Ye e-book sirf Cronyzo par padhi ja sakti hai — download band hai."
          : err?.message || "Could not open the download",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
          <div className="animate-shimmer aspect-[3/4] w-full rounded-2xl" />
          <div className="space-y-4">
            <div className="animate-shimmer h-10 w-3/4 rounded" />
            <div className="animate-shimmer h-5 w-1/3 rounded" />
            <div className="animate-shimmer h-32 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">Book not found</h1>
        <Button asChild className="mt-6">
          <Link to="/books">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to books
          </Link>
        </Button>
      </div>
    );
  }

  // E-book / PDF editions never ship — no courier, no COD, no delivery fee.
  const isDigital =
    ["ebook", "e-book", "pdf", "digital"].includes(String(book.format || "").toLowerCase()) ||
    (!["paperback", "hardcover", "hardbound", "printed"].includes(
      String(book.format || "").toLowerCase(),
    ) &&
      Boolean(book.has_pdf));

  const specs = [
    { icon: Hash, label: "ISBN", value: book.isbn ?? "—" },
    { icon: Building2, label: "Publisher", value: book.publisher ?? "—" },
    { icon: Layers, label: "Edition", value: book.edition ?? book.format },
    { icon: FileText, label: "Pages", value: book.pages ? String(book.pages) : "—" },
    { icon: Globe, label: "Language", value: book.language },
    { icon: Package, label: "Format", value: book.format },
  ];

  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span>/</span>
          <Link to="/books" className="hover:text-primary">
            Books
          </Link>
          <span>/</span>
          <Link to="/books" search={{ category: book.category }} className="hover:text-primary">
            {book.category}
          </Link>
          <span>/</span>
          <span className="truncate font-medium text-foreground">{book.title}</span>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[320px_1fr_340px]">
          {/* ── Cover ────────────────────────────────────────────── */}
          <div>
            <div className="sticky top-24">
              <div className="overflow-hidden rounded-2xl border bg-muted shadow-xl">
                {book.cover_url ? (
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-br from-violet-500 to-primary">
                    <BookOpen className="h-14 w-14 text-white/70" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Info ─────────────────────────────────────────────── */}
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/8 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <BookOpen className="h-3.5 w-3.5" />
              {book.category}
            </span>

            <h1 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
              {book.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="font-semibold text-foreground">{book.author ?? "Unknown"}</span>
              {book.seller && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  sold by{" "}
                  <span className="font-medium text-foreground">{book.seller.full_name}</span>
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {book.rating_count > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <span className="flex items-center gap-0.5 rounded-md bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950">
                    <Star className="h-3 w-3 fill-current" />
                    {book.rating_avg.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground">{book.rating_count} ratings</span>
                </span>
              ) : (
                <span className="text-muted-foreground">No ratings yet</span>
              )}
              {book.sold_count > 0 && (
                <span className="text-muted-foreground">{book.sold_count} sold</span>
              )}
            </div>

            {book.description && (
              <section className="mt-7">
                <h2 className="text-base font-bold text-foreground">About this book</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {book.description}
                </p>
              </section>
            )}

            {book.highlights.length > 0 && (
              <section className="mt-7">
                <h2 className="text-base font-bold text-foreground">What&apos;s inside</h2>
                <ul className="mt-3 space-y-2">
                  {book.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-muted-foreground">{h}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Specs */}
            <section className="mt-7">
              <h2 className="text-base font-bold text-foreground">Details</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {specs.map((spec) => (
                  <div key={spec.label}>
                    <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <spec.icon className="h-3 w-3" />
                      {spec.label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium capitalize text-foreground">
                      {spec.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Table of contents */}
            {book.chapters && book.chapters.length > 0 && (
              <section className="mt-8">
                <h2 className="text-base font-bold text-foreground">
                  Table of contents
                </h2>
                <ol className="mt-3 overflow-hidden rounded-xl border">
                  {book.chapters.map((chapter, i) => (
                    <li
                      key={chapter.id}
                      className="flex items-center gap-3 border-b bg-card px-4 py-3 text-sm last:border-b-0"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="flex-1 font-medium text-foreground">
                        {chapter.title}
                      </span>
                      {chapter.page_start ? (
                        <span className="text-xs text-muted-foreground">
                          p. {chapter.page_start}
                          {chapter.page_end ? `–${chapter.page_end}` : ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          {/* ── Buy box ──────────────────────────────────────────── */}
          <aside>
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl border bg-card p-6 shadow-lg">
                <Price
                  price={book.price}
                  mrp={book.mrp}
                  discountPercent={book.discount_percent}
                  size="lg"
                />

                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span
                    className={
                      book.in_stock
                        ? "font-bold text-emerald-600"
                        : "font-bold text-rose-600"
                    }
                  >
                    {book.in_stock ? "In stock" : "Out of stock"}
                  </span>
                  {book.in_stock && book.stock < 20 && (
                    <span className="text-amber-600">
                      Only {book.stock} left
                    </span>
                  )}
                </div>

                {/* Free e-book: read here, download only if the seller opted in */}
                {book.is_free_download ? (
                  <>
                    <Button
                      className="mt-5 w-full"
                      size="lg"
                      onClick={() => void openReader("full")}
                      disabled={readerBusy !== null}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      {readerBusy ? "Opening…" : "Read now — free"}
                    </Button>
                    <Button
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => void openDownload()}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF (free)
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className="mt-5 w-full"
                      size="lg"
                      disabled={(!book.in_stock && !isDigital) || !payments.ready}
                      onClick={() =>
                        navigate({
                          to: "/checkout",
                          search: { type: "book", id: String(book.id) },
                        })
                      }
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      {!payments.ready
                        ? "Payment jald shuru hoga"
                        : isDigital
                          ? "Buy e-book"
                          : "Buy now"}
                    </Button>
                    {book.has_pdf && (
                      <Button
                        variant="outline"
                        className="mt-2 w-full"
                        onClick={() => void openReader("full")}
                        disabled={readerBusy !== null}
                      >
                        <BookOpen className="mr-2 h-4 w-4" />
                        {readerBusy === "full" ? "Opening…" : "Read now (if purchased)"}
                      </Button>
                    )}
                  </>
                )}

                {/* Free sample — the strongest thing on a book page */}
                {book.has_preview && (
                  <Button
                    variant="ghost"
                    className="mt-2 w-full text-primary"
                    onClick={() => void openReader("sample")}
                    disabled={readerBusy !== null}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Read a free sample
                    {!!book.preview_pages && ` (${book.preview_pages} pages)`}
                  </Button>
                )}

                {pdfNote && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {pdfNote}
                  </p>
                )}

                {book.is_free_download && (
                  <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    Free title — yahan padh lein, chaahein to PDF download bhi kar lein.
                  </p>
                )}

                <div className="mt-5 space-y-3 border-t pt-5 text-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Delivery
                  </p>
                  {isDigital ? (
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Checkout ke baad turant padhna shuru — Cronyzo par hi
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <Truck className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Delivery in 3–6 working days
                      </span>
                    </div>
                  )}
                  {isDigital ? (
                    <div className="flex items-center gap-2.5">
                      <Package className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Delivery charge nahi · address ki bhi zaroorat nahi
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <Package className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        {Number(book.shipping_fee || 0) > 0
                          ? `Delivery ₹${Number(book.shipping_fee)} · checkout par`
                          : "Free delivery"}{" "}
                        · COD available
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {book.seller && (
                <div className="rounded-2xl border bg-card p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Sold by
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                      {book.seller.avatar_url ? (
                        <img
                          src={book.seller.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (book.seller.full_name?.[0] ?? "S").toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">
                          {book.seller.full_name}
                        </span>
                        <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Verified seller
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Ratings & reviews — live, from real accounts */}
        <section className="mt-14" id="reviews">
          <h2 className="text-xl font-bold text-foreground">Ratings &amp; reviews</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Written by people who signed in — one review per person, editable any time.
          </p>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              {reviewsQuery.data?.summary ? (
                <ReviewSummaryBar summary={reviewsQuery.data.summary} />
              ) : null}

              {reviewsQuery.isLoading ? (
                <div className="h-28 animate-pulse rounded-2xl border bg-card" />
              ) : (reviewsQuery.data?.items?.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
                  <p className="text-[13px] font-bold">No reviews for this book yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
                    Bought or read it? Your rating is what the next buyer looks at first.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {reviewsQuery.data!.items.map((review) => (
                    <ReviewCard key={review.id} review={review} compact />
                  ))}
                </div>
              )}
            </div>

            <div>
              <ReviewForm
                target={{ type: "book", id: book.id }}
                onSaved={() => void reviewsQuery.refetch()}
              />
            </div>
          </div>
        </section>

        {/* Related */}
        {related && related.items.length > 1 && (
          <section className="mt-16">
            <h2 className="text-xl font-bold text-foreground">
              More in {book.category}
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {related.items
                .filter((b) => b.id !== book.id)
                .slice(0, 4)
                .map((b) => (
                  <BookCard key={b.id} book={b} />
                ))}
            </div>
          </section>
        )}
      </div>

      {readerOpen && (
        <ProtectedBookReader
          bookId={book.id}
          sample={readerOpen === "sample"}
          title={book.title}
          onClose={() => setReaderOpen(null)}
          onNeedsPurchase={() => {
            if (book.is_free_download) {
              setPdfNote("Padhne ke liye sign in karein.");
              navigate({ to: "/login" });
              return;
            }
            navigate({ to: "/checkout", search: { type: "book", id: String(book.id) } });
          }}
        />
      )}
    </>
  );
}
