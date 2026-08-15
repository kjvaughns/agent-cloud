/**
 * A contract says what it pays, and where the number came from.
 *
 *   npx tsx scripts/contract-compensation-check.ts
 *
 * My Contracts showed a status and a writing number and nothing about money.
 * An agent could not see the percentage they were on, could not tell whether
 * it came from their own contract or their agency level, and could not see
 * whether they were advanced or paid as earned. Worse, a carrier the agency
 * had not finished setting up looked exactly like one it had — and an
 * unresolvable carrier writes no commission schedule at all, so the first
 * sign of it was a posted deal that never paid.
 *
 * Two halves. The batched index must agree with the single-agent resolver it
 * exists to avoid calling N times — a faster second implementation of the same
 * rules would be the exact duplication this recovery is meant to remove — and
 * the page must render what it returns rather than working anything out.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveCompensation,
  PCT_SOURCE_LABELS,
  ADVANCE_SOURCE_LABELS,
  ADVANCE_LABELS,
  type AgencyLevel,
} from "../src/lib/compensation/resolve";

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

// ── Every source has words, and they are the same words everywhere ──────────

const GA: AgencyLevel = {
  id: "ga", name: "General Agent", base_pct: 80, sort_order: 2, can_invite: true, active: true,
};
const CARRIER = {
  org_carrier_id: "oc", enabled: true, visible_to_agents: true,
  requestable_by_agents: true, available_for_post_deal: true,
  default_advance_option: "9_months" as const,
};

const fromLevel = resolveCompensation({
  agentId: "a", orgCarrierId: "oc", level: GA, mapping: null, contract: null, carrier: CARRIER,
});
check("a resolution names where its percentage came from",
  fromLevel.ok && fromLevel.pctSource, "level_base");
// `grid` joined the other three when the carrier's published product and age
// band rates started being selected from. It is the only source that can
// differ between two deals the same agent writes on the same carrier, so it
// needs a sentence as much as the rest — an agent seeing 80% on one deal and
// 60% on the next has to be able to find out why.
check("…and every source has a sentence",
  Object.keys(PCT_SOURCE_LABELS).sort(), ["contract", "grid", "level_base", "level_carrier"]);
check("…as does every advance source",
  Object.keys(ADVANCE_SOURCE_LABELS).sort(), ["carrier_default", "contract", "level_carrier"]);
// The page shows these on rows belonging to other people in Team and Agency
// scope, where "your agency level" would name the wrong person's.
check("the wording does not assume whose contract it is",
  Object.values({ ...PCT_SOURCE_LABELS, ...ADVANCE_SOURCE_LABELS })
    .some((s) => /\byour\b/i.test(s)), false);
check("an advance has a label for every option",
  Object.keys(ADVANCE_LABELS).length, 5);

const override = resolveCompensation({
  agentId: "a", orgCarrierId: "oc", level: GA, mapping: null, carrier: CARRIER,
  contract: {
    agent_id: "a", org_carrier_id: "oc", assigned_pct: 85,
    advance_option: "12_months", commission_level: "85%", status: "active",
  },
});
check("a contract override says so", override.ok && override.pctSource, "contract");
check("…and its advance says so too", override.ok && override.advanceSource, "contract");

// The case the chip exists for: nothing resolves, and no deal on this carrier
// will ever produce a commission row.
const broken = resolveCompensation({
  agentId: "a", orgCarrierId: "oc", level: null, mapping: null, contract: null, carrier: CARRIER,
});
check("an agent on no level does not resolve", broken.ok, false);
check("…and is told which fact is missing",
  !broken.ok && broken.failures, ["no_agency_level"]);

// ── The batched index is the same rules, not a second copy ──────────────────

console.log("");

const LOOKUP = strip(read("src/lib/compensation/lookup.server.ts"));
check("the batched index calls the pure resolver",
  /loadCompensationIndex[\s\S]*?resolveCompensation\(\{/.test(LOOKUP), true);
// The thing it exists to prevent: four queries per row, on a list that is one
// row per carrier per agent.
check("…and reads each fact once, not per row",
  /\.in\("organization_id", orgIds\)/.test(LOOKUP) &&
  /\.in\("agent_id", agentIds\)/.test(LOOKUP), true);
// A sub-agency has its own carriers, ladder and mappings. Keyed on carrier_id
// alone, its agents would resolve against the parent agency's percentages.
check("a carrier is keyed by agency as well as by carrier",
  /carrierByOrgAndCarrier\.set\(\s*`\$\{c\.organization_id\}:\$\{c\.carrier_id\}`/.test(LOOKUP), true);
check("org_carriers is still read with select(*) for the pending window",
  /\.from\("org_carriers"\)\s*\.select\("\*"\)\s*\.in\("organization_id", orgIds\)/.test(LOOKUP), true);

const CONTRACTING = strip(read("src/lib/contracting.functions.ts"));
check("the contract list attaches a resolution to every row",
  /const resolution = comp\.resolve\(r\.agent_id, r\.carrier_id\)/.test(CONTRACTING), true);
check("…carrying the source, not just the number",
  /pct_source: resolution\.pctSource/.test(CONTRACTING), true);
check("…and the advance", /advance_months: resolution\.advanceMonths/.test(CONTRACTING), true);
check("…and the reasons when it does not resolve",
  /messages: resolution\.messages/.test(CONTRACTING), true);

// ── The page renders it rather than working it out ──────────────────────────

console.log("");

const PAGE = strip(read("src/routes/_authenticated/contracting/index.tsx"));
check("the row shows the percentage without being expanded",
  /function CompensationChip/.test(PAGE), true);
check("…and says plainly when there is none",
  /Comp not set up/.test(PAGE), true);
check("the panel names the source of the percentage",
  /PCT_SOURCE_LABELS\[compensation\.pct_source/.test(PAGE), true);
check("…from the module that decided it, not a copy",
  /from "@\/lib\/compensation\/resolve"/.test(PAGE), true);
// An unresolvable carrier is not a cosmetic gap.
check("an unresolved carrier says what it costs",
  /won't produce a commission schedule/.test(PAGE), true);
// Two stored percentages for one concept, written by different paths. Hiding
// the disagreement is how somebody trusts the wrong one.
check("a contract record that disagrees is shown, not hidden",
  /is what pays/.test(PAGE), true);

// ── One workspace, not two pages ────────────────────────────────────────────

console.log("");

const GRIDS_ROUTE = read("src/routes/_authenticated/contracting/commission-grids.tsx");
check("the standalone comp grids page redirects into the tab",
  /redirect\(\{ to: "\/contracting", search: \{ tab: "comp-grids" \} \}\)/.test(GRIDS_ROUTE), true);
// Redirect, not delete: the path is bookmarked and the tour links to it.
check("…rather than 404ing a bookmarked path",
  /createFileRoute\("\/_authenticated\/contracting\/commission-grids"\)/.test(GRIDS_ROUTE), true);
check("the component it used to hold lives on its own",
  /export function CompGridsContent/.test(read("src/components/contracting/comp-grids-content.tsx")), true);

const NAV = strip(read("src/lib/navigation.ts"));
check("the duplicate nav row is gone",
  /path: "\/contracting\/commission-grids"/.test(NAV), false);
// The owner's editor keeps a home; only the agent's duplicate went. That home
// is now the Carriers tab of Agency Settings rather than a page of its own —
// what a carrier pays is part of setting that carrier up, so Comp Grids
// stopped being a separate destination and `/settings/comp-grids` became a
// redirect into the tab.
check("the editor still has exactly one home",
  read("src/routes/_authenticated/settings.agency.tsx")
    .includes("<ManageGridsPage embedded />"), true);
check("…and the old standalone page is a redirect, not a second mount",
  /redirect\(\{ to: "\/settings\/agency", search: \{ tab: "carriers" \}/.test(
    read("src/routes/_authenticated/settings.comp-grids.tsx")), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
