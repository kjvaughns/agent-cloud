import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  ArrowLeft, Plus, GripVertical, Trash2, Copy, Loader2, Eye, EyeOff,
  Video, FileText, HelpCircle, Paperclip, Code2, Upload, Link2, Save,
  ChevronDown, ChevronRight, AlertTriangle, Clock, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@/hooks/use-server-fn";
import { cn } from "@/lib/utils";
import {
  getCourseForEdit, saveResource, saveModule, deleteModule,
  duplicateModule, reorderModules,
} from "@/lib/resources-admin.functions";
import { RichText, RichTextPreview } from "@/components/resources/rich-text";
import { QuizBuilder } from "@/components/resources/quiz-builder";
import { blankQuiz, readQuiz, quizSummary, type Quiz } from "@/lib/academy-quiz";
import { uploadMedia, readVideoUrl, MEDIA_LIMITS } from "@/lib/academy-media";

/**
 * Building a course.
 *
 * `academy_modules` has been in the schema since May with no way to write to
 * it, so every course in the Academy is a title and a link. This is the page
 * that makes a course a course: an ordered curriculum of lessons, each one
 * video, prose, a document, an embed or a quiz, grouped into named sections.
 *
 * Two things it deliberately does not do.
 *
 * It does not autosave. Autosave on a lesson somebody is part-way through
 * writing publishes half a sentence to their whole agency, and the fix for
 * that is a draft state per lesson, which is `is_published`. Explicit saves,
 * and a warning if you try to leave with unsaved ones.
 *
 * It does not let a section be a row in a table. A section is a label on a
 * lesson: dragging a lesson under a different heading changes its label, and
 * renaming a heading renames it on every lesson under it. The alternative —
 * a table above lessons — needs its own ordering, its own ownership chain and
 * its own fork rules, to hold a string.
 */

const CATEGORIES = [
  "Sales Skills", "Product Knowledge", "Compliance", "Technology", "Recruiting", "Onboarding",
];

type Lesson = {
  id: string;
  course_id: string;
  title: string;
  section: string | null;
  kind: string | null;
  content_html: string | null;
  video_url: string | null;
  resource_urls: any;
  quiz: any;
  duration_minutes: number | null;
  is_published: boolean | null;
  sort_order: number | null;
};

const KIND_META: Record<string, { label: string; icon: typeof Video; hint: string }> = {
  video: { label: "Video", icon: Video, hint: "Upload a file, or paste a Vimeo, Loom, YouTube or Drive link." },
  text: { label: "Reading", icon: FileText, hint: "Written material — the lesson is the page itself." },
  quiz: { label: "Quiz", icon: HelpCircle, hint: "Questions the agent has to get right to finish the lesson." },
  document: { label: "Document", icon: Paperclip, hint: "A PDF or a set of files to work through." },
  embed: { label: "Embed", icon: Code2, hint: "Anything with an embed URL — a slide deck, a form, a tool." },
};

function kindOf(l: Lesson): string {
  return l.kind && KIND_META[l.kind] ? l.kind : "text";
}

/** `resource_urls` was `string[]` before this page existed and may still be. */
function readResources(raw: any): { label?: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => (typeof r === "string" ? { url: r } : r))
    .filter((r: any) => r && typeof r.url === "string" && r.url);
}

// ────────────────────────────────────────────────────────────────────────────

export function CourseBuilder({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const loadFn = useServerFn(getCourseForEdit);
  const reorderFn = useServerFn(reorderModules);

  const { data, isLoading, error } = useQuery({
    queryKey: ["course-edit", courseId],
    queryFn: () => loadFn({ data: { course_id: courseId } }),
  });

  const [order, setOrder] = useState<string[] | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const lessons = useMemo(() => {
    const rows = ((data as any)?.modules ?? []) as Lesson[];
    if (!order) return rows;
    const by = new Map(rows.map((r) => [r.id, r]));
    const sorted = order.map((id) => by.get(id)).filter(Boolean) as Lesson[];
    // Anything that arrived after the drag — a lesson somebody else added —
    // goes on the end rather than disappearing from the list.
    for (const r of rows) if (!order.includes(r.id)) sorted.push(r);
    return sorted;
  }, [data, order]);

  useEffect(() => { setOrder(null); }, [courseId]);

  // Leaving with unsaved lesson edits.
  useEffect(() => {
    if (dirty.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.size]);

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { course_id: courseId, ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course-edit", courseId] }),
    onError: (e: any) => {
      setOrder(null);   // put the list back where the server still thinks it is
      toast.error(e?.message ?? "Couldn't save the new order");
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = lessons.map((l) => l.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrder(next);
    reorder.mutate(next);
  }

  if (isLoading) return <Skeleton className="h-[540px]" />;

  if (error) {
    return (
      <Panel>
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">{(error as any)?.message ?? "Couldn't open that course."}</p>
      </Panel>
    );
  }

  const course = (data as any).course;
  const canManage = Boolean((data as any).canManage);
  const isDefault = course.organization_id === null;

  const back = () => {
    if (dirty.size > 0 && !window.confirm(
      `${dirty.size} lesson${dirty.size === 1 ? " has" : "s have"} unsaved changes. Leave anyway?`,
    )) return;
    onBack();
  };

  const totalMinutes = lessons.reduce((a, l) => a + (l.duration_minutes ?? 0), 0);
  const published = lessons.filter((l) => l.is_published !== false).length;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={back}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All resources
        </Button>
        <span className="text-sm font-semibold">{course.title}</span>
        {isDefault
          ? <Badge variant="secondary" className="text-[10px]">Platform default</Badge>
          : course.forked_from
            ? <Badge variant="outline" className="text-[10px]">Your version</Badge>
            : <Badge variant="outline" className="text-[10px]">Yours</Badge>}
        {course.published === false && <Badge variant="warning" className="text-[10px]">Unpublished</Badge>}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground tnum">
          <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {published}/{lessons.length} live</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {totalMinutes} min</span>
        </span>
      </div>

      {!canManage && (
        <Panel className="border-warning/40 bg-warning/[0.05]">
          <p className="text-sm">
            {isDefault
              ? "This is one of Agent Cloud's courses. Choose “Make ours” on the Academy list to get an editable copy for your agency — the original stays as it is for everyone else."
              : "You don't have permission to edit this course."}
          </p>
        </Panel>
      )}

      <Tabs defaultValue="curriculum">
        <TabsList>
          <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
          <TabsTrigger value="details">Course details</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="curriculum" className="mt-4">
          <div className="space-y-2">
            {lessons.length === 0 ? (
              <Panel>
                <div className="py-10 text-center">
                  <Layers className="mx-auto mb-3 h-8 w-8 text-text-dim" />
                  <div className="font-semibold">No lessons yet</div>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    A course with no lessons shows an agent an empty page. Add the first one —
                    you can leave it unpublished until it's ready.
                  </p>
                </div>
              </Panel>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                  {lessons.map((lesson, i) => {
                    const prev = lessons[i - 1];
                    const newSection = (lesson.section ?? "") !== (prev?.section ?? "");
                    return (
                      <div key={lesson.id}>
                        {newSection && lesson.section && (
                          <div className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                            {lesson.section}
                          </div>
                        )}
                        {newSection && !lesson.section && i > 0 && (
                          <div className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-dim">
                            Ungrouped
                          </div>
                        )}
                        <LessonRow
                          lesson={lesson}
                          index={i}
                          canManage={canManage}
                          expanded={openLesson === lesson.id}
                          onToggle={() => setOpenLesson(openLesson === lesson.id ? null : lesson.id)}
                          orgId={course.organization_id}
                          sections={[...new Set(lessons.map((l) => l.section).filter(Boolean))] as string[]}
                          onDirty={(isDirty) =>
                            setDirty((s) => {
                              const next = new Set(s);
                              if (isDirty) next.add(lesson.id); else next.delete(lesson.id);
                              return next;
                            })}
                        />
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}

            {canManage && (
              <AddLesson
                courseId={courseId}
                nextOrder={lessons.length}
                lastSection={lessons[lessons.length - 1]?.section ?? null}
                onAdded={(id) => setOpenLesson(id)}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <CourseDetails course={course} canManage={canManage} lessonMinutes={totalMinutes} />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <CoursePreview course={course} lessons={lessons} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── The course row itself ───────────────────────────────────────────────────

function CourseDetails({ course, canManage, lessonMinutes }: {
  course: any; canManage: boolean; lessonMinutes: number;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveResource);
  const [form, setForm] = useState<Record<string, any>>(() => ({
    title: course.title ?? "",
    slug: course.slug ?? "",
    category: course.category ?? CATEGORIES[0],
    instructor_name: course.instructor_name ?? "",
    description: course.description ?? "",
    thumbnail_url: course.thumbnail_url ?? "",
    url: course.url ?? "",
    sort_order: course.sort_order ?? 0,
    published: course.published !== false,
    featured: Boolean(course.featured),
  }));

  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const mut = useMutation({
    mutationFn: () => saveFn({ data: { table: "academy_courses", id: course.id, patch: form } }),
    onSuccess: (r: any) => {
      toast.success("Course saved");
      qc.invalidateQueries({ queryKey: ["managed-resources"] });
      qc.invalidateQueries({ queryKey: ["course-edit", r?.id ?? course.id] });
      qc.invalidateQueries({ queryKey: ["academy"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save"),
  });

  const missing = [
    !form.title.trim() && "a title",
    !form.slug.trim() && "a slug",
    !form.category.trim() && "a category",
  ].filter(Boolean) as string[];

  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Title *</Label>
          <Input
            value={form.title}
            disabled={!canManage}
            onChange={(e) => {
              set("title", e.target.value);
              // Only while the slug is still empty — rewriting a slug that is
              // already live changes the URL somebody bookmarked.
              if (!course.slug && !form.slug) {
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
              }
            }}
          />
        </div>

        <div className="space-y-1">
          <Label>Slug *</Label>
          <Input value={form.slug} disabled={!canManage} onChange={(e) => set("slug", e.target.value)} />
          <p className="text-[11px] text-muted-foreground">Unique within your agency.</p>
        </div>

        <div className="space-y-1">
          <Label>Category *</Label>
          <Input
            list="ac-course-categories"
            value={form.category}
            disabled={!canManage}
            onChange={(e) => set("category", e.target.value)}
          />
          <datalist id="ac-course-categories">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="space-y-1">
          <Label>Instructor</Label>
          <Input value={form.instructor_name} disabled={!canManage}
            onChange={(e) => set("instructor_name", e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Order in the list</Label>
          <Input
            type="number" value={form.sort_order} disabled={!canManage}
            onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={form.description} disabled={!canManage}
            onChange={(e) => set("description", e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>Cover image</Label>
          <MediaField
            kind="image"
            orgId={course.organization_id}
            value={form.thumbnail_url}
            disabled={!canManage}
            onChange={(v) => set("thumbnail_url", v)}
          />
          {form.thumbnail_url && (
            <img
              src={form.thumbnail_url} alt=""
              className="mt-2 h-24 w-44 rounded-[var(--radius)] border border-border object-cover"
            />
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>External link</Label>
          <Input
            value={form.url} disabled={!canManage} placeholder="https://…"
            onChange={(e) => set("url", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            For a course that lives somewhere else. Agents get a button to open it alongside any
            lessons here.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3">
          <div>
            <div className="text-sm font-medium">Published</div>
            <p className="text-[11px] text-muted-foreground">Unpublished courses are hidden from agents.</p>
          </div>
          <Switch checked={form.published} disabled={!canManage}
            onCheckedChange={(v) => set("published", v)} />
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3">
          <div>
            <div className="text-sm font-medium">Featured</div>
            <p className="text-[11px] text-muted-foreground">Shown at the top until somebody has a course in progress.</p>
          </div>
          <Switch checked={form.featured} disabled={!canManage}
            onCheckedChange={(v) => set("featured", v)} />
        </div>

        <div className="md:col-span-2">
          <p className="text-[11px] text-muted-foreground">
            Length is added up from the lessons — {lessonMinutes} min at the moment — so there is
            nothing to type here. A course with no lessons keeps whatever length it was given.
          </p>
        </div>
      </div>

      {canManage && (
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || missing.length > 0}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1 h-4 w-4" /> Save course</>}
          </Button>
          {missing.length > 0 && (
            <span className="text-xs text-muted-foreground">Needs {missing.join(", ")}</span>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── One lesson ──────────────────────────────────────────────────────────────

function LessonRow({ lesson, index, canManage, expanded, onToggle, orgId, sections, onDirty }: {
  lesson: Lesson;
  index: number;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
  orgId: string | null;
  sections: string[];
  onDirty: (dirty: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lesson.id, disabled: !canManage });

  const kind = kindOf(lesson);
  const Icon = KIND_META[kind].icon;
  const quiz = readQuiz(lesson.quiz);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(isDragging && "z-10 opacity-80")}
    >
      <Panel pad={false} className={cn("overflow-hidden", lesson.is_published === false && "border-dashed")}>
        <div className="flex items-start gap-2 p-3">
          {canManage && (
            <button
              ref={undefined}
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${lesson.title}`}
              className="mt-0.5 cursor-grab touch-none rounded p-1 text-text-dim hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          <span className="pt-1.5 text-[11px] text-text-dim tnum">{String(index + 1).padStart(2, "0")}</span>

          <button onClick={onToggle} className="min-w-0 flex-1 pt-0.5 text-left">
            <div className="flex flex-wrap items-center gap-2">
              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-text-dim" /> : <ChevronRight className="h-3.5 w-3.5 text-text-dim" />}
              <span className="text-sm font-medium">{lesson.title || "Untitled lesson"}</span>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Icon className="h-2.5 w-2.5" /> {KIND_META[kind].label}
              </Badge>
              {lesson.is_published === false && (
                <Badge variant="warning" className="text-[10px]">Draft</Badge>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 pl-5 text-[11px] text-muted-foreground tnum">
              {(lesson.duration_minutes ?? 0) > 0 && <span>{lesson.duration_minutes} min</span>}
              {quiz && <span>{quizSummary(quiz)}</span>}
              {readResources(lesson.resource_urls).length > 0 && (
                <span>{readResources(lesson.resource_urls).length} attachment(s)</span>
              )}
              {kind === "quiz" && !quiz && <span className="text-warning">No questions yet</span>}
            </div>
          </button>

          {canManage && <LessonActions lesson={lesson} />}
        </div>

        {expanded && (
          <div className="border-t border-border-soft p-4">
            <LessonEditor
              lesson={lesson}
              canManage={canManage}
              orgId={orgId}
              sections={sections}
              onDirty={onDirty}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}

function LessonActions({ lesson }: { lesson: Lesson }) {
  const qc = useQueryClient();
  const dupFn = useServerFn(duplicateModule);
  const delFn = useServerFn(deleteModule);
  const [armed, setArmed] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["course-edit", lesson.course_id] });
    qc.invalidateQueries({ queryKey: ["managed-resources"] });
    qc.invalidateQueries({ queryKey: ["academy"] });
  };

  const dup = useMutation({
    mutationFn: () => dupFn({ data: { id: lesson.id } }),
    onSuccess: () => { toast.success("Lesson copied — it starts as a draft"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't copy that lesson"),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id: lesson.id } }),
    onSuccess: () => { toast.success("Lesson deleted"); invalidate(); },
    onError: (e: any) => { setArmed(false); toast.error(e?.message ?? "Couldn't delete"); },
  });

  return (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Duplicate lesson"
        disabled={dup.isPending} onClick={() => dup.mutate()}>
        {dup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <Button
        size="sm" variant="ghost"
        className={cn("h-8 px-2", armed && "text-destructive")}
        aria-label="Delete lesson"
        disabled={del.isPending}
        onBlur={() => setArmed(false)}
        onClick={() => (armed ? del.mutate() : setArmed(true))}
      >
        {del.isPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : armed ? <span className="text-xs">Really?</span> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function LessonEditor({ lesson, canManage, orgId, sections, onDirty }: {
  lesson: Lesson;
  canManage: boolean;
  orgId: string | null;
  sections: string[];
  onDirty: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveModule);

  const initial = useMemo(() => ({
    title: lesson.title ?? "",
    section: lesson.section ?? "",
    kind: kindOf(lesson),
    content_html: lesson.content_html ?? "",
    video_url: lesson.video_url ?? "",
    resources: readResources(lesson.resource_urls),
    quiz: readQuiz(lesson.quiz),
    duration_minutes: lesson.duration_minutes ?? 0,
    is_published: lesson.is_published !== false,
  }), [lesson]);

  const [form, setForm] = useState(initial);
  useEffect(() => { setForm(initial); }, [initial]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const mut = useMutation({
    mutationFn: () => saveFn({
      data: {
        course_id: lesson.course_id,
        id: lesson.id,
        title: form.title.trim(),
        section: form.section.trim() || null,
        kind: form.kind as any,
        content_html: form.content_html || null,
        video_url: form.video_url || null,
        resource_urls: form.resources.length ? form.resources : null,
        quiz: form.quiz ?? null,
        duration_minutes: form.duration_minutes,
        is_published: form.is_published,
        sort_order: lesson.sort_order ?? 0,
      },
    }),
    onSuccess: (r: any) => {
      toast.success(r?.degraded
        ? "Saved. Sections, lesson type and length are waiting on a workspace update."
        : "Lesson saved");
      onDirty(false);
      qc.invalidateQueries({ queryKey: ["course-edit", lesson.course_id] });
      qc.invalidateQueries({ queryKey: ["academy"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save this lesson"),
  });

  const video = readVideoUrl(form.video_url);
  const KindIcon = KIND_META[form.kind].icon;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_200px_120px]">
        <div className="space-y-1">
          <Label className="text-xs">Lesson title</Label>
          <Input value={form.title} disabled={!canManage}
            onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Section</Label>
          <Input
            list="ac-lesson-sections"
            value={form.section}
            placeholder="Ungrouped"
            disabled={!canManage}
            onChange={(e) => set("section", e.target.value)}
          />
          <datalist id="ac-lesson-sections">
            {sections.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Minutes</Label>
          <Input
            type="number" min={0} value={form.duration_minutes} disabled={!canManage}
            onChange={(e) => set("duration_minutes", Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(KIND_META).map(([k, meta]) => {
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                disabled={!canManage}
                onClick={() => {
                  set("kind", k);
                  // A quiz lesson with no quiz is the one combination that
                  // cannot render anything, so choosing the type creates one.
                  if (k === "quiz" && !form.quiz) set("quiz", blankQuiz());
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  "disabled:opacity-50",
                  form.kind === k
                    ? "border-primary/40 bg-gold-glow text-gold-bright"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" /> {meta.label}
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <KindIcon className="h-3 w-3" /> {KIND_META[form.kind].hint}
        </p>
      </div>

      {(form.kind === "video" || form.kind === "embed") && (
        <div className="space-y-1">
          <Label className="text-xs">{form.kind === "video" ? "Video" : "Embed URL"}</Label>
          <MediaField
            kind="video"
            orgId={orgId}
            value={form.video_url}
            disabled={!canManage}
            allowUpload={form.kind === "video"}
            onChange={(v) => set("video_url", v)}
          />
          {video?.kind === "link" && (
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-warning">
              <AlertTriangle className="h-3 w-3" />
              Agent Cloud can't play a {video.provider} link inline — agents get a button that opens
              it in a new tab. Vimeo, Loom, YouTube, Wistia and Drive links play here.
            </p>
          )}
          {video?.kind === "embed" && (
            <p className="pt-1 text-[11px] text-muted-foreground">Plays inline · {video.provider}</p>
          )}
        </div>
      )}

      {form.kind !== "quiz" && (
        <div className="space-y-1">
          <Label className="text-xs">
            {form.kind === "text" ? "Lesson" : "Notes"}
          </Label>
          <RichText
            value={form.content_html}
            onChange={(v) => set("content_html", v)}
            minHeight={form.kind === "text" ? "260px" : "140px"}
          />
        </div>
      )}

      {form.kind === "quiz" && (
        <div className="space-y-1">
          <Label className="text-xs">Questions</Label>
          <QuizBuilder
            quiz={form.quiz ?? blankQuiz()}
            onChange={(q: Quiz) => set("quiz", q)}
          />
        </div>
      )}

      <ResourceList
        resources={form.resources}
        disabled={!canManage}
        orgId={orgId}
        onChange={(r) => set("resources", r)}
      />

      {canManage && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border-soft pt-3">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.title.trim() || !dirty}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1 h-4 w-4" /> Save lesson</>}
          </Button>

          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Switch checked={form.is_published} onCheckedChange={(v) => set("is_published", v)} />
            {form.is_published
              ? <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Live</span>
              : <span className="flex items-center gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" /> Draft</span>}
          </label>

          {!form.title.trim() && <span className="text-xs text-muted-foreground">Needs a title</span>}
          {dirty && form.title.trim() && <span className="text-xs text-warning">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}

// ── Attachments ─────────────────────────────────────────────────────────────

function ResourceList({ resources, onChange, disabled, orgId }: {
  resources: { label?: string; url: string }[];
  onChange: (r: { label?: string; url: string }[]) => void;
  disabled: boolean;
  orgId: string | null;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Attachments</Label>
      {resources.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={r.label ?? ""} placeholder="Name" disabled={disabled}
            className="h-8 w-40 text-sm"
            onChange={(e) => onChange(resources.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
          />
          <Input
            value={r.url} placeholder="https://…" disabled={disabled}
            className="h-8 flex-1 text-sm"
            onChange={(e) => onChange(resources.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))}
          />
          <Button
            size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Remove attachment"
            disabled={disabled}
            onClick={() => onChange(resources.filter((_, k) => k !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {!disabled && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => onChange([...resources, { url: "" }])}>
            <Link2 className="mr-1 h-3 w-3" /> Add a link
          </Button>
          <UploadButton
            kind="document"
            orgId={orgId}
            label="Upload a PDF"
            onUploaded={(url, name) => onChange([...resources, { label: name, url }])}
          />
        </div>
      )}
    </div>
  );
}

/** A URL you can either paste or upload into. */
function MediaField({ kind, orgId, value, onChange, disabled, allowUpload = true }: {
  kind: "image" | "video" | "document";
  orgId: string | null;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  allowUpload?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value} placeholder="https://…" disabled={disabled}
        className="min-w-[240px] flex-1"
        onChange={(e) => onChange(e.target.value)}
      />
      {allowUpload && !disabled && (
        <UploadButton kind={kind} orgId={orgId} onUploaded={(url) => onChange(url)} />
      )}
    </div>
  );
}

function UploadButton({ kind, orgId, onUploaded, label }: {
  kind: "image" | "video" | "document";
  orgId: string | null;
  onUploaded: (url: string, name: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadMedia(orgId, kind, file);
      onUploaded(url, file.name);
      toast.success("Uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={ref} type="file" className="hidden"
        accept={MEDIA_LIMITS[kind].accept}
        onChange={pick}
      />
      <Button size="sm" variant="outline" className="h-9 shrink-0" disabled={busy}
        onClick={() => ref.current?.click()}>
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <><Upload className="mr-1 h-3.5 w-3.5" /> {label ?? "Upload"}</>}
      </Button>
    </>
  );
}

// ── Adding ──────────────────────────────────────────────────────────────────

function AddLesson({ courseId, nextOrder, lastSection, onAdded }: {
  courseId: string; nextOrder: number; lastSection: string | null; onAdded: (id: string) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveModule);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("text");

  const mut = useMutation({
    mutationFn: () => saveFn({
      data: {
        course_id: courseId,
        title: title.trim() || "Untitled lesson",
        kind: kind as any,
        // New lessons join the section the list is currently ending in, which
        // is nearly always the one being worked on.
        section: lastSection,
        quiz: kind === "quiz" ? blankQuiz() : null,
        is_published: false,
        sort_order: nextOrder,
      },
    }),
    onSuccess: async (r: any) => {
      setTitle("");
      await qc.invalidateQueries({ queryKey: ["course-edit", courseId] });
      qc.invalidateQueries({ queryKey: ["managed-resources"] });
      onAdded(r.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't add that lesson"),
  });

  return (
    <Panel className="border-dashed">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label className="text-xs">New lesson</Label>
          <Input
            value={title}
            placeholder="What is this lesson called?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) mut.mutate(); }}
          />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-10 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_META).map(([k, m]) => (
              <SelectItem key={k} value={k}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !title.trim()}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> Add</>}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Lessons start as drafts, so nothing appears in the course until you publish it.
      </p>
    </Panel>
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────

/**
 * What an agent sees, from the same data and with the same sanitiser.
 *
 * Drafts are shown here with a marker rather than hidden — "why isn't my
 * lesson in the preview" is a worse question than a visible label saying it is
 * not live yet.
 */
function CoursePreview({ course, lessons }: { course: any; lessons: Lesson[] }) {
  return (
    <div className="space-y-3">
      <Panel>
        <Badge variant="outline" className="mb-2">{course.category}</Badge>
        <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{course.title}</h2>
        {course.description && <p className="mt-1.5 text-sm text-muted-foreground">{course.description}</p>}
        {course.instructor_name && <p className="mt-1 text-xs text-text-dim">{course.instructor_name}</p>}
      </Panel>

      {lessons.map((l, i) => {
        const prev = lessons[i - 1];
        const kind = kindOf(l);
        const quiz = readQuiz(l.quiz);
        const video = readVideoUrl(l.video_url);
        return (
          <div key={l.id}>
            {(l.section ?? "") !== (prev?.section ?? "") && l.section && (
              <div className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                {l.section}
              </div>
            )}
            <Panel className={cn(l.is_published === false && "border-dashed opacity-70")}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-dim tnum">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm font-medium">{l.title}</span>
                {l.is_published === false && <Badge variant="warning" className="text-[10px]">Not live</Badge>}
              </div>

              {video?.kind === "embed" && (
                <div className="mt-3 aspect-video overflow-hidden rounded-[var(--radius)] border border-border">
                  <iframe
                    src={video.url} title={l.title} allowFullScreen
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  />
                </div>
              )}
              {video?.kind === "file" && (
                <video src={video.url} controls className="mt-3 w-full rounded-[var(--radius)] border border-border" />
              )}

              <RichTextPreview html={l.content_html} className="mt-3" />

              {kind === "quiz" && quiz && (
                <p className="mt-3 text-xs text-muted-foreground">{quizSummary(quiz)}</p>
              )}
              {readResources(l.resource_urls).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {readResources(l.resource_urls).map((r, k) => (
                    <li key={k} className="text-primary">{r.label || r.url}</li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        );
      })}
    </div>
  );
}
