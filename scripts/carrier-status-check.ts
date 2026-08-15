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
  "draft", "needs_grid_review", "needs_advance",
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
check("…and says what to do first",
  /No advance option is chosen/.test(blank.problems[0] ?? ""), true);

// ── Carrier levels are a trade-off, not a gate ──────────────────────────────
//
// This blocked activation first, ahead of everything else, while the resolver
// was perfectly happy paying every position its own percentage. An owner was
// told a working carrier "needs levels" with no way past it and no screen
// saying what adding them would change. What levels buy is product and age
// specific rates, which is a trade-off, and a trade-off belongs in the note.

check("a carrier with no levels can still go live",
  carrierState(ready({ levelCount: 0 })).canActivate, true);
check("…and is not held at a step named after them",
  carrierState(ready({ levelCount: 0 })).status, "ready_to_activate");
check("…but is told what it is trading away",
  carrierState(ready({ levelCount: 0 })).usesFallback, true);
check("…in words that name the two ways to fix it",
  /No contract levels are recorded[\s\S]*upload its comp grid/
    .test(carrierState(ready({ levelCount: 0 })).problems[0] ?? ""), true);
// A carrier that genuinely cannot pay is still stopped — by the resolver's own
// verdict, in the resolver's own words, rather than by a step name.
check("a carrier that cannot pay anybody is still blocked",
  carrierState(ready({
    levelCount: 0,
    configuration: { configured: false, reasons: ["No percentage resolves for Trainee."] },
  })).canActivate, false);
check("…citing the resolver rather than restating it",
  carrierState(ready({
    levelCount: 0,
    configuration: { configured: false, reasons: ["No percentage resolves for Trainee."] },
  })).problems, ["No percentage resolves for Trainee."]);

// ── The blocking steps, in wizard order ─────────────────────────────────────

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

check("the row shows the status pill", /<StatusPill state=\{state\} \/>/.test(UI), true);
// The ten facts the spec asks a row to carry. A grid of cards puts each in a
// different place on every card; a row keeps them in the same column, which is
// the whole point when scanning fifteen carriers for the one missing an
// advance.
check("…and the facts a row must carry",
  ["Levels", "Advance", "Contracting", "Open requests"]
    .every((l) => new RegExp(`label="${l}"`).test(UI)), true);
// Products is the one fact that is also a doorway: it counts what the grid
// covers and opens that grid, because "0 products" with nowhere to go is a
// complaint rather than a next step.
check("…with products opening the grid it counts",
  />Products<\/dt>/.test(UI) && /onClick=\{onEditGrid\}/.test(UI), true);
check("…and saying so when there is no grid yet",
  /"Add grid"/.test(UI), true);
check("…with the logo when there is one", /c\.logo_url \? \(/.test(UI), true);
// A row of reassuring green badges teaches an owner to stop reading them,
// which is exactly when the one that matters appears.
check("…and problems only when there are problems",
  /\(state\?\.problems \?\? \[\]\)\.length > 0 &&/.test(UI), true);
// The switch is what makes a carrier real to agents, so it must not flip when
// the setup cannot pay a deal — and must say why rather than doing nothing.
// The shared <Switch>, so the toggle looks and behaves like every other one in
// the app; the gate sits on its wrapper rather than on `disabled`, which would
// swallow the click and explain nothing.
check("the row has an activation switch", /<Switch\s+checked=\{isActive\}/.test(UI), true);
check("…that refuses when setup is outstanding", /if \(mayToggle \|\| toggling\) return;/.test(UI), true);
check("…explaining what is missing rather than failing silently",
  /toast\.error\(\s*state\?\.problems\[0\]/.test(UI), true);
check("…and switching off keeps the carrier",
  /stays saved and keeps its history/.test(UI), true);

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
  /isArchived \? \(/.test(UI) && /onClick=\{onRestore\}/.test(UI), true);
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

// ── A save that says it saved ───────────────────────────────────────────────
//
// Reported symptom: choose a submission method, click save, get "Submission
// method saved", and the panel underneath still reads "None set". Two separate
// ways a save can lie, and both were live.

console.log("");

// One. The dialog held the carrier OBJECT, captured when Edit was clicked. The
// write landed and the list refetched, but the open dialog kept rendering the
// snapshot from before it — so the method was there and the screen said it was
// not. Holding the id and looking it up in the query data is what lets a
// refetch reach an open dialog.
check("the dialog holds a carrier id, not a captured row",
  /const \[editingId, setEditingId\] = useState<string \| null>\(null\)/.test(UI), true);
check("…resolved against the live list on every render",
  /const editing = byId\(editingId\)/.test(UI), true);
check("…and the same for remove and the grid",
  /const removing = byId\(removingId\)/.test(UI) && /const gridFor = byId\(gridForId\)/.test(UI), true);
// The row objects must not come back: a single `setEditing(c)` anywhere
// reintroduces exactly this bug, silently.
check("no handler captures the row object again",
  /set(Editing|Removing|GridFor)\((?!null)[a-z]/.test(UI), false);
// The form's own fields are still seeded once per carrier. Without this a
// background refetch would overwrite something half-typed.
check("but a refetch cannot overwrite a half-typed field",
  /if \(key !== lastKey\) \{/.test(UI), true);

// Two. PostgREST reports no error when an update matches zero rows — the
// statement ran, it just changed nothing. A bare update therefore returns
// success whether or not anything was written, which is a success message the
// database never agreed to.
check("the carrier update reads its own write back",
  /\.from\("org_carriers"\)\.update\(\{ \.\.\.fields, updated_by: userId \}\)[\s\S]{0,120}\.select\("id"\)/.test(OPS), true);
check("…and a zero-row update is an error, not a save",
  /if \(!after\?\.length\) \{\s*throw new Error\(\s*"The carrier was not saved/.test(OPS), true);
check("the submission method update reads its own write back",
  /\.from\("org_carrier_methods"\)\.update\(\{ \.\.\.fields[\s\S]{0,160}\.select\("id"\)/.test(OPS), true);
check("…and says so plainly when nothing was written",
  /"The submission method was not saved/.test(OPS), true);
// Archive and restore already did this. Asserted so they keep doing it.
check("archive and restore assert their row counts too",
  /if \(!row\?\.length\) throw new Error\("That carrier was already removed\."\)/.test(OPS) &&
  /if \(!row\?\.length\) throw new Error\("That carrier is not archived\."\)/.test(OPS), true);

// ── Products are asked for once, not twice ──────────────────────────────────
//
// "Why is it asking what products this carrier writes when we list those
// whenever we sell it." The comp grid is a list of products with a rate against
// each, so a gridded carrier has already said what it writes — and Post a Deal
// reads the grid, falling back to `product_types` only when there is no grid.
// Ticking the same products a second time filled a field that then changed
// nothing.

console.log("");

check("the server ships the grid's own product names",
  /grid_products: \[\.\.\.\(gridProducts\.get/.test(OPS), true);
// Lowercased for the key, original casing for the value — "FE Express", not
// "fe express", while two cases of one name stay one product.
check("…deduped on case but shown in the carrier's casing",
  /bucket\.set\(name\.toLowerCase\(\), name\)/.test(OPS), true);
check("the dialog shows those instead of asking again",
  /gridProducts\.length > 0 \? \(/.test(UI), true);
check("…saying where they came from and that there is nothing to set",
  /comp grid, which is where the/.test(UI) && /there is nothing to\s*\n?\s*set here/.test(UI), true);
// The checkboxes are still the only source for a carrier with no grid, and
// Post a Deal still falls back to them, so they cannot simply be deleted.
check("…but a carrier with no grid still gets the checkboxes",
  /\) : \(\s*<div>\s*<Label>Products this carrier writes<\/Label>[\s\S]{0,400}productOptions\.map/.test(UI), true);
check("…and is told a grid would replace them",
  /Upload a comp grid and its products replace this list/.test(UI), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
