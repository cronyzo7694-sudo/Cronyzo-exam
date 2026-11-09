/**
 * Search results page — the full version of what the palette shows.
 *
 * Shown when someone presses Enter or "Saare results". Every section of the
 * site appears here together (exams, tests, books, courses, shop, stores,
 * study topics, pages) with counts, so nothing is hidden behind a guess about
 * which tab the item lives in.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Package,
  Search as SearchIcon,
  Store as StoreIcon,
  X,
  Zap,
} from "lucide-react";
import { searchApi, type SearchHit } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const META: Record<string, { label: string; icon: typeof Zap; tone: string }> = {
  exams: { label: "Exams", icon: Layers, tone: "text-indigo-600 bg-indigo-500/10" },
  tests: { label: "Tests", icon: Zap, tone: "text-amber-600 bg-amber-500/10" },
  topics: { label: "Subjects & chapters", icon: BookOpen, tone: "text-rose-600 bg-rose-500/10" },
  books: { label: "Books", icon: BookOpen, tone: "text-violet-600 bg-violet-500/10" },
  courses: { label: "Courses", icon: GraduationCap, tone: "text-blue-600 bg-blue-500/10" },
  products: { label: "Shop", icon: Package, tone: "text-teal-600 bg-teal-500/10" },
  stores: { label: "Stores", icon: StoreIcon, tone: "text-emerald-600 bg-emerald-500/10" },
  pages: { label: "Pages", icon: Compass, tone: "text-slate-600 bg-slate-500/10" },
};

const ORDER = ["exams", "tests", "topics", "books", "courses", "products", "stores", "pages"];

const LOCKED_TYPES = new Set(["exam", "test", "subject", "chapter"]);

/** "/exams/4?series=12" → { to: "/exams/4", search: { series: "12" } } */
function splitHitUrl(url: string): { to: string; search: Record<string, string> } {
  const [path, query = ""] = url.split("?");
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) search[key] = value;
  return { to: path || "/", search };
}


function HitRow({ hit, signedIn }: { hit: SearchHit; signedIn: boolean }) {
  return (
    <Link
      to={splitHitUrl(hit.url).to as any}
      search={splitHitUrl(hit.url).search as any}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      {hit.image ? (
        <img src={hit.image} alt="" className="h-11 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold">{hit.title}</span>
          {hit.series_no ? (
            <span className="shrink-0 rounded bg-foreground px-1 py-0.5 text-[9.5px] font-bold uppercase text-background">
              #{hit.series_no}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {hit.subtitle || ""}
          {hit.questions ? ` · ${hit.questions} Q` : ""}
          {hit.minutes ? ` · ${hit.minutes} min` : ""}
        </span>
      </span>
      {hit.meta && (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground">
          {hit.meta}
        </span>
      )}
      {!signedIn && LOCKED_TYPES.has(hit.type) && (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-label="Sign in to open" />
      )}
    </Link>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const { q } = useSearch({ from: "/public/search" }) as { q?: string };
  const [term, setTerm] = useState(q || "");
  const [type, setType] = useState<string>("all");
  const signedIn = Boolean(useAuthStore((state) => state.user));

  useEffect(() => setTerm(q || ""), [q]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search-page", q, type],
    queryFn: () => searchApi.query(q || "", 20),
    enabled: Boolean(q && q.trim().length >= 2),
  });

  const groups = data?.groups ?? {};
  const total = data?.total ?? 0;
  const visibleGroups = ORDER.filter((key) => (groups[key]?.length ?? 0) > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <button
        onClick={() => navigate({ to: "/exams" })}
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <h1 className="text-[20px] font-extrabold tracking-tight sm:text-2xl">
        Search results
      </h1>

      <form
        className="relative mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ to: "/search", search: { q: term.trim() } as any });
        }}
      >
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Exam, test, book, course, topic… kuch bhi dhundo"
          className="h-11 w-full rounded-xl border bg-muted/40 pl-9 pr-24 text-[13.5px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground"
          >
            Search
          </button>
        </div>
      </form>

      {q && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          <b className="text-foreground">{total}</b> result{total === 1 ? "" : "s"} for{" "}
          <b className="text-foreground">“{data?.corrected || q}”</b>
          {data?.corrected && (
            <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              spelling theek ki: “{q}” → “{data.corrected}”
            </span>
          )}
        </p>
      )}

      {/* Type chips */}
      {total > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setType("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition",
              type === "all" ? "bg-foreground text-background" : "border text-muted-foreground",
            )}
          >
            All {total}
          </button>
          {visibleGroups.map((key) => (
            <button
              key={key}
              onClick={() => setType(key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition",
                type === key ? "bg-foreground text-background" : "border text-muted-foreground",
              )}
            >
              {META[key]?.label ?? key} {groups[key]?.length}
            </button>
          ))}
        </div>
      )}

      {(!q || (q || "").trim().length < 2) && (
        <div className="mt-6 rounded-2xl border border-dashed bg-card px-5 py-12 text-center">
          <p className="text-[13.5px] font-bold">Kuch likho</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Kam se kam 2 akshar — exam, test ka naam ya series number.
          </p>
        </div>
      )}

      {isLoading && q && (
        <div className="mt-6 space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && q && total === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card px-5 py-12 text-center">
          <p className="text-[14px] font-bold">“{q}” se kuch nahi mila</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Ye try karo:</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {(data?.suggestions?.length ? data.suggestions : ["physics", "english", "books"]).map(
              (item) => (
                <button
                  key={item}
                  onClick={() => navigate({ to: "/search", search: { q: item } as any })}
                  className="rounded-full border px-2.5 py-1 text-[12px] font-semibold hover:border-primary/50 hover:text-primary"
                >
                  {item}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {!isLoading && total > 0 && (
        <div className="mt-4 space-y-6">
          {(type === "all" ? visibleGroups : [type]).map((key) => {
            const hits = groups[key] ?? [];
            if (!hits.length) return null;
            const meta = META[key] ?? META.pages;
            const Icon = meta.icon;
            return (
              <section key={key}>
                <h2 className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", meta.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {meta.label}
                  <span className="opacity-60">{data?.counts?.[key] ?? hits.length}</span>
                </h2>
                <div className="space-y-1.5">
                  {hits.map((hit) => (
                    <HitRow key={`${hit.type}-${hit.id}-${hit.title}`} hit={hit} signedIn={signedIn} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
