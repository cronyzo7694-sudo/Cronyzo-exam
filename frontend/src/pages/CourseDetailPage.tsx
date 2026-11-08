/**
 * Course detail — the purchase page for a single course.
 */

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
  Infinity as InfinityIcon,
  Lock,
  PlayCircle,
  ShoppingCart,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useState } from "react";
import { coursesApi } from "@/lib/commerce";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Price, Rating } from "@/components/commerce/Primitives";
import { CourseCard } from "@/components/commerce/Cards";
import { cn } from "@/lib/utils";

export function CourseDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [openModules, setOpenModules] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: course, isLoading, error } = useQuery({
    queryKey: ["course", slug],
    queryFn: () => coursesApi.get(slug),
  });

  const { data: related } = useQuery({
    queryKey: ["course", "related", course?.category],
    queryFn: () =>
      coursesApi.list({ category: course?.category, sort: "popular", per_page: 4 }),
    enabled: Boolean(course?.category),
  });

  const enroll = useMutation({
    mutationFn: (courseId: number) => coursesApi.enroll(courseId),
    onSuccess: () => {
      setNotice("You are enrolled! Open My Learning to start.");
      void queryClient.invalidateQueries({ queryKey: ["course", slug] });
      void queryClient.invalidateQueries({ queryKey: ["my-courses"] });
    },
    onError: (e: Error) => setNotice(e.message),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="animate-shimmer h-8 w-48 rounded" />
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="animate-shimmer h-64 w-full rounded-2xl" />
            <div className="animate-shimmer h-10 w-3/4 rounded" />
            <div className="animate-shimmer h-24 w-full rounded" />
          </div>
          <div className="animate-shimmer h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">Course not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This course may have been unpublished by its teacher.
        </p>
        <Button asChild className="mt-6">
          <Link to="/courses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to courses
          </Link>
        </Button>
      </div>
    );
  }

  const totalLessons =
    course.modules?.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0) ??
    course.lesson_count;
  const totalMinutes =
    course.modules?.reduce(
      (sum, m) =>
        sum +
        (m.lessons?.reduce(
          (inner, l) => inner + (l.duration_minutes ?? 0),
          0,
        ) ?? 0),
      0,
    ) ?? 0;

  const handleEnroll = () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (course.is_free) {
      enroll.mutate(course.id);
    } else {
      navigate({
        to: "/checkout",
        search: { type: "course", id: String(course.id) },
      });
    }
  };

  const toggleModule = (id: number) =>
    setOpenModules((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span>/</span>
          <Link to="/courses" className="hover:text-primary">
            Courses
          </Link>
          <span>/</span>
          <Link to="/courses" search={{ category: course.category }} className="hover:text-primary">
            {course.category}
          </Link>
          <span>/</span>
          <span className="truncate font-medium text-foreground">{course.title}</span>
        </nav>

        {notice && (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}

        <div className="mt-6 grid gap-10 lg:grid-cols-[1.45fr_1fr]">
          {/* ── Main column ─────────────────────────────────────── */}
          <div className="min-w-0">
            {/* Media */}
            <div className="relative aspect-video overflow-hidden rounded-2xl border bg-muted">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-violet-600">
                  <PlayCircle className="h-16 w-16 text-white/70" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {course.category}
                </span>
                <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold capitalize text-white backdrop-blur-sm">
                  {course.level}
                </span>
                <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {course.language}
                </span>
              </div>
            </div>

            {/* Title block */}
            <div className="mt-7">
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                {course.title}
              </h1>
              {course.subtitle && (
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {course.subtitle}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                {course.rating_count > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex items-center gap-0.5 rounded-md bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950">
                      <Star className="h-3 w-3 fill-current" />
                      {course.rating_avg.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground">
                      {course.rating_count} ratings
                    </span>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {course.student_count} learners
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {course.duration_hours} hours
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <BookOpen className="h-4 w-4" />
                  {totalLessons} lessons
                </span>
              </div>

              {/* Teacher */}
              {course.teacher && (
                <div className="mt-6 flex items-center gap-3.5 rounded-2xl border bg-card p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
                    {course.teacher.avatar_url ? (
                      <img
                        src={course.teacher.avatar_url}
                        alt={course.teacher.full_name ?? ""}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (course.teacher.full_name?.[0] ?? "T").toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">
                        {course.teacher.full_name}
                      </span>
                      <BadgeCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Course instructor
                    </div>
                  </div>
                  {course.teacher.id && (
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link to="/seller/$sellerId" params={{ sellerId: String(course.teacher.id) }}>
                        View profile
                      </Link>
                    </Button>
                  )}
                </div>
              )}

              {/* Description */}
              {course.description && (
                <section className="mt-8">
                  <h2 className="text-lg font-bold text-foreground">What you will learn</h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {course.description}
                  </p>
                </section>
              )}

              {/* Syllabus */}
              <section className="mt-9">
                <h2 className="text-lg font-bold text-foreground">
                  Course content
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    {course.modules?.length ?? 0} modules · {totalLessons} lessons
                  </span>
                </h2>

                <div className="mt-4 space-y-2.5">
                  {(course.modules ?? []).map((mod) => {
                    const open = openModules.includes(mod.id);
                    const previewCount = mod.lessons?.filter((l) => l.is_preview).length ?? 0;
                    return (
                      <div key={mod.id} className="overflow-hidden rounded-xl border bg-card">
                        <button
                          onClick={() => toggleModule(mod.id)}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              open && "rotate-180",
                            )}
                          />
                          <span className="flex-1 text-sm font-bold text-foreground">
                            {mod.title}
                          </span>
                          {previewCount > 0 && (
                            <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                              {previewCount} free preview
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {mod.lessons?.length ?? 0} lessons
                          </span>
                        </button>

                        {open && (
                          <div className="border-t bg-muted/20 px-2 py-2">
                            {(mod.lessons ?? []).map((lesson) => (
                              <div
                                key={lesson.id}
                                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
                              >
                                {lesson.is_locked && !lesson.accessible ? (
                                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <PlayCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
                                )}
                                <span
                                  className={cn(
                                    "flex-1 truncate",
                                    lesson.is_locked && !lesson.accessible
                                      ? "text-muted-foreground"
                                      : "text-foreground",
                                  )}
                                >
                                  {lesson.title}
                                </span>
                                {lesson.is_preview && (
                                  <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                                    Preview
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {lesson.duration_minutes}m
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Reviews */}
              <section className="mt-9">
                <h2 className="text-lg font-bold text-foreground">
                  Learner reviews
                  {course.rating_count > 0 && (
                    <span className="ml-2 text-sm font-medium text-muted-foreground">
                      {course.rating_count} reviews
                    </span>
                  )}
                </h2>

                {(course.reviews ?? []).length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground">
                    No reviews yet — be the first once you finish a module.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {(course.reviews ?? []).map((review) => (
                      <div key={review.id} className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                            {(review.user?.full_name?.[0] ?? "L").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-foreground">
                              {review.user?.full_name ?? "Learner"}
                            </div>
                            <Rating value={review.rating} size="xs" showValue={false} />
                          </div>
                        </div>
                        {review.title && (
                          <div className="mt-3 text-sm font-bold text-foreground">
                            {review.title}
                          </div>
                        )}
                        {review.body && (
                          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            {review.body}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* ── Sticky purchase card ───────────────────────────── */}
          <aside className="lg:relative">
            <div className="sticky top-24 rounded-2xl border bg-card p-6 shadow-lg">
              <div id="buy">
                <Price
                  price={course.price}
                  mrp={course.mrp}
                  discountPercent={course.discount_percent}
                  size="lg"
                />
                {course.is_free && (
                  <div className="mt-2 text-xs font-bold text-emerald-600">
                    Free to enrol
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-2.5">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleEnroll}
                  disabled={enroll.isPending}
                >
                  {course.is_free ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Enrol for free
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Buy this course
                    </>
                  )}
                </Button>

                {course.has_free_preview && !course.enrolled && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const first = course.modules?.[0];
                      if (first) toggleModule(first.id);
                    }}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Watch free preview
                  </Button>
                )}

                {course.enrolled && (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/my-courses">Go to my learning</Link>
                  </Button>
                )}
              </div>

              <div className="mt-6 space-y-3 border-t pt-5 text-sm">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  This course includes
                </p>
                {[
                  { icon: InfinityIcon, text: "Lifetime access" },
                  { icon: PlayCircle, text: `${totalLessons} video lessons` },
                  { icon: BookOpen, text: "Downloadable notes" },
                  { icon: Award, text: "Certificate of completion" },
                  { icon: Globe, text: `${course.language} language` },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item.text}</span>
                  </div>
                ))}
              </div>

              {totalMinutes > 0 && (
                <div className="mt-5 rounded-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                  Total watch time:{" "}
                  <span className="font-bold text-foreground">
                    {Math.round(totalMinutes / 60)} hours{" "}
                    {totalMinutes % 60} mins
                  </span>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Related */}
        {related && related.items.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-bold text-foreground">You might also like</h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
              {related.items
                .filter((c) => c.id !== course.id)
                .slice(0, 4)
                .map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
