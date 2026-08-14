/**
 * The calculator asks the canonical resolver, and writes payments once.
 *
 *   npx tsx scripts/commission-wiring-check.ts
 *
 * `compensation-check.ts` proves the arithmetic. This proves the calculator
 * actually uses it — which is a separate question, and the one that was wrong:
 * the module existed nowhere, so every number came from
 * `agent_commission_levels` or from a constant.
 *
 * The assertions are mostly "is the old path gone", because each piece of it
 * failed silently:
 *
 *   * `if (existing.length > 0) return` meant a run that died between the
 *     advance rows and the override chain left the policy permanently
 *     half-paid, and a corrected level could never be applied.
 *   * `?? 600` and `?? 6` invented a carrier's advance cap when nobody had set
 *     one.
 *   * `while (depth < 5)` stopped paying at the fifth upline.
 *   * an unresolvable agent got a console warning and a queue row nobody reads.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`ok    ${name}`);
  } else {
    fail++;
    console.log(
      `FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`,
    );
  }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CALC = read("src/lib/commission-calculator.ts");
const CODE = strip(CALC);

// ── It asks the resolver ────────────────────────────────────────────────────

check(
  "the writing agent's rate comes from the canonical resolver",
  /resolveForAgent\(supabase, agentId, orgCarrier\.id\)/.test(CODE),
  true,
);
check(
  "year one comes from the pure planner",
  /planYearOne\(monthlyPremium, resolution\.pct, resolution\.advanceMonths\)/.test(CODE),
  true,
);
check(
  "overrides come from the pure chain resolver",
  /resolveOverrides\(resolution\.pct, chain, annualPremium\)/.test(CODE),
  true,
);
check(
  "the chain is loaded for the whole hierarchy",
  /loadUplineChain\(supabase, agentId, orgCarrier\.id\)/.test(CODE),
  true,
);

// The legacy table may still be READ by the resolver as a contract override,
// but the calculator must never reach for it directly again.
check(
  "the calculator no longer reads agent_commission_levels itself",
  /agent_commission_levels/.test(CODE),
  false,
);

// ── The old silent paths are gone ───────────────────────────────────────────

console.log("");

check("no early return on existing rows", /existing && existing\.length > 0/.test(CODE), false);
check("no five-deep cap on the upline walk", /depth < 5/.test(CODE), false);
check("no invented advance cap", /\?\? 600|\?\? 6\)/.test(CODE), false);
check("no hard-coded 75/25 split", /0\.75|0\.25/.test(CODE), false);
check("no unit guessing", /pct > 1\) .*\/ 100/.test(CODE), false);
// The queue was write-only: nothing surfaced it to the agent or the owner.
check(
  "an unresolvable policy is recorded as a visible issue",
  /recordSetupIssue\(supabase/.test(CODE),
  true,
);
check(
  "…and nothing is written when it cannot resolve",
  /if \(!resolution\.ok\) \{[\s\S]{0,200}return;/.test(CODE),
  true,
);

// ── Payments are written once ───────────────────────────────────────────────

console.log("");

check("every row carries a stable key", /idempotency_key: commissionKey\(r\)/.test(CODE), true);
check(
  "the key names the payment, not the attempt",
  // Whitespace-tolerant: prettier rewraps this array depending on length.
  /\[\s*r\.policy_id,\s*r\.agent_id,\s*r\.payment_type,\s*r\.payment_date,\s*String\(r\.month_number \?\? 0\),?\s*\]/.test(
    CODE,
  ),
  true,
);
check(
  "writes upsert on that key rather than inserting",
  /\.upsert\(keyed, \{ onConflict: "idempotency_key" \}\)/.test(CODE),
  true,
);
check(
  "a leg that no longer applies is superseded, not deleted",
  /superseded_at: new Date\(\)\.toISOString\(\)/.test(CODE) && !/\.delete\(\)/.test(CODE),
  true,
);
check("one run is traceable", /calc_run_id: calcRunId/.test(CODE), true);

// ── The migration ───────────────────────────────────────────────────────────

console.log("");

const MIG = read("supabase/migrations/20260814220000_commission-idempotency.sql");
const SQL = MIG.replace(/--[^\n]*/g, "");
check(
  "the key is unique",
  /create unique index if not exists uq_commission_schedule_idempotency/.test(SQL),
  true,
);
check(
  "existing rows are given the same key shape the calculator writes",
  /concat_ws\(\s*':', policy_id::text, agent_id::text, payment_type,\s*payment_date::text, coalesce\(month_number, 0\)::text\)/.test(
    SQL,
  ),
  true,
);
check("nothing is dropped or deleted", /drop (table|column)|delete from/i.test(SQL), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
