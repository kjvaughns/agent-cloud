/**
 * Exercise the commission calculator against a stand-in database.
 *
 *   npx tsx scripts/commission-check.ts
 *
 * The cases below are the ones that were producing wrong money, and each
 * asserts the behaviour rather than printing it — so this fails loudly if
 * somebody reintroduces a fallback rate or loosens the grid match.
 *
 * A mock rather than Postgres because what is being checked is the arithmetic
 * and the branching, not SQL — but the mock matches PostgREST where it counts,
 * which is that maybeSingle() over several rows is an error, not a pick.
 * Getting that wrong is what let the original renewal bug hide.
 *
 * Rewritten when the canonical resolver landed. The intents are unchanged;
 * what moved is where the numbers come from. Compensation now resolves
 * through `lib/compensation/resolve.ts` — contract override, then the level
 * and carrier mapping, then the level's base percentage — instead of reading
 * `agent_commission_levels` and nothing else, and an unresolvable agent gets a
 * visible issue row rather than a console warning and a queue nobody reads.
 */

import { calculateAndInsertAllCommissions } from "../src/lib/commission-calculator";

type Tables = Record<string, any[]>;

/** Minimal chainable stand-in for the supabase query builder. */
function mockClient(tables: Tables) {
  const inserted: Record<string, any[]> = {};
  const updated: Record<string, any[]> = {};

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      },
      is: (col: string, val: any) => {
        rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val));
        return chain;
      },
      in: (col: string, vals: any[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return chain;
      },
      not: (col: string, op: string, _v: any) => {
        // `not(col, "in", "(...)")` is the supersede sweep; the rest is the
        // grid's "level is set" filter.
        if (op === "in") return chain;
        rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
        return chain;
      },
      or: (expr: string) => {
        const wanted = expr.match(/organization_id\.eq\.([0-9a-zA-Z-]+)/)?.[1];
        rows = rows.filter((r) => r.organization_id == null || r.organization_id === wanted);
        return chain;
      },
      order: (col: string, opts?: { nullsFirst?: boolean }) => {
        const nullsFirst = opts?.nullsFirst !== false;
        rows.sort((a, b) => {
          const an = a[col] == null,
            bn = b[col] == null;
          if (an && bn) return 0;
          if (an) return nullsFirst ? -1 : 1;
          if (bn) return nullsFirst ? 1 : -1;
          return a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
        });
        return chain;
      },
      limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      // Faithful to PostgREST: more than one match is an error and `data` is
      // null. A mock that hands back the first row makes a broken query look
      // fine, which is exactly how the renewal bug survived.
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
      upsert: (payload: any) => {
        const list = Array.isArray(payload) ? payload : [payload];
        (inserted[table] ??= []).push(...list);
        return Promise.resolve({ data: null, error: null });
      },
      update: (payload: any) => {
        (updated[table] ??= []).push(payload);
        return chain;
      },
      then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return chain;
  }

  return { client: { from: builder }, inserted, updated };
}

const AGENT = "agent-1";
const UPLINE = "upline-1";
const CARRIER = "carrier-1";
const ORG = "org-1";
const OC = "oc-1";

/**
 * A fully configured agency: two rungs, one carrier with a nine-month advance,
 * and a mapping that tells the calculator what the carrier calls each rung.
 */
const baseTables = (): Tables => ({
  commission_schedule: [],
  commission_setup_issues: [],
  carriers: [
    {
      id: CARRIER,
      name: "Mutual of Test",
      advance_cap: null,
      advance_cap_amount: null,
      advance_cap_months: null,
    },
  ],
  profiles: [
    { id: AGENT, organization_id: ORG, upline_id: UPLINE, agency_level_id: "lvl-ga" },
    { id: UPLINE, organization_id: ORG, upline_id: null, agency_level_id: "lvl-owner" },
  ],
  agency_levels: [
    {
      id: "lvl-ga",
      organization_id: ORG,
      name: "General Agent",
      base_pct: 80,
      sort_order: 2,
      can_invite: true,
      active: true,
    },
    {
      id: "lvl-owner",
      organization_id: ORG,
      name: "Owner",
      base_pct: 100,
      sort_order: 1,
      can_invite: true,
      active: true,
    },
  ],
  // The carrier calls these rungs "80%" and "100%", which is what the renewal
  // grid is keyed by. The agency calls them General Agent and Owner.
  agency_level_carrier_mappings: [
    {
      agency_level_id: "lvl-ga",
      org_carrier_id: OC,
      organization_id: ORG,
      carrier_pct: null,
      carrier_level_name: "80%",
      advance_option: null,
    },
    {
      agency_level_id: "lvl-owner",
      org_carrier_id: OC,
      organization_id: ORG,
      carrier_pct: null,
      carrier_level_name: "100%",
      advance_option: null,
    },
  ],
  agent_commission_levels: [],
  org_carriers: [
    {
      id: OC,
      organization_id: ORG,
      carrier_id: CARRIER,
      enabled: true,
      visible_to_agents: true,
      requestable_by_agents: true,
      available_for_post_deal: true,
      default_advance_option: "9_months",
    },
  ],
  // Two levels for the same carrier and product — the shape that used to make
  // maybeSingle() error and silently drop every renewal.
  commission_grids: [
    {
      carrier_id: CARRIER,
      product_name: "Term Life",
      level_name: "80%",
      organization_id: null,
      age_group_min: null,
      years_2_5_pct: 5,
      years_6_plus_pct: 2,
    },
    {
      carrier_id: CARRIER,
      product_name: "Term Life",
      level_name: "100%",
      organization_id: null,
      age_group_min: null,
      years_2_5_pct: 7,
      years_6_plus_pct: 3,
    },
  ],
});

const input = {
  policyId: "policy-1",
  agentId: AGENT,
  carrierId: CARRIER,
  product: "Term Life",
  monthlyPremium: 100, // annual 1200
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
  // 1200 * 5% — the agent's own rung, not the 100% row sitting beside it. The
  // match is on the CARRIER's name for the level ("80%"), not the agency's
  // ("General Agent"), which is why the mapping carries both.
  const yr2 = renewals.find((r) => r.payment_date === "2027-04-01");
  check("matched the agent's own level", yr2?.amount === 60, `got ${yr2?.amount}, expected 60`);
}

// ── 2. The ladder alone is enough: no per-agent row required ───────────────
{
  const { client, inserted } = mockClient(baseTables());
  await calculateAndInsertAllCommissions(client, input);
  const rows = inserted.commission_schedule ?? [];
  const advance = rows.find((r) => r.payment_type === "advance");

  console.log("\n2. Compensation from the agency level alone");
  // The fixture has NO agent_commission_levels row at all. Before the resolver
  // this wrote nothing; the ladder is the default now.
  // Year one = 1200 * 80% = 960. Nine months advanced = 100 * 9 * 0.8 = 720.
  check(
    "year one resolves from the level's base percentage",
    advance?.amount === 720,
    `got ${advance?.amount}, expected 720`,
  );
  // `deferred`, not `as_earned`.
  //
  // This asserted "as_earned", which `commission_schedule_payment_type_check`
  // has never allowed — the constraint lists advance, deferred, trail, override
  // and renewal. So every balance row the calculator built was rejected by the
  // database, agents were advanced nine months and never paid the remaining
  // three, and this check was green over it the whole time because it asserted
  // the same wrong string the code wrote.
  //
  // The fix was in the calculator; the lesson is here. A test that shares the
  // code's vocabulary cannot catch the code using the wrong word — this is the
  // second time in this suite that a fixture agreeing with the bug hid it.
  const asEarned = rows.filter((r) => r.payment_type === "deferred");
  check(
    "the balance pays as earned over the remaining three months",
    asEarned.length === 3 && asEarned[0].amount === 80,
    `got ${asEarned.length} rows at ${asEarned[0]?.amount}, expected 3 at 80`,
  );
}

// ── 3. Nothing resolvable writes nothing, and says why ─────────────────────
{
  const t = baseTables();
  // No rung, no mapping, no contract — nothing to resolve from.
  t.profiles = t.profiles.map((p) => (p.id === AGENT ? { ...p, agency_level_id: null } : p));
  const { client, inserted } = mockClient(t);
  await calculateAndInsertAllCommissions(client, input);

  console.log("\n3. An agent on no level");
  check("no commission rows invented", !inserted.commission_schedule, "rows were written");
  // The old code logged a warning and queued a row nobody reads. The agent and
  // the owner are told now.
  const issues = inserted.commission_setup_issues ?? [];
  check("a visible setup issue is recorded", issues.length === 1);
  check(
    "…naming what is missing",
    issues[0]?.failures?.includes("no_agency_level"),
    `got ${JSON.stringify(issues[0]?.failures)}`,
  );
}

// ── 4. A carrier with no advance option is a configuration error ───────────
{
  const t = baseTables();
  t.org_carriers = t.org_carriers.map((c) => ({ ...c, default_advance_option: null }));
  const { client, inserted } = mockClient(t);
  await calculateAndInsertAllCommissions(client, input);

  console.log("\n4. Carrier with no advance option");
  check("nothing is written", !inserted.commission_schedule, "rows were written");
  check(
    "the reason is the missing advance option",
    (inserted.commission_setup_issues ?? [])[0]?.failures?.includes("no_advance_option"),
  );
}

// ── 5. The upline override still walks the chain ──────────────────────────
{
  const { client, inserted } = mockClient(baseTables());
  await calculateAndInsertAllCommissions(client, input);
  const overrides = (inserted.commission_schedule ?? []).filter(
    (r) => r.payment_type === "override",
  );

  console.log("\n5. Upline override");
  // The 100% Owner over an 80% writer on 1200 = 240.
  check(
    "override written to the upline",
    overrides.length === 1 && overrides[0].agent_id === UPLINE,
  );
  check(
    "spread is the difference in levels",
    overrides[0]?.amount === 240,
    `got ${overrides[0]?.amount}, expected 240`,
  );
}

// ── 6. Every payment carries a stable key ─────────────────────────────────
{
  const { client, inserted } = mockClient(baseTables());
  await calculateAndInsertAllCommissions(client, input);
  const rows = inserted.commission_schedule ?? [];

  console.log("\n6. Idempotency");
  check(
    "every row has a key",
    rows.every((r) => typeof r.idempotency_key === "string" && r.idempotency_key.length > 0),
  );
  // The bug this prevents: two legs of one policy sharing a key would mean the
  // second silently replaced the first.
  const keys = rows.map((r) => r.idempotency_key);
  check(
    "no two payments share a key",
    new Set(keys).size === keys.length,
    `${keys.length} rows, ${new Set(keys).size} distinct`,
  );
  check("the key names the payment", keys[0]?.startsWith("policy-1:"), `got ${keys[0]}`);
  check(
    "one run is traceable",
    rows.every((r) => r.calc_run_id === rows[0].calc_run_id),
  );
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
