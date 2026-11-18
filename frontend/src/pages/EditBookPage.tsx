/**
 * EditBookPage — poora edit, not a quick-fix dialog.
 *
 * Everything a listing was created with can be changed here: title, author,
 * publisher, ISBN, edition, category, language, pages, format, price, MRP,
 * stock, cover photo, description, highlights, and the digital edition
 * (full PDF + free sample, as a link or an upload, plus "free to download").
 *
 * The only things that cannot be edited are the ones that are not the seller's
 * to edit: the slug (links people already shared must not break) and the
 * seller/owner.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ImagePicker";
import { booksApi } from "@/lib/commerce";
import { cn } from "@/lib/utils";

const inputCls =
  "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary/50";

const FORMATS = [
  { value: "paperback", label: "Paperback" },
  { value: "hardcover", label: "Hardcover" },
  { value: "ebook", label: "E-book" },
  { value: "pdf", label: "PDF" },
];

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
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </label>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-[14px] font-bold leading-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

type Form = {
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  edition: string;
  category: string;
  language: string;
  pages: string;
  format: string;
  price: string;
  mrp: string;
  stock: string;
  cover_url: string;
  description: string;
  highlights: string;
  is_digital: boolean;
  file_mode: "link" | "upload";
  file_url: string;
  preview_mode: "link" | "upload";
  preview_url: string;
  is_free_download: boolean;
};

const EMPTY: Form = {
  title: "",
  author: "",
  publisher: "",
  isbn: "",
  edition: "",
  category: "General",
  language: "Hindi",
  pages: "",
  format: "paperback",
  price: "",
  mrp: "",
  stock: "",
  cover_url: "",
  description: "",
  highlights: "",
  is_digital: false,
  file_mode: "upload",
  file_url: "",
  preview_mode: "upload",
  preview_url: "",
  is_free_download: false,
};

export function EditBookPage() {
  const { slug } = useParams({ from: "/app/sell/books/$slug/edit" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["book", "edit", slug],
    queryFn: () => booksApi.get(slug),
    staleTime: 0,
  });
  const book: any = detail.data;
  const bookId: number | undefined = book?.id;

  const [form, setForm] = useState<Form>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const pdfRef = useRef<HTMLInputElement | null>(null);
  const sampleRef = useRef<HTMLInputElement | null>(null);
  const [pdfPicked, setPdfPicked] = useState<string | null>(null);
  const [samplePicked, setSamplePicked] = useState<string | null>(null);

  const currentPdf = useMemo(
    () => ({ has: Boolean(book?.has_pdf), name: book?.pdf_name as string | undefined, size: Number(book?.pdf_size_bytes || 0) }),
    [book],
  );
  const currentSample = useMemo(
    () => ({ has: Boolean(book?.has_preview), hosted: Boolean(book?.preview_hosted), link: book?.preview_pdf_url as string | undefined }),
    [book],
  );

  useEffect(() => {
    if (!book) return;
    setForm({
      title: book.title ?? "",
      author: book.author ?? "",
      publisher: book.publisher ?? "",
      isbn: book.isbn ?? "",
      edition: book.edition ?? "",
      category: book.category ?? "General",
      language: book.language ?? "Hindi",
      pages: book.pages ? String(book.pages) : "",
      format: (book.format ?? "paperback").toLowerCase(),
      price: String(Number(book.price ?? 0)),
      mrp: String(Number(book.mrp ?? book.price ?? 0)),
      stock: book.stock !== undefined ? String(book.stock) : "",
      cover_url: book.cover_url ?? "",
      description: book.description ?? "",
      highlights: Array.isArray(book.highlights) ? book.highlights.join("\n") : (book.highlights ?? ""),
      is_digital: Boolean(book.has_pdf) || ["ebook", "pdf"].includes((book.format ?? "").toLowerCase()),
      file_mode: "upload",
      file_url: "",
      preview_mode: "upload",
      preview_url: "",
      is_free_download: Boolean(book.is_free_download),
    });
    setReady(true);
  }, [book]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bookId) return;
    setError(null);
    setSaved(null);
    if (!form.title.trim()) {
      setError("Title khaali nahi ho sakta.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim(),
        isbn: form.isbn.trim(),
        edition: form.edition.trim(),
        category: form.category.trim() || "General",
        language: form.language.trim() || "Hindi",
        pages: Number(form.pages || 0),
        format: form.format,
        price: Number(form.price || 0),
        mrp: Number(form.mrp || form.price || 0),
        stock: Number(form.stock || 0),
        cover_url: form.cover_url.trim(),
        description: form.description,
        highlights: form.highlights,
        is_free_download: form.is_free_download,
        preview_pages: Number(book?.preview_pages || 0),
      };
      // A pasted link only travels when the seller actually chose "link".
      if (form.is_digital && form.file_mode === "link" && form.file_url.trim()) {
        payload.file_url = form.file_url.trim();
      }
      if (form.is_digital && form.preview_mode === "link" && form.preview_url.trim()) {
        payload.preview_url = form.preview_url.trim();
      }
      await booksApi.update(bookId, payload);

      if (form.is_digital) {
        const pdf = pdfRef.current?.files?.[0];
        if (pdf) {
          await booksApi.uploadPdf(bookId, pdf, {
            isFreeDownload: form.is_free_download,
            price: form.is_free_download ? 0 : Number(form.price || 0),
          });
        }
        const sample = sampleRef.current?.files?.[0];
        if (sample) await booksApi.uploadPreviewPdf(bookId, sample);
      }

      await queryClient.invalidateQueries({ queryKey: ["book", "edit", slug] });
      await queryClient.invalidateQueries({ queryKey: ["book", "detail"] });
      await queryClient.invalidateQueries({ queryKey: ["creator", "books"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      setPdfPicked(null);
      setSamplePicked(null);
      if (pdfRef.current) pdfRef.current.value = "";
      if (sampleRef.current) sampleRef.current.value = "";
      set("file_url", "");
      set("preview_url", "");
      setSaved("Book update ho gayi — library me turant nayi details dikhegi.");
    } catch (err: any) {
      setError(err?.message || "Save nahi ho paya — dobara try karo.");
    } finally {
      setSaving(false);
    }
  };

  const removePdf = async () => {
    if (!bookId) return;
    if (!window.confirm("Is book ka PDF hata dein? Listing rahegi, sirf file hat jayegi.")) return;
    setSaving(true);
    setError(null);
    try {
      await booksApi.update(bookId, { file_url: "" });
      await queryClient.invalidateQueries({ queryKey: ["book", "edit", slug] });
      setSaved("PDF hata diya.");
    } catch (err: any) {
      setError(err?.message || "PDF nahi hata paya.");
    } finally {
      setSaving(false);
    }
  };

  if (detail.isLoading || !ready) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-20 text-[13px] font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Book load ho rahi hai…
      </div>
    );
  }

  if (detail.isError || !book) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
        <p className="mt-2 text-[14px] font-bold">Book nahi mili</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Ho sakta hai ye listing delete ho gayi ho.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/sell/books">My books par wapas</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <Link
        to="/sell/books"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> My books
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Edit book</h1>
          <p className="mt-1 truncated text-[12px] text-muted-foreground">
            {book.title} · /books/{book.slug}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/books/$slug" params={{ slug: book.slug }}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Dekho
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <Section icon={BookOpen} title="Book details" subtitle="Jo library card aur book page par dikhta hai.">
          <div className="space-y-3">
            <Field label="Title">
              <input
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputCls}
                placeholder="Designing Data-Intensive Applications"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Author">
                <input value={form.author} onChange={(e) => set("author", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Publisher">
                <input value={form.publisher} onChange={(e) => set("publisher", e.target.value)} className={inputCls} />
              </Field>
              <Field label="ISBN">
                <input value={form.isbn} onChange={(e) => set("isbn", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Edition">
                <input
                  value={form.edition}
                  onChange={(e) => set("edition", e.target.value)}
                  placeholder="2nd Edition"
                  className={inputCls}
                />
              </Field>
              <Field label="Category">
                <input
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className={inputCls}
                  placeholder="Programming / SSC / Fiction"
                />
              </Field>
              <Field label="Language">
                <select
                  value={form.language}
                  onChange={(e) => set("language", e.target.value)}
                  className={inputCls}
                >
                  {["Hindi", "English", "Hinglish", "Urdu", "Bengali", "Marathi", "Tamil", "Telugu"].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pages">
                <input
                  type="number"
                  min={0}
                  value={form.pages}
                  onChange={(e) => set("pages", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section icon={FileText} title="Format, price & stock" subtitle="Format aur paisa — dono yahin badlo.">
          <div className="space-y-3">
            <Field label="Format">
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => set("format", f.value)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                      form.format === f.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Price (₹)">
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="MRP (₹)">
                <input
                  type="number"
                  min={0}
                  value={form.mrp}
                  onChange={(e) => set("mrp", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Stock">
                <input
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) => set("stock", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section icon={BookOpen} title="Book cover photo" subtitle="Portrait 3:4 sabse accha lagta hai — device se upload ya link paste karo.">
          <ImagePicker
            label="Cover"
            shape="cover"
            value={form.cover_url}
            onChange={(url) => set("cover_url", url)}
            hint="Yeh wahi photo hai jo library grid me dikhti hai."
          />
        </Section>

        <Section icon={FileText} title="Description & highlights" subtitle="Highlights ek line me ek — book page par bullet list ban jaata hai.">
          <div className="space-y-3">
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                className="w-full rounded-lg border bg-card p-3 text-sm outline-none focus:border-primary/50"
                placeholder="Ye book kis ke liye hai, kya sikhaati hai…"
              />
            </Field>
            <Field label="Highlights">
              <textarea
                value={form.highlights}
                onChange={(e) => set("highlights", e.target.value)}
                rows={4}
                className="w-full rounded-lg border bg-card p-3 text-sm outline-none focus:border-primary/50"
                placeholder={"25 solved papers\nChapter-wise theory\nFree sample PDF"}
              />
            </Field>
          </div>
        </Section>

        <Section
          icon={FileText}
          title="Digital edition (PDF)"
          subtitle="Buyer ko paid hone par download link milta hai — ya free, agar neeche tick kiya ho."
        >
          <label className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.is_digital}
              onChange={(e) => set("is_digital", e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-[13px] font-semibold">Sell this as a PDF e-book</span>
          </label>

          {form.is_digital && (
            <div className="mt-3 space-y-4">
              <div className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-bold">Full book PDF</p>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {currentPdf.has
                      ? `${currentPdf.name || "PDF attached"}${currentPdf.size ? ` · ${Math.round(currentPdf.size / 1024)} KB` : ""}`
                      : "abhi koi PDF nahi"}
                  </span>
                </div>

                <div className="mt-2 flex gap-2">
                  {(["link", "upload"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => set("file_mode", mode)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold",
                        form.file_mode === mode
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {mode === "link" ? <Link2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                      {mode === "link" ? "Paste a link" : "Upload a PDF"}
                    </button>
                  ))}
                </div>

                {form.file_mode === "link" ? (
                  <div className="mt-2">
                    <input
                      value={form.file_url}
                      onChange={(e) => set("file_url", e.target.value)}
                      placeholder="https://drive.google.com/…"
                      className={inputCls}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Drive/Dropbox link chalega — Cronyzo use buyers ke liye gate karta hai.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <input
                      ref={pdfRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => setPdfPicked(e.target.files?.[0]?.name ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => pdfRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
                    >
                      <Upload className="h-4 w-4" />
                      {pdfPicked || (currentPdf.has ? "Naya PDF chuno (purana replace hoga)" : "PDF chuno")}
                    </button>
                  </div>
                )}

                {currentPdf.has && (
                  <button
                    type="button"
                    onClick={() => void removePdf()}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-destructive hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> PDF hatao
                  </button>
                )}
              </div>

              <div className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-bold">Free sample PDF (optional)</p>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {currentSample.has ? "sample attached" : "abhi nahi"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Watermarked extract jo koi bhi padh sakta hai — book page par sabse zyada bikri
                  isi se hoti hai.
                </p>

                <div className="mt-2 flex gap-2">
                  {(["link", "upload"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => set("preview_mode", mode)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold",
                        form.preview_mode === mode
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {mode === "link" ? <Link2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                      {mode === "link" ? "Paste a link" : "Upload a PDF"}
                    </button>
                  ))}
                </div>

                {form.preview_mode === "link" ? (
                  <input
                    value={form.preview_url}
                    onChange={(e) => set("preview_url", e.target.value)}
                    placeholder={currentSample.link || "https://… sample.pdf"}
                    className={cn(inputCls, "mt-2")}
                  />
                ) : (
                  <div className="mt-2">
                    <input
                      ref={sampleRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => setSamplePicked(e.target.files?.[0]?.name ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => sampleRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
                    >
                      <Upload className="h-4 w-4" />
                      {samplePicked || (currentSample.has ? "Naya sample chuno" : "Sample PDF chuno")}
                    </button>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.is_free_download}
                  onChange={(e) => set("is_free_download", e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-[12.5px] font-semibold leading-relaxed">
                  Free to download — koi bhi PDF le sakta hai, kharidne ki zaroorat nahi
                </span>
              </label>
            </div>
          )}
        </Section>

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] font-semibold text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {saved && (
          <p className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {saved}
          </p>
        )}

        {/* sticky save bar — always reachable on a phone */}
        <div className="sticky bottom-[76px] z-30 flex gap-2 rounded-2xl border bg-background/95 p-2.5 backdrop-blur sm:bottom-4">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Save ho raha hai…" : "Save changes"}
          </Button>
          {/* on phones the back link at the top is the way out — a second
              button here would sit under the chat bubble */}
          <Button
            type="button"
            variant="outline"
            className="hidden sm:inline-flex"
            onClick={() => navigate({ to: "/sell/books" })}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
