/**
 * Does the gate let the right people through, and does the upsell stay honest?
 *
 *   npm run check:upsells
 *
 * Two kinds of assertion here and the second matters more.
 *
 * The first is the gate: subscribers always through, one free run on the
 * agent's own book, and — the one that decides the design — the gate FAILS
 * OPEN when its usage table cannot be read. That table is a pending migration
 * applied by hand, and blocking would mean denying somebody a feature because
 * an audit table was late. The cost of failing open is a free run.
 *
 * The second is the copy. The FTC's click-to-cancel rule is in force and state
 * AGs are enforcing against subscription dark patterns, so "no confirmshaming"
 * is not a style preference. These check the actual strings.
 */

import {
  resolveAccess, shouldRetire, placement, GATED, GATED_IDS, PLACEMENTS,
  EXPLICITLY_FREE, FREE_TRIAL_RUNS, TRIAL_WINDOW_DAYS, MIN_CONVERSION_RATE,
} from "../src/lib/nova-features";

let pass = 0;
const failures: string[] = [];
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  }
}

const TODAY = "2026-08-06";
const RECENT = "2026-08-01";   // 5 days old
const OLD = "2026-01-01";      // well past the window

console.log("\n1. Subscribers");

for (const status of ["active", "grace_period"]) {
  const a = resolveAccess({ novaProStatus: status, runsUsed: 99, accountCreatedAt: OLD, asOf: TODAY });
  check(`${status} is always allowed`, a.allowed, true);
  check(`${status} reads as subscribed`, a.mode, "subscribed");
  check(`${status} has no run counter`, a.runsLeft, null);
  // A subscriber must never see an upsell for what they already pay for.
  check(`${status} gets no message`, a.message, "");
}
check("past_due is not a subscription",
  resolveAccess({ novaProStatus: "past_due", runsUsed: 0, accountCreatedAt: RECENT, asOf: TODAY }).mode,
  "trial");

console.log("\n2. The free run");

const first = resolveAccess({ novaProStatus: null, runsUsed: 0, accountCreatedAt: RECENT, asOf: TODAY });
check("a new account gets one run", first.allowed, true);
check("and is told it is free", /on us/i.test(first.message), true);
check("with the count", first.runsLeft, FREE_TRIAL_RUNS);

const used = resolveAccess({ novaProStatus: null, runsUsed: 1, accountCreatedAt: RECENT, asOf: TODAY });
check("the second run is gated", used.allowed, false);
check("and says so plainly", used.mode, "trial_used");

const expired = resolveAccess({ novaProStatus: null, runsUsed: 0, accountCreatedAt: OLD, asOf: TODAY });
check("an old account has missed the window", expired.allowed, false);
check("which is its own state", expired.mode, "trial_expired");
// An account with no creation date is a data gap, not a reason to refuse.
check("an unknown signup date does not deny the run",
  resolveAccess({ novaProStatus: null, runsUsed: 0, accountCreatedAt: null, asOf: TODAY }).allowed, true);

console.log("\n3. Failing open — the decision the migration forced");

// The usage table is applied by hand. If it is not there yet, allow the run.
// Denying a feature because an audit table was late is the worse failure.
const unknown = resolveAccess({
  novaProStatus: null, runsUsed: 0, accountCreatedAt: OLD, asOf: TODAY, usageUnknown: true,
});
check("an unreadable usage table allows the run", unknown.allowed, true);
// Even past the window — because we cannot know whether they used it.
check("even for an account past the window", unknown.mode, "trial");

console.log("\n4. The copy — no dark patterns");

const allMessages = [
  resolveAccess({ novaProStatus: null, runsUsed: 1, accountCreatedAt: RECENT, asOf: TODAY }).message,
  resolveAccess({ novaProStatus: null, runsUsed: 0, accountCreatedAt: OLD, asOf: TODAY }).message,
  ...PLACEMENTS.map((p) => `${p.headline} ${p.body}`),
];

// Confirmshaming: "No thanks, I'll keep doing commissions by hand".
const SHAMING = /by hand anyway|i'?ll keep|no thanks|don'?t care about|missing out|too busy to/i;
check("nothing shames the user", allMessages.some((m) => SHAMING.test(m)), false);

// Fear and urgency belong to the compliance screen's prohibited list for
// client messages; they have no business in our own upsell either.
const SCARE = /act now|last chance|expires? (?:today|tonight)|hurry|don'?t lose|before it'?s too late/i;
check("nothing manufactures urgency", allMessages.some((m) => SCARE.test(m)), false);

check("every message says something concrete",
  allMessages.every((m) => m.length > 20), true);

console.log("\n5. What is gated, and what is explicitly not");

check("three features are gated", GATED_IDS.length, 3);
check("the lapse scan is one", GATED_IDS.includes("lapse_scan"), true);
check("compliance screening is one", GATED_IDS.includes("compliance_screen"), true);
check("review prep is one", GATED_IDS.includes("review_prep"), true);

// The one that must NOT be gated. It existed before this work and was free;
// converting it is exactly what the prompt's hard rules forbid.
check("reconciliation is not gated",
  GATED_IDS.some((id) => /reconcil/i.test(id)), false);
check("and it is named as free out loud",
  EXPLICITLY_FREE.some((f) => /reconcil/i.test(f.label)), true);
check("as is the Nova assistant",
  EXPLICITLY_FREE.some((f) => /assistant/i.test(f.label)), true);

check("every gated feature has a pitch",
  GATED_IDS.every((id) => GATED[id].pitch.length > 30), true);
check("and somewhere to go",
  GATED_IDS.every((id) => GATED[id].path.startsWith("/")), true);

console.log("\n6. Placements");

check("every placement names its moment",
  PLACEMENTS.every((p) => p.when.length > 15), true);
check("every placement points at a gated feature",
  PLACEMENTS.every((p) => GATED_IDS.includes(p.feature)), true);
check("placement ids are unique",
  new Set(PLACEMENTS.map((p) => p.id)).size, PLACEMENTS.length);
check("a known placement resolves", placement("book_over_fifty")?.feature, "lapse_scan");
check("an unknown one is null, not a guess", placement("nope"), null);

console.log("\n7. Killing a placement that does not work");

check("below the floor with enough data, retire it",
  shouldRetire({ impressions: 1000, conversions: 2 }), true);
check("above the floor, keep it",
  shouldRetire({ impressions: 1000, conversions: 50 }), false);
// Two conversions in fifty impressions is noise in both directions.
check("too few impressions to judge",
  shouldRetire({ impressions: 50, conversions: 0 }), false);
check("the floor is written down, not remembered", MIN_CONVERSION_RATE, 0.005);
check("the trial window is too", TRIAL_WINDOW_DAYS, 14);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
