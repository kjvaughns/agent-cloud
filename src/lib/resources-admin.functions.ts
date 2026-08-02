import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** The fields a fork carries over, per table. Ids and ownership are not among them. */
const COPYABLE: Record<Table, string[]> = {
  handbook_sections: ["title", "slug", "content_html", "sort_order"],
  scripts: ["title", "category", "content_markdown", "content_html", "short_description", "long_description", "accent_color", "sort_order"],
  academy_courses: ["title", "slug", "category", "instructor_name", "duration_minutes", "thumbnail_url", "description", "sort_order", "published", "featured"],
};

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
  if (table === "academy_courses") {
    const { data: modules } = await supabase
      .from("academy_modules")
      .select("title, sort_order, video_url, content_html, quiz, resource_urls")
      .eq("course_id", source.id)
      .order("sort_order");
    if (modules?.length) {
      await supabase.from("academy_modules")
        .insert(modules.map((m: any) => ({ ...m, course_id: made.id })));
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
 * academy_modules was never seeded, so no course on the platform has ever had
 * a lesson — the Academy has been a list of titles with nothing behind them.
 * Row-level security follows the course, so there is no organisation to pass
 * here: if you may edit the course, you may edit its lessons.
 */
export const saveModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      course_id: z.string().uuid(),
      id: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(200),
      content_html: z.string().max(100_000).optional(),
      video_url: z.string().url().max(2000).optional().or(z.literal("")),
      sort_order: z.number().int().min(0).max(999).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const row = {
      course_id: data.course_id,
      title: data.title,
      content_html: data.content_html ?? null,
      video_url: data.video_url || null,
      sort_order: data.sort_order ?? 0,
    };

    if (data.id) {
      const { data: touched, error } = await supabase
        .from("academy_modules").update(row).eq("id", data.id).select("id");
      if (error) throw new Error(error.message);
      if (!touched?.length) throw new Error("You don't have permission to edit that lesson.");
      return { id: data.id };
    }

    const { data: made, error } = await supabase
      .from("academy_modules").insert(row).select("id").maybeSingle();
    if (error || !made) throw new Error(error?.message ?? "Could not add that lesson.");
    return { id: made.id as string };
  });

export const deleteModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: gone, error } = await supabase
      .from("academy_modules").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("You don't have permission to delete that lesson.");
    return { ok: true };
  });
