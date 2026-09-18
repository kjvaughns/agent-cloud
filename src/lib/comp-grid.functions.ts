import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJsonFull } from "@/lib/ai-gateway";
import { assertCanEditGrids } from "@/lib/settings/tab-guard.server";
import { preferOwnGridRows } from "@/lib/compensation/own-grid";

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
  /** Authored position of the product row in the editor. Absent on legacy rows. */
  sort_order?: number | null;
  /** Authored position of the level column. Absent on legacy rows. */
  level_sort?: number | null;
  /** Came out of "Fill the rest" and was never touched by a person. */
  is_estimated?: boolean;
};

const RowSchema = z.object({
  product_name: z.string().trim().min(1).max(120),
  level_name: z.string().trim().min(1).max(60),
  year_1_pct: z.number().min(0).max(300),
  years_2_5_pct: z.number().min(0).max(300).nullable().optional(),
  years_6_plus_pct: z.number().min(0).max(300).nullable().optional(),
  age_group_min: z.number().int().min(0).max(120).nullable().optional(),
  age_group_max: z.number().int().min(0).max(120).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).nullable().optional(),
  level_sort: z.number().int().min(0).max(9999).nullable().optional(),
  is_estimated: z.boolean().optional(),
});

// ── Read ─────────────────────────────────────────────────────────────────────

export const listMyGrids = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;

    const [{ data: grids }, { data: carriers }, { data: assigned }] = await Promise.all([
      // `*` rather than a column list: sort_order and level_sort arrive with a
      // hand-applied migration, and PostgREST fails a whole select that names
      // a column the table does not have yet. There was also no .order() here
      // at all, so the editor loaded rows in Postgres heap order and product
      // order could shift between reloads; ordering happens below, in code,
      // where a missing column reads as undefined instead of failing.
      supabase.from("commission_grids").select("*").limit(5000),
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
    // Own rows shadow the shared defaults, otherwise a carrier that began as a
    // shared grid shows both sets after the first save and the edit looks lost.
    for (const g of preferOwnGridRows((grids ?? []) as any[])) {
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

    // Authored order first, then name, so a grid arranged in the editor comes
    // back arranged the same way and one without the columns yet stays stable
    // alphabetically instead of shifting with the query plan.
    for (const entry of byCarrier.values()) {
      entry.rows.sort((a: any, b: any) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        String(a.product_name).localeCompare(String(b.product_name)) ||
        (a.age_group_min ?? -1) - (b.age_group_min ?? -1) ||
        (a.level_sort ?? Number.MAX_SAFE_INTEGER) - (b.level_sort ?? Number.MAX_SAFE_INTEGER) ||
        String(a.level_name).localeCompare(String(b.level_name)));
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

/**
 * One record per PRODUCT, carrying a rates map keyed by level.
 *
 * It used to be one record per cell, which is how a 15-column grid stopped
 * being readable: 11 products x 15 levels is ~165 records, the reply ran out
 * of tokens partway through, and what survived was the first level column. The
 * owner saw "it only read one column". The same grid in this shape is ~11
 * records and fits with room to spare. Expanded back to per-level rows below,
 * so nothing downstream — storage, editor, calculator — changes.
 */
const EXTRACT_SYSTEM = `You read insurance carrier commission grids and return structured data.

Return JSON:
{"levels":["105","100",...],
 "products":[{"product_name":"Senior Choice (FE)","age_group_min":null,"age_group_max":null,
              "rates":{"105":105,"100":100},
              "renewals_2_5":{"105":10},"renewals_6_plus":{"105":2}}],
 "carrier_name":string|null,"confidence":0..1,"notes":string}

Rules:
- "levels" is EVERY contract level column header in the table, left to right,
  exactly as printed — e.g. "Agent", "SA", "GA", "MGA", "110", "105", "LOA".
  List them all even if you cannot read every cell underneath.
- For each product, "rates" maps EVERY level header to that product's first
  year percentage. Do not stop after the first few columns. Do not omit a
  column because its value repeats.
- Percentages as numbers, not strings. 110% -> 110. "LOA", "-", "N/A" or a
  blank cell -> 0.
- product_name is the row label, e.g. "Final Expense", "Term 20", "GUL".
- Age bands only when the grid actually splits by age; otherwise null. When a
  product lists different rates by age range — "Ages 18-59: 54%, Ages 60-80:
  90%" — return one product entry PER age range with age_group_min and
  age_group_max set. Never flatten age-banded rates into one entry.
- "renewals_2_5" / "renewals_6_plus" only when the grid shows renewal rates;
  omit them entirely otherwise.
- Read every product row and every level column. Do not invent any.
- confidence reflects how legible the document was. Be honest — a blurry photo
  should score low.`;

const RateMap = z.record(z.string(), z.union([z.number(), z.string(), z.null()]));

const CompactSchema = z.object({
  levels: z.array(z.string()).nullable().optional(),
  products: z.array(z.object({
    product_name: z.string().trim().min(1).max(120),
    age_group_min: z.number().nullable().optional(),
    age_group_max: z.number().nullable().optional(),
    rates: RateMap.nullable().optional(),
    renewals_2_5: RateMap.nullable().optional(),
    renewals_6_plus: RateMap.nullable().optional(),
  })).nullable().optional(),
  // Older shape, kept so a model that answers per-cell is still understood.
  rows: z.array(z.any()).nullable().optional(),
  carrier_name: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type Compact = z.infer<typeof CompactSchema>;

/** "105%" / "-" / "LOA" / 105 → 105 / 0. Null when there is nothing to read. */
function toPct(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return clampPct(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^(loa|n\/?a|-+|—|none)$/i.test(s)) return 0;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  return clampPct(Number(m[0]));
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(300, n));
}

/** Compact answer → the per-level rows the rest of the app already speaks. */
function expandCompact(out: Compact): GridRow[] {
  const rows: GridRow[] = [];
  const levelOrder = (out.levels ?? []).map((l) => String(l).trim()).filter(Boolean);

  (out.products ?? []).forEach((p, productIndex) => {
    const rates = p.rates ?? {};
    for (const [rawLevel, rawPct] of Object.entries(rates)) {
      const level = String(rawLevel).trim();
      const pct = toPct(rawPct);
      if (!level || pct == null) continue;
      const levelSort = levelOrder.indexOf(level);
      rows.push({
        product_name: p.product_name.trim(),
        level_name: level.slice(0, 60),
        year_1_pct: pct,
        years_2_5_pct: toPct(p.renewals_2_5?.[rawLevel]),
        years_6_plus_pct: toPct(p.renewals_6_plus?.[rawLevel]),
        age_group_min: p.age_group_min ?? null,
        age_group_max: p.age_group_max ?? null,
        sort_order: productIndex,
        level_sort: levelSort >= 0 ? levelSort : null,
      });
    }
  });

  // A model that answered in the old per-cell shape still lands here.
  for (const r of out.rows ?? []) {
    const parsed = RowSchema.safeParse(r);
    if (!parsed.success) continue;
    rows.push({
      ...parsed.data,
      years_2_5_pct: parsed.data.years_2_5_pct ?? null,
      years_6_plus_pct: parsed.data.years_6_plus_pct ?? null,
      age_group_min: parsed.data.age_group_min ?? null,
      age_group_max: parsed.data.age_group_max ?? null,
    });
  }

  return rows;
}

/** Peel a one-element array or a single wrapper key off the answer. */
function unwrapAnswer(value: unknown): unknown {
  let v: any = value;
  for (let i = 0; i < 3; i++) {
    if (Array.isArray(v) && v.length === 1) { v = v[0]; continue; }
    if (v && typeof v === "object" && !("products" in v) && !("rows" in v) && !("levels" in v)) {
      const keys = Object.keys(v);
      if (keys.length === 1 && v[keys[0]] && typeof v[keys[0]] === "object") { v = v[keys[0]]; continue; }
    }
    break;
  }
  return v;
}

/** Levels the answer actually filled in, across every product. */
function coveredLevels(out: Compact): Set<string> {
  const seen = new Set<string>();
  for (const p of out.products ?? []) {
    for (const [level, v] of Object.entries(p.rates ?? {})) {
      if (toPct(v) != null) seen.add(String(level).trim());
    }
  }
  for (const r of out.rows ?? []) {
    const name = String((r as any)?.level_name ?? "").trim();
    if (name) seen.add(name);
  }
  return seen;
}

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
      /** One read. `only` restricts it to a group of level columns. */
      const read = async (only: string[] | null) => {
        const ask = only?.length
          ? `Read ONLY these level columns: ${only.join(", ")}. Return every product row with a rate for each of those columns, and list those columns in "levels".`
          : pages.length > 1
            ? `Extract the commission grid from this ${pages.length}-page document. Products continue across pages; return every one you find, with every level column.`
            : "Extract the commission grid from this document, with every level column.";

        const { value, truncated } = await callAiJsonFull<unknown>({
          // The reply carries one record per product now rather than one per
          // cell, so this budget is generous; the model also spends part of it
          // thinking, which is what made 8000 run out on a wide grid.
          maxTokens: 16000,
          // Transcription, not writing.
          temperature: 0,
          messages: [
            { role: "system", content: EXTRACT_SYSTEM },
            {
              role: "user",
              content: [
                { type: "text", text: ask },
                ...(data.text ? [{ type: "text" as const, text: data.text.slice(0, 150_000) }] : []),
                ...pages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
              ],
            },
          ],
        });
        // Models sometimes wrap the object in a one-element array, or under a
        // key like "grid". Unwrap before validating rather than calling a
        // perfectly good answer malformed.
        const unwrapped = unwrapAnswer(value);
        const parsed = CompactSchema.safeParse(unwrapped);
        if (!parsed.success) throw new Error("Couldn't make sense of that grid — try a clearer copy.");
        return { out: parsed.data, truncated };
      };

      const first = await read(null);
      const merged: Compact = first.out;

      // Every level column the document shows, against the ones that actually
      // came back. A wide grid whose answer stopped early used to be reported
      // as a complete read; now the missing columns are re-read in groups.
      const headerLevels = (merged.levels ?? []).map((l) => String(l).trim()).filter(Boolean);
      let missing = headerLevels.filter((l) => !coveredLevels(merged).has(l));

      if (first.truncated || missing.length) {
        const groups: string[][] = [];
        const todo = missing.length ? missing : headerLevels;
        for (let i = 0; i < todo.length; i += 5) groups.push(todo.slice(i, i + 5));

        for (const group of groups.slice(0, 4)) {
          try {
            const extra = await read(group);
            const byName = new Map(
              (merged.products ?? []).map((p) => [`${p.product_name.trim().toLowerCase()}|${p.age_group_min ?? ""}|${p.age_group_max ?? ""}`, p]),
            );
            for (const p of extra.out.products ?? []) {
              const key = `${p.product_name.trim().toLowerCase()}|${p.age_group_min ?? ""}|${p.age_group_max ?? ""}`;
              const existing = byName.get(key);
              if (existing) {
                existing.rates = { ...(existing.rates ?? {}), ...(p.rates ?? {}) };
                if (p.renewals_2_5) existing.renewals_2_5 = { ...(existing.renewals_2_5 ?? {}), ...p.renewals_2_5 };
                if (p.renewals_6_plus) existing.renewals_6_plus = { ...(existing.renewals_6_plus ?? {}), ...p.renewals_6_plus };
              } else {
                merged.products = [...(merged.products ?? []), p];
                byName.set(key, p);
              }
            }
          } catch {
            // A failed group is reported as a missing column below rather than
            // failing the whole read — the columns already in hand are useful.
          }
        }
        missing = headerLevels.filter((l) => !coveredLevels(merged).has(l));
      }

      const rows = expandCompact(merged);

      const notes = [
        merged.notes ?? null,
        missing.length
          ? `Couldn't read ${missing.length === 1 ? "the level column" : "these level columns"} ${missing.join(", ")} — check ${missing.length === 1 ? "it" : "them"} by hand.`
          : null,
      ].filter(Boolean).join(" ") || null;

      await supabase.from("commission_grid_uploads").update({
        status: rows.length ? "review" : "failed",
        extracted: { rows, notes },
        row_count: rows.length,
        carrier_name: data.carrier_name ?? merged.carrier_name ?? null,
        error: rows.length ? null : "Couldn't read any rows from that file.",
        updated_at: new Date().toISOString(),
      }).eq("id", upload.id);

      return {
        upload_id: upload.id as string,
        rows,
        carrier_name: merged.carrier_name ?? null,
        confidence: merged.confidence ?? null,
        notes,
        missing_levels: missing,
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
  sort_order?: number | null;
  level_sort?: number | null;
  is_estimated?: boolean;
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
    // Only what this payload actually redefines. This used to delete by
    // product_name alone, which meant a document carrying level B's rates
    // deleted level A's rows for every product both levels share — the normal
    // case, since a carrier's levels cover the same product list. The hazard
    // was documented in import-router.ts and worked around by Import batching
    // a carrier's levels into one call; now the predicate itself is right:
    // delete per (level, products), so a level the payload never mentions is
    // never touched. Age bands ride along — rewriting a (product, level)
    // replaces all its bands with the payload's, which is what "this document
    // redefines these cells" means.
    const byLevel = new Map<string, string[]>();
    for (const r of opts.rows) {
      const list = byLevel.get(r.level_name) ?? [];
      if (!list.includes(r.product_name)) list.push(r.product_name);
      byLevel.set(r.level_name, list);
    }
    for (const [level, products] of byLevel) {
      for (let i = 0; i < products.length; i += 100) {
        const { error } = await supabase
          .from("commission_grids")
          .delete()
          .eq("carrier_id", opts.carrier_id)
          .eq("organization_id", orgId)
          .eq("level_name", level)
          .in("product_name", products.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
    }
  }

  const toRow = (r: WriteGridRow, withPending: boolean) => ({
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
    // Outside the pending group: the column has existed since 20260606 and was
    // simply never written — "Fill the rest" guesses saved as carrier fact.
    is_estimated: r.is_estimated ?? false,
    ...(withPending
      ? { sort_order: r.sort_order ?? null, level_sort: r.level_sort ?? null }
      : {}),
  });

  // 20260815070000 made (org, carrier, product, level, age band, state, risk)
  // unique, so a payload that names the same cell twice — the matrix editor
  // sending a duplicated column, a document extracted with a repeated row —
  // now violates commission_grids_org_rule_uniq instead of quietly storing two
  // conflicting rates. Last one wins, which matches how the editor reads: the
  // value furthest down the screen is the one the person just typed.
  const seen = new Map<string, WriteGridRow>();
  for (const r of opts.rows) {
    const key = [
      r.product_name.trim().toLowerCase(),
      (r.level_name ?? "").trim().toLowerCase(),
      r.age_group_min ?? -1,
      r.age_group_max ?? -1,
    ].join("|");
    seen.set(key, r);
  }
  const rows = Array.from(seen.values());

  // sort_order / level_sort arrive with a hand-applied migration and this code
  // ships first. PostgREST rejects a whole insert naming an unknown column
  // (PGRST204), so the batch retries without the pending fields rather than
  // refusing to save any grid at all in the window.
  let dropPending = false;
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    if (!dropPending) {
      const { error } = await supabase.from("commission_grids")
        .insert(slice.map((r) => toRow(r, true)));
      if (!error) continue;
      if (error.code !== "PGRST204" && error.code !== "42703") throw new Error(error.message);
      dropPending = true;
    }
    const { error } = await supabase.from("commission_grids")
      .insert(slice.map((r) => toRow(r, false)));
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
    // Hiding the editor is not enough: this endpoint rewrites what every agent
    // on this carrier is paid, including on deals already written against it.
    await assertCanEditGrids(userId, orgId);

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
