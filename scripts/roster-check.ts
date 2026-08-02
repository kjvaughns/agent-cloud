/**
 * Where an agent sits, and why.
 *
 * `npx tsx scripts/roster-check.ts`
 *
 * `src/lib/team-roster.ts` is pure and takes its facts as an argument, so all
 * of this runs without a database. That is the point of the split: the decisions
 * worth arguing about are here, not tangled into a query.
 *
 * Three of these guard against a specific way this goes wrong:
 *
 *   an agent with nothing on file must not read as compliant — "we have not
 *   been told" and "everything is current" are different answers and only one
 *   of them is green
 *
 *   a brand-new agent with no sales must not be flagged for not selling, or the
 *   flag fires on everybody and stops meaning anything
 *
 *   persistency of `null` means there were no eligible policies in the band,
 *   which is not 0% — treating it as a number flags every agent whose book is
 *   younger than thirteen months
 *
 * Run alongside `onboarding-actor-check.ts` and `revocation-check.ts`.
 */

import {
  complianceLevel, daysSince, daysUntil, lifecycleStage, riskFlags,
  type AgentFacts,
} from "../src/lib/team-roster";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// A fixed "now" so nothing here depends on the day it runs.
const NOW = Date.UTC(2026, 7, 2);
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);
const agoDays = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const BASE: AgentFacts = {
  status: "active",
  liveLicences: 2,
  nextLicenceExpiry: inDays(300),
  eoExpiry: inDays(300),
  eoPresent: true,
  activeCarriers: 3,
  policiesCount: 20,
  lastSaleAt: agoDays(2),
  firstContractedAt: agoDays(400),
  persistencyPct: 92,
};
const f = (over: Partial<AgentFacts>): AgentFacts => ({ ...BASE, ...over });

// ── Date helpers ────────────────────────────────────────────────────────

console.log("");
check("daysUntil counts forward", daysUntil(inDays(45), NOW), 45);
check("daysUntil goes negative once past", daysUntil(inDays(-3), NOW), -3);
check("daysUntil of null is null, not 0", daysUntil(null, NOW), null);
check("daysSince counts back", daysSince(agoDays(14), NOW), 14);
check("daysSince of null is null, not 0", daysSince(null, NOW), null);
check("an unparseable date is null, not NaN", daysUntil("not a date", NOW), null);

// ── The compliance dot ──────────────────────────────────────────────────

console.log("");
check("everything current is ok", complianceLevel(BASE, NOW), "ok");

// The one that matters: nothing on file is not a pass.
check("nothing on file at all is unknown, never ok",
  complianceLevel(f({ liveLicences: 0, eoPresent: false, nextLicenceExpiry: null, eoExpiry: null }), NOW),
  "unknown");

check("no live licence is bad", complianceLevel(f({ liveLicences: 0 }), NOW), "bad");
check("an expired licence is bad", complianceLevel(f({ nextLicenceExpiry: inDays(-1) }), NOW), "bad");
check("expired E&O is bad", complianceLevel(f({ eoExpiry: inDays(-1) }), NOW), "bad");
check("a licence expiring in 45 days warns", complianceLevel(f({ nextLicenceExpiry: inDays(45) }), NOW), "warn");
check("46 days is still ok", complianceLevel(f({ nextLicenceExpiry: inDays(46) }), NOW), "ok");
check("E&O expiring in 30 days warns", complianceLevel(f({ eoExpiry: inDays(30) }), NOW), "warn");
check("31 days is still ok", complianceLevel(f({ eoExpiry: inDays(31) }), NOW), "ok");
check("licensed but no E&O warns", complianceLevel(f({ eoPresent: false, eoExpiry: null }), NOW), "warn");

// ── The flags ───────────────────────────────────────────────────────────

console.log("");
const keys = (x: AgentFacts) => riskFlags(x, NOW).map((r) => r.key);

check("a producing agent in good standing has no flags", keys(BASE), []);
check("no submission in 14 days flags", keys(f({ lastSaleAt: agoDays(14) })), ["no_sales"]);
check("13 days does not", keys(f({ lastSaleAt: agoDays(13) })), []);

// A new agent who has never sold is onboarding, not at risk. Flagging them
// buries the agents who genuinely stopped.
check("never sold and never contracted does not flag as stalled",
  keys(f({ policiesCount: 0, lastSaleAt: null, activeCarriers: 0, firstContractedAt: null })), []);

// But contracted-and-idle is a real problem, after a grace period.
check("contracted 30 days with nothing submitted flags",
  keys(f({ policiesCount: 0, lastSaleAt: null, firstContractedAt: agoDays(30) })), ["never_sold"]);
check("contracted 29 days does not",
  keys(f({ policiesCount: 0, lastSaleAt: null, firstContractedAt: agoDays(29) })), []);

check("a licence expiring in 45 days flags", keys(f({ nextLicenceExpiry: inDays(45) })), ["licence_expiring"]);
check("46 days does not", keys(f({ nextLicenceExpiry: inDays(46) })), []);
check("E&O expiring in 30 days flags", keys(f({ eoExpiry: inDays(30) })), ["eo_expiring"]);
check("31 days does not", keys(f({ eoExpiry: inDays(31) })), []);

// Null is "nothing to measure", not zero.
check("persistency of null does not flag", keys(f({ persistencyPct: null })), []);
check("persistency of 77 flags", keys(f({ persistencyPct: 77 })), ["persistency"]);
check("persistency of 78 does not", keys(f({ persistencyPct: 78 })), []);

// Severity escalates rather than just existing.
const sev = (x: AgentFacts, k: string) => riskFlags(x, NOW).find((r) => r.key === k)?.severity;
check("30 days without a sale is critical", sev(f({ lastSaleAt: agoDays(30) }), "no_sales"), "critical");
check("14 days is a warning", sev(f({ lastSaleAt: agoDays(14) }), "no_sales"), "warn");
check("an already-expired licence is critical", sev(f({ nextLicenceExpiry: inDays(-1) }), "licence_expiring"), "critical");

// The reason carries the number. A flag reading "Licence expiring" would send
// somebody to another screen to find out how urgent it is.
check("the reason names the number",
  riskFlags(f({ nextLicenceExpiry: inDays(32) }), NOW)[0].reason,
  "Licence expires in 32 days");
check("an expired licence says how long ago",
  riskFlags(f({ nextLicenceExpiry: inDays(-5) }), NOW)[0].reason,
  "Licence expired 5 days ago");

// Somebody already revoked is not "at risk" — they are gone. Stacking flags on
// them pushes live problems down the list.
check("a terminated agent has no flags", keys(f({ status: "terminated", lastSaleAt: agoDays(300) })), []);
check("an inactive agent has no flags", keys(f({ status: "inactive", lastSaleAt: agoDays(300) })), []);

// ── The stage ───────────────────────────────────────────────────────────

console.log("");
const stage = (x: AgentFacts) => lifecycleStage(x, riskFlags(x, NOW));

check("producing and clean is active", stage(BASE), "active");
check("status wins over everything", stage(f({ status: "terminated" })), "terminated");
check("inactive too", stage(f({ status: "inactive" })), "inactive");
check("no licence is onboarding", stage(f({ liveLicences: 0 })), "onboarding");
check("licensed with no carriers is licensed", stage(f({ activeCarriers: 0 })), "licensed");
check("contracted with no policies is contracted",
  stage(f({ policiesCount: 0, lastSaleAt: null, firstContractedAt: agoDays(5) })), "contracted");
check("a flag on a producing agent is at risk", stage(f({ lastSaleAt: agoDays(20) })), "at_risk");

// Order matters: an unlicensed agent is Onboarding, not At risk, even though
// the missing licence would also raise a flag. The earlier stage is the more
// useful answer — it says what to do next rather than that something is wrong.
check("no licence beats the flag it would raise",
  stage(f({ liveLicences: 0, nextLicenceExpiry: inDays(-10) })), "onboarding");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
