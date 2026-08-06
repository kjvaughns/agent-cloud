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
    const { supabase, userId } = context as Ctx;
    const { data: result, error } = await supabase.rpc("reconcile_statement", {
      _statement_id: data.statement_id,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(result) ? result[0] : result;
    const out = {
      matched: Number(r?.matched ?? 0),
      variance: Number(r?.variance_count ?? 0),
      unmatched: Number(r?.unmatched ?? 0),
    };

    const { data: stmt } = await supabase
      .from("commission_statements")
      .select("id, carrier_id, statement_date")
      .eq("id", data.statement_id)
      .maybeSingle();
    const { queueEmail, APP_ORIGIN } = await import("@/lib/email/send.server");
    await queueEmail({
      template: "statement-reconciled",
      profileId: userId,
      category: "commission_posted",
      key: `statement-reconciled:${data.statement_id}`,
      data: {
        statementLabel: (stmt as any)?.statement_date
          ? `Statement ${(stmt as any).statement_date}`
          : undefined,
        matched: out.matched,
        varianceCount: out.variance,
        unmatched: out.unmatched,
        appUrl: `${APP_ORIGIN}/finances`,
      },
    });

    return out;
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

// ── The second pass: lines the policy number did not match ──────────────────

/**
 * Candidate policies for the unmatched lines of a statement, with the insured
 * name the `policies` table does not carry.
 *
 * Scoped to the caller's own RLS view rather than the service-role client, and
 * that is the security boundary: the suggestion list is derived entirely from
 * rows this person may already read, so it cannot become a way to learn that
 * another agency has a client called Willie Jenkins.
 *
 * Narrowed to policies whose agent appears on the statement where the statement
 * names agents at all, and otherwise to the whole readable book. A statement is
 * a month of one carrier's payments; the book is everything ever written, and
 * scoring one against the other unfiltered is both slow and a good way to find
 * a coincidence.
 */
async function candidatesFor(supabase: any, statementId: string, carrierId: string | null) {
  let q = supabase
    .from("policies")
    .select("id, policy_number, agent_id, effective_date, monthly_premium, annual_premium, client_id, clients(first_name, last_name)")
    .limit(4000);
  if (carrierId) q = q.eq("carrier_id", carrierId);

  const { data: policies } = await q;
  const rows = (policies ?? []) as any[];
  if (!rows.length) return [];

  // Expected commission, per policy, in one query rather than per candidate.
  const ids = rows.map((p) => p.id);
  const expectedBy = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: sched } = await supabase
      .from("commission_schedule")
      .select("policy_id, amount")
      .in("policy_id", ids.slice(i, i + 500));
    for (const s of sched ?? []) {
      expectedBy.set(s.policy_id, (expectedBy.get(s.policy_id) ?? 0) + Number(s.amount ?? 0));
    }
  }

  return rows.map((p) => ({
    policyId: p.id as string,
    policyNumber: (p.policy_number ?? null) as string | null,
    insuredName: p.clients
      ? `${p.clients.first_name ?? ""} ${p.clients.last_name ?? ""}`.trim() || null
      : null,
    agentId: (p.agent_id ?? null) as string | null,
    agentName: null,
    monthlyPremium: p.monthly_premium === null ? null : Number(p.monthly_premium),
    annualPremium: p.annual_premium === null ? null : Number(p.annual_premium),
    effectiveDate: (p.effective_date ?? null) as string | null,
    expected: expectedBy.has(p.id) ? expectedBy.get(p.id)! : null,
  }));
}

/**
 * Suggestions for the lines `reconcile_statement` could not place.
 *
 * Read-only and computed fresh rather than stored. Two reasons, and the second
 * is the one that decided it: a stored suggestion goes stale the moment a
 * policy is posted or corrected, and `match_status` has a CHECK constraint
 * whose vocabulary has no room for "suggested" — inventing a value there would
 * need a migration, and migrations here are applied by hand.
 */
export const suggestStatementMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ statement_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    const { data: stmt } = await supabase
      .from("commission_statements")
      .select("id, carrier_id")
      .eq("id", data.statement_id)
      .maybeSingle();
    if (!stmt) throw new Error("Statement not found or access denied.");

    const { data: lines } = await supabase
      .from("commission_statement_lines")
      .select("id, policy_number, insured_name, agent_name, paid_amount, paid_date")
      .eq("statement_id", data.statement_id)
      .in("match_status", ["unmatched", "unexpected"])
      .limit(2000);

    const unplaced = (lines ?? []) as any[];
    if (!unplaced.length) return { suggestions: {}, candidateCount: 0 };

    const candidates = await candidatesFor(supabase, data.statement_id, (stmt as any).carrier_id ?? null);
    if (!candidates.length) return { suggestions: {}, candidateCount: 0 };

    const { suggestForStatement } = await import("@/lib/statement-match");
    const suggestions = suggestForStatement(
      unplaced.map((l) => ({
        lineId: l.id as string,
        policyNumber: l.policy_number ?? null,
        insuredName: l.insured_name ?? null,
        agentName: l.agent_name ?? null,
        paidAmount: Number(l.paid_amount ?? 0),
        paidDate: l.paid_date ?? null,
      })),
      candidates,
    );

    // The name is looked up here rather than sent from the client, so the label
    // on the button and the row it writes cannot disagree.
    const nameById = new Map(candidates.map((c) => [c.policyId, c.insuredName]));
    const numberById = new Map(candidates.map((c) => [c.policyId, c.policyNumber]));
    const decorated: Record<string, any[]> = {};
    for (const [lineId, list] of Object.entries(suggestions)) {
      decorated[lineId] = list.map((s) => ({
        ...s,
        insuredName: nameById.get(s.policyId) ?? null,
        policyNumber: numberById.get(s.policyId) ?? null,
      }));
    }

    return { suggestions: decorated, candidateCount: candidates.length };
  });

/**
 * Accept suggestions a person ticked.
 *
 * The confidence and the expected amount are recomputed here from the policy
 * rather than taken from the request. A client that could name its own
 * `expected_amount` could report any variance it liked, and variance is the
 * number this whole feature exists to produce.
 */
export const applyStatementMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      statement_id: z.string().uuid(),
      matches: z.array(z.object({
        line_id: z.string().uuid(),
        policy_id: z.string().uuid(),
      })).min(1).max(2000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    // Both sides re-read through the caller's own client, so a line or a policy
    // they cannot see is simply not there to be written.
    const lineIds = data.matches.map((m) => m.line_id);
    const { data: lines } = await supabase
      .from("commission_statement_lines")
      .select("id, paid_amount")
      .eq("statement_id", data.statement_id)
      .in("id", lineIds);
    const paidBy = new Map<string, number>(
      (lines ?? []).map((l: any) => [String(l.id), Number(l.paid_amount ?? 0)]),
    );

    const policyIds = [...new Set(data.matches.map((m) => m.policy_id))];
    const { data: policies } = await supabase
      .from("policies")
      .select("id, agent_id")
      .in("id", policyIds);
    const agentBy = new Map<string, string | null>(
      (policies ?? []).map((p: any) => [String(p.id), p.agent_id ?? null]),
    );

    const expectedBy = new Map<string, number>();
    const { data: sched } = await supabase
      .from("commission_schedule")
      .select("policy_id, amount")
      .in("policy_id", policyIds);
    for (const s of sched ?? []) {
      expectedBy.set(s.policy_id, (expectedBy.get(s.policy_id) ?? 0) + Number(s.amount ?? 0));
    }

    let applied = 0;
    let skipped = 0;
    for (const m of data.matches) {
      if (!paidBy.has(m.line_id) || !agentBy.has(m.policy_id)) { skipped++; continue; }
      const paid = paidBy.get(m.line_id)!;
      const expected = expectedBy.has(m.policy_id) ? expectedBy.get(m.policy_id)! : null;
      const variance = expected === null ? null : Math.round((paid - expected) * 100) / 100;

      const { error } = await supabase
        .from("commission_statement_lines")
        .update({
          matched_policy_id: m.policy_id,
          matched_agent_id: agentBy.get(m.policy_id),
          expected_amount: expected,
          variance,
          // A line matched by this route is never silently "matched" — it is a
          // human decision, and a zero variance on a hand-matched line still
          // deserves to read as one.
          match_status: variance !== null && Math.abs(variance) <= 0.01 ? "matched" : "variance",
        })
        .eq("id", m.line_id)
        .eq("statement_id", data.statement_id);
      if (error) throw new Error(error.message);
      applied++;
    }

    return { applied, skipped };
  });

// ── The third opinion: what the contract says ───────────────────────────────

/**
 * Grid findings for a reconciled statement.
 *
 * The existing `expected_amount` is what `commission-calculator.ts` scheduled
 * when the deal was posted, and that is built from `agent_commission_levels`
 * alone — `commission_grids.year_1_pct` is displayed, edited and imported, and
 * never used to compute money. So reconciling paid-against-scheduled compares
 * the carrier to a number the agency's own comp grid may never have agreed
 * with, and the disagreement is invisible because both sides of the comparison
 * come from the same place.
 *
 * This adds the third number. Read-only, and read through the caller's own
 * client so the grid, the levels and the policies are all rows this person may
 * already see.
 */
async function computeGridFindings(supabase: any, statementId: string) {
  const { data: stmt } = await supabase
    .from("commission_statements")
    .select("id, carrier_id")
    .eq("id", statementId)
    .maybeSingle();
  if (!stmt) throw new Error("Statement not found or access denied.");

  const { data: lineRows } = await supabase
    .from("commission_statement_lines")
    .select("id, matched_policy_id, matched_agent_id, paid_amount, expected_amount, insured_name")
    .eq("statement_id", statementId)
    .not("matched_policy_id", "is", null)
    .limit(5000);

  const lines = (lineRows ?? []) as any[];
  if (!lines.length) return { findings: [], summary: { rate_mismatch: 0, underpaid: 0, no_schedule: 0, overpaid: 0 } };

  const policyIds = [...new Set(lines.map((l) => l.matched_policy_id).filter(Boolean))];
  const { data: policies } = await supabase
    .from("policies")
    .select("id, agent_id, carrier_id, product, annual_premium, monthly_premium")
    .in("id", policyIds);
  const policyBy = new Map<string, any>((policies ?? []).map((p: any) => [String(p.id), p]));

  // One row per (agent, carrier) rather than per line — the same agent's rate
  // is the same rate on every line of the statement.
  const agentIds = [...new Set((policies ?? []).map((p: any) => p.agent_id).filter(Boolean))];
  const carrierIds = [...new Set((policies ?? []).map((p: any) => p.carrier_id).filter(Boolean))];

  const levelBy = new Map<string, { pct: number | null; level: string | null }>();
  if (agentIds.length && carrierIds.length) {
    const { data: levels } = await supabase
      .from("agent_commission_levels")
      .select("agent_id, carrier_id, assigned_pct, commission_level")
      .in("agent_id", agentIds)
      .in("carrier_id", carrierIds);
    for (const l of levels ?? []) {
      levelBy.set(`${l.agent_id}:${l.carrier_id}`, {
        pct: l.assigned_pct === null ? null : Number(l.assigned_pct),
        level: l.commission_level ?? null,
      });
    }
  }

  // The grid, keyed the way the calculator keys it: carrier, product, level.
  const gridBy = new Map<string, number | null>();
  if (carrierIds.length) {
    const { data: grids } = await supabase
      .from("commission_grids")
      .select("carrier_id, product_name, level_name, year_1_pct, organization_id")
      .in("carrier_id", carrierIds)
      // An agency's own grid beats the shared default, same precedence the
      // calculator uses for renewals.
      .order("organization_id", { nullsFirst: false });
    for (const g of grids ?? []) {
      const key = `${g.carrier_id}:${g.product_name}:${g.level_name ?? ""}`;
      if (!gridBy.has(key)) gridBy.set(key, g.year_1_pct === null ? null : Number(g.year_1_pct));
    }
  }

  const { gridExpectation } = await import("@/lib/grid-expectation");

  const findings = lines.map((l) => {
    const p = policyBy.get(String(l.matched_policy_id));
    const lvl = p ? levelBy.get(`${p.agent_id}:${p.carrier_id}`) : undefined;
    const gridPct = p && lvl?.level
      ? gridBy.get(`${p.carrier_id}:${p.product}:${lvl.level}`) ?? null
      : null;

    const annual = p
      ? (p.annual_premium !== null
          ? Number(p.annual_premium)
          : p.monthly_premium !== null ? Number(p.monthly_premium) * 12 : null)
      : null;

    const e = gridExpectation({
      annualPremium: annual,
      assignedPct: lvl?.pct ?? null,
      gridYear1Pct: gridPct,
      scheduled: l.expected_amount === null ? null : Number(l.expected_amount),
      paid: Number(l.paid_amount ?? 0),
    });

    return {
      lineId: l.id as string,
      policyId: (l.matched_policy_id ?? null) as string | null,
      agentId: (p?.agent_id ?? null) as string | null,
      insuredName: (l.insured_name ?? null) as string | null,
      scheduled: l.expected_amount === null ? null : Number(l.expected_amount),
      paid: Number(l.paid_amount ?? 0),
      ...e,
    };
  });

  const summary = {
    rate_mismatch: findings.filter((f) => f.finding === "rate_mismatch").length,
    underpaid: findings.filter((f) => f.finding === "underpaid").length,
    no_schedule: findings.filter((f) => f.finding === "no_schedule").length,
    overpaid: findings.filter((f) => f.finding === "overpaid").length,
  };

  return { findings: findings.filter((f) => f.finding !== "ok" && f.finding !== "no_grid"), summary };
}

export const gridFindingsForStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ statement_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    return computeGridFindings(supabase, data.statement_id);
  });

/**
 * Turn the findings into tasks.
 *
 * The findings are recomputed here rather than accepted from the request, for
 * the same reason `applyStatementMatches` recomputes the variance: a client
 * that could name its own findings could put any sentence it liked into an
 * agency's task list.
 *
 * A rate mismatch is collapsed to one task per agent-and-carrier. It is one
 * problem affecting every policy that agent wrote, and four hundred identical
 * tasks is a way of hiding it rather than reporting it.
 */
export const createTasksForGridFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ statement_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // The plain helper, not the server function: calling one createServerFn
    // from another does not carry the middleware context, so `supabase` would
    // arrive undefined and every lookup would silently return nothing.
    const { findings } = await computeGridFindings(supabase, data.statement_id);
    const { isActionable } = await import("@/lib/grid-expectation");

    const actionable = (findings as any[]).filter((f) => isActionable(f.finding));
    if (!actionable.length) return { created: 0 };

    const rows: any[] = [];
    const seenMismatch = new Set<string>();

    for (const f of actionable) {
      if (f.finding === "rate_mismatch") {
        const key = String(f.agentId ?? "unknown");
        if (seenMismatch.has(key)) continue;
        seenMismatch.add(key);
        rows.push({
          title: "Commission rate disagrees with the comp grid",
          description: f.explanation,
          assigned_to: userId,
          created_by: userId,
          priority: "high",
          related_type: "agent",
          related_id: f.agentId,
        });
        continue;
      }

      rows.push({
        title: f.finding === "underpaid"
          ? `Underpaid: ${f.insuredName ?? "unnamed policy"}`
          : `No commission schedule: ${f.insuredName ?? "unnamed policy"}`,
        description: f.explanation,
        assigned_to: userId,
        created_by: userId,
        priority: f.finding === "underpaid" ? "high" : "normal",
        related_type: "policy",
        related_id: f.policyId,
      });
    }

    // A finding with nothing to point at cannot become a task the person can
    // act on, so it is dropped rather than written without its link.
    const writable = rows.filter((r) => r.related_id);
    if (!writable.length) return { created: 0 };

    const { error } = await supabase.from("tasks").insert(writable);
    if (error) throw new Error(error.message);
    return { created: writable.length };
  });
