import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai-gateway";

type Ctx = { supabase: any; userId: string };

/**
 * Bulk document intake.
 *
 * An owner drops in a pile of carrier reports and the platform reads each one,
 * says what it is, and proposes what to do with it.
 *
 * Nothing is applied automatically. Every file lands in needs_review and a
 * human confirms. An AI misread that silently rewrote policy statuses or
 * commission rows would be far more expensive than the minute it takes to
 * glance at a list — so the AI's job here is to sort and summarize, not to
 * act.
 */

export type IntakeDoc = {
  id: string;
  file_name: string;
  status: "queued" | "analyzing" | "needs_review" | "applied" | "dismissed" | "failed";
  doc_type: string | null;
  carrier_name: string | null;
  period_label: string | null;
  summary: string | null;
  suggested_action: string | null;
  confidence: number | null;
  error: string | null;
  created_at: string;
};

export const DOC_TYPES = [
  "commission_statement",
  "policy_report",
  "lapse_report",
  "production_report",
  "commission_grid",
  "carrier_notice",
  "other",
] as const;

export const DOC_TYPE_LABEL: Record<string, string> = {
  commission_statement: "Commission statement",
  policy_report: "Policy / book report",
  lapse_report: "Lapse & cancellation report",
  production_report: "Production report",
  commission_grid: "Commission grid",
  carrier_notice: "Carrier notice",
  other: "Unrecognized",
};

const ANALYZE_SYSTEM = `You triage documents an insurance agency receives from carriers.

Return JSON:
{"doc_type": one of ${DOC_TYPES.join("|")},
 "carrier_name": string|null,
 "period_label": string|null,
 "summary": string,
 "suggested_action": string,
 "key_figures": {"total_amount": number|null, "row_count": number|null},
 "confidence": 0..1}

Rules:
- summary: two sentences at most, plain language, what this document is and what it contains.
- suggested_action: what the agency should do with it, phrased as an instruction.
- If you cannot tell what it is, use "other" and say so plainly rather than guessing.
- confidence should be low for an illegible or ambiguous document. Be honest.`;

/** Start a batch. Files are recorded first so nothing is lost if analysis fails. */
export const createIntakeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      files: z.array(z.object({
        file_name: z.string().min(1).max(255),
        mime_type: z.string().max(120).nullable().optional(),
        size_bytes: z.number().int().nonnegative().nullable().optional(),
      })).min(1).max(100),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const batchId = crypto.randomUUID();
    const rows = data.files.map((f) => ({
      batch_id: batchId,
      file_name: f.file_name,
      mime_type: f.mime_type ?? null,
      size_bytes: f.size_bytes ?? null,
      status: "queued",
      uploaded_by: userId,
    }));

    const { data: inserted, error } = await supabase
      .from("document_intake")
      .insert(rows)
      .select("id, file_name, status, created_at");
    if (error) throw new Error(error.message);

    return { batch_id: batchId, documents: inserted ?? [] };
  });

/**
 * Analyze one document. Called per file so a long batch reports progress as it
 * goes rather than blocking on the whole set, and one bad file cannot sink the
 * others.
 */
export const analyzeIntakeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      // Either an image data URI (scans, photos) or extracted text (CSV, text
      // PDF). Whichever the browser could produce.
      image: z.string().max(12_000_000).nullable().optional(),
      text: z.string().max(200_000).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    await supabase.from("document_intake")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", data.id);

    try {
      if (!data.image && !data.text) throw new Error("Nothing readable in that file");

      const content = data.image
        ? [
            { type: "text" as const, text: "Identify and summarize this carrier document." },
            { type: "image_url" as const, image_url: { url: data.image } },
          ]
        : `Identify and summarize this carrier document.\n\n${(data.text ?? "").slice(0, 60_000)}`;

      const out = await callAiJson<{
        doc_type: string; carrier_name: string | null; period_label: string | null;
        summary: string; suggested_action: string;
        key_figures: { total_amount: number | null; row_count: number | null };
        confidence: number;
      }>({
        maxTokens: 900,
        messages: [
          { role: "system", content: ANALYZE_SYSTEM },
          { role: "user", content },
        ],
      });

      const docType = (DOC_TYPES as readonly string[]).includes(out.doc_type) ? out.doc_type : "other";

      await supabase.from("document_intake").update({
        status: "needs_review",
        doc_type: docType,
        carrier_name: out.carrier_name ?? null,
        period_label: out.period_label ?? null,
        summary: out.summary ?? null,
        suggested_action: out.suggested_action ?? null,
        extracted: out.key_figures ?? null,
        confidence: out.confidence ?? null,
        error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);

      return { ok: true, doc_type: docType, summary: out.summary };
    } catch (e: any) {
      await supabase.from("document_intake").update({
        status: "failed",
        error: e?.message ?? "Analysis failed",
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      // Resolved, not thrown: one unreadable file should not fail the batch.
      return { ok: false, error: e?.message ?? "Analysis failed" };
    }
  });

export const listIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      batch_id: z.string().uuid().nullable().optional(),
      status: z.enum(["all", "needs_review", "applied", "dismissed", "failed"]).default("all"),
    }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let q = supabase
      .from("document_intake")
      .select("id, batch_id, file_name, status, doc_type, carrier_name, period_label, summary, suggested_action, extracted, confidence, error, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (data.batch_id) q = q.eq("batch_id", data.batch_id);
    if (data.status !== "all") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) return { documents: [] };
    return { documents: (rows ?? []) as IntakeDoc[] };
  });

export const setIntakeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
      status: z.enum(["applied", "dismissed", "needs_review"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("document_intake").update({
      status: data.status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });
