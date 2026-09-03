/**
 * What an agent earns, and who gets paid above them.
 *
 *   npx tsx scripts/compensation-check.ts
 *
 * These are the business rules the product is worth nothing without, and every
 * one of them had a way of being silently wrong before this module existed:
 *
 *   * The commission calculator read only `agent_commission_levels`, so an
 *     agency could build its whole promotion ladder, watch it render on every
 *     roster row, and have commissions computed from somewhere else — or not
 *     computed at all.
 *   * Where a percentage was missing it fell back to a hard-coded 70 or 75,
 *     paying a number nobody chose.
 *   * The override walk stopped at five uplines, so a sixth-level agency owner
 *     was simply not paid.
 *   * `if (pct > 1) pct = pct / 100` guessed at whether a number was a
 *     percentage or a multiplier instead of knowing.
 *
 * Each of those has an assertion here.
 */

import {
  resolveCompensation,
  carrierConfiguration,
  planYearOne,
  resolveOverrides,
  asFraction,
  isAdvanceOption,
  ADVANCE_MONTHS,
  ADVANCE_OPTIONS,
  type AgencyLevel,
  type LevelCarrierMapping,
  type ContractOverride,
  type AgencyCarrier,
} from "../src/lib/compensation/resolve";

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

const level = (o: Partial<AgencyLevel> = {}): AgencyLevel => ({
  id: "lvl-ga",
  name: "General Agent",
  base_pct: 80,
  sort_order: 3,
  can_invite: true,
  active: true,
  ...o,
});

const carrier = (o: Partial<AgencyCarrier> = {}): AgencyCarrier => ({
  org_carrier_id: "oc-1",
  enabled: true,
  visible_to_agents: true,
  requestable_by_agents: true,
  available_for_post_deal: true,
  default_advance_option: "9_months",
  ...o,
});

const mapping = (o: Partial<LevelCarrierMapping> = {}): LevelCarrierMapping => ({
  agency_level_id: "lvl-ga",
  org_carrier_id: "oc-1",
  carrier_pct: null,
  advance_option: null,
  ...o,
});

const contract = (o: Partial<ContractOverride> = {}): ContractOverride => ({
  agent_id: "a1",
  org_carrier_id: "oc-1",
  assigned_pct: null,
  advance_option: null,
  status: "active",
  ...o,
});

const base = { agentId: "a1", orgCarrierId: "oc-1" };

// ── The resolution order ────────────────────────────────────────────────────

const r1 = resolveCompensation({
  ...base,
  level: level(),
  mapping: null,
  contract: null,
  carrier: carrier(),
});
check("the level's base percentage is the fallback", r1.ok && [r1.pct, r1.pctSource], [
  80,
  "level_base",
]);

const r2 = resolveCompensation({
  ...base,
  level: level(),
  mapping: mapping({ carrier_pct: 85 }),
  contract: null,
  carrier: carrier(),
});
check("a level-and-carrier mapping outranks the base", r2.ok && [r2.pct, r2.pctSource], [
  85,
  "level_carrier",
]);

const r3 = resolveCompensation({
  ...base,
  level: level(),
  mapping: mapping({ carrier_pct: 85 }),
  contract: contract({ assigned_pct: 90 }),
  carrier: carrier(),
});
check("an active contract outranks the mapping", r3.ok && [r3.pct, r3.pctSource], [90, "contract"]);

// History is not terms.
const r4 = resolveCompensation({
  ...base,
  level: level(),
  mapping: mapping({ carrier_pct: 85 }),
  contract: contract({ assigned_pct: 90, status: "terminated" }),
  carrier: carrier(),
});
check("a contract that is not active overrides nothing", r4.ok && [r4.pct, r4.pctSource], [
  85,
  "level_carrier",
]);

// ── Failing loudly ──────────────────────────────────────────────────────────

console.log("");

// The whole point: no silent 70 or 75.
const noLevel = resolveCompensation({
  ...base,
  level: null,
  mapping: null,
  contract: null,
  carrier: carrier(),
});
check("an agent on no level does not resolve", noLevel.ok, false);
check("…and is told to be placed, not to configure a carrier", !noLevel.ok && noLevel.failures, [
  "no_agency_level",
]);

const noPct = resolveCompensation({
  ...base,
  level: level({ base_pct: null as any }),
  mapping: null,
  contract: null,
  carrier: carrier(),
});
check("a level with no base and no mapping does not resolve", noPct.ok, false);

const noCarrier = resolveCompensation({
  ...base,
  level: level(),
  mapping: null,
  contract: null,
  carrier: null,
});
check("an unconfigured carrier does not resolve", !noCarrier.ok && noCarrier.failures, [
  "carrier_not_configured",
]);

const off = resolveCompensation({
  ...base,
  level: level(),
  mapping: null,
  contract: null,
  carrier: carrier({ enabled: false }),
});
check("a disabled carrier does not resolve", !off.ok && off.failures, ["carrier_disabled"]);

// An owner fixing configuration wants the whole list, not one trip per fault.
const twoFaults = resolveCompensation({
  ...base,
  level: null,
  mapping: null,
  contract: null,
  carrier: carrier({ default_advance_option: null }),
});
check("every reason is collected, not just the first", !twoFaults.ok && twoFaults.failures.sort(), [
  "no_advance_option",
  "no_agency_level",
]);
check(
  "…each with a sentence an owner can act on",
  !twoFaults.ok && twoFaults.messages.every((m) => m.length > 20),
  true,
);

// ── Advances ────────────────────────────────────────────────────────────────

console.log("");

check(
  "the carrier default is the advance floor",
  r1.ok && [r1.advance, r1.advanceSource, r1.advanceMonths],
  ["9_months", "carrier_default", 9],
);
check(
  "a mapping may override the carrier default",
  (() => {
    const r = resolveCompensation({
      ...base,
      level: level(),
      mapping: mapping({ advance_option: "6_months" }),
      contract: null,
      carrier: carrier(),
    });
    return r.ok && [r.advance, r.advanceSource];
  })(),
  ["6_months", "level_carrier"],
);
check(
  "a contract may override both",
  (() => {
    const r = resolveCompensation({
      ...base,
      level: level(),
      mapping: mapping({ advance_option: "6_months" }),
      contract: contract({ assigned_pct: 90, advance_option: "12_months" }),
      carrier: carrier(),
    });
    return r.ok && [r.advance, r.advanceSource];
  })(),
  ["12_months", "contract"],
);
check(
  "a carrier with no advance option does not resolve",
  (() => {
    const r = resolveCompensation({
      ...base,
      level: level(),
      mapping: null,
      contract: null,
      carrier: carrier({ default_advance_option: null }),
    });
    return !r.ok && r.failures;
  })(),
  ["no_advance_option"],
);
check("as-earned is zero advanced months", ADVANCE_MONTHS.as_earned, 0);
check("the option list is exactly the five allowed", ADVANCE_OPTIONS.length, 5);
check("an arbitrary string is not an advance option", isAdvanceOption("7_months"), false);

// ── Year one ────────────────────────────────────────────────────────────────

console.log("");

// $100/mo at 80% with a 9-month advance.
const y = planYearOne(100, 80, 9);
check("year one is annual premium times the rate", y.yearOneTotal, 960);
check("the advance is monthly premium × months × rate", y.advanceAmount, 720);
check(
  "the balance pays as earned over the rest of the year",
  [y.balance, y.asEarnedMonths, y.monthlyAsEarned],
  [240, 3, 80],
);

const asEarned = planYearOne(100, 80, 0);
check(
  "as-earned advances nothing and pays all twelve months",
  [asEarned.advanceAmount, asEarned.asEarnedMonths, asEarned.monthlyAsEarned],
  [0, 12, 80],
);

const full = planYearOne(100, 80, 12);
check(
  "a twelve-month advance leaves no balance",
  [full.advanceAmount, full.balance, full.monthlyAsEarned],
  [960, 0, 0],
);

// The unit bug, pinned: 80 is a percentage, never a multiplier.
check("80 means eighty per cent", asFraction(80), 0.8);
check(
  "…and a contract above 100% is legitimate, not a typo",
  planYearOne(100, 120, 0).yearOneTotal,
  1440,
);

// ── Overrides up the chain ──────────────────────────────────────────────────

console.log("");

const CHAIN = [
  { agentId: "up1", pct: 85 },
  { agentId: "up2", pct: 90 },
  { agentId: "up3", pct: 100 },
];
const legs = resolveOverrides(80, CHAIN, 1200);
check(
  "each upline earns only their own spread",
  legs.map((l) => [l.agentId, l.spread, l.amount]),
  [
    ["up1", 5, 60],
    ["up2", 5, 60],
    ["up3", 10, 120],
  ],
);
check(
  "the chain never pays out more than the top percentage",
  legs.reduce((s, l) => s + l.spread, 0) + 80,
  100,
);

// An upline on the same level earns nothing, and a zero row is not written.
check(
  "a flat upline is paid nothing rather than zero",
  resolveOverrides(80, [{ agentId: "same", pct: 80 }], 1200),
  [],
);
// A worse contract above a better one must never claw money back.
check(
  "a negative spread is never paid",
  resolveOverrides(90, [{ agentId: "lower", pct: 80 }], 1200),
  [],
);
// …and must not block the people above them.
check(
  "…and does not stop the chain",
  resolveOverrides(
    90,
    [
      { agentId: "lower", pct: 80 },
      { agentId: "top", pct: 100 },
    ],
    1200,
  ).map((l) => [l.agentId, l.spread]),
  [["top", 10]],
);

// The old five-deep cap silently skipped an agency owner at level six.
const DEEP = Array.from({ length: 8 }, (_, i) => ({ agentId: `up${i + 1}`, pct: 81 + i }));
check("the walk goes past five", resolveOverrides(80, DEEP, 1200).length, 8);
check("…but is capped", resolveOverrides(80, DEEP, 1200, 3).length, 3);
// upline_id is a plain self-reference; nothing in the database stops a loop.
check(
  "a cycle terminates",
  resolveOverrides(
    80,
    [
      { agentId: "a", pct: 85 },
      { agentId: "a", pct: 90 },
    ],
    1200,
  ).length,
  1,
);
check(
  "somebody with no resolvable percentage is skipped, not treated as zero",
  resolveOverrides(
    80,
    [
      { agentId: "unset", pct: null },
      { agentId: "top", pct: 100 },
    ],
    1200,
  ).map((l) => [l.agentId, l.spread]),
  [["top", 20]],
);

// ── Is a carrier usable? ────────────────────────────────────────────────────

console.log("");

const LEVELS = [
  level({ id: "l1", name: "Agent", base_pct: 70 }),
  level({ id: "l2", name: "GA", base_pct: 80 }),
];
check(
  "a carrier resolving every level from base alone is configured",
  carrierConfiguration(carrier(), LEVELS, []).configured,
  true,
);
check(
  "…and a full product grid is not required",
  carrierConfiguration(carrier(), LEVELS, []).reasons,
  [],
);
check(
  "no advance option means not configured",
  carrierConfiguration(carrier({ default_advance_option: null }), LEVELS, []).configured,
  false,
);

const NO_BASE = [level({ id: "l3", name: "Trainee", base_pct: null as any })];
check(
  "a level that resolves to nothing is named in the reason",
  carrierConfiguration(carrier(), NO_BASE, []).reasons.some((r) => r.includes("Trainee")),
  true,
);
check(
  "…and a mapping for that level fixes it",
  carrierConfiguration(carrier(), NO_BASE, [mapping({ agency_level_id: "l3", carrier_pct: 60 })])
    .configured,
  true,
);
check(
  "an agency with no levels cannot be configured",
  carrierConfiguration(carrier(), [], []).configured,
  false,
);

// ── An override is advanced and deferred like any other year-one money ─────
//
// Reported as "overrides aren't being calculated properly for finances". They
// were not: the calculator wrote ONE row for the full twelve months of spread,
// dated the effective date, while the writing agent's own year one was
// advanced for the configured months and the remainder paid monthly.
//
// So on a $100/month policy the agent at 80% got $720 up front and $240 over
// three months, and their upline got the whole $240 of override on day one —
// paid on three months of premium the carrier had not advanced. Finances told
// everybody the opposite: its own explainer said the advance and trail split
// applied to overrides.
//
// The spread is now put through `planYearOne`, the same function that splits
// the writing agent's year one, so the two agree by construction.

console.log("");

{
  const MONTHLY = 100, MONTHS = 9;
  const direct = planYearOne(MONTHLY, 80, MONTHS);
  const [leg] = resolveOverrides(80, [{ agentId: "up", pct: 100 }], MONTHLY * 12);
  const override = planYearOne(MONTHLY, leg.spread, MONTHS);

  check("the override's year-one total is still the full spread",
    override.yearOneTotal, leg.amount);
  check("…but only the advanced months are paid up front",
    override.advanceAmount, 180);
  check("…and the rest is deferred", [override.balance, override.asEarnedMonths], [60, 3]);
  check("the upline no longer receives twelve months on day one",
    override.advanceAmount < leg.amount, true);

  // The two schedules must line up, or Finances shows an override arriving in
  // a month the writing agent's own money does not.
  check("override and direct advance the same months",
    override.asEarnedMonths, direct.asEarnedMonths);
  check("…and both advance on the same proportion of the year",
    round4(override.advanceAmount / override.yearOneTotal),
    round4(direct.advanceAmount / direct.yearOneTotal));

  // As-earned carriers advance nothing — for the upline too.
  const asEarned = planYearOne(MONTHLY, leg.spread, 0);
  check("an as-earned carrier advances no override either",
    [asEarned.advanceAmount, asEarned.asEarnedMonths], [0, 12]);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Both sides of the spread are priced the same way ───────────────────────
//
// The writing agent is resolved against the carrier's grid, so a young
// non-tobacco case can price them at the 110% row. Each upline was resolved
// WITHOUT the grid, from their flat level — so a 100% owner came out ten
// points BELOW their own agent and earned nothing, on exactly the deals that
// paid best. This is the arithmetic that produced it.
check("a grid rate above the upline's level wipes out the override",
  resolveOverrides(110, [{ agentId: "owner", pct: 100 }], 1200).length, 0);
// …which is correct arithmetic on numbers that were never comparable, so the
// repair is upstream in how the chain is priced. commission-wiring-check
// asserts that end, since it is the script that reads the calculator.

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
