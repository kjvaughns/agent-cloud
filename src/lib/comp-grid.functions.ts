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

    const [{ data: grids }, { data: carriers }] = await Promise.all([
      supabase
        .from("commission_grids")
        .select("id, carrier_id, organization_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct, age_group_min, age_group_max, source, effective_date")
        .limit(5000),
      supabase.from("carriers").select("id, name").order("name"),
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

    return {
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

export const extractGridFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      // data: URI of the page image. PDFs are rasterized client-side first.
      image: z.string().min(32).max(12_000_000),
      file_name: z.string().max(255),
      carrier_id: z.string().uuid().nullable().optional(),
      carrier_name: z.string().max(120).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

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
              { type: "text", text: "Extract the commission grid from this document." },
              { type: "image_url", image_url: { url: data.image } },
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
 * Write grid rows for a carrier. Replaces the agency's own rows for that
 * carrier; the shared defaults (organization_id null) are left alone so an
 * agency can always fall back to them.
 */
export const saveGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      carrier_id: z.string().uuid(),
      rows: z.array(RowSchema).min(1).max(2000),
      source: z.enum(["manual", "ai_extracted"]).default("manual"),
      upload_id: z.string().uuid().nullable().optional(),
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("No organization on your account");

    // Replace this agency's rows for the carrier, in place of merging — a
    // partial overwrite would leave stale levels behind and silently skew the
    // forecast.
    const { error: delErr } = await supabase
      .from("commission_grids")
      .delete()
      .eq("carrier_id", data.carrier_id)
      .eq("organization_id", orgId);
    if (delErr) throw new Error(delErr.message);

    const rows = data.rows.map((r) => ({
      carrier_id: data.carrier_id,
      organization_id: orgId,
      product_name: r.product_name,
      level_name: r.level_name,
      year_1_pct: r.year_1_pct,
      years_2_5_pct: r.years_2_5_pct ?? null,
      years_6_plus_pct: r.years_6_plus_pct ?? null,
      age_group_min: r.age_group_min ?? null,
      age_group_max: r.age_group_max ?? null,
      source: data.source,
      effective_date: data.effective_date ?? null,
      created_by: userId,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("commission_grids").insert(rows.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    if (data.upload_id) {
      await supabase.from("commission_grid_uploads")
        .update({ status: "applied", carrier_id: data.carrier_id, updated_at: new Date().toISOString() })
        .eq("id", data.upload_id);
    }

    return { ok: true, count: rows.length };
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
