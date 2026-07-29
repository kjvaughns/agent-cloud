import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Commission reconciliation.
 *
 * commission_schedule holds what the platform EXPECTS to be paid, derived from
 * posted deals by the JS commission engine. This module records what a carrier
 * ACTUALLY paid and reports the difference.
 *
 * It never writes to commission_schedule. commission_calculator.ts stays the
 * single source of truth for expected commission, and the disabled
 * trg_generate_commission_schedule trigger stays disabled — reconciliation is
 * a reporting layer over both, not a third writer.
 */

export type StatementLine = {
  id: string;
  policy_number: string | null;
  insured_name: string | null;
  agent_name: string | null;
  product: string | null;
  paid_amount: number;
  paid_date: string | null;
  expected_amount: number | null;
  variance: number | null;
  match_status: "unmatched" | "matched" | "variance" | "unexpected" | "disputed" | "resolved";
  matched_policy_id: string | null;
  note: string | null;
};

export const listStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("commission_statements")
      .select("id, carrier_name, carrier_id, statement_date, period_start, period_end, file_name, stated_total, parsed_total, status, created_at")
      .order("statement_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { statements: data ?? [] };
  });

const LineSchema = z.object({
  policy_number: z.string().trim().max(80).nullable().optional(),
  insured_name: z.string().trim().max(160).nullable().optional(),
  agent_name: z.string().trim().max(160).nullable().optional(),
  product: z.string().trim().max(120).nullable().optional(),
  paid_amount: z.number(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const createStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      carrier_id: z.string().uuid().nullable().optional(),
      carrier_name: z.string().trim().min(1).max(120),
      statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      file_name: z.string().max(255).nullable().optional(),
      stated_total: z.number().nullable().optional(),
      lines: z.array(LineSchema).min(1).max(5000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: stmt, error } = await supabase
      .from("commission_statements")
      .insert({
        carrier_id: data.carrier_id ?? null,
        carrier_name: data.carrier_name,
        statement_date: data.statement_date,
        period_start: data.period_start ?? null,
        period_end: data.period_end ?? null,
        file_name: data.file_name ?? null,
        stated_total: data.stated_total ?? null,
        uploaded_by: userId,
      })
      .select("id, organization_id")
      .single();
    if (error) throw new Error(error.message);

    const rows = data.lines.map((l) => ({
      statement_id: stmt.id,
      organization_id: stmt.organization_id,
      policy_number: l.policy_number ?? null,
      insured_name: l.insured_name ?? null,
      agent_name: l.agent_name ?? null,
      product: l.product ?? null,
      paid_amount: l.paid_amount,
      paid_date: l.paid_date ?? null,
    }));

    // Chunked so a large statement doesn't exceed the request limit.
    for (let i = 0; i < rows.length; i += 500) {
      const { error: lineErr } = await supabase
        .from("commission_statement_lines")
        .insert(rows.slice(i, i + 500));
      if (lineErr) throw new Error(lineErr.message);
    }

    return { statement_id: stmt.id as string, lines: rows.length };
  });

/** Match the statement's lines against expected commission. */
export const reconcileStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ statement_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: result, error } = await supabase.rpc("reconcile_statement", {
      _statement_id: data.statement_id,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(result) ? result[0] : result;
    return {
      matched: Number(r?.matched ?? 0),
      variance: Number(r?.variance_count ?? 0),
      unmatched: Number(r?.unmatched ?? 0),
    };
  });

export const getStatementDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      statement_id: z.string().uuid(),
      filter: z.enum(["all", "variance", "unmatched", "matched"]).default("all"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    const { data: stmt, error } = await supabase
      .from("commission_statements")
      .select("id, carrier_name, statement_date, period_start, period_end, stated_total, parsed_total, status, file_name")
      .eq("id", data.statement_id)
      .single();
    if (error) throw new Error("Statement not found or access denied.");

    let q = supabase
      .from("commission_statement_lines")
      .select("id, policy_number, insured_name, agent_name, product, paid_amount, paid_date, expected_amount, variance, match_status, matched_policy_id, note")
      .eq("statement_id", data.statement_id)
      .limit(5000);

    if (data.filter === "variance") q = q.eq("match_status", "variance");
    if (data.filter === "matched") q = q.eq("match_status", "matched");
    if (data.filter === "unmatched") q = q.in("match_status", ["unmatched", "unexpected"]);

    const { data: lines } = await q.order("variance", { ascending: true, nullsFirst: false });
    const all = (lines ?? []) as StatementLine[];

    // Totals come from the full statement, not the filtered view.
    const { data: totals } = await supabase
      .from("commission_statement_lines")
      .select("paid_amount, expected_amount, variance, match_status")
      .eq("statement_id", data.statement_id);

    const t = totals ?? [];
    return {
      statement: stmt,
      lines: all,
      summary: {
        lineCount: t.length,
        paid: t.reduce((a: number, l: any) => a + Number(l.paid_amount ?? 0), 0),
        expected: t.reduce((a: number, l: any) => a + Number(l.expected_amount ?? 0), 0),
        netVariance: t.reduce((a: number, l: any) => a + Number(l.variance ?? 0), 0),
        matched: t.filter((l: any) => l.match_status === "matched").length,
        varianceCount: t.filter((l: any) => l.match_status === "variance").length,
        unmatched: t.filter((l: any) => ["unmatched", "unexpected"].includes(l.match_status)).length,
      },
    };
  });

export const updateStatementLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      match_status: z.enum(["unmatched", "matched", "variance", "unexpected", "disputed", "resolved"]).optional(),
      note: z.string().trim().max(500).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { id, ...patch } = data;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return { ok: true };
    const { error } = await supabase.from("commission_statement_lines").update(clean).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
