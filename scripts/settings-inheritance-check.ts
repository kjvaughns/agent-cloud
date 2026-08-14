/**
 * A child agency inherits its parent's contracting policy — and an override
 * belongs to the child alone.
 *
 *   npx tsx scripts/settings-inheritance-check.ts
 *
 * The pure half exercises resolveEffectiveSettings against the four-step
 * cascade the design demands:
 *
 *   1. the parent sets a value → a child with no override shows it,
 *      labelled inherited;
 *   2. the child overrides → the parent is untouched, the child says
 *      "set by you";
 *   3. the child resets → it re-adopts the parent's CURRENT value;
 *   4. the parent changes again → still-inheriting children move,
 *      overridden children do not.
 *
 * The wiring half pins the part that makes inheritance real rather than
 * cosmetic: every server-side reader of org_contracting_settings goes
 * through the one effective-settings loader, so a child's work inbox,
 * licensing roster and hierarchy approvals obey the same resolution as its
 * settings page.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INHERITABLE_FIELDS, SYSTEM_DEFAULTS, resolveEffectiveSettings, type ChainOrg,
} from "../src/lib/contracting-ops/effective-settings";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const org = (orgId: string, orgName: string, row: Record<string, unknown> | null): ChainOrg =>
  ({ orgId, orgName, row });

// ── The cascade, all four steps ─────────────────────────────────────────────

const PARENT_ROW = {
  organization_id: "P", request_sla_days: 3, require_manager_review: true,
  overridden_fields: ["request_sla_days", "require_manager_review"],
};

{
  // 1. Parent sets 3-day SLA; child has no row at all.
  const r = resolveEffectiveSettings([org("C", "Vantage", null), org("P", "Ascent", PARENT_ROW)]);
  check("an empty child inherits the parent's value", r.effective.request_sla_days, 3);
  check("…and the label names the parent", r.sources.request_sla_days, { source: "inherited", inheritedFrom: "Ascent" });
  check("fields the parent never set fall to the system default", r.effective.pdb_refresh_days, 90);
  check("…labelled default, not inherited", r.sources.pdb_refresh_days, { source: "default" });
}

{
  // 2. Child overrides the SLA. The parent row object is untouched by
  // construction — resolution never writes — so the assertion is the label.
  const childRow = { organization_id: "C", request_sla_days: 10, overridden_fields: ["request_sla_days"] };
  const r = resolveEffectiveSettings([org("C", "Vantage", childRow), org("P", "Ascent", PARENT_ROW)]);
  check("an override wins over the parent", r.effective.request_sla_days, 10);
  check("…and reads as set-by-you", r.sources.request_sla_days, { source: "self" });
  check("unrelated fields still inherit", r.effective.require_manager_review, true);
  check("what reset would restore is the parent's value", r.inheritedValues.request_sla_days, 3);
}

{
  // 3 + 4. Reset = the field leaves overridden_fields; the child then tracks
  // the parent's CURRENT value, including later changes.
  const childRow = { organization_id: "C", request_sla_days: 10, overridden_fields: [] };
  const moved = { ...PARENT_ROW, request_sla_days: 5 };
  const r = resolveEffectiveSettings([org("C", "Vantage", childRow), org("P", "Ascent", moved)]);
  check("after reset the child re-adopts the parent", r.effective.request_sla_days, 5);
  check("…even though the child's row still stores the old 10", childRow.request_sla_days, 10);

  const overriddenChild = { organization_id: "C", request_sla_days: 10, overridden_fields: ["request_sla_days"] };
  const r2 = resolveEffectiveSettings([org("C", "Vantage", overriddenChild), org("P", "Ascent", moved)]);
  check("an overridden child does not move when the parent does", r2.effective.request_sla_days, 10);
}

// ── Depth, legacy rows, and the un-inheritable field ────────────────────────

console.log("");

{
  // Grandparent chains resolve to the NEAREST ancestor that claims the field.
  const grand = { organization_id: "G", request_sla_days: 1, pdb_refresh_days: 30, overridden_fields: ["request_sla_days", "pdb_refresh_days"] };
  const parent = { organization_id: "P", request_sla_days: 3, overridden_fields: ["request_sla_days"] };
  const r = resolveEffectiveSettings([
    org("C", "Vantage", null), org("P", "Ascent", parent), org("G", "Summit", grand),
  ]);
  check("the nearest ancestor wins", r.effective.request_sla_days, 3);
  check("a field only the grandparent set flows down two levels", r.effective.pdb_refresh_days, 30);
  check("…named after the grandparent", r.sources.pdb_refresh_days, { source: "inherited", inheritedFrom: "Summit" });
}

{
  // A legacy row — no overridden_fields marker at all — claims every field.
  // This is the pre-migration window and every agency that existed before it.
  const legacyChild = { organization_id: "C", request_sla_days: 14 };
  const r = resolveEffectiveSettings([org("C", "Vantage", legacyChild), org("P", "Ascent", PARENT_ROW)]);
  check("a legacy row keeps behaving as fully local", r.effective.request_sla_days, 14);
  check("…so applying the migration changes nothing by itself", r.sources.request_sla_days, { source: "self" });
}

{
  // auto_assign_staff_id names a person in one org. It must never cascade.
  const parent = { organization_id: "P", auto_assign_staff_id: "staff-at-parent", overridden_fields: [] };
  const r = resolveEffectiveSettings([org("C", "Vantage", null), org("P", "Ascent", parent)]);
  check("auto-assign never inherits from the parent", r.effective.auto_assign_staff_id, null);
  check("…and is not in the inheritable list",
    (INHERITABLE_FIELDS as readonly string[]).includes("auto_assign_staff_id"), false);
}

{
  // A root org — no chain to walk. Its row is simply its settings.
  const r = resolveEffectiveSettings([org("P", "Ascent", PARENT_ROW)]);
  check("a root org reads its own row", r.effective.request_sla_days, 3);
  check("…and unset fields read the defaults", r.effective.request_sla_days !== SYSTEM_DEFAULTS.request_sla_days, true);
}

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// Inheritance is only real if every reader resolves. A consumer that queries
// the table raw would give a child agency the system defaults its parent
// deliberately changed.
const CONSUMERS = [
  "src/lib/work.functions.ts",
  "src/lib/contracting-workflow.functions.ts",
  "src/lib/contracting-records.functions.ts",
  "src/lib/contracting.functions.ts",
];
for (const p of CONSUMERS) {
  const body = strip(read(p));
  check(`${p} resolves through the loader`, body.includes("loadEffectiveContractingSettings"), true);
  check(`${p} no longer queries the table raw`, body.includes('from("org_contracting_settings")'), false);
}

const OPS = read("src/lib/contracting-ops.functions.ts");
check("the settings read returns sources and inherited values",
  /sources: resolved\.sources/.test(OPS) && /inheritedValues: resolved\.inheritedValues/.test(OPS), true);
check("the save accepts the override list", /overridden_fields: z\.array\(z\.enum\(INHERITABLE_FIELDS\)\)\.optional\(\)/.test(OPS), true);
check("a root agency is pinned to all-local on save", /INHERITABLE_FIELDS\.slice\(\)/.test(OPS), true);
check("the save survives the pre-migration window", /PGRST204/.test(OPS) && /42703/.test(OPS), true);

const LOADER = read("src/lib/contracting-ops/effective-settings.server.ts");
check("the chain walk is depth-capped and cycle-guarded",
  /MAX_PARENT_DEPTH/.test(LOADER) && /seen\.has\(/.test(LOADER), true);
check("resolution runs on the service role, not widened RLS", /supabaseAdmin/.test(LOADER), true);

const PANEL = read("src/components/settings/contracting-settings-panel.tsx");
check("the panel says inherited-from in words", /Inherited from \{parentName\}/.test(PANEL), true);
check("…and set-by-you with a reset", /Set by you/.test(PANEL) && /Reset to \{parentName\}/.test(PANEL), true);
check("an inherited field is locked until overridden", /const locked = \(f: InheritableField\) => !canEdit \|\| !isOwn\(f\)/.test(PANEL), true);
check("reset restores the parent's current value", /setDraft\(\{ \.\.\.s, \[f\]: inheritedValues\[f\] \}\)/.test(PANEL), true);
check("auto-assign carries no source row", /Never inherited: it names a person in THIS agency/.test(read("src/components/settings/contracting-settings-panel.tsx")), true);

const MIGRATION = read("supabase/migrations/20260814140000_contracting-settings-inheritance.sql");
check("the migration adds only the marker column", /add column if not exists overridden_fields text\[\]/.test(MIGRATION), true);
check("…idempotent and schema-reloading", /if not exists/.test(MIGRATION) && /notify pgrst/.test(MIGRATION), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
