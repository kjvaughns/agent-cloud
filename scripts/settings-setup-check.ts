/**
 * Settings in six groups, and contracting setup as one list you can follow.
 *
 *   npx tsx scripts/settings-setup-check.ts
 *
 * ── The defect that made the checklist necessary ──
 *
 * Every setup screen existed and was reachable. Nothing said which order to do
 * them in, or whether the result worked. So an owner could add three carriers,
 * never choose an advance option, and find out weeks later when a posted deal
 * earned nothing.
 *
 * ── The defect found while building it, which was worse ──
 *
 * `OrgCarrierSchema` did not list `default_advance_option`,
 * `visible_to_agents`, `requestable_by_agents`, `available_for_post_deal` or
 * `enabled`. `z.object` strips unknown keys, so every one of them was silently
 * dropped on the way in — the columns existed, the resolver read them, and
 * nothing in the product could ever write them.
 *
 * That is why the advance option "could not be chosen": not a missing screen,
 * a schema that threw the value away. And because the resolver refuses to
 * guess an advance term, every carrier reported `no_advance_option` forever
 * and My Contracts marked every row "Comp not set up" with no control anywhere
 * that could clear it. A checklist telling an owner to fix that would have
 * been an instruction the product could not carry out.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateSetup, progress, nextStep, isReady, SETUP_STEPS, type SetupFacts,
} from "../src/lib/settings/contracting-checklist";
import {
  SETTINGS_GROUPS, groupOf, groupEntries, GROUP_PURPOSE, SETTINGS_PARENT_ID,
} from "../src/lib/settings/groups";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The six groups ──────────────────────────────────────────────────────────

check("the six the brief names", [...SETTINGS_GROUPS], [
  "Agency Profile", "Team and Access", "Contracting Setup",
  "Communications", "Integrations", "Billing",
]);
check("each says what it is for",
  SETTINGS_GROUPS.every((g) => GROUP_PURPOSE[g].length > 10), true);

// Every Settings entry in the registry must land in a group. One that does not
// is a page that exists and is listed nowhere.
const NAV = read("src/lib/navigation.ts");
const settingsIds = Array.from(
  NAV.matchAll(/id: "([a-z-]+)"[^}]*area: "Settings"/g),
).map((m) => m[1]).filter((id) => id !== SETTINGS_PARENT_ID);

check("every settings page is in the registry", settingsIds.length >= 15, true);
check("…and every one of them is grouped",
  settingsIds.filter((id) => !SETTINGS_GROUPS.includes(groupOf(id))), []);

// The sidebar hub must list the same six, in the same order.
const hub = NAV.slice(NAV.indexOf("  settings: ["));
const hubLabels = Array.from(hub.matchAll(/label: "([^"]*)"/g)).map((m) => m[1]).slice(0, 6);
check("the sidebar shows the six groups", hubLabels, [...SETTINGS_GROUPS]);
// It used to be one unlabelled run plus "Your agency".
check("…and the old flat grouping is gone", /label: "Your agency"/.test(NAV), false);

// A staff member without billing rights should not see an empty heading.
check("a group with nothing visible is dropped",
  groupEntries([{ id: "agency-settings", label: "A", path: "/a" }]).map((g) => g.group),
  ["Agency Profile"]);
check("the Settings parent is not an item inside itself",
  groupEntries([{ id: SETTINGS_PARENT_ID, label: "S", path: "/settings" }]).length, 0);
// An entry added later and never mapped must be filed, not lost.
check("an unmapped entry still appears somewhere",
  SETTINGS_GROUPS.includes(groupOf("something-added-next-week")), true);

// ── The checklist ───────────────────────────────────────────────────────────

console.log("");

check("the six steps the brief names", [...SETUP_STEPS],
  ["carriers", "levels", "mappings", "advances", "test", "publish"]);

const EMPTY: SetupFacts = {
  carriers: [], levels: [], configuration: new Map(), carriersWithGrids: new Set(),
};
const blank = evaluateSetup(EMPTY);
check("a brand-new agency has done none of it", progress(blank).done, 0);
check("…and is pointed at carriers first", nextStep(blank)?.id, "carriers");
check("…and is not called ready", isReady(blank), false);
// An owner told to choose advance options before adding a carrier is being
// sent to an empty screen.
check("…with the later steps blocked rather than offered",
  blank.filter((s) => s.status === "blocked").map((s) => s.id),
  ["mappings", "advances", "test", "publish"]);

const ok = (over: Partial<SetupFacts> = {}): SetupFacts => ({
  carriers: [{
    id: "oc1", carrier_id: "c1", name: "Mutual", enabled: true,
    visible_to_agents: true, available_for_post_deal: true,
    default_advance_option: "9_months",
  }],
  levels: [{ id: "l1", name: "Agent", base_pct: 80 }],
  configuration: new Map([["oc1", { configured: true, reasons: [] }]]),
  carriersWithGrids: new Set(["c1"]),
  ...over,
});

check("a finished agency is finished", isReady(evaluateSetup(ok())), true);
check("…with nothing left to do", nextStep(evaluateSetup(ok())), null);
check("…and shows six of six", progress(evaluateSetup(ok())).pct, 100);

// The one an agency skips.
const noAdvance = evaluateSetup(ok({
  carriers: [{ ...ok().carriers[0], default_advance_option: null }],
}));
check("a carrier with no advance option is caught",
  noAdvance.find((s) => s.id === "advances")?.status, "todo");
check("…and told nothing is assumed for them",
  /Nothing is assumed on your behalf/.test(
    noAdvance.find((s) => s.id === "advances")?.problems[0] ?? ""), true);
check("…by name", /Mutual/.test(noAdvance.find((s) => s.id === "advances")?.problems[0] ?? ""), true);

// A level with no percentage resolves nothing.
const noPct = evaluateSetup(ok({ levels: [{ id: "l1", name: "MGA", base_pct: null }] }));
check("a position with no percentage is caught",
  noPct.find((s) => s.id === "levels")?.status, "todo");
check("…naming the position", /MGA/.test(noPct.find((s) => s.id === "levels")?.problems[0] ?? ""), true);

// The resolver's own words, not a second opinion.
const unresolved = evaluateSetup(ok({
  configuration: new Map([["oc1", {
    configured: false,
    reasons: ["No percentage resolves for Agent — give the level a base percentage or map it to this carrier."],
  }]]),
}));
check("a mapping problem uses the resolver's own sentence",
  /give the level a base percentage/.test(
    unresolved.find((s) => s.id === "mappings")?.problems[0] ?? ""), true);
check("…prefixed with the carrier it is about",
  /^Mutual: /.test(unresolved.find((s) => s.id === "mappings")?.problems[0] ?? ""), true);
// Repeating "no advance option" under mappings would make one problem read as
// two, since it has its own step.
check("…and the advance reason is not repeated there",
  evaluateSetup(ok({
    configuration: new Map([["oc1", { configured: false, reasons: ["This carrier has no advance option chosen."] }]]),
  })).find((s) => s.id === "mappings")?.problems.filter((p) => /advance/i.test(p)).length,
  0);
check("…while the test step still fails on it",
  evaluateSetup(ok({
    configuration: new Map([["oc1", { configured: false, reasons: ["This carrier has no advance option chosen."] }]]),
  })).find((s) => s.id === "test")?.status,
  "todo");

// A missing grid is worth saying and does not stop a deal paying.
const noGrid = evaluateSetup(ok({ carriersWithGrids: new Set() }));
check("a missing comp grid is mentioned",
  /No comp grid uploaded for Mutual/.test(
    noGrid.find((s) => s.id === "mappings")?.problems[0] ?? ""), true);
check("…and says the position percentages still apply",
  /position percentages still apply/.test(
    noGrid.find((s) => s.id === "mappings")?.problems[0] ?? ""), true);

// Set up but not published is the last gap, and a real one.
const unpublished = evaluateSetup(ok({
  carriers: [{ ...ok().carriers[0], available_for_post_deal: false }],
}));
check("a configured but unpublished carrier is caught",
  unpublished.find((s) => s.id === "publish")?.status, "todo");
check("…and the agency is not called ready", isReady(unpublished), false);

// Every carrier switched off is not the same as no carriers.
const allOff = evaluateSetup(ok({
  carriers: [{ ...ok().carriers[0], enabled: false }],
}));
check("carriers that are all switched off says so",
  /Every carrier you have added is switched off/.test(
    allOff.find((s) => s.id === "carriers")?.problems[0] ?? ""), true);

// ── The instructions can be followed ────────────────────────────────────────

console.log("");

const OPS = strip(read("src/lib/contracting-ops.functions.ts"));
// The whole reason the advance option "could not be set".
check("the carrier schema accepts an advance option",
  /default_advance_option: z\.enum\(ADVANCE_OPTIONS\)\.nullable\(\)\.optional\(\)/.test(OPS), true);
check("…from the resolver's own list rather than a retyped one",
  /import \{ ADVANCE_OPTIONS \} from "@\/lib\/compensation\/resolve"/.test(OPS), true);
check("…and the publish controls too",
  ["enabled", "visible_to_agents", "requestable_by_agents", "available_for_post_deal"]
    .every((f) => new RegExp(`${f}: z\\.boolean\\(\\)\\.optional\\(\\)`).test(OPS)), true);

const FORM = strip(read("src/components/contracting/carrier-setup.tsx"));
check("the carrier form offers the advance option",
  /default_advance_option: advance/.test(FORM), true);
// "Not chosen" must be an option, or opening the form silently picks one.
check("…with 'not chosen yet' as a real choice",
  /<option value="">Not chosen yet<\/option>/.test(FORM), true);
check("…and warns while it is unset",
  /cannot work out what to advance/.test(FORM), true);
check("the form offers the publish switches",
  /visible_to_agents: publish\.visible_to_agents/.test(FORM) &&
  /available_for_post_deal: publish\.available_for_post_deal/.test(FORM), true);

// ── The status comes from the resolver, not a second opinion ────────────────

console.log("");

const FN = strip(read("src/lib/settings/setup.functions.ts"));
check("the setup status reuses the resolver's verdict",
  /agencyCarrierConfiguration\(supabase, orgId\)/.test(FN), true);
// It was written for exactly this and had no caller.
check("…which had been written and never called",
  /Returns the reasons rather than a boolean so the owner's setup screen can/
    .test(read("src/lib/compensation/resolve.ts")), true);
check("the status read writes nothing",
  /\.insert\(|\.update\(|\.upsert\(|recordSetupIssue/.test(FN), false);
// Absent columns must read as today's behaviour, not as "switched off".
check("a pending column reads as the permissive default",
  (FN.match(/!== false/g) ?? []).length, 3);
// Except the advance, where "not chosen" is the whole point.
check("…except the advance, which is left unchosen",
  /default_advance_option: c\.default_advance_option \?\? null/.test(FN), true);

const PAGE = strip(read("src/routes/_authenticated/settings.contracting.tsx"));
check("the checklist is on the contracting settings page",
  /<SetupChecklist steps=\{setup\.steps\}/.test(PAGE), true);

const UI = strip(read("src/components/settings/setup-checklist.tsx"));
check("it shows a progress indicator",
  /style=\{\{ width: `\$\{progress\.pct\}%` \}\}/.test(UI), true);
check("…and how many of how many", /\{progress\.done\} of \{progress\.total\}/.test(UI), true);
// Sending somebody to a screen they cannot yet act on is worse than no link.
check("a blocked step offers no link",
  /step\.status === "todo" && \(/.test(UI), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
