/**
 * The terms of a parent/child agency relationship — and who holds the pen.
 *
 *   npx tsx scripts/sub-agency-check.ts
 *
 * agency_relationships turns the bare parent_org_id foreign key into a row
 * with terms: does the child's production count, do its deals flow into the
 * parent's feed, is the link active. The failure modes this guards against:
 *
 *   - a child changing its own terms (the parent owns the toggles);
 *   - a silent RLS no-op reading as success (the row-count assert);
 *   - a Sub-Agencies tab shown to a solo agency (the has-sub-agencies gate);
 *   - the pre-migration window erroring instead of explaining (42P01).
 *
 * String assertions — proof of connection. The behavioural half of Phase 4
 * lives in the migration's own scratch-Postgres run (RLS is SQL, not TS).
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
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The migration ───────────────────────────────────────────────────────────

const MIG = read("supabase/migrations/20260814150000_agency-relationships.sql");
check("the table carries the four terms",
  ["include_production", "allow_sales_feed", "visibility", "status"].every((c) => MIG.includes(c)), true);
check("one row per parent/child pair", /unique \(parent_org_id, child_org_id\)/.test(MIG), true);
check("an org cannot be its own parent", /check \(parent_org_id <> child_org_id\)/.test(MIG), true);
check("the parent's admins hold the pen", /is_org_admin\(parent_org_id\)/.test(MIG), true);
check("a child may read its own row only",
  /agency_relationships_child_read[\s\S]*?for select using \(\s*public\.is_org_admin\(child_org_id\)\s*\)/.test(MIG), true);
check("existing parent_org_id links are backfilled",
  /insert into public\.agency_relationships \(parent_org_id, child_org_id\)/.test(MIG) &&
  /on conflict \(parent_org_id, child_org_id\) do nothing/.test(MIG), true);
check("idempotent + schema reload", /create table if not exists/.test(MIG) && /notify pgrst/.test(MIG), true);

// ── The server functions ────────────────────────────────────────────────────

console.log("");

const FNS = read("src/lib/agency-relationships.functions.ts");
check("reads and writes run on the RLS-bound client",
  /const \{ supabase, userId \} = context as Ctx/.test(FNS), true);
check("the update asserts its row count",
  /\.select\("id"\)/.test(FNS) && /not yours to manage/.test(FNS), true);
check("the child's view selects only the terms and the parent's name",
  /getMyParentAgency/.test(FNS) &&
  /select\("parent_org_id, include_production, allow_sales_feed, status"\)/.test(FNS) &&
  /select\("name"\)\.eq\("id", row\.parent_org_id\)/.test(FNS), true);
check("the pre-migration window explains instead of erroring",
  /42P01/.test(FNS) && /pendingMigration/.test(FNS), true);
check("terminated rows are excluded from both views",
  (FNS.match(/\.neq\("status", "terminated"\)/g) ?? []).length >= 2, true);

// ── The page and the gate ───────────────────────────────────────────────────

console.log("");

const PAGE = read("src/routes/_authenticated/settings.sub-agencies.tsx");
check("the toggles speak plain language",
  /Count their production in my totals/.test(PAGE) && /Let them post sales to my feed/.test(PAGE), true);
check("the page says the rollup only flows up", /rollup only flows up/.test(PAGE), true);
check("remove asks first and never deletes the agency",
  /window\.confirm/.test(PAGE) && /doesn't delete their agency/.test(PAGE), true);
check("only settings-editors may flip terms", /canEditAgencySettings/.test(PAGE), true);

const NAV = read("src/lib/navigation.ts");
check("the nav gate exists", /"has-sub-agencies"/.test(NAV), true);
check("…and requires children AND agency admin",
  /ctx\.hasSubAgencies && ctx\.canSeeAgency/.test(NAV), true);
// Moved twice. First out of the flat "Your agency" run into Team and Access,
// where a sub-agency belongs: it is who else is in the org, not how
// contracting runs. Then out of Settings entirely, when the Settings hub was
// cut to five destinations — a sub-agency is people, so it sits under Agency
// beside the roster rather than under Settings beside billing.
//
// What matters either way is that it is reachable and still gated, which is
// what these assert. Pinning the hub it happened to live in is what made this
// fail on a move that improved it.
check("the page is still in the registry",
  /id: "sub-agencies-nav", label: "Sub-Agencies"/.test(NAV), true);
check("…under Agency, with the roster",
  /id: "sub-agencies-nav"[^}]*area: "Agency"/.test(NAV), true);
check("…still gated on actually having children",
  /id: "sub-agencies-nav"[^}]*unlock: "has-sub-agencies"/.test(NAV), true);
// The Settings hub, held to exactly this list. Anything creeping back in is
// the thing the consolidation was for — notif-settings is here on purpose,
// because it configures your own inbox and cannot live behind an agency
// permission.
check("the Settings hub holds its shape",
  /settings: \[\s*\{ label: "", ids: \["agency-settings", "notif-settings", "security", "billing", "nova-pro", "support-desk"\] \},\s*\]/
    .test(NAV), true);

const ACCESS = read("src/lib/permissions.functions.ts");
check("hasSubAgencies is computed from parent_org_id",
  /eq\("parent_org_id", org\.id\)/.test(ACCESS), true);
check("…and shipped through the nav context",
  /hasSubAgencies: Boolean\(access\?\.hasSubAgencies\)/.test(read("src/hooks/use-my-access.ts")), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
