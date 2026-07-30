import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getCourses, getAcademyProgress, getCourseDetail, setModuleComplete,
} from "@/lib/resources.functions";
import { Panel } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GraduationCap, Play, Clock, Layers, ArrowLeft, ExternalLink, Check, Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/resources/agent-academy")({
  head: () => ({ meta: [{ title: "Agent Academy — Agent Cloud" }] }),
  component: Page,
});

const CATS = ["All", "Sales Skills", "Product Knowledge", "Compliance", "Technology", "Recruiting"];

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function Page() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <CourseDetail id={openId} onBack={() => setOpenId(null)} />
    : <CourseList onOpen={setOpenId} />;
}

// ── Course list ─────────────────────────────────────────────────────────────

function CourseList({ onOpen }: { onOpen: (id: string) => void }) {
  const coursesFn = useServerFn(getCourses);
  const progressFn = useServerFn(getAcademyProgress);

  const { data: courses = [], isLoading } = useQuery({ queryKey: ["academy"], queryFn: () => coursesFn() });
  const { data: prog } = useQuery({ queryKey: ["academy", "progress"], queryFn: () => progressFn() });

  const [cat, setCat] = useState("All");
  const byCourse = ((prog as any)?.byCourse ?? {}) as Record<string, { total: number; done: number; pct: number }>;

  const list = useMemo(
    () => (courses as any[]).filter((c) => cat === "All" || c.category === cat),
    [courses, cat],
  );

  // "Continue where you left off" beats a featured banner nobody has finished.
  const inProgress = useMemo(
    () => (courses as any[]).find((c) => {
      const p = byCourse[c.id];
      return p && p.done > 0 && p.pct < 100;
    }),
    [courses, byCourse],
  );

  const featured = useMemo(() => (courses as any[]).find((c) => c.featured), [courses]);
  const hero = inProgress ?? featured;
  const heroProgress = hero ? byCourse[hero.id] : undefined;

  const totals = useMemo(() => {
    const vals = Object.values(byCourse);
    const started = vals.filter((v) => v.done > 0).length;
    const finished = vals.filter((v) => v.pct === 100).length;
    const modules = vals.reduce((a, v) => a + v.done, 0);
    return { started, finished, modules };
  }, [byCourse]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[var(--gap)]">
        <Skeleton className="h-32" />
        <div className="grid gap-[var(--gap)] md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {(courses as any[]).length > 0 && (
        <div className="grid grid-cols-3 gap-[var(--gap)]">
          <Panel><StatTile label="Courses Started" value={String(totals.started)} /></Panel>
          <Panel><StatTile label="Completed" value={String(totals.finished)} tone={totals.finished ? "gold" : undefined} /></Panel>
          <Panel><StatTile label="Modules Done" value={String(totals.modules)} /></Panel>
        </div>
      )}

      {hero && (
        <Panel className="relative overflow-hidden border-primary/30 bg-primary/[0.05]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {inProgress ? "Continue where you left off" : "Featured course"}
          </div>
          <div className="mt-1.5 text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {hero.title}
          </div>
          {hero.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{hero.description}</p>
          )}

          {heroProgress && heroProgress.total > 0 && (
            <div className="mt-4 max-w-sm">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground tnum">
                <span>{heroProgress.done} of {heroProgress.total} modules</span>
                <span>{heroProgress.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${heroProgress.pct}%` }} />
              </div>
            </div>
          )}

          <Button className="mt-4" onClick={() => onOpen(hero.id)}>
            <Play className="mr-1 h-4 w-4" /> {inProgress ? "Resume" : "Start course"}
          </Button>
        </Panel>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              cat === c
                ? "border-primary/40 bg-gold-glow text-gold-bright"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Panel>
          <div className="py-14 text-center">
            <GraduationCap className="mx-auto mb-3 h-9 w-9 text-text-dim" />
            <div className="font-semibold">
              {(courses as any[]).length === 0 ? "No courses yet" : `Nothing in ${cat}`}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {(courses as any[]).length === 0
                ? "Your admin will add training courses here."
                : "Try another category."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-[var(--gap)] md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const p = byCourse[c.id];
            const done = p?.pct === 100;
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className={cn(
                  "ac-lift group flex flex-col overflow-hidden rounded-[var(--radius)] border bg-card text-left",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  done ? "border-success/40" : "border-border hover:border-primary/40",
                )}
              >
                <div className="relative grid h-24 place-items-center border-b border-border-soft bg-gold-glow">
                  {c.thumbnail_url
                    ? <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    : <GraduationCap className="h-9 w-9 text-gold-bright/60" />}
                  {done && (
                    <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-success text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <Badge variant="outline" className="mb-2 self-start">{c.category}</Badge>
                  <div className="font-semibold group-hover:text-gold-bright">{c.title}</div>
                  {c.instructor_name && (
                    <div className="mt-0.5 text-xs text-text-dim">{c.instructor_name}</div>
                  )}

                  <div className="mt-2 flex items-center gap-3 text-xs text-text-dim tnum">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDuration(c.duration_minutes ?? 0)}</span>
                    <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {c.module_count ?? 0} modules</span>
                  </div>

                  <div className="mt-auto pt-3">
                    {p && p.total > 0 ? (
                      <>
                        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground tnum">
                          <span>{p.done}/{p.total}</span>
                          <span>{p.pct}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-primary")}
                            style={{ width: `${p.pct}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-primary">Start course →</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Course detail ───────────────────────────────────────────────────────────

/**
 * academy_modules and course_progress both existed and neither was used — a
 * course was a link that opened in a new tab and forgot you'd been there.
 * This works through the modules and records what you finish.
 */
function CourseDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getCourseDetail);
  const completeFn = useServerFn(setModuleComplete);

  const { data, isLoading } = useQuery({
    queryKey: ["academy", "course", id],
    queryFn: () => detailFn({ data: { course_id: id } }),
  });

  const [openModule, setOpenModule] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (vars: { module_id: string; completed: boolean }) =>
      completeFn({ data: { course_id: id, ...vars } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save your progress"),
  });

  if (isLoading) return <Skeleton className="h-[520px]" />;

  const course = (data as any)?.course;
  const modules = ((data as any)?.modules ?? []) as any[];
  const p = (data as any)?.progress ?? { total: 0, done: 0, pct: 0 };
  const finished = p.total > 0 && p.pct === 100;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> All courses
      </Button>

      <Panel className={cn(finished && "border-success/40 bg-success/[0.04]")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Badge variant="outline" className="mb-2">{course?.category}</Badge>
            <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {course?.title}
            </h2>
            {course?.description && (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{course.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-dim tnum">
              {course?.instructor_name && <span>{course.instructor_name}</span>}
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDuration(course?.duration_minutes ?? 0)}</span>
              <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {p.total || course?.module_count || 0} modules</span>
            </div>
          </div>

          {finished && (
            <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              <Trophy className="h-4 w-4" /> Course complete
            </div>
          )}
        </div>

        {p.total > 0 && (
          <div className="mt-4 max-w-md">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground tnum">
              <span>{p.done} of {p.total} modules</span>
              <span>{p.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn("h-full rounded-full transition-all", finished ? "bg-success" : "bg-primary")}
                style={{ width: `${p.pct}%` }}
              />
            </div>
          </div>
        )}

        {course?.url && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.open(course.url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open course materials
          </Button>
        )}
      </Panel>

      {modules.length === 0 ? (
        <Panel>
          <div className="py-12 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-text-dim" />
            <div className="font-semibold">No modules yet</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {course?.url
                ? "This course lives outside the platform — use the link above."
                : "Modules for this course haven't been added yet."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-2">
          {modules.map((m, i) => {
            const expanded = openModule === m.id;
            const hasBody = Boolean(m.content_html || m.video_url || (m.resource_urls ?? []).length);
            return (
              <Panel key={m.id} pad={false} className={cn(m.completed && "border-success/30")}>
                <div className="flex items-start gap-3 p-4">
                  <Checkbox
                    className="mt-0.5"
                    checked={m.completed}
                    onCheckedChange={(v) => toggle.mutate({ module_id: m.id, completed: Boolean(v) })}
                    aria-label={`Mark ${m.title} ${m.completed ? "incomplete" : "complete"}`}
                  />

                  <button
                    onClick={() => hasBody && setOpenModule(expanded ? null : m.id)}
                    className={cn("min-w-0 flex-1 text-left", hasBody && "cursor-pointer")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="tnum text-[11px] text-text-dim">{String(i + 1).padStart(2, "0")}</span>
                      <span className={cn("text-sm font-medium", m.completed && "text-muted-foreground line-through")}>
                        {m.title}
                      </span>
                    </div>
                    {hasBody && (
                      <span className="mt-0.5 block text-[11px] text-primary">
                        {expanded ? "Hide" : "Open module"}
                      </span>
                    )}
                  </button>

                  {m.video_url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 text-xs"
                      onClick={() => window.open(m.video_url, "_blank", "noopener,noreferrer")}
                    >
                      <Play className="mr-1 h-3 w-3" /> Watch
                    </Button>
                  )}
                </div>

                {expanded && (
                  <div className="border-t border-border-soft px-4 py-4">
                    {m.content_html && (
                      <article
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: m.content_html }}
                      />
                    )}
                    {(m.resource_urls ?? []).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(m.resource_urls as string[]).map((u, k) => (
                          <Button
                            key={k}
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(u, "_blank", "noopener,noreferrer")}
                          >
                            <ExternalLink className="mr-1 h-3 w-3" /> Resource {k + 1}
                          </Button>
                        ))}
                      </div>
                    )}
                    {!m.completed && (
                      <Button
                        size="sm"
                        className="mt-4"
                        onClick={() => toggle.mutate({ module_id: m.id, completed: true })}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Mark complete
                      </Button>
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
