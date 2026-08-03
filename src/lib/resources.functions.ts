import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// `getOnboardingStatus` was here: a second six-step definition of onboarding,
// read only by the New Agent Guide, while the dashboard showed ten from
// `getAgentOnboarding`. Different counts and different membership describing
// the same person, with no way to reconcile them.
//
// `getAgentOnboarding` is authoritative now — it derives every step from real
// data rather than a stored flag, and it absorbed the one step this had that it
// lacked (posting the first policy). Deleted rather than left in place, because
// a second definition nobody reads is a second definition somebody will
// eventually read again.
//
// It also checked `doc_type === "eo_certificate"` alone, which misses the older
// `eo` spelling the vocabulary migration deliberately kept — so agents with a
// legacy E&O certificate were told they had none.

/**
 * Defaults plus overrides, resolved to one of each.
 *
 * Row-level security returns the platform's defaults *and* the agency's own
 * rows, which is right — the reader cannot know which the agency has
 * replaced. When they have taken a copy, `forked_from` points at the default
 * it came from, and showing both would mean two "Compensation" sections in
 * the handbook, one of them stale.
 *
 * An agency that has changed nothing is unaffected: no forks, nothing hidden.
 */
function resolveOverrides<T extends Record<string, any>>(rows: T[]): T[] {
  const replaced = new Set(
    rows.filter((r) => r.organization_id && r.forked_from).map((r) => r.forked_from),
  );
  return rows.filter((r) => !(r.organization_id == null && replaced.has(r.id)));
}

export const getHandbookSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("handbook_sections").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return resolveOverrides(data ?? []);
  });

export const getScripts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scripts").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return resolveOverrides(data ?? []);
  });

export const getCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("academy_courses").select("*").eq("published", true).order("sort_order");
    if (error) throw new Error(error.message);
    // Filtered on published *before* resolving, so an agency that unpublishes
    // its copy falls back to the platform default rather than to nothing.
    return resolveOverrides(data ?? []);
  });

export const getStatesReference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("states_reference").select("*").order("state_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyLicenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("state_licenses").select("*").eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    state_code: z.string().length(2),
    license_number: z.string().min(1).max(64),
    issued_date: z.string(),
    expires_date: z.string(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("state_licenses").upsert({
      agent_id: userId,
      state_code: data.state_code,
      license_number: data.license_number,
      issued_date: data.issued_date,
      expires_date: data.expires_date,
    }, { onConflict: "agent_id,state_code,loa" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const scanNiprPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    file_base64: z.string().min(100),
    media_type: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI features unavailable — LOVABLE_API_KEY not configured.");

    const systemPrompt = `You are a data extraction assistant. Extract all insurance license records from a NIPR Producer Database (PDB) report.
Return ONLY a valid JSON object with this exact structure, no markdown fences, no explanation:
{
  "npn": "<NPN number as string>",
  "licenses": [
    {
      "state_code": "<2-letter state code>",
      "license_number": "<license number>",
      "license_type": "<license type e.g. Resident, Non-Resident>",
      "loa": "<line of authority e.g. Life, Accident & Health, Property, Casualty>",
      "loa_status": "<Active or Inactive>",
      "issued_date": "<YYYY-MM-DD or empty string>",
      "expires_date": "<YYYY-MM-DD or empty string>",
      "is_resident": <true or false>
    }
  ]
}
If the document is not a NIPR PDB report or cannot be parsed, return: {"error": "Not a valid NIPR PDB report"}`;

    const dataUrl = `data:${data.media_type};base64,${data.file_base64}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: "Extract all license records from this NIPR PDB report." },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Contact your admin.");
      throw new Error(`AI gateway error ${res.status}: ${errBody}`);
    }
    const body = await res.json();
    const raw: string = body?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (parsed.error) throw new Error(parsed.error);
    return parsed as { npn: string; licenses: any[] };
  });

export const bulkUpsertLicenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    npn: z.string().optional(),
    licenses: z.array(z.object({
      state_code: z.string().length(2),
      license_number: z.string().optional(),
      license_type: z.string().optional(),
      loa: z.string().optional(),
      loa_status: z.string().optional(),
      issued_date: z.string().optional(),
      expires_date: z.string().optional(),
      is_resident: z.boolean().optional(),
    })),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const errors: string[] = [];
    let inserted = 0;
    for (const lic of data.licenses) {
      const row = {
        agent_id: userId,
        state_code: lic.state_code,
        license_number: lic.license_number ?? null,
        license_type: lic.license_type ?? null,
        loa: lic.loa ?? null,
        loa_status: lic.loa_status ?? "Active",
        issued_date: lic.issued_date || null,
        expires_date: lic.expires_date || null,
        is_resident: lic.is_resident ?? false,
        npn_number: data.npn ?? null,
        updated_at: new Date().toISOString(),
      } as any;
      const { error } = await supabase.from("state_licenses").upsert(row, {
        onConflict: "agent_id,state_code,loa",
      });
      if (error) errors.push(`${lic.state_code} (${lic.loa ?? "no LOA"}): ${error.message}`);
      else inserted++;
    }
    if (data.npn) {
      await supabase.from("profiles").update({ npn_number: data.npn }).eq("id", userId);
    }
    return { inserted, errors, total: data.licenses.length };
  });

// ── Agent Academy: modules and progress ─────────────────────────────────────

/**
 * academy_modules and course_progress both existed and neither was used — the
 * Academy page only ever opened a course's external URL in a new tab, so
 * nothing an agent completed was ever recorded. These make the course a thing
 * you work through rather than a link.
 */

export type AcademyModule = {
  id: string;
  course_id: string;
  title: string;
  content_html: string | null;
  video_url: string | null;
  resource_urls: string[] | null;
  sort_order: number | null;
  completed: boolean;
  completed_at: string | null;
};

/** Per-course completion for the course list. */
export const getAcademyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const [{ data: modules }, { data: progress }] = await Promise.all([
      supabase.from("academy_modules").select("id, course_id"),
      supabase.from("course_progress").select("course_id, module_id, completed").eq("agent_id", userId),
    ]);

    const total = new Map<string, number>();
    for (const m of modules ?? []) {
      total.set(m.course_id, (total.get(m.course_id) ?? 0) + 1);
    }

    const done = new Map<string, number>();
    for (const p of progress ?? []) {
      if (p.completed) done.set(p.course_id, (done.get(p.course_id) ?? 0) + 1);
    }

    const byCourse: Record<string, { total: number; done: number; pct: number }> = {};
    for (const [courseId, t] of total) {
      const d = Math.min(done.get(courseId) ?? 0, t);
      byCourse[courseId] = { total: t, done: d, pct: t > 0 ? Math.round((d / t) * 100) : 0 };
    }
    // A course with progress but no module rows still deserves a count.
    for (const [courseId, d] of done) {
      if (!byCourse[courseId]) byCourse[courseId] = { total: d, done: d, pct: 100 };
    }

    return { byCourse };
  });

export const getCourseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const [{ data: course }, { data: modules }, { data: progress }] = await Promise.all([
      supabase.from("academy_courses").select("*").eq("id", data.course_id).maybeSingle(),
      supabase.from("academy_modules").select("*").eq("course_id", data.course_id).order("sort_order"),
      supabase.from("course_progress").select("module_id, completed, completed_at")
        .eq("agent_id", userId).eq("course_id", data.course_id),
    ]);

    if (!course) throw new Error("Course not found");

    const doneBy = new Map<string, { completed: boolean; completed_at: string | null }>(
      (progress ?? []).map((p: any) => [p.module_id, { completed: p.completed, completed_at: p.completed_at }]),
    );

    const withProgress: AcademyModule[] = (modules ?? []).map((m: any) => ({
      ...m,
      completed: Boolean(doneBy.get(m.id)?.completed),
      completed_at: doneBy.get(m.id)?.completed_at ?? null,
    }));

    const done = withProgress.filter((m) => m.completed).length;

    return {
      course,
      modules: withProgress,
      progress: {
        total: withProgress.length,
        done,
        pct: withProgress.length > 0 ? Math.round((done / withProgress.length) * 100) : 0,
      },
    };
  });

export const setModuleComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      course_id: z.string().uuid(),
      module_id: z.string().uuid(),
      completed: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // course_progress has no unique constraint on (agent, module), so an
    // upsert cannot be relied on — find the row first.
    const { data: existing } = await supabase
      .from("course_progress")
      .select("id")
      .eq("agent_id", userId)
      .eq("module_id", data.module_id)
      .maybeSingle();

    const patch = {
      agent_id: userId,
      course_id: data.course_id,
      module_id: data.module_id,
      completed: data.completed,
      completed_at: data.completed ? new Date().toISOString() : null,
    };

    const { error } = existing
      ? await supabase.from("course_progress").update(patch).eq("id", existing.id)
      : await supabase.from("course_progress").insert(patch);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
