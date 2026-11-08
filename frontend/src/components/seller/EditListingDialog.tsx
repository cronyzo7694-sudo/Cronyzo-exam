/**
 * Edit a listing after it is published.
 *
 * Delete has always been there; editing was missing, which meant fixing a typo
 * in a price required deleting the book and listing it again — losing its
 * reviews and orders. This dialog edits the fields that actually change day to
 * day: title, price, MRP, stock, description and the cover photo.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { booksApi, shopApi } from "@/lib/commerce";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ImagePicker";

type Props = {
  kind: "books" | "products";
  id: number;
  slug: string;
  onClose: () => void;
};

const inputCls =
  "h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none transition-colors focus:border-primary/60";

export function EditListingDialog({ kind, id, slug, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    price: "",
    mrp: "",
    stock: "",
    description: "",
    cover: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const detail = useQuery<any>({
    queryKey: ["edit-listing", kind, slug],
    queryFn: async () =>
      kind === "books" ? await booksApi.get(slug) : await shopApi.product(slug),
  });

  useEffect(() => {
    const item: any = detail.data;
    if (!item) return;
    setForm({
      title: item.title || "",
      price: String(item.price ?? ""),
      mrp: String(item.mrp ?? item.price ?? ""),
      stock: String(item.stock ?? ""),
      description: item.description || "",
      cover: item.cover_url || item.image_url || "",
    });
  }, [detail.data]);

  const save = useMutation<any, any, void>({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        price: Number(form.price || 0),
        mrp: Number(form.mrp || form.price || 0),
        stock: Number(form.stock || 0),
        description: form.description,
      };
      if (form.cover) {
        // Books use cover_url, products use image_url — send both, the API
        // ignores the one it does not know.
        payload.cover_url = form.cover;
        payload.image_url = form.cover;
      }
      return kind === "books" ? booksApi.update(id, payload) : shopApi.updateProduct(id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-catalogue"] });
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["shop-products"] });
      qc.invalidateQueries({ queryKey: ["book", "detail"] });
      onClose();
    },
    onError: (err: any) => setMsg(err?.message || "Could not save the changes"),
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-bold">
            Edit {kind === "books" ? "book" : "product"}
          </p>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {detail.isLoading ? (
          <p className="py-8 text-center text-[12.5px] text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <form
            className="space-y-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              setMsg(null);
              save.mutate();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Title
              </span>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputCls}
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Price ₹
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  MRP ₹
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.mrp}
                  onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Stock
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={inputCls}
                />
              </label>
            </div>

            <ImagePicker
              label={kind === "books" ? "Cover photo" : "Product photo"}
              shape={kind === "books" ? "cover" : "photo"}
              value={form.cover}
              onChange={(url) => setForm({ ...form, cover: url })}
            />

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Description
              </span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60"
              />
            </label>

            {msg && <p className="text-[12px] font-semibold text-destructive">{msg}</p>}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending} className="rounded-xl">
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
