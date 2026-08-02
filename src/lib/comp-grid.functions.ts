import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai-gateway";

type Ctx = { supabase: any; userId: string };

/**
 * Self-serve commission grids.
 *
 * An agency's payout forecast is only as good as its comp grid. Rather than
 * making everyone wait on us to key in their contract, an owner can either
 * photograph the grid the carrier sent them and let AI read it, or build one
 * by hand.
 *
 * Extraction never writes straight to commission_grids. It parks the result
 * for review and a human applies it — a misread rate would quietly corrupt
 * every forecast downstream, which is far worse than a minute of checking.
 */

export type GridRow = {
  product_name: string;
  level_name: string;
  year_1_pct: number;
  years_2_5_pct: number | null;
  years_6_plus_pct: number | null;
  age_group_min: number | null;
  age_group_max: number | null;
};

const RowSchema = z.object({
  product_name: z.string().trim().min(1).max(120),
  level_name: z.string().trim().min(1).max(60),
  year_1_pct: z.number().min(0).max(300),
  years_2_5_pct: z.number().min(0).max(300).nullable().optional(),
  years_6_plus_pct: z.number().min(0).max(300).nullable().optional(),
  age_group_min: z.number().int().min(0).max(120).nullable().optional(),
  age_group_max: z.number().int().min(0).max(120).nullable().optional(),
});

// ── Read ─────────────────────────────────────────────────────────────────────

export const listMyGrids = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;

    const [{ data: grids }, { data: carriers }, { data: assigned }] = await Promise.all([
      supabase
        .from("commission_grids")
        .select("id, carrier_id, organization_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct, age_group_min, age_group_max, source, effective_date")
        .limit(5000),
      supabase.from("carriers").select("id, name").order("name"),
      // The levels agents are actually on. The calculator matches a grid's
      // level_name against this column as an exact string — no parsing, no
      // normalising — and a miss returns no row, so the agent is paid
      // nothing rather than paid wrongly. That failure is invisible at the
      // point it is caused, which is here, so the editor gets to warn.
      supabase
        .from("agent_commission_levels")
        .select("commission_level")
        .not("commission_level", "is", null)
        .limit(5000),
    ]);

    const nameById = new Map<string, string>((carriers ?? []).map((c: any) => [c.id, c.name]));

    // Group by carrier, and flag which carriers the agency has customized.
    const byCarrier = new Map<string, { carrier_id: string; carrier_name: string; rows: any[]; owned: boolean }>();
    for (const g of grids ?? []) {
      const key = g.carrier_id ?? "unknown";
      if (!byCarrier.has(key)) {
        byCarrier.set(key, {
          carrier_id: key,
          carrier_name: nameById.get(key) ?? "Unknown carrier",
          rows: [],
          owned: false,
        });
      }
      const entry = byCarrier.get(key)!;
      entry.rows.push(g);
      if (g.organization_id) entry.owned = true;
    }

    const assignedLevels = [
      ...new Set(
        ((assigned ?? []) as any[])
          .map((r) => String(r.commission_level ?? "").trim())
          .filter(Boolean),
      ),
    ].sort();

    return {
      assignedLevels,
      carriers: (carriers ?? []) as { id: string; name: string }[],
      grids: Array.from(byCarrier.values()).sort((a, b) => a.carrier_name.localeCompare(b.carrier_name)),
    };
  });

export const listGridUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("commission_grid_uploads")
      .select("id, carrier_id, carrier_name, file_name, status, row_count, extracted, error, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { uploads: [] };
    return { uploads: data ?? [] };
  });

// ── AI extraction ────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You read insurance carrier commission grids and return structured data.

Return JSON: {"rows":[{"product_name","level_name","year_1_pct","years_2_5_pct","years_6_plus_pct","age_group_min","age_group_max"}],"carrier_name":string|null,"confidence":0..1,"notes":string}

Rules:
- Percentages as numbers, not strings. 110% -> 110. "LOA" or a blank cell -> 0.
- level_name is the contract level column header, e.g. "Agent", "SA", "GA", "MGA", "110".
- product_name is the row label, e.g. "Final Expense", "Term 20", "GUL".
- Age bands only when the grid actually splits by age; otherwise null.
- years_2_5_pct / years_6_plus_pct null when the grid does not show renewals.
- Return every product/level pair you can read. Do not invent rows.
- confidence reflects how legible the document was. Be honest — a blurry photo
  should score low.`;

export const extractGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      // data: URI of a page image. PDFs are rasterized client-side first.
      image: z.string().min(32).max(12_000_000).nullable().optional(),
      /**
       * The rest of the pages, when there are any.
       *
       * This used to be one image, because the client only ever rendered page
       * one — and a rate card that ran to three pages was extracted from the
       * first, then saved with a mode that deletes every product it did not
       * mention. The pages the extraction never saw disappeared.
       */
      images: z.array(z.string().min(32).max(12_000_000)).max(8).nullable().optional(),
      /**
       * Spreadsheet or CSV contents, when the grid arrived as a table rather
       * than a picture of one. Rate cards come both ways, and a workbook sent
       * as an image is not readable at all.
       */
      text: z.string().max(200_000).nullable().optional(),
      file_name: z.string().max(255),
      carrier_id: z.string().uuid().nullable().optional(),
      carrier_name: z.string().max(120).nullable().optional(),
    }).refine((v) => Boolean(v.image) || (v.images?.length ?? 0) > 0 || Boolean(v.text), {
      message: "Nothing readable in that file",
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const pages = data.images?.length ? data.images : data.image ? [data.image] : [];

    const { data: upload } = await supabase
      .from("commission_grid_uploads")
      .insert({
        carrier_id: data.carrier_id ?? null,
        carrier_name: data.carrier_name ?? null,
        file_name: data.file_name,
        status: "extracting",
        uploaded_by: userId,
      })
      .select("id")
      .single();

    try {
      const out = await callAiJson<{
        rows: GridRow[]; carrier_name: string | null; confidence: number; notes: string;
      }>({
        maxTokens: 4000,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: pages.length > 1
                  ? `Extract the commission grid from this ${pages.length}-page document. Products continue across pages; return every one you find.`
                  : "Extract the commission grid from this document.",
              },
              ...(data.text ? [{ type: "text" as const, text: data.text.slice(0, 150_000) }] : []),
              ...pages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          },
        ],
      });

      // Validate row by row and keep what parses. A grid with three unreadable
      // rows is still worth showing; failing the whole page is not helpful.
      const rows: GridRow[] = [];
      for (const r of out.rows ?? []) {
        const parsed = RowSchema.safeParse(r);
        if (parsed.success) {
          rows.push({
            ...parsed.data,
            years_2_5_pct: parsed.data.years_2_5_pct ?? null,
            years_6_plus_pct: parsed.data.years_6_plus_pct ?? null,
            age_group_min: parsed.data.age_group_min ?? null,
            age_group_max: parsed.data.age_group_max ?? null,
          });
        }
      }

      await supabase.from("commission_grid_uploads").update({
        status: rows.length ? "review" : "failed",
        extracted: { rows, notes: out.notes ?? null },
        row_count: rows.length,
        carrier_name: data.carrier_name ?? out.carrier_name ?? null,
        error: rows.length ? null : "Couldn't read any rows from that file.",
        updated_at: new Date().toISOString(),
      }).eq("id", upload.id);

      return {
        upload_id: upload.id as string,
        rows,
        carrier_name: out.carrier_name ?? null,
        confidence: out.confidence ?? null,
        notes: out.notes ?? null,
      };
    } catch (e: any) {
      await supabase.from("commission_grid_uploads").update({
        status: "failed",
        error: e?.message ?? "Extraction failed",
        updated_at: new Date().toISOString(),
      }).eq("id", upload.id);
      throw new Error(e?.message ?? "Couldn't read that file");
    }
  });

// ── Apply / manual entry ─────────────────────────────────────────────────────

/**
 * Looser than `GridRow`: the renewal bands and age bands are genuinely
 * optional, and the Zod schema yields `undefined` for an omitted key rather
 * than the `null` a fully-populated row carries. Both mean "not given".
 */
export type WriteGridRow = {
  product_name: string;
  level_name: string;
  year_1_pct: number;
  years_2_5_pct?: number | null;
  years_6_plus_pct?: number | null;
  age_group_min?: number | null;
  age_group_max?: number | null;
};

export type WriteGridOptions = {
  carrier_id: string;
  rows: WriteGridRow[];
  source?: "manual" | "ai_extracted";
  effective_date?: string | null;
  /**
   * `replace` clears the carrier and writes what you sent — right for the
   * matrix editor, where the screen *is* the whole grid.
   *
   * `merge` touches only the products in this payload. Right for anything
   * extracted from a document, because a document is rarely the whole grid: a
   * rate card that runs to three pages, or a carrier notice covering two
   * products, would otherwise delete every product it failed to mention.
   */
  mode?: "replace" | "merge";
};

/**
 * The one place grid rows are written.
 *
 * A plain function rather than a server function, because Import needs the
 * same behaviour and calling one server function from another means hoping its
 * middleware still has a request to read. Two copies of "how a grid is saved"
 * is exactly the divergence this codebase already has too much of.
 *
 * The agency's own rows are what change; the shared defaults
 * (`organization_id is null`) are left alone so an agency can always fall back
 * to them.
 */
export async function writeGridRows(
  supabase: any,
  userId: string,
  orgId: string,
  opts: WriteGridOptions,
): Promise<{ count: number }> {
  const mode = opts.mode ?? "replace";

  if (mode === "replace") {
    // Everything this agency holds for the carrier goes, and what you sent
    // takes its place. Correct when the caller is showing the whole grid — a
    // partial overwrite would leave stale levels behind and skew the forecast.
    const { error } = await supabase
      .from("commission_grids")
      .delete()
      .eq("carrier_id", opts.carrier_id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
  } else {
    // Only the products named in this payload. A document is rarely the whole
    // grid, and `replace` on a partial extraction deletes every product the
    // document did not happen to mention — silently, showing up later as a
    // commission forecast that is quietly wrong.
    const products = [...new Set(opts.rows.map((r) => r.product_name))];
    for (let i = 0; i < products.length; i += 100) {
      const { error } = await supabase
        .from("commission_grids")
        .delete()
        .eq("carrier_id", opts.carrier_id)
        .eq("organization_id", orgId)
        .in("product_name", products.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
  }

  const rows = opts.rows.map((r) => ({
    carrier_id: opts.carrier_id,
    organization_id: orgId,
    product_name: r.product_name,
    level_name: r.level_name,
    year_1_pct: r.year_1_pct,
    years_2_5_pct: r.years_2_5_pct ?? null,
    years_6_plus_pct: r.years_6_plus_pct ?? null,
    age_group_min: r.age_group_min ?? null,
    age_group_max: r.age_group_max ?? null,
    source: opts.source ?? "manual",
    effective_date: opts.effective_date ?? null,
    created_by: userId,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("commission_grids").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  return { count: rows.length };
}

/** The agency's own organization, or a refusal a person can act on. */
export async function requireOrgId(supabase: any, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  if (!profile?.organization_id) throw new Error("No organization on your account");
  return profile.organization_id;
}

/** Write grid rows for a carrier. See `writeGridRows` for the semantics. */
export const saveGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      carrier_id: z.string().uuid(),
      rows: z.array(RowSchema).min(1).max(2000),
      source: z.enum(["manual", "ai_extracted"]).default("manual"),
      upload_id: z.string().uuid().nullable().optional(),
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      /**
       * `replace` clears the carrier and writes what you sent — right for the
       * matrix editor, where the screen *is* the whole grid.
       *
       * `merge` touches only the products in this payload. Right for anything
       * extracted from a document, because a document is rarely the whole
       * grid: a rate card that runs to three pages, or a carrier notice
       * covering two products, would otherwise delete every product it failed
       * to mention.
       */
      mode: z.enum(["replace", "merge"]).default("replace"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await requireOrgId(supabase, userId);

    const { count } = await writeGridRows(supabase, userId, orgId, {
      carrier_id: data.carrier_id,
      rows: data.rows,
      source: data.source,
      effective_date: data.effective_date ?? null,
      mode: data.mode,
    });

    if (data.upload_id) {
      await supabase.from("commission_grid_uploads")
        .update({ status: "applied", carrier_id: data.carrier_id, updated_at: new Date().toISOString() })
        .eq("id", data.upload_id);
    }

    return { ok: true, count };
  });

export const deleteMyGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ carrier_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization on your account");

    const { error } = await supabase
      .from("commission_grids")
      .delete()
      .eq("carrier_id", data.carrier_id)
      .eq("organization_id", profile.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
