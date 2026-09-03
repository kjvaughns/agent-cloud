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
  // The requirement is that the rate comes from `resolveForAgent`, not that the
  // call has three arguments. Pinning the exact argument list made this fail
  // when the grid and the deal were added to it — a passing test breaking on an
  // improvement to the thing it guards, which teaches people to edit the test.
  /resolveForAgent\(supabase, agentId, orgCarrier\.id[,)]/.test(CODE),
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
// The call gained the grid and deal it prices against, so this matches the
// call rather than its exact argument list. That the walk covers the WHOLE
// hierarchy rather than a fixed five is a property of `loadUplineChain` and
// `resolveOverrides`, and is asserted in compensation-check where they live.
check(
  "the chain is loaded for the whole hierarchy",
  /loadUplineChain\(\s*supabase,\s*agentId,\s*orgCarrier\.id/.test(CODE),
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

// ── The grid tier, which was dead ───────────────────────────────────────────
//
// `commission_grids` has carried age bands, state exceptions and risk classes
// since the first schema. `selectGridRule` scores between them. `resolveCompensation`
// has a whole `pctSource: "grid"` branch. None of it ran: `CommissionInput`
// carried no age, no state and no risk class, so the branch condition
// `input.grid?.length && input.deal` was never true anywhere in production and
// an 82 year old was paid the 55 year old's rate.
//
// None of it needed asking for. Pipeline already stores all three on the client.

console.log("");

check("the calculator reads the deal's own facts",
  /const facts = await loadDealFacts\(supabase, policyId, effectiveDate\)/.test(CALC), true);
check("…and the carrier's grid",
  /const grid = orgIdEarly \? await loadGridRows\(supabase, orgIdEarly, carrierId\) : \[\]/.test(CALC), true);
check("…and hands both to the resolver",
  /resolveForAgent\(supabase, agentId, orgCarrier\.id, \{\s*grid,\s*deal: \{/.test(CALC), true);
check("…with the three the grid rates on",
  /age: facts\.age/.test(CALC) && /state: facts\.state/.test(CALC) &&
  /riskClass: facts\.riskClass/.test(CALC), true);

const PRICING = read("src/lib/compensation/deal-pricing.server.ts");
// Age on the effective date, not today. Using today's would move a policy into
// a different band on the insured's birthday and repay every remaining renewal
// at a rate nobody changed.
check("age is taken on the effective date",
  /ageOn\(client\.date_of_birth, effectiveDate\)/.test(PRICING), true);
check("the facts come from Pipeline's own columns, not a new form",
  /\.from\("clients"\)\.select\("date_of_birth, state"\)/.test(PRICING) &&
  /\.from\("client_health"\)\.select\("tobacco_use"\)/.test(PRICING), true);
check("…mapped to the vocabulary the grid is written in",
  /health\.tobacco_use \? "tobacco" : "non_tobacco"/.test(PRICING), true);
// This runs inside the commission calculator. A table that is missing must not
// take a policy write down with it.
check("a missing client_health does not fail the calculation",
  /try \{[\s\S]{0,400}client_health[\s\S]{0,300}\} catch \{/.test(PRICING), true);

// The renewal path was a SECOND hand-written query over the same table, and it
// could not see age bands, state exceptions or risk classes at all — it ordered
// `nullsFirst` to take the band-less row on purpose, because the age was not
// available. Two selectors over one table is the duplication this codebase
// keeps removing, and it made a renewal disagree with year one of its own policy.
check("renewals go through the same selector as year one",
  /const yr25 = selectGridRule\(grid, \{ \.\.\.renewalQuery, policyYear: 2 \}\)/.test(CALC) &&
  /const yr6 = selectGridRule\(grid, \{ \.\.\.renewalQuery, policyYear: 6 \}\)/.test(CALC), true);
check("…keyed on the carrier's level name, not the agency's",
  /levelName: myLevelName/.test(CALC), true);
check("…and the hand-written renewal query is gone",
  /\.from\("commission_grids"\)/.test(CALC), false);
check("…including its deliberate band-less ordering",
  /age_group_min", \{ nullsFirst: true \}/.test(CALC), false);
// Stored form is 0–500 where 80 means 80%. The old renewal code divided by 100
// inline; `asFraction` is the one place that conversion is allowed to live.
check("the renewal rate converts through asFraction, not by hand",
  /const yr25pct = yr25 \? asFraction\(yr25\.pct\) : 0/.test(CALC), true);
check("…with no second /100 left behind",
  /years_2_5_pct \?\? 0\) \/ 100/.test(CALC), false);

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

// ── The override is priced and paid like the rest of year one ─────────────
//
// Two separate faults, one report. The spread was computed between a writing
// rate that had been priced against the carrier's grid and an upline rate that
// had not, so a grid row above the upline's level silently wiped the override
// out. And the whole twelve months of spread was written as one row on the
// effective date, while the writing agent's own year one was advanced and
// deferred — the agency paying override on premium the carrier had not
// advanced, and Finances describing the opposite in its own explainer.

check("the upline chain is priced against the same grid and deal",
  /loadUplineChain\(\s*supabase,\s*agentId,\s*orgCarrier\.id,\s*\{\s*grid,/.test(CODE), true);
check("…and no longer resolved from flat levels alone",
  /loadUplineChain\(supabase, agentId, orgCarrier\.id\)/.test(CODE), false);
check("each override leg goes through the year-one planner",
  /planYearOne\(monthlyPremium, leg\.spread, resolution\.advanceMonths\)/.test(CODE), true);
check("…so an override is no longer a single lump on the effective date",
  /amount: leg\.amount,/.test(CODE), false);
check("the deferred override months follow the advance",
  /month = resolution\.advanceMonths \+ i;/.test(CODE), true);

// Finances documented a fixed 75/25 split and a $600 GTL cap long after both
// were removed in favour of configured values, which is what an agent read to
// understand their own money.
const FIN = readFileSync(join(ROOT, "src/routes/_authenticated/finances.tsx"), "utf8");
check("Finances no longer claims a fixed 75/25 split", /75% of first-year/.test(FIN), false);
check("…nor a hard-coded GTL cap", /capped at \$600/.test(FIN), false);
check("…and says the override follows the same schedule",
  /advanced and paid down exactly like your own year one/.test(FIN), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
