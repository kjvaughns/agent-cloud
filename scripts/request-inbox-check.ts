/**
 * The contracting inbox can be worked without opening every row.
 *
 *   npx tsx scripts/request-inbox-check.ts
 *
 * The two lists staff work from — the requests list and the staff queue —
 * showed a readiness percentage and little else. Deciding what to do next
 * meant clicking into each request in turn to find the same four things:
 *
 *   what level is being asked for   on the row (`requested_comp_level_id`),
 *                                   never selected by the list query
 *   who the agent sits under        on the row (`direct_upline_id`), same
 *   what is actually outstanding    in `readiness_blockers`, same
 *   the writing number              in `writing_numbers`, never looked up
 *
 * Two more were odd rather than missing. The requests list showed "waiting on"
 * — a role — and never the assignee, so the same request looked unowned there
 * and claimed on the queue. And the queue selected `contract_type` and never
 * rendered it, so a level change and a brand-new appointment looked identical
 * in the list somebody picks their next task from.
 *
 * Every one of these was already on the row or one join away. Nothing here
 * needed a migration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS } from "../src/lib/contracting-ops/types";

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

const OPS = strip(read("src/lib/contracting-ops.functions.ts"));
const LIST = strip(read("src/routes/_authenticated/contracting-ops/requests/index.tsx"));
const QUEUE = strip(read("src/routes/_authenticated/contracting-ops/queue.tsx"));

// ── The query asks for what the list shows ──────────────────────────────────

check("the list selects the level being asked for",
  /requested_comp_level_id/.test(OPS), true);
check("…and resolves it to a name",
  /requested_level:requested_comp_level_id \( id, name \)/.test(OPS), true);
check("the list selects the upline", /direct_upline_id/.test(OPS), true);
check("…and resolves it to a person",
  /upline:direct_upline_id \( id, first_name, last_name \)/.test(OPS), true);
check("the list selects what is outstanding",
  /readiness_blockers/.test(OPS), true);
// The carrier id is what makes the writing-number lookup possible at all.
check("…and the carrier behind the org carrier",
  /org_carriers \( id, carrier_id, carriers \( name, logo_url \) \)/.test(OPS), true);

// ── The writing number comes from the authoritative table ───────────────────

console.log("");

// `contract_requests.writing_number` is deprecated (20260802220000). Reading
// it here would have been the easy wrong answer.
check("the writing number comes from writing_numbers",
  /loadWritingNumbers\(\s*supabase,/.test(OPS), true);
check("…keyed by agent and carrier",
  /numbers\.get\(writingNumberKey\(r\.agent_id, r\.org_carriers\.carrier_id\)\)/.test(OPS), true);
// One lookup for the page, not one per row.
check("…in a single batched lookup",
  (OPS.match(/loadWritingNumbers\(/g) ?? []).length, 1);
check("…over the distinct agents on the page",
  /Array\.from\(new Set\(\(rows \?\? \[\]\)\.map\(\(r: any\) => r\.agent_id\)\.filter\(Boolean\)\)\)/.test(OPS),
  true);
// A row whose org carrier has no carrier id must not key a lookup on
// `undefined` and match somebody else's number.
check("a row with no carrier gets no number, rather than a wrong one",
  /r\.org_carriers\?\.carrier_id\s*\?/.test(OPS), true);

// ── Blockers become words ───────────────────────────────────────────────────

console.log("");

check("the outstanding items are labels, not raw json",
  /r\.readiness_blockers\.map\(\(b: any\) => b\?\.label\)\.filter\(Boolean\)/.test(OPS), true);
// `readiness_blockers` defaults to '[]' but a row written before that default
// or by hand could hold anything; mapping a non-array would throw on render.
check("…and a row whose blockers are not an array does not break the page",
  /Array\.isArray\(r\.readiness_blockers\)/.test(OPS), true);

// ── The list renders them ───────────────────────────────────────────────────

console.log("");

check("the list shows who the agent sits under", /under \{r\.upline_name\}/.test(LIST), true);
check("the list shows the writing number once there is one",
  /r\.writing_number \?/.test(LIST), true);
check("…and the requested level until then",
  /r\.requested_level_name \?/.test(LIST), true);
check("the list names the first outstanding item", /\{r\.blockers\[0\]\}/.test(LIST), true);
check("…and says how many more there are",
  /r\.blockers\.length > 1 \? ` \+\$\{r\.blockers\.length - 1\}` : ""/.test(LIST), true);
// The full set in the tooltip, so nothing is lost to the truncation.
check("…with the rest on hover", /title=\{r\.blockers\.join\(", "\)\}/.test(LIST), true);

check("the list has an owner column", /<span className="w-24">Owner<\/span>/.test(LIST), true);
check("…showing the person, not the role",
  /r\.assignee_name \?\? <span className="text-text-dim">Unassigned<\/span>/.test(LIST), true);
// "Waiting on" is whose turn it is by status — a different question, kept.
check("…beside the role, which answers something else",
  /<span className="w-20">Waiting on<\/span>/.test(LIST), true);

// Headers and cells must stay in step or every column shifts by one.
check("every header has a cell",
  (LIST.match(/<span className="w-32">Outstanding<\/span>/g) ?? []).length, 1);

// ── The queue distinguishes kinds of work ───────────────────────────────────

console.log("");

check("the queue shows the request type", /key: "type", header: "Type"/.test(QUEUE), true);
check("…in words", /CONTRACT_TYPE_LABELS\[r\.contract_type as ContractType\]/.test(QUEUE), true);
// It was already being fetched; only the column was missing.
const WORKFLOW = strip(read("src/lib/contracting-workflow.functions.ts"));
check("…which the queue was already fetching",
  /contract_type: r\.contract_type/.test(WORKFLOW), true);

check("every request type has a label",
  CONTRACT_TYPES.every((t) => Boolean(CONTRACT_TYPE_LABELS[t])), true);
check("…including the two the brief names beside a new contract",
  [CONTRACT_TYPE_LABELS.comp_level_change, CONTRACT_TYPE_LABELS.hierarchy_change],
  ["Compensation level change", "Hierarchy change"]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
