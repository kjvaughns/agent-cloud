import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { QuizSchema, quizProblems } from "@/lib/academy-quiz";

/**
 * An agency's own handbook, scripts and courses.
 *
 * The content model is defaults plus overrides. A row with no
 * `organization_id` is the platform's default and every agency reads it; a
 * row with one belongs to that agency and nobody else sees it. Editing a
 * default takes a copy rather than changing the shared row, so one agency's
 * edit can never appear in another's handbook.
 *
 * Everything here goes through the caller's own client. `can_manage_resources`
 * in the database is the authority on who may write, and these functions ask
 * it rather than re-deciding — a second copy of an authorisation rule is a
 * second thing to get wrong.
 */

type Ctx = { supabase: any; userId: string };

type Table = "handbook_sections" | "scripts" | "academy_courses";

/**
 * The fields a fork carries over, per table. Ids and ownership are not among
 * them — and this list is also the write whitelist in `saveResource`, so
 * adding a field here makes it editable. That is the security boundary, not a
 * convenience list.
 *
 * `url` was missing from `academy_courses`, so an agency that took a copy of a
 * course hosted somewhere else got the copy without the link to it — a course
 * with nothing behind it at all. `module_count` and `duration_minutes` stay
 * out on purpose: both are maintained by trigger from the lessons, and a hand
 * write would be overwritten by the next lesson edit.
 */
const COPYABLE: Record<Table, string[]> = {
  handbook_sections: ["title", "slug", "content_html", "sort_order"],
  scripts: ["title", "category", "content_markdown", "content_html", "short_description", "long_description", "accent_color", "sort_order"],
  academy_courses: ["title", "slug", "category", "instructor_name", "thumbnail_url", "description", "url", "sort_order", "published", "featured"],
};

/**
 * Fields that only exist once `20260803020000` is applied.
 *
 * Migrations are applied by hand, so this code reaches production first.
 * PostgREST answers a write naming an unknown column with `PGRST204` and
 * rejects the whole statement, which would mean no lesson could be saved at
 * all during that window rather than lessons saving without their new fields.
 * Every write that touches these retries without them — see `writeTolerantly`.
 */
const PENDING_MODULE_COLUMNS = [
  "section", "kind", "duration_minutes", "is_published", "updated_at",
] as const;

/** PostgREST: the request named a column the table does not have. */
function isMissingColumn(error: any): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

function withoutPending<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = { ...row };
  for (const c of PENDING_MODULE_COLUMNS) delete out[c];
  return out as Partial<T>;
}

/**
 * Run a write, and run it again without the not-yet-migrated columns if the
 * database says it has never heard of them.
 *
 * The retry is deliberately narrow: only `PGRST204`/`42703`, and only these
 * five column names. Any other error is the caller's problem to report.
 */
async function writeTolerantly<T>(
  row: Record<string, unknown>,
  attempt: (row: Record<string, unknown>) => Promise<{ data: T; error: any }>,
): Promise<{ data: T; error: any; degraded: boolean }> {
  const first = await attempt(row);
  if (!isMissingColumn(first.error)) return { ...first, degraded: false };
  const second = await attempt(withoutPending(row));
  return { ...second, degraded: true };
}

/**
 * HTML written by one agency's staff and rendered to every agent in that
 * agency with `dangerouslySetInnerHTML`.
 *
 * The reader sanitises too, and that is the one that actually protects the
 * person looking at the page. This one stops the payload being stored, which
 * matters because stored HTML outlives whichever reader rendered it — the
 * next thing to read `content_html` might be an export, an email or a print
 * stylesheet, and none of those will remember to sanitise.
 */
function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return clean.trim() ? clean : null;
}

async function myOrgId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  if (!data?.organization_id) throw new Error("You are not in an agency.");
  return data.organization_id as string;
}

async function assertMayManage(supabase: any, orgId: string): Promise<void> {
  const { data } = await supabase.rpc("can_manage_resources", { _org: orgId });
  if (!data) throw new Error("You don't have permission to edit your agency's resources.");
}

/**
 * Platform defaults the agency has already replaced, so the list shows one of
 * each rather than the default and the copy side by side.
 */
function resolve<T extends { id: string; organization_id: string | null; forked_from: string | null }>(
  rows: T[],
): T[] {
  const replaced = new Set(rows.filter((r) => r.organization_id && r.forked_from).map((r) => r.forked_from!));
  return rows.filter((r) => !(r.organization_id === null && replaced.has(r.id)));
}

// ── Reading, for the editor ─────────────────────────────────────────────────

export const listManagedResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    // Row-level security already limits this to the platform's defaults plus
    // this agency's own, so there is no organisation filter to forget here.
    //
    // `*` rather than a column list because `organization_id` and
    // `forked_from` arrive with this feature's own migration, and code
    // reaches production before a migration is applied. PostgREST fails the
    // whole select when it is asked for a column that does not exist yet.
    const [handbook, scripts, courses] = await Promise.all([
      supabase.from("handbook_sections").select("*").order("sort_order"),
      supabase.from("scripts").select("*").order("sort_order"),
      supabase.from("academy_courses").select("*").order("sort_order"),
    ]);

    let orgId: string | null = null;
    try { orgId = await myOrgId(supabase, userId); } catch { /* solo: defaults only */ }

    // A missing function and a denied permission are different answers and
    // the page says different things about them. Collapsing both to "you
    // can't" would send an owner to look for a permission they already have.
    let canManage = false;
    let pendingSetup = false;
    if (orgId) {
      const { data: ok, error } = await supabase.rpc("can_manage_resources", { _org: orgId });
      if (error) pendingSetup = true;
      else canManage = Boolean(ok);
    }

    return {
      orgId,
      canManage,
      pendingSetup,
      handbook: resolve((handbook.data ?? []) as any[]),
      scripts: resolve((scripts.data ?? []) as any[]),
      courses: resolve((courses.data ?? []) as any[]),
    };
  });

// ── Writing ─────────────────────────────────────────────────────────────────

const TableSchema = z.enum(["handbook_sections", "scripts", "academy_courses"]);

/**
 * Make this agency's copy of a platform default, and hand back its id.
 *
 * Idempotent: a second call returns the copy the first one made rather than a
 * duplicate, which matters because the obvious way to reach this is two
 * people clicking Edit on the same section. The partial unique index on
 * (organization_id, forked_from) is what actually holds that line — this
 * check just avoids the error in the ordinary case.
 *
 * A plain function rather than a server function, because saveResource needs
 * it mid-handler and invoking a server function from inside another one
 * re-enters middleware that is expecting a request.
 */
async function forkInto(
  supabase: any, userId: string, orgId: string, table: Table, id: string,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await supabase
    .from(table).select("id")
    .eq("organization_id", orgId).eq("forked_from", id).maybeSingle();
  if (existing) return { id: existing.id as string, created: false };

  const { data: source } = await supabase
    .from(table).select("*").eq("id", id).maybeSingle();
  if (!source) throw new Error("That item no longer exists.");
  // Already theirs. Nothing to copy, and copying would make a second one.
  if (source.organization_id) return { id: source.id as string, created: false };

  const copy: Record<string, unknown> = {
    organization_id: orgId,
    forked_from: source.id,
    updated_by: userId,
  };
  for (const f of COPYABLE[table]) {
    if (source[f] !== undefined) copy[f] = source[f];
  }

  const { data: made, error } = await supabase
    .from(table).insert(copy).select("id").maybeSingle();
  if (error || !made) throw new Error(error?.message ?? "Could not copy that item.");

  // A course is nothing without its lessons.
  //
  // `*` minus the columns that identify the original, rather than a column
  // list: a named list silently stops copying whatever gets added next, and
  // the failure looks like "my copy lost its quizzes" long after the change
  // that caused it. Anything the lesson table grows comes along by default.
  if (table === "academy_courses") {
    const { data: modules } = await supabase
      .from("academy_modules").select("*").eq("course_id", source.id).order("sort_order");
    if (modules?.length) {
      const copies = modules.map((m: any) => {
        const { id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest } = m;
        return { ...rest, course_id: made.id };
      });
      const { error: modErr } = await supabase.from("academy_modules").insert(copies);
      // A course copied without its lessons is worse than no copy: it looks
      // finished and is empty. Undo rather than leave that behind.
      if (modErr) {
        await supabase.from(table).delete().eq("id", made.id);
        throw new Error(`Copied the course but not its lessons: ${modErr.message}`);
      }
    }
  }

  return { id: made.id as string, created: true };
}

export const forkResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ table: TableSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await myOrgId(supabase, userId);
    await assertMayManage(supabase, orgId);
    return forkInto(supabase, userId, orgId, data.table as Table, data.id);
  });

const PatchSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const saveResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      table: TableSchema,
      /** Absent creates a new one; a platform default's id forks first. */
      id: z.string().uuid().optional(),
      patch: PatchSchema,
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await myOrgId(supabase, userId);
    await assertMayManage(supabase, orgId);

    const table = data.table as Table;

    // Only the fields this table actually copies are writable. Without the
    // whitelist a patch could set organization_id and hand the row to another
    // agency — which row-level security would then happily let them keep.
    const allowed = new Set(COPYABLE[table]);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (allowed.has(k)) patch[k] = v;
    }
    if (!Object.keys(patch).length) throw new Error("Nothing to save.");

    // Both editors write HTML now, so both are a stored-XSS surface.
    for (const field of ["content_html", "long_description"]) {
      if (typeof patch[field] === "string") patch[field] = cleanHtml(patch[field] as string);
    }

    patch.updated_by = userId;
    patch.updated_at = new Date().toISOString();

    let targetId = data.id ?? null;

    if (targetId) {
      const { data: row } = await supabase
        .from(table).select("id, organization_id").eq("id", targetId).maybeSingle();
      if (!row) throw new Error("That item no longer exists.");
      // Editing a default means editing your copy of it.
      if (row.organization_id === null) {
        targetId = (await forkInto(supabase, userId, orgId, table, targetId)).id;
      }
    }

    if (!targetId) {
      const { data: made, error } = await supabase
        .from(table).insert({ ...patch, organization_id: orgId }).select("id").maybeSingle();
      if (error || !made) throw new Error(error?.message ?? "Could not create that.");
      return { id: made.id as string };
    }

    const { data: touched, error } = await supabase
      .from(table).update(patch).eq("id", targetId).select("id");
    if (error) throw new Error(error.message);
    if (!touched?.length) throw new Error("You don't have permission to edit that item.");
    return { id: targetId };
  });

/**
 * Remove an agency's own item.
 *
 * A platform default is refused rather than deleted: it belongs to the
 * platform, and row-level security would refuse it anyway — saying why is
 * better than letting the policy answer with silence.
 */
export const deleteResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ table: TableSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await myOrgId(supabase, userId);
    await assertMayManage(supabase, orgId);

    const { data: row } = await supabase
      .from(data.table).select("id, organization_id").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    if (row.organization_id === null) {
      throw new Error("That's a platform default — edit it to make your agency's own version instead.");
    }

    const { data: gone, error } = await supabase
      .from(data.table).delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("You don't have permission to delete that item.");
    return { ok: true };
  });

// ── Academy lessons ─────────────────────────────────────────────────────────

/**
 * academy_modules was never seeded and never written to, so no course on the
 * platform has ever had a lesson — the Academy has been a list of titles with
 * nothing behind them. `saveModule` and `deleteModule` existed before this and
 * had no caller anywhere in the app.
 *
 * Row-level security on academy_modules follows the course, so the database
 * needs no organisation passed here: if you may edit the course, you may edit
 * its lessons. `assertMayEditCourse` is not a second copy of that rule — RLS
 * still decides — it is there so a refusal arrives as a sentence rather than as
 * a delete that quietly matches no rows.
 */

/**
 * The course exists, and this caller may write to it.
 *
 * Returns the course so the caller does not read it twice. Refusing a platform
 * default by name matters: "make your agency's own copy first" is an
 * instruction, where the RLS answer would be an empty result set.
 */
async function assertMayEditCourse(supabase: any, courseId: string): Promise<any> {
  const { data: course } = await supabase
    .from("academy_courses").select("*").eq("id", courseId).maybeSingle();
  if (!course) throw new Error("That course no longer exists.");

  if (course.organization_id === null) {
    const { data: isPlatform } = await supabase.rpc("is_platform_admin");
    if (!isPlatform) {
      throw new Error(
        "That's a platform default. Choose “Make ours” on the course first — " +
        "your lessons then belong to your agency and the original stays as it is.",
      );
    }
    return course;
  }

  await assertMayManage(supabase, course.organization_id);
  return course;
}

/** The whole course as the builder needs it: the row, its lessons, and whether you may write. */
export const getCourseForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const [{ data: course }, { data: modules }] = await Promise.all([
      supabase.from("academy_courses").select("*").eq("id", data.course_id).maybeSingle(),
      // Ordered by created_at as well, so a course whose lessons all share
      // sort_order 0 — every course that exists today — comes back in the same
      // order every time rather than in whatever order the planner chose.
      supabase.from("academy_modules").select("*")
        .eq("course_id", data.course_id)
        .order("sort_order").order("created_at", { ascending: true }),
    ]);

    if (!course) throw new Error("That course no longer exists.");

    let canManage = false;
    if (course.organization_id === null) {
      const { data: isPlatform } = await supabase.rpc("is_platform_admin");
      canManage = Boolean(isPlatform);
    } else {
      let orgId: string | null = null;
      try { orgId = await myOrgId(supabase, userId); } catch { /* not in an agency */ }
      if (orgId === course.organization_id) {
        const { data: ok } = await supabase.rpc("can_manage_resources", { _org: orgId });
        canManage = Boolean(ok);
      }
    }

    return { course, modules: (modules ?? []) as any[], canManage };
  });

const KindSchema = z.enum(["video", "text", "quiz", "document", "embed"]);

/**
 * A lesson.
 *
 * Every content field is optional because a lesson is genuinely allowed to be
 * any one of five things, and requiring the field its `kind` implies would
 * make an author unable to save half-finished work — which is what
 * `is_published` is for instead. The editor warns; the database does not
 * refuse.
 */
export const saveModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      course_id: z.string().uuid(),
      id: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(200),
      section: z.string().trim().max(120).nullish(),
      kind: KindSchema.optional(),
      content_html: z.string().max(200_000).nullish(),
      video_url: z.string().max(2000).nullish(),
      resource_urls: z.array(z.object({
        label: z.string().trim().max(120).optional(),
        url: z.string().url().max(2000),
      })).max(20).nullish(),
      quiz: QuizSchema.nullish(),
      duration_minutes: z.number().int().min(0).max(1440).optional(),
      is_published: z.boolean().optional(),
      sort_order: z.number().int().min(0).max(999).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await assertMayEditCourse(supabase, data.course_id);

    // A quiz that cannot be passed, or one whose correct answer was deleted
    // out from under it, is worse than no quiz — every agent fails it and
    // nobody can tell why. Refused at the point it would be stored.
    if (data.quiz) {
      const problems = quizProblems(data.quiz);
      if (problems.length) throw new Error(problems.join(" "));
    }

    const row: Record<string, unknown> = {
      course_id: data.course_id,
      title: data.title,
      section: data.section?.trim() || null,
      kind: data.kind ?? "text",
      content_html: cleanHtml(data.content_html),
      video_url: data.video_url?.trim() || null,
      resource_urls: data.resource_urls?.length ? data.resource_urls : null,
      quiz: data.quiz ?? null,
      duration_minutes: data.duration_minutes ?? 0,
      is_published: data.is_published ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: touched, error, degraded } = await writeTolerantly(row, (r) =>
        supabase.from("academy_modules").update(r).eq("id", data.id!).select("id"));
      if (error) throw new Error(error.message);
      if (!(touched as any[])?.length) throw new Error("You don't have permission to edit that lesson.");
      return { id: data.id, degraded };
    }

    const { data: made, error, degraded } = await writeTolerantly(row, (r) =>
      supabase.from("academy_modules").insert(r).select("id").maybeSingle());
    if (error || !made) throw new Error(error?.message ?? "Could not add that lesson.");
    return { id: (made as any).id as string, degraded };
  });

export const deleteModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    const { data: lesson } = await supabase
      .from("academy_modules").select("course_id").eq("id", data.id).maybeSingle();
    if (!lesson) return { ok: true };
    await assertMayEditCourse(supabase, lesson.course_id);

    const { data: gone, error } = await supabase
      .from("academy_modules").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("You don't have permission to delete that lesson.");
    return { ok: true };
  });

/**
 * Copy a lesson, placed directly after the one it came from.
 *
 * The lesson people build most is the one that is nearly the same as the last
 * one — same section, same shape, different subject. Without this the choice is
 * retyping it or editing the original and losing it.
 */
export const duplicateModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    const { data: source } = await supabase
      .from("academy_modules").select("*").eq("id", data.id).maybeSingle();
    if (!source) throw new Error("That lesson no longer exists.");
    await assertMayEditCourse(supabase, source.course_id);

    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = source;
    const copy = {
      ...rest,
      title: `${source.title} (copy)`,
      sort_order: (source.sort_order ?? 0) + 1,
      // A copy starts unpublished. The alternative is a duplicate of a live
      // lesson appearing in the course the instant somebody clicks Duplicate.
      is_published: false,
    };

    // Everything at or after the copy's slot shifts down, so the copy lands
    // next to its original instead of tied with whatever was already there.
    const { data: after } = await supabase
      .from("academy_modules").select("id, sort_order")
      .eq("course_id", source.course_id)
      .gte("sort_order", copy.sort_order)
      .order("sort_order");
    for (const m of after ?? []) {
      await supabase.from("academy_modules")
        .update({ sort_order: (m.sort_order ?? 0) + 1 }).eq("id", m.id);
    }

    const { data: made, error } = await writeTolerantly(copy, (r) =>
      supabase.from("academy_modules").insert(r).select("id").maybeSingle());
    if (error || !made) throw new Error(error?.message ?? "Could not copy that lesson.");
    return { id: (made as any).id as string };
  });

/**
 * Renumber a course's lessons to the order given.
 *
 * The whole list, not a pair of swaps — dragging one lesson from the bottom of
 * a twenty-lesson course to the top is one intent, and expressing it as
 * nineteen swaps is nineteen chances to end up somewhere in between. Ids not in
 * the list are left alone and keep their existing numbers, so a stale tab
 * cannot silently reshuffle lessons it never knew about.
 *
 * `sort_order` has no uniqueness, so there is no window here where two rows
 * collide and the write fails half-done. That is the trade for accepting ties.
 */
export const reorderModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      course_id: z.string().uuid(),
      /** Lesson ids in their new order, top first. */
      ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await assertMayEditCourse(supabase, data.course_id);

    let moved = 0;
    for (const [i, id] of data.ids.entries()) {
      const { data: touched, error } = await supabase
        .from("academy_modules")
        .update({ sort_order: i })
        .eq("id", id)
        .eq("course_id", data.course_id)   // an id from another course cannot be renumbered here
        .select("id");
      if (error) throw new Error(error.message);
      if (touched?.length) moved++;
    }

    if (!moved) throw new Error("You don't have permission to reorder these lessons.");
    return { moved };
  });
