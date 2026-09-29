/**
 * Guarantee Trust Life monthly commission statement (e.g. "01A8SH00_MC_08-31-2026.pdf").
 *
 * The statement is a fixed-layout print: one line per policy transaction with
 * policy #, state, truncated insured name, effective date, paid-to date, mode,
 * day paid, writing agent, policy form, then a TRANS code. The trans code is
 * what tells us the policy's health:
 *   1 regular payment, 2 reinstatement, 3 balance on delivery → paid
 *   N NSF, S stop pay, O other bank problem → returned payment (lapse pending)
 *   R refund, F flat cancel, C account closed, I cancel-reissue → cancelled
 *   7 reversion → lapsed
 * Parsed deterministically — no AI — so the whole statement is always read.
 */

export type GtlStatementRow = {
  "Policy #": string;
  Status: string;
  Insured: string;
  "Status Date": string;
  "Writing Agent": string;
  "Effective Date": string;
};

const TRANS_STATUS: Record<string, string> = {
  "1": "Paid",
  "2": "Paid (reinstatement)",
  "3": "Paid (balance on delivery)",
  "5": "Paid (A.P.L.)",
  "6": "Paid (waiver)",
  N: "NSF returned payment",
  S: "Stop pay returned payment",
  O: "Bank problem returned payment",
  R: "Refund cancelled",
  F: "Flat cancel",
  C: "Account closed cancelled",
  I: "Cancel reissue",
  "7": "Lapsed (reversion)",
};

const PAID = new Set(["1", "2", "3", "5", "6"]);

function isoFromShort(d: string): string {
  const [mm, dd, yy] = d.split("-");
  return `20${yy}-${mm}-${dd}`;
}

export function looksLikeGtlStatement(text: string): boolean {
  return /GUARANTEE\s+TRUST\s+LIFE/i.test(text) && /COMMISSION\s+STATEMENT/i.test(text) && /GTL\d{6,}/.test(text);
}

export function parseGtlStatement(text: string): GtlStatementRow[] {
  const flat = text.replace(/\|/g, " ").replace(/\s+/g, " ");
  const re =
    /\b(GTL\d{6,})\s+([A-Z]{2})\s+(.+?)\s+(\d\d-\d\d-\d\d)\s+(\d\d-\d\d-\d\d)\s+\d\d\s+\d\d\s+([A-Z0-9]{5})\s+([A-Z0-9]{3,6})\s+([0-9A-Z])\s+[\d,]+\.\d\d/g;

  const byPolicy = new Map<string, GtlStatementRow & { paid: boolean }>();
  for (const m of flat.matchAll(re)) {
    const [, policy, , name, eff, paidTo, agent, , trans] = m;
    const status = TRANS_STATUS[trans] ?? `Reversal code ${trans}`;
    const row = {
      "Policy #": policy,
      Status: status,
      Insured: name.trim(),
      "Status Date": isoFromShort(paidTo),
      "Writing Agent": agent,
      "Effective Date": isoFromShort(eff),
      paid: PAID.has(trans),
    };
    const prev = byPolicy.get(policy);
    // A reversal beats a payment on the same statement; otherwise the later line wins.
    if (!prev || !(prev.paid === false && row.paid)) byPolicy.set(policy, row);
  }
  return [...byPolicy.values()].map(({ paid: _p, ...r }) => r);
}
