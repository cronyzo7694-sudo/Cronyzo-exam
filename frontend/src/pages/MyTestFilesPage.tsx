/**
 * MyTestFilesPage — "apni HTML test file kholo".
 *
 * Students get their papers as a single HTML file (CSS + JS inside). This page
 * lets them pick that file straight from the phone (or drag it in on a laptop),
 * keeps it in the browser, and opens it full-screen with autosave — no upload,
 * no account, no server copy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  FileCode2,
  FolderOpen,
  Loader2,
  MonitorSmartphone,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  deleteTestFile,
  humanSize,
  lastFileId,
  listTestFiles,
  newFileId,
  putTestFile,
  rememberLastFile,
  type TestFileRecord,
} from "@/lib/fileVault";
import { TestFileViewer } from "@/components/testfile/TestFileViewer";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — a paper with images still fits

export function MyTestFilesPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<TestFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<TestFileRecord | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resumed, setResumed] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listTestFiles();
    setFiles(rows);
    setLoading(false);
    return rows;
  }, []);

  /* Reopen whatever was being attempted before a reload / crash. */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const rows = await refresh();
      if (!alive) return;
      const last = lastFileId();
      if (!last) return;
      const found = rows.find((row) => row.id === last);
      if (found) {
        setOpen(found);
        setResumed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const accept = useCallback(
    async (file: File | null | undefined) => {
      setError(null);
      if (!file) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith(".html") && !name.endsWith(".htm")) {
        setError("Sirf .html ya .htm file chalegi — test file HTML me honi chahiye.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`File bahut badi hai (${humanSize(file.size)}). 20 MB tak ki file chalti hai.`);
        return;
      }
      setBusy(true);
      try {
        const html = await file.text();
        const record: TestFileRecord = {
          id: newFileId(),
          name: file.name,
          size: file.size,
          html,
          added_at: Date.now(),
          opened_at: Date.now(),
        };
        await putTestFile(record);
        rememberLastFile(record.id);
        await refresh();
        setOpen(record);
        setResumed(false);
      } catch {
        setError("File phone/browser me save nahi ho payi. Thoda space khaali karke dobara try karo.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [refresh],
  );

  const openFile = useCallback(async (record: TestFileRecord) => {
    rememberLastFile(record.id);
    setOpen(record);
  }, []);

  const removeFile = useCallback(
    async (record: TestFileRecord) => {
      const ok = window.confirm(`"${record.name}" aur uska saved progress delete kar dein?`);
      if (!ok) return;
      await deleteTestFile(record.id);
      if (lastFileId() === record.id) rememberLastFile(null);
      await refresh();
    },
    [refresh],
  );

  const closeViewer = useCallback(async () => {
    setOpen(null);
    setResumed(false);
    await refresh();
  }, [refresh]);

  if (open) {
    return <TestFileViewer file={open} onClose={() => void closeViewer()} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-28 sm:px-6 sm:py-10 sm:pb-12">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileCode2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Apni test file kholo</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Teacher ya kisi bhi source se mili <b>HTML test file</b> seedha phone ya laptop se
            chuno — site ke andar hi khul jaayegi, mobile + PC dono par fit, fullscreen me bhi.
            Answers aapke browser me save hote rehte hain, reload hone par bhi nahi jaate.
          </p>
        </div>
      </div>

      {resumed && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] font-semibold text-primary">
          <Play className="h-3.5 w-3.5" />
          Pichhli baar wali test file wapas khul gayi thi — answers wahin se aage badhaao.
        </p>
      )}

      {/* picker */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(event.dataTransfer.files?.[0]);
        }}
        className={`mt-5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".html,.htm,text/html"
          className="hidden"
          onChange={(event) => void accept(event.target.files?.[0])}
        />
        <p className="text-[14px] font-bold">
          {busy ? "File padh rahe hain…" : "File chuno ya yahin drag karke chhod do"}
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          .html / .htm · 20 MB tak · CSS aur JS file ke andar hi ho to sabse best
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-[13.5px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          File select karo
        </button>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] font-semibold text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Upload nahi hoti — file sirf aapke device par rehti hai
        </p>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] font-semibold text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* saved files */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Aapki saved files
          </h2>
          <span className="text-[11.5px] font-semibold text-muted-foreground">
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        </div>

        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Dekh rahe hain…
          </p>
        ) : files.length === 0 ? (
          <div className="mt-3 rounded-2xl border bg-card px-4 py-8 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-[13px] font-bold">Abhi koi file nahi hai</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Upar se apni pehli HTML test file chuno — uske baad yahin dikhegi, ek tap me khulegi.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {files.map((record) => (
              <li
                key={record.id}
                className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FileCode2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{record.name}</span>
                  <span className="block truncate text-[11px] font-semibold text-muted-foreground">
                    {humanSize(record.size)}
                    {record.opened_at
                      ? ` · ${new Date(record.opened_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })} ko kholi thi`
                      : " · nayi file"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void openFile(record)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="h-3.5 w-3.5" />
                  Kholo
                </button>
                <button
                  type="button"
                  onClick={() => void removeFile(record)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`${record.name} delete karo`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* how it behaves */}
      <div className="mt-7 grid gap-2 sm:grid-cols-3">
        {[
          { icon: MonitorSmartphone, title: "Mobile + PC", text: "Dono par responsive, rotate karo to bhi fit." },
          { icon: ShieldCheck, title: "Data safe", text: "Answers browser me — reload par bhi bache." },
          { icon: ArrowRight, title: "Ek se doosri", text: "Ek test band karo, doosri turant kholo." },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-xl border bg-card px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-bold">
                <Icon className="h-3.5 w-3.5 text-primary" />
                {item.title}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {item.text}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[11.5px] text-muted-foreground">
        Cronyzo ke apne mock tests chahiye?{" "}
        <Link to="/exams" className="font-bold text-primary hover:underline">
          Exams section kholo
        </Link>
        .
      </p>
    </div>
  );
}
