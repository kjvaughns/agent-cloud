/**
 * A contract status change leaves a trail, and the statuses are the real ones.
 *
 *   npx tsx scripts/contract-trail-check.ts
 *
 * Two defects, both of which a person would hit.
 *
 * **The admin contracts table sent statuses the database rejects.** Its
 * dropdown offered `in_review` and `declined`; `contract_status` has neither.
 * The red reject button sent `declined` too. `adminUpdateContract` validated
 * `status` as a bare `z.string()`, so nothing caught it before Postgres did,
 * and every use of that control failed with a raw enum error. The same list
 * omitted `assigned`, `processing` and `rejected`, which are real — so three
 * of the seven statuses could not be set from the admin screen at all.
 *
 * **Nothing recorded a contract changing.** Four server functions could change
 * or delete a contract request and not one wrote an audit row or told the
 * agent. Somebody could open Contracting, find a carrier they had been waiting
 * on marked Rejected, and there was no record of who did it, when, or why.
 * They found out by looking.
 *
 * The sibling `contracting_requests` table has had both since it was built.
 * This is the half that was missed, which is why the fix is to reuse
 * `recordAudit` and `notifyPeople` rather than invent a third mechanism.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  isContractStatus,
  isTerminalContractStatus,
  contractStatusSentence,
} from "../src/lib/contracting/status";

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

// ── The seven statuses are the enum's seven ─────────────────────────────────

// The database is the authority. If the enum gains a value and this list does
// not, an agent's contract shows a raw status string; if this list gains one
// the enum does not, saving it fails at Postgres.
const ENUM_SQL = sql(read("supabase/migrations/20260522213134_acda8e2a-5f32-4d6c-afbb-cdf50f8a48c3.sql"));
const declared = ENUM_SQL.match(/CREATE TYPE public\.contract_status AS ENUM \(([^)]*)\)/i)?.[1] ?? "";
const fromEnum = (declared.match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ""));
// `assigned` was added later, by its own migration.
const ADDED = sql(read("supabase/migrations/20260604260000_assigned_contract_status.sql"));
const addedValue = ADDED.match(/ADD VALUE\s+(?:IF NOT EXISTS\s+)?'([a-z_]+)'/i)?.[1];

check("the module lists every value the enum declares",
  [...CONTRACT_STATUSES].sort(),
  [...fromEnum, addedValue].filter(Boolean).sort());
check("…including the one added by a later migration",
  CONTRACT_STATUSES.includes(addedValue as any), true);
check("there are seven of them", CONTRACT_STATUSES.length, 7);

check("every status has a label",
  CONTRACT_STATUSES.every((s) => Boolean(CONTRACT_STATUS_LABELS[s])), true);
check("…and every status has a sentence an agent can act on",
  CONTRACT_STATUSES.every((s) => contractStatusSentence(s, "Acme").includes("Acme")), true);

// The two values that used to be offered and are not real.
check("in_review is not a status", isContractStatus("in_review"), false);
check("declined is not a status either", isContractStatus("declined"), false);
check("rejected is", isContractStatus("rejected"), true);
check("assigned is", isContractStatus("assigned"), true);
check("a non-string is not", isContractStatus(null), false);

// Terminal: the two answers somebody has been waiting for.
check("active ends the request", isTerminalContractStatus("active"), true);
check("…as does rejected", isTerminalContractStatus("rejected"), true);
check("processing does not", isTerminalContractStatus("processing"), false);
check("a missing status is not terminal", isTerminalContractStatus(null), false);

// ── The admin screen ────────────────────────────────────────────────────────

console.log("");

const ADMIN = strip(read("src/routes/admin.contracts.tsx"));

check("the admin table takes its statuses from the module",
  /const STATUSES = \["all", \.\.\.CONTRACT_STATUSES\]/.test(ADMIN), true);
// The exact two values that failed at Postgres.
check("…and no longer offers in_review", /in_review/.test(ADMIN), false);
check("…nor declined", /"declined"/.test(ADMIN), false);
check("the reject button sends the real value",
  /update\(c\.id, \{ status: "rejected" \}\)/.test(ADMIN), true);
// A colour map keyed to the type cannot silently miss one.
check("the colour map is keyed by the status type",
  /STATUS_COLORS: Record<ContractStatus, string>/.test(ADMIN), true);
check("…and covers all seven",
  CONTRACT_STATUSES.every((s) => new RegExp(`\\n  ${s}:`).test(ADMIN)), true);

const ADMINFN = strip(read("src/lib/admin.functions.ts"));
// The boundary that was missing: a bare z.string() let anything through.
check("the admin server function validates the status",
  /status: z\.enum\(CONTRACT_STATUSES\)\.optional\(\)/.test(ADMINFN), true);
// Anchored on the field boundary: `new_status` on the support-ticket function
// is a different field on a different table and is allowed to be a free string.
check("…rather than accepting any string",
  /\n\s+status: z\.string\(\)\.optional\(\)/.test(ADMINFN), false);

// ── The badge does not keep its own copy ────────────────────────────────────

console.log("");

const BADGE = strip(read("src/components/contracting/contract-status-badge.tsx"));
check("the badge re-exports rather than restating",
  /export \{ CONTRACT_STATUSES, type ContractStatus \} from "@\/lib\/contracting\/status"/.test(BADGE),
  true);
check("…and keeps no second list",
  /export const CONTRACT_STATUSES: ContractStatus\[\] = \[/.test(BADGE), false);
check("…taking its labels from the module too",
  /CONTRACT_STATUS_LABELS\[status as ContractStatus\]/.test(BADGE), true);
// A status the map does not know must still render as something.
check("an unknown status shows its own value rather than a blank",
  /\?\? status/.test(BADGE), true);

// ── Every writer leaves a trail ─────────────────────────────────────────────

console.log("");

const TRAIL = strip(read("src/lib/contracting/trail.server.ts"));

check("the trail writes an audit row", /recordAudit\(\{/.test(TRAIL), true);
check("…and tells somebody", /return notifyPeople\(client, \{/.test(TRAIL), true);
// One function, so a caller cannot record the change and forget the person.
check("…in the same call, not two a caller must remember",
  /export async function recordContractChange/.test(TRAIL), true);
check("the notification respects the contracting preference",
  /category: "contract_updates"/.test(TRAIL), true);
check("nobody is told about their own action",
  /exceptUserId: input\.actorId/.test(TRAIL), true);
// The two tables share an audit vocabulary and are told apart by record type.
check("the audit row says which table it is about",
  /recordType: "contract_request"/.test(TRAIL), true);

const CONTRACTING = strip(read("src/lib/contracting.functions.ts"));

check("the status enum comes from the module",
  /const StatusEnum = z\.enum\(CONTRACT_STATUSES\)/.test(CONTRACTING), true);
// It used to omit `assigned`, so a contract could leave that state and never
// return to it.
check("…so assigned can be set again",
  /z\.enum\(\["requested","submitted","processing","issue","active","rejected"\]\)/.test(CONTRACTING),
  false);

// Three call sites in this file, one in admin.functions.
check("all three contracting writers record the change",
  (CONTRACTING.match(/await recordContractChange\(\{/g) ?? []).length, 3);
check("…and so does the admin one",
  (ADMINFN.match(/await recordContractChange\(\{/g) ?? []).length, 1);

// The previous value has to be read before the write, or the record cannot say
// what changed.
check("a status change records what it changed from",
  /\.select\("status"\)\.eq\("id", data\.id\)\.maybeSingle\(\)/.test(CONTRACTING), true);
check("…and the admin path does the same",
  /\.select\("agent_id, status, carrier_id, organization_id"\)/.test(ADMINFN), true);
// A delete destroys the row, so reading it first is the only chance.
check("a delete reads the row before removing it",
  /\.select\("agent_id, status, carrier_id, organization_id"\)\.eq\("id", data\.id\)\.maybeSingle\(\)/.test(CONTRACTING),
  true);
check("…and records it as removed, not declined",
  /kind: "removed"/.test(CONTRACTING), true);

// `request.removed` had to be added; the rest of the vocabulary already existed.
const AUDIT = strip(read("src/lib/contracting-ops/audit.ts"));
check("removal is its own audit action", /"request\.removed"/.test(AUDIT), true);

// ── Failure cannot undo the thing it describes ──────────────────────────────

console.log("");

// The change has already landed by the time the trail runs. Both underlying
// helpers swallow and log; neither call site may add a throw around them.
check("the trail is not wrapped in anything that rethrows",
  /throw/.test(TRAIL), false);
check("…and the audit helper swallows its own failures",
  /catch \(err\) \{[\s\S]*?console\.error\("\[contracting-audit\] write failed"/.test(AUDIT), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
