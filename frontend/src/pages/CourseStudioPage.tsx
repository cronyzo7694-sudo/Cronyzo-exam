/**
 * Course studio — where a teacher actually builds and runs a course.
 *
 * Everything a teacher needs, on one screen:
 *
 *   1. **Modules & lessons**  — add a module, then add lessons inside it. A
 *      lesson can be a YouTube video, an article, a downloadable PDF or a quiz.
 *   2. **Live classes**       — schedule a session with a date, a duration and a
 *      YouTube Live / Zoom / Meet link. Students only see the join link once
 *      they own the course.
 *   3. **PDF library**        — upload notes, worksheets or past papers. Mark one
 *      as a free preview so visitors can sample the teaching before paying.
 *   4. **Announcements**      — post a notice to everyone who owns the course.
 *
 * Layout is a single column of collapsible cards, so it works on a phone between
 * two classes as well as on a desktop.
 */

import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Megaphone,
  Plus,
  Radio,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import {
  teachingApi,
  type Announcement,
  type LessonFile,
  type LiveClass,
} from "@/lib/api";
import { coursesApi, type Course } from "@/lib/commerce";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50";

const CONTENT_TYPES = [
  { value: "video", label: "YouTube video" },
  { value: "article", label: "Article / text" },
  { value: "download", label: "PDF download" },
  { value: "live", label: "Live session" },
  { value: "quiz", label: "Quiz" },
];

function when(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bytes(n: number) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Collapsible card ─────────────────────────────────────────────────── */
function Panel({
  icon,
  title,
  subtitle,
  badge,
  defaultOpen,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13.5px] font-extrabold text-foreground">{title}</span>
            {badge !== undefined && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════ */

export function CourseStudioPage({ courseId }: { courseId: number }) {
  const qc = useQueryClient();

  const courseQ = useQuery({
    queryKey: ["studio", "course", courseId],
    queryFn: () => coursesApi.list({ mine: "true", per_page: 100 }),
    select: (data: any) =>
      ((data?.items ?? data?.courses ?? []) as Course[]).find(
        (c) => Number(c.id) === Number(courseId),
      ) ?? null,
  });

  const course = courseQ.data;

  if (courseQ.isLoading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-[13px] font-semibold">Course not found</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          It may belong to another teacher, or it was removed.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/sell/courses">Back to my courses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/sell/courses"
        className="text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        ← My courses
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{course.title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {course.lesson_count ?? 0} lessons · {course.duration_hours ?? 0}h ·{" "}
          <Link
            to="/courses/$slug"
            params={{ slug: course.slug }}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            view public page <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      </header>

      <div className="space-y-3">
        <CurriculumPanel course={course} onChanged={() => qc.invalidateQueries({ queryKey: ["studio"] })} />
        <LivePanel courseId={course.id} />
        <FilesPanel courseId={course.id} />
        <AnnouncementsPanel courseId={course.id} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Modules & lessons
   ═══════════════════════════════════════════════════════════ */

function CurriculumPanel({ course, onChanged }: { course: Course; onChanged: () => void }) {
  const [moduleTitle, setModuleTitle] = useState("");
  const [addingModule, setAddingModule] = useState(false);
  const [lessonFor, setLessonFor] = useState<number | null>(null);
  const [lesson, setLesson] = useState({
    title: "",
    content_type: "video",
    video_url: "",
    content: "",
    duration_minutes: 10,
    is_preview: false,
  });
  const [busy, setBusy] = useState(false);

  const modules = (course.modules ?? []) as any[];

  const addModule = async () => {
    if (!moduleTitle.trim()) return;
    setBusy(true);
    try {
      await coursesApi.addModule(course.id, { title: moduleTitle.trim() });
      setModuleTitle("");
      setAddingModule(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const addLesson = async (moduleId: number) => {
    if (!lesson.title.trim()) return;
    setBusy(true);
    try {
      await coursesApi.addLesson(course.id, moduleId, {
        ...lesson,
        title: lesson.title.trim(),
        duration_minutes: Number(lesson.duration_minutes) || 0,
      });
      setLesson({
        title: "",
        content_type: "video",
        video_url: "",
        content: "",
        duration_minutes: 10,
        is_preview: false,
      });
      setLessonFor(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      icon={<FileText className="h-4 w-4" />}
      title="Modules & lessons"
      subtitle="Structure the course — a student sees these in order"
      badge={modules.length}
      defaultOpen
    >
      <div className="space-y-3">
        {modules.length === 0 && (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[12.5px] text-muted-foreground">
            No modules yet. A course is a list of modules; each module holds lessons.
          </p>
        )}

        {modules.map((mod) => (
          <div key={mod.id} className="rounded-xl border bg-muted/20">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-[12.5px] font-bold">
                {mod.sort_order}. {mod.title}
              </p>
              <span className="text-[10.5px] font-semibold text-muted-foreground">
                {(mod.lessons ?? []).length} lessons
              </span>
            </div>

            <ul className="divide-y">
              {(mod.lessons ?? []).map((l: any) => (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-primary">
                    {l.content_type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{l.title}</span>
                  {l.duration_minutes > 0 && (
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">
                      {l.duration_minutes}m
                    </span>
                  )}
                  {l.is_preview && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Free
                    </span>
                  )}
                </li>
              ))}
              {(mod.lessons ?? []).length === 0 && (
                <li className="px-3 py-2 text-[11.5px] text-muted-foreground">
                  No lessons in this module yet.
                </li>
              )}
            </ul>

            {lessonFor === mod.id ? (
              <div className="space-y-2 border-t bg-card p-3">
                <input
                  value={lesson.title}
                  onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                  placeholder="Lesson title"
                  className={inputCls}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    value={lesson.content_type}
                    onChange={(e) => setLesson({ ...lesson, content_type: e.target.value })}
                    className={inputCls}
                  >
                    {CONTENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={lesson.duration_minutes}
                    onChange={(e) =>
                      setLesson({ ...lesson, duration_minutes: Number(e.target.value) })
                    }
                    placeholder="Minutes"
                    className={inputCls}
                  />
                </div>
                {(lesson.content_type === "video" || lesson.content_type === "live") && (
                  <input
                    value={lesson.video_url}
                    onChange={(e) => setLesson({ ...lesson, video_url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className={inputCls}
                  />
                )}
                <textarea
                  value={lesson.content}
                  onChange={(e) => setLesson({ ...lesson, content: e.target.value })}
                  rows={3}
                  placeholder="Notes or the article body (optional)"
                  className={cn(inputCls, "resize-y")}
                />
                <label className="flex items-center gap-2 text-[12px] font-semibold">
                  <input
                    type="checkbox"
                    checked={lesson.is_preview}
                    onChange={(e) => setLesson({ ...lesson, is_preview: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                  Free preview — anyone can watch this one before buying
                </label>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void addLesson(mod.id)} disabled={busy || !lesson.title.trim()}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                    Add lesson
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLessonFor(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t px-3 py-2">
                <button
                  type="button"
                  onClick={() => setLessonFor(mod.id)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add lesson
                </button>
              </div>
            )}
          </div>
        ))}

        {addingModule ? (
          <div className="flex gap-2">
            <input
              value={moduleTitle}
              onChange={(e) => setModuleTitle(e.target.value)}
              placeholder="Module title, e.g. Getting started"
              className={inputCls}
              autoFocus
            />
            <Button size="sm" onClick={() => void addModule()} disabled={busy || !moduleTitle.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingModule(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAddingModule(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add module
          </Button>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════
   Live classes
   ═══════════════════════════════════════════════════════════ */

function LivePanel({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["studio", "live", courseId],
    queryFn: () => teachingApi.listLiveClasses(courseId),
  });

  const [form, setForm] = useState({
    title: "",
    provider: "youtube",
    join_url: "",
    starts_at: "",
    duration_minutes: 60,
    is_free: false,
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classes: LiveClass[] = data?.live_classes ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["studio", "live"] });

  const schedule = async () => {
    if (!form.title.trim() || !form.starts_at) {
      setError("A title and a start time are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teachingApi.createLiveClass(courseId, {
        ...form,
        provider: form.provider as LiveClass["provider"],
        starts_at: new Date(form.starts_at).toISOString(),
        duration_minutes: Number(form.duration_minutes) || 60,
      });
      setForm({ ...form, title: "", join_url: "", starts_at: "", description: "" });
      refresh();
    } catch (e: any) {
      setError(e?.message || "Could not schedule the class");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      icon={<Radio className="h-4 w-4" />}
      title="Live classes"
      subtitle="Go live on YouTube — students get the join link when it starts"
      badge={classes.length}
    >
      <div className="space-y-3">
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Class title, e.g. Doubt session on hooks"
              className={cn(inputCls, "sm:col-span-2")}
            />
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className={inputCls}
            >
              <option value="youtube">YouTube Live</option>
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
              <option value="internal">Cronyzo room</option>
              <option value="other">Other link</option>
            </select>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className={inputCls}
            />
            <input
              value={form.join_url}
              onChange={(e) => setForm({ ...form, join_url: e.target.value })}
              placeholder="https://youtube.com/live/… (students only)"
              className={cn(inputCls, "sm:col-span-2")}
            />
            <input
              type="number"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              placeholder="Minutes"
              className={inputCls}
            />
            <label className="flex items-center gap-2 text-[11.5px] font-semibold">
              <input
                type="checkbox"
                checked={form.is_free}
                onChange={(e) => setForm({ ...form, is_free: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              Open to everyone (no purchase needed)
            </label>
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          <Button size="sm" className="mt-2" onClick={() => void schedule()} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="mr-1.5 h-3.5 w-3.5" />}
            Schedule class
          </Button>
        </div>

        {isLoading ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" />
        ) : classes.length === 0 ? (
          <p className="text-center text-[11.5px] text-muted-foreground">
            No classes scheduled yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {classes.map((c) => (
              <li key={c.id} className="flex items-start gap-2 rounded-xl border px-3 py-2.5">
                <Youtube className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {when(c.starts_at)} · {c.duration_minutes}m ·{" "}
                    <span
                      className={cn(
                        "font-bold",
                        c.status === "live"
                          ? "text-red-600"
                          : c.status === "ended"
                            ? "text-muted-foreground"
                            : "text-primary",
                      )}
                    >
                      {c.status}
                    </span>
                    {c.is_free && " · free"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Remove "${c.title}"?`)) return;
                    await teachingApi.deleteLiveClass(c.id);
                    refresh();
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:text-red-600"
                  aria-label="Remove class"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════
   PDF library
   ═══════════════════════════════════════════════════════════ */

function FilesPanel({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["studio", "files", courseId],
    queryFn: () => teachingApi.courseFiles(courseId),
  });

  const [title, setTitle] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const files: LessonFile[] = data?.files ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["studio", "files"] });

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a PDF first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const up = await teachingApi.upload(file, "pdf");
      await teachingApi.addCourseFile(courseId, {
        title: title.trim() || up.file.file_name,
        file_url: up.file.url,
        file_name: up.file.file_name,
        size_bytes: up.file.size_bytes,
        is_preview: isPreview,
      });
      setTitle("");
      setIsPreview(false);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      icon={<Upload className="h-4 w-4" />}
      title="PDF library"
      subtitle="Notes, worksheets and past papers students can download"
      badge={files.length}
    >
      <div className="space-y-3">
        <div className="rounded-xl border bg-muted/20 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Week 3 notes"
            className={inputCls}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="mt-2 block w-full text-[11.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-[11.5px] file:font-bold file:text-primary"
          />
          <label className="mt-2 flex items-center gap-2 text-[11.5px] font-semibold">
            <input
              type="checkbox"
              checked={isPreview}
              onChange={(e) => setIsPreview(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Free preview — visitors can download this before buying
          </label>
          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
          <Button size="sm" className="mt-2" onClick={() => void upload()} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Upload PDF
          </Button>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            Up to 50 MB. Stored locally today; set the Cloudinary env vars to move
            storage without touching the app.
          </p>
        </div>

        {isLoading ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" />
        ) : files.length === 0 ? (
          <p className="text-center text-[11.5px] text-muted-foreground">No PDFs yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-xl border px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold">{f.title}</p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {bytes(f.size_bytes)} · {f.download_count} downloads
                    {f.is_preview && " · free preview"}
                  </p>
                </div>
                <a
                  href={f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1 text-muted-foreground hover:text-primary"
                  aria-label="Open PDF"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Remove "${f.title}"?`)) return;
                    await teachingApi.deleteCourseFile(f.id);
                    refresh();
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:text-red-600"
                  aria-label="Remove PDF"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════
   Announcements
   ═══════════════════════════════════════════════════════════ */

function AnnouncementsPanel({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["studio", "announcements", courseId],
    queryFn: () => teachingApi.courseAnnouncements(courseId),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const rows: Announcement[] = data?.announcements ?? [];

  const post = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await teachingApi.postAnnouncement(courseId, { title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["studio", "announcements"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      icon={<Megaphone className="h-4 w-4" />}
      title="Announcements"
      subtitle="A notice everyone who owns this course will see"
      badge={rows.length}
    >
      <div className="space-y-3">
        <div className="rounded-xl border bg-muted/20 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Class moved to 8pm"
            className={inputCls}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="What do students need to know?"
            className={cn(inputCls, "mt-2 resize-y")}
          />
          <Button
            size="sm"
            className="mt-2"
            onClick={() => void post()}
            disabled={busy || !title.trim() || !body.trim()}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Megaphone className="mr-1.5 h-3.5 w-3.5" />}
            Post announcement
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-center text-[11.5px] text-muted-foreground">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => (
              <li key={a.id} className="rounded-xl border px-3 py-2.5">
                <p className="text-[12.5px] font-bold">{a.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted-foreground">
                  {a.body}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">{when(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
