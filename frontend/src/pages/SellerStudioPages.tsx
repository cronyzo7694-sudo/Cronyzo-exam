/**
 * Seller studio — the three "create" forms (product, course, book).
 *
 * They share a small internal form kit so the three pages look and behave
 * like one product.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  ImageIcon,
  Package,
  Save,
} from "lucide-react";
import { useRef, useState } from "react";
import { booksApi, coursesApi, shopApi } from "@/lib/commerce";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShopkeeperGate } from "@/components/seller/ShopkeeperGate";

/* ═══════════════════════════════════════════════════════════
   Shared form kit
   ═══════════════════════════════════════════════════════════ */

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary/50";

function StudioShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/sell/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}

function SuccessNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Create product
   ═══════════════════════════════════════════════════════════ */

function CreateProductPageInner() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    brand: "",
    category_id: "",
    price: "",
    mrp: "",
    stock: "",
    image_url: "",
    fulfillment: "physical",
  });

  const create = useMutation({
    mutationFn: () =>
      shopApi.createProduct({
        title: form.title,
        description: form.description,
        brand: form.brand,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        price: Number(form.price || 0),
        mrp: Number(form.mrp || form.price || 0),
        stock: Number(form.stock || 0),
        image_url: form.image_url,
        fulfillment: form.fulfillment,
      }),
    onSuccess: (res) => {
      navigate({ to: "/shop/$slug", params: { slug: res.item.slug } });
    },
  });

  return (
    <StudioShell
      icon={Package}
      title="List a product"
      subtitle="Add an item to your storefront. It goes live the moment you publish."
    >
      <form
        className="space-y-5 rounded-2xl border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Product title">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Aurex Pro 5G Smartphone (256GB)"
            className={inputCls}
          />
        </Field>

        <Field label="Description" hint="What makes this worth buying?">
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="6.7&quot; AMOLED, 120Hz, 5000mAh with 67W charging."
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand">
            <input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="Aurex"
              className={inputCls}
            />
          </Field>

          <Field label="Category ID" hint="Leave empty to list uncategorised.">
            <input
              type="number"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              placeholder="1"
              className={inputCls}
            />
          </Field>

          <Field label="Selling price (₹)">
            <input
              required
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="31999"
              className={inputCls}
            />
          </Field>

          <Field label="MRP (₹)" hint="Shown struck through. Leave equal to price.">
            <input
              type="number"
              min={0}
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              placeholder="38999"
              className={inputCls}
            />
          </Field>

          <Field label="Stock">
            <input
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              placeholder="24"
              className={inputCls}
            />
          </Field>

          <Field label="Fulfilment">
            <select
              value={form.fulfillment}
              onChange={(e) => setForm({ ...form, fulfillment: e.target.value })}
              className={inputCls}
            >
              <option value="physical">Physical — ships to buyer</option>
              <option value="digital">Digital — instant download</option>
            </select>
          </Field>
        </div>

        <Field
          label="Image URL"
          hint="Paste a Cloudinary URL once you wire up media storage."
        >
          <div className="flex gap-2">
            <input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              placeholder="https://res.cloudinary.com/…/image.jpg"
              className={inputCls}
            />
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </span>
          </div>
        </Field>

        {create.isError && (
          <p className="text-sm font-medium text-destructive">
            {(create.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/sell/dashboard" })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {create.isPending ? "Publishing…" : "Publish product"}
          </Button>
        </div>
      </form>
    </StudioShell>
  );
}

/* ═══════════════════════════════════════════════════════════
   Create course
   ═══════════════════════════════════════════════════════════ */

function CreateCoursePageInner() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    description: "",
    category: "Data & AI",
    level: "beginner",
    language: "Hindi",
    price: "",
    mrp: "",
    duration_hours: "",
    thumbnail_url: "",
  });

  const create = useMutation({
    mutationFn: () =>
      coursesApi.create({
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        category: form.category,
        level: form.level,
        language: form.language,
        price: Number(form.price || 0),
        mrp: Number(form.mrp || form.price || 0),
        duration_hours: Number(form.duration_hours || 0),
        thumbnail_url: form.thumbnail_url,
      }),
    onSuccess: (res) => {
      navigate({ to: "/courses/$slug", params: { slug: res.item.slug } });
    },
  });

  return (
    <StudioShell
      icon={GraduationCap}
      title="Create a course"
      subtitle="Start with the basics — you can add modules and lessons once it is live."
    >
      <form
        className="space-y-5 rounded-2xl border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Course title">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Python & Data Engineering Masterclass"
            className={inputCls}
          />
        </Field>

        <Field label="One-line promise" hint="Shown under the title on the course page.">
          <input
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            placeholder="From first script to a production-grade pipeline"
            className={inputCls}
          />
        </Field>

        <Field label="Description" hint="What will the student be able to do at the end?">
          <textarea
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="A complete, project-first path through Python, SQL and orchestration…"
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Level">
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              className={inputCls}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </Field>
          <Field label="Language">
            <input
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="Price (₹)" hint="0 makes it a free course.">
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="2499"
              className={inputCls}
            />
          </Field>
          <Field label="MRP (₹)">
            <input
              type="number"
              min={0}
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              placeholder="4999"
              className={inputCls}
            />
          </Field>
          <Field label="Duration (hours)">
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.duration_hours}
              onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
              placeholder="24.5"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Thumbnail URL" hint="A 16:10 image works best.">
          <input
            value={form.thumbnail_url}
            onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
            placeholder="https://res.cloudinary.com/…/course.jpg"
            className={inputCls}
          />
        </Field>

        {create.isError && (
          <p className="text-sm font-medium text-destructive">
            {(create.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/sell/dashboard" })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {create.isPending ? "Creating…" : "Create course"}
          </Button>
        </div>
      </form>
    </StudioShell>
  );
}

/* ═══════════════════════════════════════════════════════════
   Create book
   ═══════════════════════════════════════════════════════════ */

function CreateBookPageInner() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    author: "",
    publisher: "",
    isbn: "",
    edition: "",
    category: "Programming",
    language: "English",
    pages: "",
    price: "",
    mrp: "",
    stock: "",
    format: "pdf",
    cover_url: "",
    description: "",
    highlights: "",
    // Digital edition — Cronyzo publications are PDF-first by design, so this
    // is on from the start and the file is mandatory (see handleSubmit).
    is_digital: true,
    is_free_download: false,
    // "link" = the file already lives somewhere else (Google Drive, Dropbox,
    // the seller's own site) and we only store the URL. "upload" = we host it.
    file_mode: "link" as "link" | "upload",
    file_url: "",
    preview_url: "",
  });

  const pdfRef = useRef<HTMLInputElement | null>(null);
  const sampleRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      booksApi.create({
        title: form.title,
        author: form.author,
        publisher: form.publisher,
        isbn: form.isbn,
        edition: form.edition,
        category: form.category,
        language: form.language,
        pages: Number(form.pages || 0),
        price: Number(form.price || 0),
        mrp: Number(form.mrp || form.price || 0),
        stock: Number(form.stock || 0),
        format: form.format,
        cover_url: form.cover_url,
        description: form.description,
        highlights: form.highlights,
        // Link-based listing: the API normalises Drive/Dropbox share links
        // and applies the same purchase check before handing the URL out.
        file_url: form.is_digital && form.file_mode === "link" ? form.file_url.trim() : "",
        preview_url:
          form.is_digital && form.file_mode === "link" ? form.preview_url.trim() : "",
        is_free_download: form.is_free_download,
      }),
    onSuccess: async (res) => {
      // The PDFs are attached in a second step: the listing must exist first so
      // the upload is scoped to its own book id (and its own ownership check).
      if (form.file_mode === "link") {
        navigate({ to: "/books/$slug", params: { slug: res.item.slug } });
        return;
      }
      try {
        const bookId = res.item.id;
        const pdf = pdfRef.current?.files?.[0];
        const sample = sampleRef.current?.files?.[0];
        if (pdf) {
          await booksApi.uploadPdf(bookId, pdf, {
            isFreeDownload: form.is_free_download,
            price: form.is_free_download ? 0 : Number(form.price || 0),
          });
        }
        if (sample) {
          await booksApi.uploadPreviewPdf(bookId, sample);
        }
      } catch (err: any) {
        // The book is already published — surface the upload problem without
        // trapping the seller on the form.
        setUploadError(err?.message || "Book listed, but the PDF upload failed");
        return;
      }
      navigate({ to: "/books/$slug", params: { slug: res.item.slug } });
    },
  });

  /**
   * Publishing is PDF-only.
   *
   * The listing is created first so the upload can be scoped to its own book
   * id, which means a missing PDF would leave a published book nobody can
   * open. So the file is checked here, before any request goes out.
   */
  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setUploadError(null);
    if (form.is_digital && form.file_mode === "link") {
      const link = form.file_url.trim();
      if (!/^https?:\/\//i.test(link)) {
        setUploadError(
          "Paste the book's file link (it must start with https://) — Google Drive, " +
            "Dropbox or any direct PDF link. Or switch to “Upload a PDF”.",
        );
        return;
      }
      if (form.preview_url.trim() && !/^https?:\/\//i.test(form.preview_url.trim())) {
        setUploadError("The free-sample link must start with https://");
        return;
      }
    }
    if (form.is_digital && form.file_mode === "upload" && !pdfRef.current?.files?.[0]) {
      setUploadError(
        "Publishing is PDF-only — attach the book PDF before listing it. " +
          "Untick “Sell this as a PDF e-book” only for a physical title.",
      );
      pdfRef.current?.focus();
      return;
    }
    create.mutate();
  };

  return (
    <StudioShell
      icon={BookOpen}
      title="List a book"
      subtitle="Give learners the details they need before they buy."
    >
      <form
        className="space-y-5 rounded-2xl border bg-card p-6"
        onSubmit={handleSubmit}
      >
        <Field label="Title">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Designing Data-Intensive Applications"
            className={inputCls}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Author">
            <input
              value={form.author}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
              placeholder="Martin Kleppmann"
              className={inputCls}
            />
          </Field>
          <Field label="Publisher">
            <input
              value={form.publisher}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })}
              placeholder="O'Reilly Media"
              className={inputCls}
            />
          </Field>
          <Field label="ISBN">
            <input
              value={form.isbn}
              onChange={(e) => setForm({ ...form, isbn: e.target.value })}
              placeholder="978-93-5000-456-8"
              className={inputCls}
            />
          </Field>
          <Field label="Edition">
            <input
              value={form.edition}
              onChange={(e) => setForm({ ...form, edition: e.target.value })}
              placeholder="2nd Edition"
              className={inputCls}
            />
          </Field>
          <Field label="Category">
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Language">
            <input
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Pages">
            <input
              type="number"
              min={0}
              value={form.pages}
              onChange={(e) => setForm({ ...form, pages: e.target.value })}
              placeholder="616"
              className={inputCls}
            />
          </Field>
          <Field label="Format">
            <select
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
              className={inputCls}
            >
              <option value="paperback">Paperback</option>
              <option value="hardcover">Hardcover</option>
              <option value="ebook">E-book</option>
              <option value="pdf">PDF</option>
            </select>
          </Field>
          <Field label="Price (₹)">
            <input
              required
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="1299"
              className={inputCls}
            />
          </Field>
          <Field label="MRP (₹)">
            <input
              type="number"
              min={0}
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              placeholder="1899"
              className={inputCls}
            />
          </Field>
          <Field label="Stock">
            <input
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              placeholder="18"
              className={inputCls}
            />
          </Field>
          <Field label="Cover image URL" hint="Paste any image link — Drive, Cloudinary, Imgur.">
            <div className="flex items-center gap-2">
              <input
                value={form.cover_url}
                onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                placeholder="https://res.cloudinary.com/…/cover.jpg"
                className={inputCls}
              />
              {/^https?:\/\//i.test(form.cover_url) && (
                <img
                  src={form.cover_url}
                  alt=""
                  className="h-10 w-8 shrink-0 rounded border object-cover"
                />
              )}
            </div>
          </Field>
        </div>

        <Field label="Description">
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="The reference for anyone designing systems that hold up under load…"
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </Field>

        <Field
          label="Highlights"
          hint="One per line — shown as a bullet list on the book page."
        >
          <textarea
            rows={4}
            value={form.highlights}
            onChange={(e) => setForm({ ...form, highlights: e.target.value })}
            placeholder={"Storage and retrieval internals\nConsensus and replication explained"}
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </Field>

        {/* ── Digital edition ─────────────────────────────────────── */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={form.is_digital}
              onChange={(e) =>
                setForm({
                  ...form,
                  is_digital: e.target.checked,
                  format: e.target.checked ? "pdf" : form.format,
                })
              }
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-[13px] font-bold">Sell this as a PDF e-book</span>
              <span className="block text-[11.5px] text-muted-foreground">
                Upload the full book. Buyers get a download link the moment the order
                is paid — or free, if you tick the box below.
              </span>
            </span>
          </label>

          {form.is_digital && (
            <div className="mt-3 space-y-3 border-t pt-3">
              {/* Where does the file live? Most sellers already have it in
                  Drive — forcing a 40 MB upload would only empty their patience. */}
              <div className="flex rounded-xl border bg-card p-1">
                {([
                  ["link", "Paste a link", "Google Drive / Dropbox / your site"],
                  ["upload", "Upload a PDF", "Cronyzo hosts the file"],
                ] as const).map(([key, title, hint]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, file_mode: key })}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-left transition-colors",
                      form.file_mode === key
                        ? "bg-primary text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block text-[12.5px] font-bold">{title}</span>
                    <span
                      className={cn(
                        "block text-[10.5px]",
                        form.file_mode === key ? "text-white/80" : "text-muted-foreground",
                      )}
                    >
                      {hint}
                    </span>
                  </button>
                ))}
              </div>

              {form.file_mode === "link" ? (
                <div className="space-y-2.5">
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Book file link *
                    </p>
                    <input
                      value={form.file_url}
                      onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                      placeholder="https://drive.google.com/file/d/…/view?usp=sharing"
                      className={inputCls}
                    />
                    <p className="mt-1 text-[10.5px] text-muted-foreground">
                      Google Drive: right-click the PDF → <b>Share → Anyone with the
                      link</b>. Then paste the link here — we convert it to a direct
                      download automatically. Buyers only receive it after payment
                      (or instantly, if you tick “Free to download”).
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Free sample link (optional)
                    </p>
                    <input
                      value={form.preview_url}
                      onChange={(e) => setForm({ ...form, preview_url: e.target.value })}
                      placeholder="https://drive.google.com/file/d/…/view?usp=sharing"
                      className={inputCls}
                    />
                  </div>
                  <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-[10.5px] text-muted-foreground">
                    Nothing is uploaded — your database stays light and the file
                    stays in your own Drive.
                  </p>
                </div>
              ) : (
                <>
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Full book PDF
                </p>
                <input
                  ref={pdfRef}
                  type="file"
                  accept="application/pdf"
                  className="block w-full text-[11.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-[11.5px] file:font-bold file:text-primary"
                />
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Free sample PDF (optional)
                </p>
                <input
                  ref={sampleRef}
                  type="file"
                  accept="application/pdf"
                  className="block w-full text-[11.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-[11.5px] file:font-bold"
                />
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  A watermarked extract anyone can read before buying. This is the
                  best-converting thing on a book page.
                </p>
              </div>
                </>
              )}

              <label className="flex items-center gap-2 text-[12px] font-semibold">
                <input
                  type="checkbox"
                  checked={form.is_free_download}
                  onChange={(e) =>
                    setForm({ ...form, is_free_download: e.target.checked })
                  }
                  className="h-3.5 w-3.5"
                />
                Free to download — anybody can take the PDF, no purchase needed
              </label>

              {form.is_free_download && (
                <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  This title will publish at ₹0 and appear under “Free e-books”.
                </p>
              )}
            </div>
          )}
        </div>

        {uploadError && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            {uploadError}
          </p>
        )}

        {create.isError && (
          <p className="text-sm font-medium text-destructive">
            {(create.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/sell/dashboard" })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {create.isPending ? "Publishing…" : "List book"}
          </Button>
        </div>
      </form>
    </StudioShell>
  );
}

/* Publishing screens are wrapped so nobody fills a form they cannot submit. */
export function CreateProductPage() {
  return (
    <ShopkeeperGate>
      <CreateProductPageInner />
    </ShopkeeperGate>
  );
}

/* Courses are a teacher capability, not shop inventory — no shopkeeper gate. */
export function CreateCoursePage() {
  return <CreateCoursePageInner />;
}

export function CreateBookPage() {
  return (
    <ShopkeeperGate>
      <CreateBookPageInner />
    </ShopkeeperGate>
  );
}
