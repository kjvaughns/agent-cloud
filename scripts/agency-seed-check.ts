/**
 * A sub agency starts from its parent's setup — copied once, then independent.
 *
 *   npx tsx scripts/agency-seed-check.ts
 *
 * The failure modes this guards against:
 *
 *   - copying a row without remapping the ids it points at, so a child's
 *     mapping silently references the PARENT's level or carrier;
 *   - copying identity/audit columns (id, created_by), which either collides
 *     or credits the wrong person;
 *   - a second run duplicating a ladder (the per-category emptiness guard);
 *   - a failed copy taking the whole signup down;
 *   - `org_contracting_settings` copied WITHOUT claiming its fields, which
 *     would leave the child on live parent inheritance — the thing copy-once
 *     is not.
 *
 * String assertions, as with the other structural checks: the writes need a
 * database, the wiring does not.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SEED = read("src/lib/agency-seed/seed-from-parent.server.ts");
const FNS = read("src/lib/agency-seed.functions.ts");
const ONBOARD = read("src/lib/onboarding.functions.ts");
const PANEL = read("src/components/settings/inherit-parent-panel.tsx");
const AGENCY = read("src/routes/_authenticated/settings.agency.tsx");

// ── What gets copied ────────────────────────────────────────────────────────

for (const table of [
  "agency_levels", "org_carriers", "carrier_comp_levels",
  "agency_level_carrier_mappings", "org_carrier_methods", "carrier_requirements",
  "commission_grids", "org_role_comp_mappings", "org_contracting_settings",
]) {
  check(`copies ${table}`, SEED.includes(`"${table}"`), true);
}

// ── Identity and audit columns never travel ─────────────────────────────────

for (const col of ["id", "organization_id", "created_at", "updated_at", "created_by", "updated_by", "auto_assign_staff_id"]) {
  check(`drops ${col} from the copy`, new RegExp(`"${col}",`).test(SEED.split("DROP_COLUMNS")[1] ?? ""), true);
}

// ── Ids are remapped, not carried ───────────────────────────────────────────

check("levels come first, capturing their id map", SEED.indexOf("levelMap") < SEED.indexOf("carrierMap"), true);
check("mappings remap agency_level_id", /agency_level_id: level/.test(SEED), true);
check("mappings remap org_carrier_id", /org_carrier_id: oc/.test(SEED), true);
check("comp levels remap their self-reference", /max_downline_level_id: newTarget/.test(SEED), true);
check("role mappings remap comp_level_id", /comp_level_id: cl \?\? null/.test(SEED), true);
check("a row whose carrier didn't come across is dropped", /if \(!oc\) return null/.test(SEED), true);
check("an existing child ladder still yields an id map", SEED.includes("existingMap"), true);

// ── Idempotent per category ─────────────────────────────────────────────────

check("every category is guarded by an emptiness check", SEED.includes("hasRows"), true);
check("the guard is per table, not global", (SEED.match(/hasRows\(/g) ?? []).length >= 5, true);
check("settings are only written when the child has none", SEED.includes("if (!existingSettings)"), true);

// ── Copy-once, not live inheritance ─────────────────────────────────────────

check("copied settings claim their fields", /overridden_fields = \[\.\.\.INHERITABLE_FIELDS\]/.test(SEED), true);
check("grid copies are marked inherited", /source: "inherited"/.test(SEED), true);

// ── Wiring ──────────────────────────────────────────────────────────────────

check("invite acceptance seeds the new sub agency", ONBOARD.includes("seedOrgFromParent"), true);
check("a failed seed cannot break signup", /try \{[\s\S]*seedOrgFromParent[\s\S]*catch/.test(ONBOARD), true);
check("the server fn is owner-only", FNS.includes("assertOrgOwner"), true);
check("the server fn refuses a root agency", FNS.includes("doesn't sit under a parent agency"), true);
check("the admin client is loaded inside the handler", !/^import \{ supabaseAdmin/m.test(FNS), true);
check("the note hides when there is nothing to carry over", PANEL.includes("!data.missing.length"), true);
check("the note says the copy is editable", /without affecting them/.test(PANEL), true);
check("agency settings mounts the note", AGENCY.includes("<InheritParentPanel />"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
