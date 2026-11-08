import { useRef, useState } from "react";
import { uploadsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   ImagePicker — one control for every picture in the product
   ---------------------------------------------------------------
   Two ways to add an image, because the two places we ship to
   behave differently:

     • **Upload**  — phone: opens the camera roll / camera directly.
                     desktop: normal file dialog. The server resizes
                     it, so there is nothing to think about.
     • **Link**    — paste a Google Drive / Imgur / Cloudinary URL.

   Whichever route is used, the stored value is a plain URL, which is
   what every card and detail page in the app already renders.
   ═══════════════════════════════════════════════════════════ */

type Props = {
  value: string;
  onChange: (url: string) => void;
  /** "cover" = tall 3:4 book cover, "photo" = 16:10 product shot, "avatar" = round */
  shape?: "cover" | "photo" | "avatar";
  label?: string;
  hint?: string;
  className?: string;
};

const SHAPES: Record<NonNullable<Props["shape"]>, { box: string; img: string }> = {
  cover: { box: "h-32 w-24", img: "h-32 w-24 rounded-lg object-cover" },
  photo: { box: "h-24 w-40", img: "h-24 w-40 rounded-lg object-cover" },
  avatar: { box: "h-24 w-24", img: "h-24 w-24 rounded-full object-cover" },
};

export function ImagePicker({
  value,
  onChange,
  shape = "cover",
  label = "Photo",
  hint,
  className,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = SHAPES[shape];
  const looksLikeUrl = /^(https?:\/\/|\/)/i.test(value.trim());

  const pick = () => fileRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const res = await uploadsApi.image(file);
      onChange(res.url);
    } catch (err) {
      setError((err as Error)?.message || "Upload failed — try a smaller photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-[11px] font-semibold">
          {(["upload", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "upload" ? "Upload photo" : "Paste a link"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3">
        {/* Live preview — the point of this control. What you see is exactly
            what the buyer sees on the card. */}
        <button
          type="button"
          onClick={pick}
          className={cn(
            "group relative shrink-0 overflow-hidden border-2 border-dashed bg-muted/40 transition-colors hover:border-primary/50",
            s.box,
            shape === "avatar" ? "rounded-full" : "rounded-lg",
          )}
          title="Choose a photo"
        >
          {looksLikeUrl ? (
            <img src={value} alt="" className={s.img} />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span className="px-1 text-center text-[10px] font-semibold leading-tight">
                {busy ? "Uploading…" : "Add photo"}
              </span>
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-[10px] font-bold">
              Uploading…
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          {mode === "upload" ? (
            <>
              <button
                type="button"
                onClick={pick}
                disabled={busy}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:border-primary/50 disabled:opacity-60"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <path d="M17 8l-5-5-5 5M12 3v12" />
                </svg>
                {busy ? "Uploading…" : value ? "Change photo" : "Choose from device"}
              </button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {hint ||
                  "On a phone this opens your gallery/camera. Any JPG, PNG or WEBP up to 8 MB — it is resized automatically."}
              </p>
            </>
          ) : (
            <>
              <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://…"
                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary/50"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                {hint || "Paste any public image link (Drive, Imgur, Cloudinary…)."}
              </p>
            </>
          )}

          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[11px] font-semibold text-destructive hover:underline"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      {looksLikeUrl && (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" />
          </svg>
          Photo attached — buyers will see this
        </p>
      )}
      {error && <p className="text-[11.5px] font-semibold text-destructive">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}
