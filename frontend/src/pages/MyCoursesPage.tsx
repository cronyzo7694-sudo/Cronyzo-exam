/**
 * My learning — enrolled courses with progress tracking.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { learningApi } from "@/lib/commerce";
import { EmptyState, GridSkeleton } from "@/components/commerce/Primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MyCoursesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => learningApi.myCourses(),
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            My learning
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {items.length} course{items.length === 1 ? "" : "s"} enrolled · keep
            the streak going
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/courses">
            Browse more courses
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8">
          <GridSkeleton count={4} aspect="16 / 9" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={GraduationCap}
            title="You have not enrolled in anything yet"
            description="Pick a course and start learning — free courses enrol instantly."
            action={
              <Button asChild>
                <Link to="/courses">
                  Explore courses
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {items.map((enrollment) => {
            const course = enrollment.course;
            const progress = Math.max(0, Math.min(100, enrollment.progress || 0));
            const done = enrollment.is_completed || progress >= 100;

            return (
              <div
                key={enrollment.id}
                className="flex flex-col gap-5 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30 sm:flex-row"
              >
                <Link
                  to="/courses/$slug"
                  params={{ slug: course?.slug ?? "" }}
                  className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-64"
                >
                  {course?.thumbnail_url && (
                    <img
                      src={course.thumbnail_url}
                      alt={course?.title ?? ""}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity hover:opacity-100">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-primary">
                      <PlayCircle className="h-6 w-6" />
                    </span>
                  </div>
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-foreground">
                        {course?.title ?? "Course"}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          {course?.teacher_name ?? course?.teacher?.full_name ?? "Instructor"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          {course?.lesson_count ?? 0} lessons
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {course?.duration_hours ?? 0}h
                        </span>
                      </div>
                    </div>

                    {done && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mt-auto pt-5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-muted-foreground">
                        {enrollment.completed_lessons} of{" "}
                        {course?.lesson_count ?? 0} lessons complete
                      </span>
                      <span
                        className={cn(
                          "font-bold",
                          done ? "text-emerald-600" : "text-primary",
                        )}
                      >
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          done
                            ? "bg-emerald-500"
                            : "bg-gradient-to-r from-indigo-500 to-violet-500",
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link to="/courses/$slug" params={{ slug: course?.slug ?? "" }}>
                        <PlayCircle className="mr-2 h-3.5 w-3.5" />
                        {done ? "Revisit" : "Continue learning"}
                      </Link>
                    </Button>
                    {done && (
                      <Button asChild variant="outline" size="sm">
                        <Link to="/courses/$slug" params={{ slug: course?.slug ?? "" }}>
                          <Sparkles className="mr-2 h-3.5 w-3.5" />
                          Write a review
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
