/**
 * A change to what somebody is paid leaves a trail.
 *
 *   npx tsx scripts/comp-audit-check.ts
 *
 * The recovery brief asks for audit logs on "permission, hierarchy, level,
 * contract, carrier, writing number, and commission changes". Most of that
 * list was already kept. Two were not, and they are the two that decide money.
 *
 * `agency_levels.base_pct` is the ladder — since the canonical resolver
 * landed, it is the number an agent is paid from when no override exists. So
 * an owner editing a rung changes what every agent on it earns, and
 * `saveAgencyLevel` recorded nothing at all: not who, not when, not what it
 * was before. "It used to be 80" had no answer anywhere in the product.
 *
 * `agent_commission_levels.assigned_pct` is the per-agent override that
 * outranks the ladder. Both paths that set it — the admin assign and the
 * comp-level editor — also recorded nothing, so "who put me on 70?" was
 * equally unanswerable.
 *
 * The prior value is the whole point of the record and it is gone the instant
 * the write lands, so both now read before they write. Neither may ever undo
 * the change it describes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    .replace(/\/\*[\s\S]*?\*\//g, "");

const AUDIT = read("src/lib/contracting-ops/audit.ts");
const RECORDS = strip(read("src/lib/contracting-records.functions.ts"));
const ADMIN = strip(read("src/lib/admin.functions.ts"));

// ── The ladder ──────────────────────────────────────────────────────────────

check("the trail has an action for an agency level",
  /"agency_level\.created" \| "agency_level\.updated"/.test(AUDIT), true);
// Distinct from comp_level.*, which is the carrier-side grid. Collapsing them
// would make the log unable to say which kind of percentage moved.
check("…distinct from the carrier-side comp level",
  /"comp_level\.created"/.test(AUDIT), true);

check("saving a rung records it",
  /action: id \? "agency_level\.updated" : "agency_level\.created"/.test(RECORDS), true);
// The prior percentage is the point of the record and it is gone the moment
// the write lands.
check("…reading what it was first",
  /const before = id[\s\S]{0,400}\.from\("agency_levels"\)[\s\S]{0,200}\.maybeSingle\(\)/.test(RECORDS),
  true);
check("…including the per-carrier mappings",
  /mappingsBefore/.test(RECORDS) && /mappings: mappingsBefore/.test(RECORDS), true);
// Pulled out of the JSON blobs so a reader scanning the log sees the money
// change without opening two columns.
check("…and naming the percentage that moved",
  /base_pct_from:[\s\S]{0,120}base_pct_to:/.test(RECORDS), true);

// ── The per-agent override ──────────────────────────────────────────────────

console.log("");

check("the trail has an action for a per-agent change",
  /"agent_comp\.changed"/.test(AUDIT), true);
check("there is one helper, not two copies",
  (ADMIN.match(/async function auditAgentComp/g) ?? []).length, 1);

// Both writers. A trail that covers one of two paths is not a trail.
const WRITERS = ADMIN.match(/from\("agent_commission_levels"\)\.upsert/g) ?? [];
check("both writers exist to be covered", WRITERS.length, 2);
check("…and both are audited", (ADMIN.match(/auditAgentComp\(supabase, \{/g) ?? []).length, 2);

check("the prior percentage is read before the upsert",
  /await auditAgentComp\(supabase, \{[\s\S]{0,300}\}\);\s*(const \{ error \} = )?await supabase\s*\.?\s*\.?from\("agent_commission_levels"\)\.upsert/.test(ADMIN),
  true);
check("…and carries both ends of the change",
  /pct_from:[\s\S]{0,120}pct_to:/.test(ADMIN), true);
check("…attributed to the agency the agent belongs to",
  /organizationId: \(agent as any\)\?\.organization_id/.test(ADMIN), true);

// ── An audit write may never undo the thing it describes ────────────────────

console.log("");

check("a failed comp audit is logged, not thrown",
  /catch \(e: any\) \{[\s\S]{0,120}comp change not audited/.test(ADMIN), true);
// The house contract, stated in the audit module itself.
check("…which is the contract the audit module states",
  /Failures here are swallowed/.test(AUDIT), true);
check("the log is service-role only",
  /grants no insert to `authenticated`/.test(AUDIT), true);

// ── The brief's list ────────────────────────────────────────────────────────

console.log("");

// permission | hierarchy | level | contract | carrier | writing number |
// commission. Each has an action somewhere in the product.
const PERMS = strip(read("src/lib/permissions.functions.ts"));
check("permission changes are recorded", /from\("audit_log"\)\.insert/.test(PERMS), true);
for (const [what, pattern] of [
  ["hierarchy", /"hierarchy\.changed"/],
  ["carrier", /"carrier\.updated"/],
  ["writing number", /"writing_number\.updated"/],
  ["contract request", /"request\.status_changed"/],
] as const) {
  check(`${what} changes have an action`, pattern.test(AUDIT), true);
}
// The two this commit adds, which complete the list.
check("agency level changes have one now", /"agency_level\.updated"/.test(AUDIT), true);
check("per-agent compensation changes have one now", /"agent_comp\.changed"/.test(AUDIT), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
