/**
 * Who can see the agency licensing roster.
 *
 * `npx tsx scripts/licensing-check.ts`
 *
 * `listLicensingRecords` reads `profiles` through the service-role client, so
 * row-level security never sees that query. The entire boundary is one
 * predicate in TypeScript — and it shipped as:
 *
 *   visible.size === 0 || visible.has(p.id) || true
 *
 * with a comment above it reading "Only agents the caller can actually see
 * licensing for." Two defects:
 *
 *   `|| true` short-circuits the whole expression. A debugging leftover.
 *
 *   `visible.size === 0` is a second, independent leak. `visible` is the set of
 *   agents whose licence rows RLS returned, so an agent with none of their own
 *   matched nothing and the escape hatch handed them the entire agency. That is
 *   exactly the brand-new-agent case — removing only the `|| true` would have
 *   left it open, which is why both halves are tested below.
 *
 * What leaked was names and NPNs. RLS on `state_licenses` is correct, so
 * licence counts and PDB status for agents outside the caller's downline came
 * back empty either way. NPN is a regulated identifier and is a search key on
 * that page, so the table could be enumerated by partial NPN.
 *
 * Run alongside `revocation-check.ts` and `delete-check.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { visibleLicensingAgents } from "../src/lib/licensing-visibility";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The predicate ───────────────────────────────────────────────────────

const ME = "me";
const ROSTER = [{ id: "me" }, { id: "other-1" }, { id: "other-2" }, { id: "downline-1" }];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// The reported scenario, exactly: a brand-new agent with nothing on file.
// Under the old predicate `visible.size === 0` fired and returned all four.
check("a caller with nothing on file sees only themselves",
  ids(visibleLicensingAgents(ROSTER, new Set(), ME)), ["me"]);

// The other half. Even with licence rows of their own, the old `|| true`
// returned everyone.
check("a caller with their own licences still sees only themselves",
  ids(visibleLicensingAgents(ROSTER, new Set(["me"]), ME)), ["me"]);

// A manager sees their downline, because RLS returned those rows.
check("a manager sees themselves plus their downline",
  ids(visibleLicensingAgents(ROSTER, new Set(["me", "downline-1"]), ME)), ["me", "downline-1"]);

// An owner sees everyone, for the same reason — RLS returned everyone.
check("an owner sees the whole roster",
  ids(visibleLicensingAgents(ROSTER, new Set(["me", "other-1", "other-2", "downline-1"]), ME)),
  ["me", "other-1", "other-2", "downline-1"]);

// Self is included even when RLS returned somebody else but not them — an
// agent must never be missing from their own licensing page.
check("self is included even when not in the visible set",
  ids(visibleLicensingAgents(ROSTER, new Set(["downline-1"]), ME)), ["me", "downline-1"]);

// Nobody else's row can arrive by being in the roster alone.
check("roster membership alone grants nothing",
  ids(visibleLicensingAgents([{ id: "other-1" }, { id: "other-2" }], new Set(), ME)), []);

check("an empty roster is empty, not a crash",
  ids(visibleLicensingAgents([], new Set(["me"]), ME)), []);

// ── The shape of the call site ──────────────────────────────────────────

console.log("");

const FN = readFileSync(join(process.cwd(), "src/lib/contracting-records.functions.ts"), "utf8");
const licensing = FN.slice(FN.indexOf("export const listLicensingRecords"));
const withComments = licensing.slice(0, licensing.indexOf("export const", 10));

// Comments stripped first. The handler's comment deliberately quotes the old
// expression so the next reader knows what was wrong — testing the raw text
// would match that prose and fail on a correct file, which is a check that
// cannot ever pass and so is worse than none.
const body = withComments.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

// The tautology, in any spacing.
check("no `|| true` survives in the licensing handler", /\|\|\s*true/.test(body), false);

// The size-zero escape hatch.
check("no `visible.size === 0` escape hatch survives", /visible\.size\s*===\s*0/.test(body), false);

check("the predicate goes through the tested helper",
  /visibleLicensingAgents\(/.test(body), true);

// The roster read must be gated. Without this an ordinary agent still causes a
// service-role read of every profile in the org, even if the filter then drops
// them — the names would be in the response payload before the filter runs if
// anybody later moves the mapping.
check("the membership read is gated on a capability", /canSeeRoster/.test(body), true);
check("a non-staff caller queries only themselves",
  /\{ data: \[\{ profile_id: userId \}\] \}/.test(body), true);

// ── The route guard ─────────────────────────────────────────────────────

console.log("");

const LAYOUT = readFileSync(join(process.cwd(), "src/routes/_authenticated/contracting-ops.tsx"), "utf8");
check("the contracting-ops layout has a beforeLoad guard", /beforeLoad:/.test(LAYOUT), true);
check("it redirects rather than rendering", /throw redirect\(/.test(LAYOUT), true);
// Contracting staff hold no user_roles row — they are granted through
// role_permissions. Checking roles alone locks out the people whose job it is.
check("it admits staff granted via role_permissions", /role_permissions/.test(LAYOUT), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
