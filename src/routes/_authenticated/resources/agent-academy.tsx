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
  Video, FileText, HelpCircle, Paperclip, Code2, RotateCcw, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RichTextPreview } from "@/components/resources/rich-text";
import { readVideoUrl } from "@/lib/academy-media";
import { readQuiz, gradeQuiz, type Quiz, type QuizResult } from "@/lib/academy-quiz";

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--gap)]">
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
                    {/* `module_count` counts drafts too; the progress total is
                        the number of lessons this agent can actually open. */}
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" /> {p?.total ?? c.module_count ?? 0} lessons
                    </span>
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
    mutationFn: (vars: { module_id: string; completed: boolean; quiz_score?: number }) =>
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
            <div className="font-semibold">No lessons yet</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {course?.url
                ? "This course lives outside the platform — use the link above."
                : "Lessons for this course haven't been added yet."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-2">
          {modules.map((m, i) => {
            const prev = modules[i - 1];
            const startsSection = (m.section ?? "") !== (prev?.section ?? "") && Boolean(m.section);
            return (
              <div key={m.id}>
                {startsSection && (
                  <div className="px-1 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                    {m.section}
                  </div>
                )}
                <Lesson
                  lesson={m}
                  index={i}
                  expanded={openModule === m.id}
                  onToggle={() => setOpenModule(openModule === m.id ? null : m.id)}
                  onComplete={(completed, quiz_score) =>
                    toggle.mutate({ module_id: m.id, completed, quiz_score })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── One lesson ──────────────────────────────────────────────────────────────

const KIND_ICON: Record<string, typeof Video> = {
  video: Video, text: FileText, quiz: HelpCircle, document: Paperclip, embed: Code2,
};

/** `resource_urls` was a bare `string[]` before attachments had names. */
function readResources(raw: any): { label?: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => (typeof r === "string" ? { url: r } : r))
    .filter((r: any) => r && typeof r.url === "string" && r.url);
}

function Lesson({ lesson, index, expanded, onToggle, onComplete }: {
  lesson: any;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onComplete: (completed: boolean, quizScore?: number) => void;
}) {
  const quiz = readQuiz(lesson.quiz);
  const video = readVideoUrl(lesson.video_url);
  const resources = readResources(lesson.resource_urls);
  const Icon = KIND_ICON[lesson.kind ?? ""] ?? FileText;

  const hasBody = Boolean(lesson.content_html || video || resources.length || quiz);

  return (
    <Panel pad={false} className={cn(lesson.completed && "border-success/30")}>
      <div className="flex items-start gap-3 p-4">
        <Checkbox
          className="mt-0.5"
          checked={lesson.completed}
          // A quiz is finished by passing it, not by ticking a box next to it.
          disabled={Boolean(quiz) && !lesson.completed}
          onCheckedChange={(v) => onComplete(Boolean(v))}
          aria-label={`Mark ${lesson.title} ${lesson.completed ? "incomplete" : "complete"}`}
        />

        <button
          onClick={() => hasBody && onToggle()}
          className={cn("min-w-0 flex-1 text-left", hasBody && "cursor-pointer")}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-[11px] text-text-dim">{String(index + 1).padStart(2, "0")}</span>
            <Icon className="h-3.5 w-3.5 shrink-0 text-text-dim" />
            <span className={cn("text-sm font-medium", lesson.completed && "text-muted-foreground line-through")}>
              {lesson.title}
            </span>
            {(lesson.duration_minutes ?? 0) > 0 && (
              <span className="text-[11px] text-text-dim tnum">{lesson.duration_minutes} min</span>
            )}
            {quiz && lesson.quiz_score != null && (
              <Badge variant="outline" className="text-[10px] tnum">Scored {lesson.quiz_score}%</Badge>
            )}
          </div>
          {hasBody && (
            <span className="mt-0.5 block pl-6 text-[11px] text-primary">
              {expanded ? "Hide" : quiz ? "Take the quiz" : "Open lesson"}
            </span>
          )}
        </button>

        {video?.kind === "link" && (
          <Button
            size="sm" variant="ghost" className="h-7 shrink-0 text-xs"
            onClick={() => window.open(video.url, "_blank", "noopener,noreferrer")}
          >
            <Play className="mr-1 h-3 w-3" /> Watch
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border-soft px-4 py-4">
          {video?.kind === "embed" && (
            <div className="aspect-video overflow-hidden rounded-[var(--radius)] border border-border">
              <iframe
                src={video.url} title={lesson.title} allowFullScreen className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              />
            </div>
          )}
          {video?.kind === "file" && (
            <video src={video.url} controls className="w-full rounded-[var(--radius)] border border-border" />
          )}

          <RichTextPreview html={lesson.content_html} />

          {resources.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {resources.map((r, k) => (
                <Button
                  key={k} size="sm" variant="outline"
                  onClick={() => window.open(r.url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> {r.label || `Resource ${k + 1}`}
                </Button>
              ))}
            </div>
          )}

          {quiz ? (
            <QuizRunner
              quiz={quiz}
              alreadyPassed={Boolean(lesson.completed)}
              lastScore={lesson.quiz_score ?? null}
              onPassed={(pct) => onComplete(true, pct)}
              onFailed={(pct) => onComplete(false, pct)}
            />
          ) : !lesson.completed ? (
            <Button size="sm" onClick={() => onComplete(true)}>
              <Check className="mr-1 h-3.5 w-3.5" /> Mark complete
            </Button>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

// ── Taking a quiz ───────────────────────────────────────────────────────────

/**
 * Marked in the browser.
 *
 * The correct answers are in the lesson body the reader already has, so there
 * is no secret to protect by marking on the server — anybody who wanted the
 * answers could read them out of the response. What is worth being careful
 * about is the score, and `setModuleComplete` is where that is recorded.
 *
 * A failed attempt still records its score. Somebody who scored 60% twice is a
 * different situation from somebody who has not opened the quiz, and the second
 * is what a blank would say about both.
 */
function QuizRunner({ quiz, alreadyPassed, lastScore, onPassed, onFailed }: {
  quiz: Quiz;
  alreadyPassed: boolean;
  lastScore: number | null;
  onPassed: (pct: number) => void;
  onFailed: (pct: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [attempts, setAttempts] = useState(0);

  const outOfAttempts = quiz.max_attempts != null && attempts >= quiz.max_attempts;
  const unanswered = quiz.questions.filter((q) => !(answers[q.id] ?? []).length).length;

  function pick(q: (typeof quiz.questions)[number], optionId: string) {
    if (result) return;
    setAnswers((s) => {
      if (q.kind === "single") return { ...s, [q.id]: [optionId] };
      const cur = s[q.id] ?? [];
      return {
        ...s,
        [q.id]: cur.includes(optionId) ? cur.filter((c) => c !== optionId) : [...cur, optionId],
      };
    });
  }

  function submit() {
    const r = gradeQuiz(quiz, answers);
    setResult(r);
    setAttempts((a) => a + 1);
    if (r.passed) onPassed(r.pct); else onFailed(r.pct);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tnum">
        <span>{quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{quiz.pass_pct}% to pass</span>
        {quiz.max_attempts != null && <><span>·</span><span>{quiz.max_attempts} attempts</span></>}
        {alreadyPassed && lastScore != null && (
          <Badge variant="outline" className="ml-auto text-[10px]">Passed with {lastScore}%</Badge>
        )}
      </div>

      {quiz.questions.map((q, i) => {
        const chosen = answers[q.id] ?? [];
        const mark = result?.results.find((r) => r.question_id === q.id);
        return (
          <div key={q.id} className="rounded-[var(--radius)] border border-border p-3">
            <div className="flex items-start gap-2">
              <span className="pt-0.5 text-[11px] text-text-dim tnum">Q{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{q.prompt}</p>
                {q.kind === "multiple" && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Pick every correct answer.</p>
                )}

                <div className="mt-2 space-y-1.5">
                  {q.options.map((o) => {
                    const picked = chosen.includes(o.id);
                    const isRight = result ? q.correct.includes(o.id) : false;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="checkbox"
                        aria-checked={picked}
                        disabled={Boolean(result)}
                        onClick={() => pick(q, o.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-left text-sm transition-colors",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                          result
                            ? isRight
                              ? "border-success/50 bg-success/10"
                              : picked ? "border-destructive/50 bg-destructive/10" : "border-border"
                            : picked
                              ? "border-primary/50 bg-gold-glow"
                              : "border-border hover:border-primary/40",
                        )}
                      >
                        <span className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center border",
                          q.kind === "single" ? "rounded-full" : "rounded",
                          picked ? "border-primary bg-primary" : "border-border",
                        )}>
                          {picked && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
                        </span>
                        <span>{o.text}</span>
                        {result && isRight && <Check className="ml-auto h-3.5 w-3.5 text-success" />}
                        {result && picked && !isRight && <XCircle className="ml-auto h-3.5 w-3.5 text-destructive" />}
                      </button>
                    );
                  })}
                </div>

                {result && q.explanation && (
                  <p className="mt-2 text-[11px] text-muted-foreground">{q.explanation}</p>
                )}
              </div>
              {mark && (
                mark.correct
                  ? <Check className="h-4 w-4 shrink-0 text-success" />
                  : <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
            </div>
          </div>
        );
      })}

      {result ? (
        <div className={cn(
          "flex flex-wrap items-center gap-3 rounded-[var(--radius)] border p-3",
          result.passed ? "border-success/40 bg-success/[0.06]" : "border-warning/40 bg-warning/[0.06]",
        )}>
          <span className="text-sm font-semibold tnum">
            {result.correct} of {result.total} · {result.pct}%
          </span>
          <span className="text-sm">
            {result.passed
              ? "Passed — the lesson is marked complete."
              : `You need ${quiz.pass_pct}% to pass.`}
          </span>
          {!result.passed && !outOfAttempts && (
            <Button
              size="sm" variant="outline" className="ml-auto"
              onClick={() => { setResult(null); setAnswers({}); }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Try again
            </Button>
          )}
          {!result.passed && outOfAttempts && (
            <span className="ml-auto text-xs text-muted-foreground">
              No attempts left — ask your manager to reset it.
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={submit} disabled={unanswered > 0}>
            <Check className="mr-1 h-3.5 w-3.5" /> Submit answers
          </Button>
          {unanswered > 0 && (
            <span className="text-xs text-muted-foreground">
              {unanswered} question{unanswered === 1 ? "" : "s"} still to answer
            </span>
          )}
        </div>
      )}
    </div>
  );
}
