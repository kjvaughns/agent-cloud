/**
 * Exercise the commission calculator against a stand-in database.
 *
 *   npx esbuild scripts/commission-check.ts --bundle --platform=node \
 *     --format=esm --outfile=.cc.mjs && node .cc.mjs
 *
 * The cases below are the ones that were producing wrong money, and each
 * asserts the behaviour rather than printing it — so this fails loudly if
 * somebody reintroduces a fallback rate or loosens the grid match.
 *
 * Checked against the code as it was: cases 1 and 2 both fail on the previous
 * implementation — zero renewal rows instead of nine, and a full schedule
 * built on an invented 70%. A test that passes either way would have been
 * worth nothing, and the first version of this file was exactly that, because
 * its maybeSingle() handed back the first row instead of erroring.
 *
 * A mock rather than Postgres because what is being checked is the arithmetic
 * and the branching, not SQL — but the mock matches PostgREST where it counts,
 * which is that maybeSingle() over several rows is an error, not a pick.
 */

import { calculateAndInsertAllCommissions } from "../src/lib/commission-calculator";

type Tables = Record<string, any[]>;

/** Minimal chainable stand-in for the supabase query builder. */
function mockClient(tables: Tables) {
  const inserted: Record<string, any[]> = {};

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      },
      not: (col: string, _op: string, _v: any) => {
        rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
        return chain;
      },
      // `organization_id.eq.X,organization_id.is.null`
      or: (expr: string) => {
        const wanted = expr.match(/organization_id\.eq\.([0-9a-zA-Z-]+)/)?.[1];
        rows = rows.filter((r) => r.organization_id == null || r.organization_id === wanted);
        return chain;
      },
      order: (col: string, opts?: { nullsFirst?: boolean }) => {
        const nullsFirst = opts?.nullsFirst !== false;
        rows.sort((a, b) => {
          const an = a[col] == null, bn = b[col] == null;
          if (an && bn) return 0;
          if (an) return nullsFirst ? -1 : 1;
          if (bn) return nullsFirst ? 1 : -1;
          return a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
        });
        return chain;
      },
      limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      // Faithful to PostgREST: more than one match is an error and `data` is
      // null. Getting this wrong is what let the original bug hide — a mock
      // that hands back the first row makes the broken query look fine.
      maybeSingle: () =>
        Promise.resolve(
          rows.length > 1
            ? { data: null, error: { code: "PGRST116", message: "multiple rows returned" } }
            : { data: rows[0] ?? null, error: null },
        ),
      insert: (payload: any) => {
        const list = Array.isArray(payload) ? payload : [payload];
        (inserted[table] ??= []).push(...list);
        return Promise.resolve({ data: null, error: null });
      },
      then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return chain;
  }

  return { client: { from: builder }, inserted };
}

const AGENT = "agent-1";
const UPLINE = "upline-1";
const CARRIER = "carrier-1";
const ORG = "org-1";

const baseTables = (): Tables => ({
  commission_schedule: [],
  commission_backfill_queue: [],
  carriers: [{ id: CARRIER, name: "Mutual of Test", advance_cap: null, advance_cap_amount: null, advance_cap_months: null }],
  profiles: [
    { id: AGENT, organization_id: ORG, upline_id: UPLINE },
    { id: UPLINE, organization_id: ORG, upline_id: null },
  ],
  agent_commission_levels: [
    { agent_id: AGENT, carrier_id: CARRIER, assigned_pct: 80, commission_level: "80%" },
    { agent_id: UPLINE, carrier_id: CARRIER, assigned_pct: 100, commission_level: "100%" },
  ],
  org_carriers: [{ id: "oc-1", organization_id: ORG, carrier_id: CARRIER }],
  carrier_comp_levels: [],
  // Two levels for the same carrier and product — the shape that used to make
  // maybeSingle() error and silently drop every renewal.
  commission_grids: [
    { carrier_id: CARRIER, product_name: "Term Life", level_name: "80%", organization_id: null, age_group_min: null, years_2_5_pct: 5, years_6_plus_pct: 2 },
    { carrier_id: CARRIER, product_name: "Term Life", level_name: "100%", organization_id: null, age_group_min: null, years_2_5_pct: 7, years_6_plus_pct: 3 },
  ],
});

const input = {
  policyId: "policy-1",
  agentId: AGENT,
  carrierId: CARRIER,
  product: "Term Life",
  monthlyPremium: 100,          // annual 1200
  effectiveDate: "2026-03-01",
  clientName: "Pat Doe",
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── 1. Renewals generate even when the carrier has several levels ──────────
{
  const { client, inserted } = mockClient(baseTables());
  await calculateAndInsertAllCommissions(client, input);
  const rows = inserted.commission_schedule ?? [];
  const renewals = rows.filter((r) => r.payment_type === "renewal");

  console.log("\n1. Multi-level carrier");
  check("renewal rows generated", renewals.length === 9, `got ${renewals.length}, expected 9`);
  // 1200 * 5% — the agent's own 80% row, not the 100% row sitting beside it.
  const yr2 = renewals.find((r) => r.payment_date === "2027-04-01");
  check("matched the agent's own level", yr2?.amount === 60, `got ${yr2?.amount}, expected 60`);
}

// ── 2. No assigned level writes nothing and queues for backfill ────────────
{
  const t = baseTables();
  t.agent_commission_levels = t.agent_commission_levels.filter((r) => r.agent_id !== AGENT);
  const { client, inserted } = mockClient(t);
  await calculateAndInsertAllCommissions(client, input);

  console.log("\n2. Agent with no assigned level");
  check("no commission rows invented", !inserted.commission_schedule, "rows were written");
  check("policy queued for backfill", inserted.commission_backfill_queue?.length === 1);
}

// ── 3. The configured advance percentage governs the split ────────────────
{
  const t = baseTables();
  t.carrier_comp_levels = [{ org_carrier_id: "oc-1", level_name: "80%", advance_pct: 60, advance_months: null }];
  const { client, inserted } = mockClient(t);
  await calculateAndInsertAllCommissions(client, input);
  const rows = inserted.commission_schedule ?? [];
  const advance = rows.find((r) => r.payment_type === "advance");
  const trail = rows.filter((r) => r.payment_type === "trail");

  console.log("\n3. Comp level sets advance to 60%");
  // year one = 1200 * 80% = 960. 60% advanced = 576, 40% trailed = 384 over 3.
  check("advance follows the comp level", advance?.amount === 576, `got ${advance?.amount}, expected 576`);
  check("balance trails over three months", trail.length === 3 && trail[0].amount === 128,
    `got ${trail.length} rows at ${trail[0]?.amount}, expected 3 at 128`);
}

// ── 4. The upline override still walks the chain ──────────────────────────
{
  const { client, inserted } = mockClient(baseTables());
  await calculateAndInsertAllCommissions(client, input);
  const overrides = (inserted.commission_schedule ?? []).filter((r) => r.payment_type === "override");

  console.log("\n4. Upline override");
  // 100% upline over an 80% writer on 1200 = 240.
  check("override written to the upline", overrides.length === 1 && overrides[0].agent_id === UPLINE);
  check("spread is the difference in levels", overrides[0]?.amount === 240, `got ${overrides[0]?.amount}, expected 240`);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
