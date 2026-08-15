/**
 * The prompt and the validation for reading a carrier report that arrived as a
 * picture.
 *
 * Every deterministic path is tried first and this is the fallback, for one
 * specific reason: carrier PDFs are printed from mainframe reports, and their
 * text layer comes out as one column of words with the table structure gone. A
 * debt report read that way gives a list of names and a list of numbers with no
 * way to say which belongs to which — and an amount attached to the wrong agent
 * is worse than no amount at all. So when there is no grid to read, the pages go
 * to the model as images, where the columns are still visible.
 *
 * The model proposes; nothing here writes. Everything it returns is validated
 * field by field and lands as a proposal a human approves, the same as any other
 * import.
 */

import { z } from "zod";

export const CARRIER_REPORT_SYSTEM = `You read reports that life insurance carriers send to agencies and return structured JSON.

First decide which of three reports this is:
- "commission_statement": a payout statement. Shows commissions earned/paid, sometimes advances, chargebacks, balances.
- "agent_debt": a debt or debit-balance report. One row per agent, showing money the agent owes back.
- "policy_status_report": a certificate/policy listing. One row per policy with a contract status.

Return JSON:
{"kind":"commission_statement|agent_debt|policy_status_report|unknown",
 "carrier_name":string|null,
 "confidence":0..1,
 "notes":string,
 "statement":{"statement_date":"YYYY-MM-DD"|null,"period_start":"YYYY-MM-DD"|null,"period_end":"YYYY-MM-DD"|null,"stated_total":number|null},
 "lines":[{"insured_name":string|null,"policy_number":string|null,"product":string|null,"paid_amount":number,"paid_date":"YYYY-MM-DD"|null,"agent_name":string|null}],
 "debts":[{"agent_name":string,"agent_number":string|null,"agent_email":string|null,"npn":string|null,"upline_name":string|null,"commission_level":string|null,"carrier_name":string|null,"balance":number,"unsecured_advance":number|null,"unpaid_commission":number|null,"age_of_debt":number|null,"pending_policies":number|null,"agent_status":string|null,"as_of_date":"YYYY-MM-DD"|null}],
 "certificates":[{"insured_name":string,"policy_number":string,"product":string|null,"status_text":string|null,"effective_date":"YYYY-MM-DD"|null,"face_amount":number|null,"monthly_premium":number|null}]}

Rules:
- Fill only the array that matches "kind". Leave the others empty.
- Money as numbers. "$1,234.56" -> 1234.56. Parentheses and minus signs both mean
  negative: "(1,226.05)" -> -1226.05. Never drop the sign — on a debt report the
  sign is the difference between money owed and money owing.
- Read amounts from the row they are printed on. If you cannot tell which agent
  or policy an amount belongs to, omit that row entirely. A wrong pairing is far
  worse than a missing one.
- Dates as YYYY-MM-DD. A placeholder date such as 1/1/1800 means "never
  happened" — return null, not the date.
- status_text is the carrier's own wording, copied verbatim ("CON TERM NT NO PAY",
  "CONTRACT ACTIVE"). Do not translate or tidy it; the exact words carry the
  meaning and are mapped afterwards.
- Skip totals, subtotals, page headers and footers. Only real detail rows.
- Do not invent rows, agents, policy numbers or amounts. Omit what you cannot read.
- confidence should be honest: a faint scan or a report you had to guess the
  layout of scores low.`;

const LineSchema = z.object({
  insured_name: z.string().max(200).nullable().optional(),
  policy_number: z.string().max(80).nullable().optional(),
  product: z.string().max(200).nullable().optional(),
  paid_amount: z.number(),
  paid_date: z.string().max(20).nullable().optional(),
  agent_name: z.string().max(200).nullable().optional(),
});

const DebtSchema = z.object({
  agent_name: z.string().trim().min(1).max(200),
  agent_number: z.string().max(60).nullable().optional(),
  agent_email: z.string().max(200).nullable().optional(),
  npn: z.string().max(40).nullable().optional(),
  upline_name: z.string().max(200).nullable().optional(),
  commission_level: z.string().max(60).nullable().optional(),
  carrier_name: z.string().max(160).nullable().optional(),
  balance: z.number(),
  unsecured_advance: z.number().nullable().optional(),
  unpaid_commission: z.number().nullable().optional(),
  age_of_debt: z.number().nullable().optional(),
  pending_policies: z.number().nullable().optional(),
  agent_status: z.string().max(60).nullable().optional(),
  as_of_date: z.string().max(20).nullable().optional(),
});

const CertificateSchema = z.object({
  insured_name: z.string().trim().min(1).max(200),
  policy_number: z.string().trim().min(1).max(80),
  product: z.string().max(200).nullable().optional(),
  status_text: z.string().max(120).nullable().optional(),
  effective_date: z.string().max(20).nullable().optional(),
  face_amount: z.number().nullable().optional(),
  monthly_premium: z.number().nullable().optional(),
});

export type CarrierReportRaw = {
  kind?: string;
  carrier_name?: string | null;
  confidence?: number;
  notes?: string;
  statement?: Record<string, any> | null;
  lines?: unknown[];
  debts?: unknown[];
  certificates?: unknown[];
};

/**
 * Keep what parses, count what did not.
 *
 * Row-by-row rather than all-or-nothing: a statement with two illegible lines is
 * still worth reviewing, and failing the whole page over them would send someone
 * back to typing it in by hand. The dropped count is reported so the number on
 * screen is never quietly smaller than the number in the file.
 */
export function validateCarrierReport(out: CarrierReportRaw) {
  const lines: z.infer<typeof LineSchema>[] = [];
  const debts: z.infer<typeof DebtSchema>[] = [];
  const certificates: z.infer<typeof CertificateSchema>[] = [];
  let dropped = 0;

  for (const r of out.lines ?? []) {
    const p = LineSchema.safeParse(r);
    p.success ? lines.push(p.data) : dropped++;
  }
  for (const r of out.debts ?? []) {
    const p = DebtSchema.safeParse(r);
    p.success ? debts.push(p.data) : dropped++;
  }
  for (const r of out.certificates ?? []) {
    const p = CertificateSchema.safeParse(r);
    p.success ? certificates.push(p.data) : dropped++;
  }

  const kind =
    out.kind === "commission_statement" || out.kind === "agent_debt" || out.kind === "policy_status_report"
      ? out.kind
      : "unknown";

  return {
    kind,
    carrier_name: out.carrier_name ?? null,
    confidence: typeof out.confidence === "number" ? out.confidence : 0,
    notes: out.notes ?? "",
    statement: {
      statement_date: (out.statement?.statement_date as string) ?? null,
      period_start: (out.statement?.period_start as string) ?? null,
      period_end: (out.statement?.period_end as string) ?? null,
      stated_total:
        typeof out.statement?.stated_total === "number" ? out.statement.stated_total : null,
    },
    lines,
    debts,
    certificates,
    dropped,
  };
}

export type CarrierReport = ReturnType<typeof validateCarrierReport>;
