/**
 * A carrier says where it stands, in the same words everywhere.
 *
 *   npx tsx scripts/carrier-status-check.ts
 *
 * ── The defect this exists for ──
 *
 * Four screens needed "is this carrier ready" and none of them had an answer:
 * the Carriers tab, the last step of Add Carrier, the activation toggle, and
 * the setup progress at the top of Agency Settings. None of the nine statuses
 * the brief names existed anywhere in the codebase, so each screen was about
 * to invent its own — which is how a product tells an owner a carrier is ready
 * on one screen and not on another.
 *
 * ── What is deliberately not tested here ──
 *
 * Whether the resolver's reasons are correct. They come from
 * `carrierConfiguration`, which has its own suite. This module orders them
 * into a lifecycle and must not re-diagnose, so the tests assert that the
 * resolver's sentences arrive unaltered rather than checking their contents.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CARRIER_STATUSES, STATUS_LABEL, carrierState, isSelectableByAgents,
  removalMode, removalExplanation, summarise, type CarrierFacts,
} from "../src/lib/carriers/status";

const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The lifecycle ───────────────────────────────────────────────────────────

check("the nine the brief names", [...CARRIER_STATUSES], [
  "draft", "needs_levels", "needs_grid_review", "needs_advance",
  "needs_contracting_method", "ready_to_activate", "active", "inactive", "archived",
]);
check("each has a label a person would read",
  CARRIER_STATUSES.every((s) => STATUS_LABEL[s].length > 3 && STATUS_LABEL[s][0] === STATUS_LABEL[s][0].toUpperCase()),
  true);

const ready = (over: Partial<CarrierFacts> = {}): CarrierFacts => ({
  orgCarrierId: "oc1",
  carrierName: "Transamerica",
  enabled: false,
  archived: false,
  levelCount: 4,
  gridRowCount: 12,
  unreviewedGridRowCount: 0,
  maxAdvance: "9_months",
  hasContractingMethod: true,
  configuration: { configured: true, reasons: [] },
  positionsOnFallback: [],
  ...over,
});

// ── A brand new carrier ─────────────────────────────────────────────────────

const blank = carrierState(ready({
  levelCount: 0, gridRowCount: 0, maxAdvance: null, hasContractingMethod: false,
  configuration: { configured: false, reasons: [] },
}));
// "You have not started" and "you started and stopped" want different words.
check("a carrier nobody has touched reads as a draft", blank.status, "draft");
check("…and cannot be activated", blank.canActivate, false);
check("…and says what to do first", /no contract levels yet/.test(blank.problems[0] ?? ""), true);

// ── The blocking steps, in wizard order ─────────────────────────────────────

check("no levels blocks first",
  carrierState(ready({ levelCount: 0, configuration: { configured: false, reasons: [] } })).status,
  "needs_levels");

// An owner told to choose an advance before defining a level is being sent to
// an empty screen, so order matters and is asserted rather than assumed.
check("…before the advance, even when both are missing",
  carrierState(ready({
    levelCount: 0, maxAdvance: null,
    configuration: { configured: false, reasons: [] },
  })).status,
  "needs_levels");

check("unreviewed extracted rates block",
  carrierState(ready({ unreviewedGridRowCount: 3 })).status, "needs_grid_review");
check("…and are counted by name",
  /3 extracted rates/.test(carrierState(ready({ unreviewedGridRowCount: 3 })).problems[0] ?? ""), true);
// One is not "1 rates".
check("…with singular wording for one",
  /1 extracted rate on Transamerica has not been confirmed/
    .test(carrierState(ready({ unreviewedGridRowCount: 1 })).problems[0] ?? ""), true);

check("a missing advance blocks", carrierState(ready({ maxAdvance: null })).status, "needs_advance");
check("…and says nothing is assumed",
  /Nothing is assumed on your behalf/.test(carrierState(ready({ maxAdvance: null })).problems[0] ?? ""), true);

check("a missing contracting method blocks",
  carrierState(ready({ hasContractingMethod: false })).status, "needs_contracting_method");
check("…because a request would have nowhere to go",
  /nowhere to go/.test(carrierState(ready({ hasContractingMethod: false })).problems[0] ?? ""), true);

// ── Ready, active, and the switch ───────────────────────────────────────────

check("a fully configured carrier is ready", carrierState(ready()).status, "ready_to_activate");
check("…and the switch is offered", carrierState(ready()).canActivate, true);
check("…with nothing to fix", carrierState(ready()).problems, []);

const live = carrierState(ready({ enabled: true }));
check("a switched-on carrier is active", live.status, "active");
// The switch is already on; offering to turn it on again is noise.
check("…and is not offered activation again", live.canActivate, false);
check("only an active carrier is selectable by agents", isSelectableByAgents(live), true);
check("…a ready one is not, until somebody switches it on",
  isSelectableByAgents(carrierState(ready())), false);

// ── The fallback, which is allowed but must be said out loud ────────────────

const fallback = carrierState(ready({ gridRowCount: 0, positionsOnFallback: ["Training Agent", "Agent"] }));
// The brief is explicit: do not block activation when the fallback is valid.
check("a carrier with no grid can still activate on the fallback", fallback.canActivate, true);
check("…and is marked as using it", fallback.usesFallback, true);
check("…naming the positions affected",
  /Training Agent, Agent/.test(fallback.problems[0] ?? ""), true);
check("…and what is being given up",
  /Product and age specific rates will not apply/.test(fallback.problems[0] ?? ""), true);
// A live carrier on the fallback must keep saying so, or the warning vanishes
// at exactly the moment it starts mattering.
check("…and an active carrier keeps saying so",
  carrierState(ready({ enabled: true, positionsOnFallback: ["Agent"] })).problems.length, 1);

// ── The resolver's words, not a second opinion ──────────────────────────────

const unresolved = carrierState(ready({
  configuration: {
    configured: false,
    reasons: ["No percentage resolves for Agent — give the level a base percentage or map it to this carrier."],
  },
}));
check("a mapping that does not add up is not a missing step", unresolved.status, "needs_grid_review");
check("…and keeps the resolver's own sentence",
  unresolved.problems[0],
  "No percentage resolves for Agent — give the level a base percentage or map it to this carrier.");
check("…and cannot be activated", unresolved.canActivate, false);

// ── States the owner chose ──────────────────────────────────────────────────

const archived = carrierState(ready({ archived: true, levelCount: 0, maxAdvance: null }));
// Telling somebody their archived carrier "needs levels" answers a question
// they did not ask.
check("an archived carrier is just archived", archived.status, "archived");
check("…with no setup nagging", archived.problems, []);
check("…and is not selectable", isSelectableByAgents(archived), false);

// ── Delete versus archive ───────────────────────────────────────────────────

const unused = { contracts: 0, policies: 0, requests: 0, commissionRecords: 0 };
check("an unused carrier can be deleted", removalMode(unused), "delete");
check("…and is told it cannot be undone",
  /cannot be undone/.test(removalExplanation("Transamerica", unused)), true);

// Conservative on purpose: getting this backwards loses commission history.
check("one policy is enough to force archive",
  removalMode({ ...unused, policies: 1 }), "archive");
check("one commission record is too",
  removalMode({ ...unused, commissionRecords: 1 }), "archive");
check("one open request is too",
  removalMode({ ...unused, requests: 1 }), "archive");
check("…and the explanation counts what is attached",
  /2 policies, 1 contract/.test(
    removalExplanation("Transamerica", { ...unused, policies: 2, contracts: 1 })), true);
check("…and says archived carriers can be restored",
  /can be restored/.test(removalExplanation("T", { ...unused, policies: 1 })), true);

// ── The header counts ───────────────────────────────────────────────────────

const states = [
  carrierState(ready({ enabled: true })),
  carrierState(ready({ enabled: true })),
  carrierState(ready({ maxAdvance: null })),
  carrierState(ready({ archived: true })),
  carrierState(ready()),
];
check("active carriers are counted", summarise(states).active, 2);
// An archived carrier is not work waiting to be done.
check("…and needing-setup excludes archived", summarise(states).needsSetup, 2);

// ── The list actually carries it ────────────────────────────────────────────
//
// A status module nothing calls is the defect M5 turned up in reverse: the
// columns existed, the resolver read them, and no screen could reach them.

const OPS = strip(readFileSync(join(process.cwd(), "src/lib/contracting-ops.functions.ts"), "utf8"));

check("the carrier list computes a state", /const state = carrierState\(\{/.test(OPS), true);
check("…from the resolver's verdict, not its own",
  /agencyCarrierConfiguration\(supabase, access\.orgId\)/.test(OPS), true);
// Grid rows key on carrier_id while org_carriers keys on its own id. Getting
// this wrong matches nothing and every carrier silently reads as having no
// grid — the same mistake the setup checklist made and had to fix.
check("…counting grid rows by carrier_id",
  /gridCount\.get\(String\(c\.carrier_id\)\)/.test(OPS), true);
check("…and names the positions on fallback rather than counting them",
  /positionsOnFallback: \(\(levels \?\? \[\]\)/.test(OPS), true);
check("archived carriers come from the status column",
  /archived: c\.status === "archived"/.test(OPS), true);

// ── The screen actually renders it ──────────────────────────────────────────
//
// The status model existed for a while with nothing showing it. A carrier that
// "needs an advance" and looks identical to one that is live is the defect
// this was written for, still present.

console.log("");

const UI = strip(readFileSync(join(process.cwd(), "src/components/contracting/carrier-setup.tsx"), "utf8"));

check("the card shows the status pill", /<StatusPill state=\{c\.state\} \/>/.test(UI), true);
// A row of reassuring green badges teaches an owner to stop reading them,
// which is exactly when the one that matters appears.
check("…and problems only when there are problems",
  /\(c\.state\?\.problems \?\? \[\]\)\.length > 0 &&/.test(UI), true);
check("the header counts active and needing setup",
  /summarise\(allCarriers\.map/.test(UI), true);
// Filtering must not change the counts, or an owner filtering to Draft can no
// longer see how many are live.
check("…from the whole list, not the filtered view",
  UI.includes("summarise(allCarriers") && !UI.includes("summarise(visible"), true);
check("there is a search box", /placeholder="Search carriers"/.test(UI), true);
check("…and a status filter built from the nine",
  /CARRIER_STATUSES\.map\(\(st\) =>/.test(UI), true);

// ── Delete versus archive, on screen ────────────────────────────────────────

check("removing a carrier asks first", /RemoveCarrierDialog/.test(UI), true);
check("…and uses the shared explanation rather than its own words",
  /removalExplanation\(carrier\.name, usage\)/.test(UI), true);
check("…with the wording deciding the button",
  /mode === "delete" \? "Delete permanently" : "Archive"/.test(UI), true);
// An archived carrier with an Edit button and no way back is a dead end.
check("an archived carrier offers restore instead of edit",
  /c\.state\?\.status === "archived" \? \(/.test(UI), true);
check("…and archived rows are out of the default view",
  /filter === "all"\s*\? carriers\.filter\(\(c\) => c\.state\?\.status !== "archived"\)/.test(UI), true);

// A stale screen must not be able to turn an archive into a delete. `OPS` is
// the same file read for the wiring assertions above.
check("the server decides delete or archive for itself",
  /const mode = removalMode\(usage\);/.test(OPS), true);
check("…from counts it read, not ones it was handed",
  /const usage = await getCarrierUsage/.test(OPS), true);
check("…and archiving keeps the row",
  /\.update\(\{ status: "archived"/.test(OPS), true);
check("restoring comes back paused, not active",
  /\.update\(\{ status: "paused"/.test(OPS), true);
check("both are audited", (OPS.match(/action: "carrier\.archived"/g) ?? []).length, 2);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
