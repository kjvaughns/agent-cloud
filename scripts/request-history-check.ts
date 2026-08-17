/**
 * The agent can see where their own contracting request stands.
 *
 *   npx tsx scripts/request-history-check.ts
 *
 * Two defects, both of which a person would act on.
 *
 * **The agent could not see their own history.** `contracting_status_history`
 * has recorded every transition since the ops workflow was built, separates
 * `agent_visible_message` from `internal_message`, and its RLS explicitly lets
 * an agent read their own rows. Nothing rendered them anywhere an agent could
 * reach: the only screen that showed history sits under `/contracting-ops`,
 * whose layout guard redirects anybody without a staff role or permission flag
 * to `/licensing`. So the person waiting on the carrier saw the end state and
 * nothing else — no way to tell "submitted last Tuesday, carrier reviewing"
 * from "nothing has happened in three weeks".
 *
 * **Every transition is recorded twice.** `trg_log_contracting_status` writes a
 * row on every status change; when the change carries a message,
 * `updateRequestStatus` writes a second row for the same transition with the
 * message on it. The staff screen renders both, so a request declined with an
 * explanation shows the same step twice, once blank. The trigger's row is also
 * the one with no author — it runs under the service role, so `auth.uid()` and
 * therefore `changed_by` are null.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { merge, forAgent, statusLabel, waitingOn, currentStanding } from "../src/lib/contracting/history";
import { REQUEST_STATUSES, REQUEST_STATUS_META } from "../src/lib/contracting-ops/types";

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
const strip = (s: string) =>
  s
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const sql = (s: string) => s.replace(/--[^\n]*/g, "");

// ── One event, one entry ────────────────────────────────────────────────────

// Exactly what the two writers produce: the trigger's bare row, then the app's
// row a moment later carrying the message and the author.
const PAIR = [
  {
    id: "trigger",
    from_status: "submitted",
    to_status: "declined",
    changed_by: null,
    created_at: "2026-08-14T10:00:00.000Z",
  },
  {
    id: "app",
    from_status: "submitted",
    to_status: "declined",
    changed_by: "staff-1",
    agent_visible_message: "The carrier could not verify your resident licence.",
    next_action: "Upload a current licence",
    created_at: "2026-08-14T10:00:02.400Z",
  },
];

check("a transition recorded twice shows once", merge(PAIR).length, 1);
check("…keeping the row that says something",
  merge(PAIR)[0].agent_visible_message,
  "The carrier could not verify your resident licence.");
// The trigger row is the one with no author, so dedupe must not prefer it.
check("…and recovering who did it", merge(PAIR)[0].changed_by, "staff-1");
// Dated when the change happened, not when the second write landed.
check("…dated from the earlier of the two", merge(PAIR)[0].created_at, "2026-08-14T10:00:00.000Z");

// Order matters: the same pair arriving newest-first must collapse identically.
check("the merge does not depend on the order rows arrive in",
  merge([...PAIR].reverse())[0].id, merge(PAIR)[0].id);

// A genuine repeat is not a duplicate. Somebody setting a status, changing it
// back, and setting it again is three events.
const REPEATED = [
  { id: "1", from_status: "submitted", to_status: "nigo", changed_by: "s", created_at: "2026-08-01T10:00:00.000Z" },
  { id: "2", from_status: "nigo", to_status: "submitted", changed_by: "s", created_at: "2026-08-02T10:00:00.000Z" },
  { id: "3", from_status: "submitted", to_status: "nigo", changed_by: "s", created_at: "2026-08-03T10:00:00.000Z" },
];
check("the same transition a day apart is two events, not one",
  merge(REPEATED).length, 3);

// Different transitions at the same instant are different events.
check("two different transitions at the same moment both survive",
  merge([
    { id: "a", from_status: "draft", to_status: "submitted", changed_by: "s", created_at: "2026-08-01T10:00:00.000Z" },
    { id: "b", from_status: "submitted", to_status: "approved", changed_by: "s", created_at: "2026-08-01T10:00:00.000Z" },
  ]).length,
  2);

check("newest first", merge(REPEATED).map((r) => r.id), ["3", "2", "1"]);
check("an empty history is empty, not an error", merge([]), []);

// ── Reading like a person ───────────────────────────────────────────────────

console.log("");

// The staff screen prints the raw string. An agent should not have to.
check("a status reads as words", statusLabel("awaiting_owner_approval"), "Waiting on owner approval");
// `nigo` used to read "Not in good order" here. It reads "Agent action
// needed" now, folded in with the other four states that mean the same thing to
// whoever is looking. The requirement was never that word — it was that the raw
// enum value never reaches a screen — so that is what this asserts, and the
// wording is free to improve without breaking a test.
check("…including the one nobody would guess",
  statusLabel("nigo") !== "nigo" && /\s/.test(statusLabel("nigo")), true);
check("every status the database allows has a label",
  REQUEST_STATUSES.every((s) => statusLabel(s) !== s), true);
// An unknown status shows itself rather than nothing, so drift is visible.
check("an unknown status shows its own value", statusLabel("teleported"), "teleported");

// The question an agent is actually asking.
check("waiting on the agent says so plainly", waitingOn("missing_documents"), "You");
check("…and on the carrier", waitingOn("submitted"), "The carrier");
check("…and a finished request says it is finished",
  waitingOn("writing_number_issued"), "Nobody — this is finished");

check("an open status is open", currentStanding("carrier_reviewing").open, true);
check("…and a terminal one is not", currentStanding("declined").open, false);
// Standing comes from the request's own status, so a request predating the
// history table still reports where it stands.
check("standing does not depend on there being any history",
  // The label moved from "Draft" to "Requested" — the same state, named for
  // what the agent did rather than for the row's initial value. What matters is
  // that a request with no history still reports a standing, and that it is
  // open rather than finished.
  [currentStanding("draft").label !== "draft", currentStanding("draft").open],
  [true, true]);

// ── What reaches the agent ──────────────────────────────────────────────────

console.log("");

const entries = forAgent([
  ...PAIR,
  {
    id: "internal",
    from_status: "draft",
    to_status: "submitted",
    changed_by: "staff-1",
    internal_message: "Chased the upline twice, no answer.",
    created_at: "2026-08-13T09:00:00.000Z",
  },
]);

check("the agent view is merged too", entries.length, 2);
check("…labelled", entries[0].label, "Declined");
// "Submitted to carrier" shortened to "Submitted". The requirement is that a
// transition names BOTH ends, so the agent can see what moved — pinning the
// exact phrasing of one end tested the copy instead.
check("…and says where it came from",
  Boolean(entries[0].fromLabel) && entries[0].fromLabel !== entries[0].label, true);
check("a next action reaches the agent", entries[0].nextAction, "Upload a current licence");
// The server strips this too. Dropping it here as well means no caller can
// render it by accident even if that strip is ever loosened.
check("an internal note never reaches the agent view",
  JSON.stringify(entries).includes("Chased the upline"), false);
check("…and the module has no field to put it in",
  Object.keys(entries[0]).includes("internal_message"), false);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const FNS = strip(read("src/lib/contracting.functions.ts"));
check("there is an agent-facing reader", /export const listMyRequestHistory/.test(FNS), true);
// RLS is the check. Both policies already say agent_id = auth.uid().
check("…reading under the caller's own permissions",
  /listMyRequestHistory[\s\S]{0,900}?supabase\s*\n\s*\.from\("contracting_requests"\)/.test(FNS), true);
check("…and never through the service role",
  /listMyRequestHistory[\s\S]{0,1200}?supabaseAdmin/.test(FNS), false);
check("…scoped to the caller", /\.eq\("agent_id", userId\)/.test(FNS), true);
check("…through the shared merge", /history: forAgent\(/.test(FNS), true);
// A missing table or a changed policy must not take down My Contracts.
check("a failed read degrades rather than throws",
  /if \(error\) return \{ rows: \[\] as any\[\], available: false \}/.test(FNS), true);

const PAGE = strip(read("src/routes/_authenticated/contracting/index.tsx"));
check("the agent's own contracting page renders it",
  /<RequestHistory rows=\{myRequests!\.rows\} \/>/.test(PAGE), true);
// It describes the viewer's own requests, so it must not sit under a team scope.
check("…only in the personal scope", /scope === "mine" &&/.test(PAGE), true);
check("…and is not fetched in the others",
  /enabled: scopeReady && scope === "mine"/.test(PAGE), true);

const COMP = strip(read("src/components/contracting/request-history.tsx"));
check("the component takes its labels from the module",
  /from "@\/lib\/contracting\/history"/.test(COMP), true);
check("…and its request-type names from the shared vocabulary",
  /CONTRACT_TYPE_LABELS\[r\.contract_type as ContractType\]/.test(COMP), true);
// A request with no rows yet is a real state and must not read as a bug.
check("a request with no steps says so", /No steps recorded yet/.test(COMP), true);

// ── The duplicate is real, not imagined ─────────────────────────────────────

console.log("");

// Both writers, in the repository, so the merge rule cannot be removed as
// unnecessary without one of these failing first.
const MIG = sql(read("supabase/migrations/20260730162000_contracting-ops-requests.sql"));
check("the trigger writes a row on every status change",
  /create trigger trg_log_contracting_status/.test(MIG), true);
check("…with no author, because it runs as the service role",
  /values \(new\.organization_id, new\.id, old\.status, new\.status, auth\.uid\(\)\)/.test(MIG), true);

const OPS = strip(read("src/lib/contracting-ops.functions.ts"));
check("and the app writes a second one when there is a message",
  /from\("contracting_status_history"\)\.insert\(\{/.test(OPS), true);

check("every status the app can set has agent-facing metadata",
  REQUEST_STATUSES.every((s) => Boolean(REQUEST_STATUS_META[s])), true);

// ── A status change can carry its explanation ───────────────────────────────
//
// `StatusSchema` has accepted `agent_visible_message`, `internal_message`,
// `next_action` and `decline_reason` since the workflow was built. No control
// supplied any of them, so every decline in the system was recorded with no
// reason at all: the agent saw "Declined" and nothing else, and the
// `decline_reason` column that exists to hold the explanation stayed null.

console.log("");

const DETAIL = strip(read("src/routes/_authenticated/contracting-ops/requests/$requestId.tsx"));

check("the server has always accepted a decline reason",
  /decline_reason: z\.string\(\)/.test(OPS), true);
check("…and now something sends one", /decline_reason: composing\.reason\.trim\(\)/.test(DETAIL), true);
// A decline with no reason gives the agent nothing to act on.
check("…which a decline cannot be saved without",
  /composing\.status === "declined" && !composing\.reason\.trim\(\)/.test(DETAIL), true);

check("a status change can say what the agent sees",
  /agent_visible_message: composing\.message\.trim\(\)/.test(DETAIL), true);
check("…what happens next", /next_action: composing\.nextAction\.trim\(\)/.test(DETAIL), true);
check("…and carry a staff-only note", /internal_message: composing\.internal\.trim\(\)/.test(DETAIL), true);

// A blank field must not overwrite anything or write a history row that says
// nothing, so empty strings are omitted rather than sent as "".
check("blank fields are omitted rather than sent",
  (DETAIL.match(/\?\s*\{ (agent_visible_message|internal_message|next_action|decline_reason)/g) ?? []).length,
  4);

// The writing-number path kept its own step in the status picker. It has since
// moved into Carrier decision, where the number is recorded beside the level and
// the advance it is granted with — one act instead of two, and next to the facts
// it belongs with.
//
// What must not change is that a contract cannot go active without one: the
// number is how Finances knows which policies are this agent's, and an active
// contract lacking it pays nobody. So the assertion follows the requirement to
// where it now lives rather than pinning the old handler.
check("a writing number is still captured",
  /Writing number/.test(DETAIL), true);
check("…and a contract cannot go active without one",
  /disabled=\{busy \|\| !number\.trim\(\)/.test(DETAIL), true);

// ── The screen an operator actually works ───────────────────────────────────

console.log("");

// The percentage was a second answer to a question the level already answers.
// Pick "RK1 (50)" and type 105 and the request recorded both, with nothing to
// say which one pays.
check("the decision does not ask for a percentage as well as a level",
  /id="granted-pct"/.test(DETAIL), false);
check("…it reads it off the level chosen",
  /const grantedPct: number \| null =\s*\n?\s*chosenComp\?\.commission_pct \?\? chosenGrid\?\.pct \?\? null;/.test(DETAIL), true);
// A level whose grid rates vary by product has no single figure, and saying so
// beats showing one of them as if it were the rate.
check("…and says when a level has no single rate",
  /Rates vary by product on this level/.test(DETAIL), true);

// Granting more advance than the carrier funds is not a setting somebody fixes
// later — it is money fronted that comes back as a chargeback.
check("the advance offers only what the carrier allows",
  /const advanceChoices = advanceOptionsUpTo\(maxAdvance\)/.test(DETAIL), true);
check("…from the shared ordering, not a second list",
  /from "@\/lib\/carriers\/wizard"/.test(DETAIL), true);
check("…and never the full five",
  /ADVANCE_OPTIONS\.map/.test(DETAIL), false);
check("…saying what the cap is",
  /is the most this carrier advances/.test(DETAIL), true);

// Status was the last control inside Actions, below three buttons and an
// assignment picker — the most frequent act on the page, furthest to reach.
check("status has a panel of its own",
  /<Panel title="Status" className="ac-no-print">/.test(DETAIL), true);
check("…saying where the request stands right now",
  /Currently <span className="text-foreground">/.test(DETAIL), true);
// One place to write to the request, not three cards to scroll between.
check("invitation and notes fold into Actions rather than a third card",
  /<Panel title="Invitation & notes"/.test(DETAIL), false);
check("…mounted inside it",
  /<InviteAndNotePanel[\s\S]{0,200}onNote=\{\(vars\) => addNote\.mutate\(vars\)\}/.test(DETAIL), true);

// The five that identify the person, ahead of the qualifiers. A carrier form is
// filled from these, and the NPN was buried among nine other fields.
check("agent information leads with what a submission needs",
  /Full legal name[\s\S]{0,400}Requested level[\s\S]{0,200}<\/dl>/.test(DETAIL), true);
// The whole point of the "I already have a writing number" path.
check("an agent-reported writing number is shown as a fact",
  /Agent-reported writing number/.test(DETAIL) && /unverified/.test(DETAIL), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
