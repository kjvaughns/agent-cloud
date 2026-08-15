/**
 * Writing the two carrier reports that are not client records.
 *
 * A book of business becomes clients and policies, and `saveClientFullRecord`
 * already owns that. A commission statement and a debt report are different
 * animals: one is money the carrier says it paid, the other money it says it is
 * owed, and neither belongs on a client row.
 *
 * Both writes are deliberately unglamorous:
 *
 *   **A statement lands unmatched.** Its lines are inserted with
 *   `match_status: "unmatched"` and nothing is reconciled here. Reconciliation
 *   already exists as its own screen, with a suggest step and a human applying
 *   the matches; guessing them at import time would put a paid amount against
 *   the wrong policy with nobody having agreed to it.
 *
 *   **A debt figure is upserted, not accumulated.** Debt reports are snapshots —
 *   the same agent appears in this week's file and last week's — so re-importing
 *   refreshes the balance for that agent, carrier and report date instead of
 *   stacking a second row and doubling the agency's apparent exposure.
 *
 * Kept out of `import.functions.ts` on purpose: that file is a thin wrapper of
 * server-function declarations, and helpers living beside them get stripped by
 * the server-function transform.
 */

import { resolveCarrierId } from "./import-helpers";
import type { DebtRecord, StatementLine } from "./import-carrier-reports";

/** A statement proposal: the header the carrier printed, plus its detail lines. */
export type StatementPayload = {
  carrier_name?: string | null;
  carrier_id?: string | null;
  statement_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  stated_total?: number | null;
  file_name?: string | null;
  lines?: StatementLine[];
};

/**
 * Create a statement and its lines.
 *
 * `parsed_total` is the sum of what was actually read, kept separate from
 * `stated_total` — the figure printed on the statement. Storing one number for
 * both would hide exactly the discrepancy this table exists to surface: if the
 * carrier says $6,152.36 and the lines add to $5,900, somebody needs to see
 * both numbers rather than a single reassuring one.
 */
export async function applyStatementImport(
  supabase: any,
  userId: string,
  orgId: string,
  payload: StatementPayload,
): Promise<string> {
  const lines = (payload.lines ?? []).filter((l) => l && Number.isFinite(Number(l.paid_amount)));

  const carrierId = payload.carrier_id ?? (await resolveCarrierId(supabase, payload.carrier_name));
  const parsedTotal = lines.reduce((sum, l) => sum + Number(l.paid_amount || 0), 0);

  const { data: statement, error } = await supabase
    .from("commission_statements")
    .insert({
      organization_id: orgId,
      carrier_id: carrierId,
      carrier_name: payload.carrier_name ?? null,
      // A statement has to be dated to be filed. When the carrier's own date
      // could not be read, the import date is used rather than refusing the
      // whole statement — the period fields carry the real answer.
      statement_date: payload.statement_date ?? new Date().toISOString().slice(0, 10),
      period_start: payload.period_start ?? null,
      period_end: payload.period_end ?? null,
      stated_total: payload.stated_total ?? null,
      parsed_total: Number(parsedTotal.toFixed(2)),
      file_name: payload.file_name ?? null,
      status: "imported",
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (lines.length) {
    const rows = lines.map((l) => ({
      statement_id: statement.id,
      organization_id: orgId,
      insured_name: l.insured_name ?? null,
      policy_number: l.policy_number ?? null,
      product: l.product ?? null,
      agent_name: l.agent_name ?? null,
      paid_amount: Number(l.paid_amount),
      paid_date: l.paid_date ?? null,
      // Left for the reconciliation screen. Matching here would be a guess
      // nobody approved.
      match_status: "unmatched",
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: lineErr } = await supabase
        .from("commission_statement_lines")
        .insert(rows.slice(i, i + 500));
      if (lineErr) throw new Error(lineErr.message);
    }
  }

  return statement.id as string;
}

/**
 * Record one agent's debt balance.
 *
 * The agent is matched by email first and NPN second, because those identify a
 * person and a name does not — two "J. Smith"s in a downline is normal. An
 * unmatched name is still stored: the agency's total exposure is wrong without
 * it, and the row becomes attributable the moment that person has an account.
 */
export async function applyAgentDebt(
  supabase: any,
  orgId: string,
  payload: DebtRecord & { source_document_id?: string | null },
): Promise<string> {
  const email = String(payload.agent_email ?? "").trim().toLowerCase();
  const npn = String(payload.npn ?? "").trim();

  let agentId: string | null = null;
  if (email) {
    const { data } = await supabase
      .from("profiles").select("id").ilike("email", email).limit(1).maybeSingle();
    agentId = data?.id ?? null;
  }
  if (!agentId && npn) {
    const { data } = await supabase
      .from("profiles").select("id").eq("npn_number", npn).limit(1).maybeSingle();
    agentId = data?.id ?? null;
  }

  const carrierId = await resolveCarrierId(supabase, payload.carrier_name);

  const fields = {
    organization_id: orgId,
    agent_id: agentId,
    agent_name: payload.agent_name,
    agent_number: payload.agent_number ?? null,
    agent_email: payload.agent_email ?? null,
    npn: payload.npn ?? null,
    upline_name: payload.upline_name ?? null,
    commission_level: payload.commission_level ?? null,
    carrier_id: carrierId,
    carrier_name: payload.carrier_name ?? null,
    balance: Number(payload.balance ?? 0),
    unsecured_advance: payload.unsecured_advance ?? null,
    unpaid_commission: payload.unpaid_commission ?? null,
    age_of_debt: payload.age_of_debt ?? null,
    pending_policies: payload.pending_policies ?? null,
    agent_status: payload.agent_status ?? null,
    source_line: payload.source_line ?? null,
    as_of_date: payload.as_of_date ?? null,
    source_document_id: payload.source_document_id ?? null,
  };

  /*
    Find, then write — rather than an upsert.

    The unique index is on lowered and coalesced expressions, which PostgREST
    cannot name in `onConflict`, so an upsert here fails on the constraint it is
    trying to respect. Matching the same three things the index does keeps the
    behaviour identical without asking the API to do something it cannot.
  */
  let q = supabase
    .from("agent_debt_balances")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("agent_name", payload.agent_name);
  q = payload.carrier_name
    ? q.ilike("carrier_name", payload.carrier_name)
    : q.is("carrier_name", null);
  q = payload.as_of_date ? q.eq("as_of_date", payload.as_of_date) : q.is("as_of_date", null);

  const { data: existing } = await q.limit(1).maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("agent_debt_balances")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id as string;
  }

  const { data: row, error } = await supabase
    .from("agent_debt_balances")
    .insert(fields)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row.id as string;
}
