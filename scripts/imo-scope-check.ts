/**
 * Total IMO: the one place the org boundary opens, and only on the parent's
 * terms, and only upward.
 *
 *   npx tsx scripts/imo-scope-check.ts
 *
 * The pure half exercises the TS scope layer: the fourth option exists only
 * when the database says the caller has an opted-in child, a stale ?scope=imo
 * link narrows instead of erroring, and the labels read like a person wrote
 * them. The SQL arm is pinned by string assertions against the migration —
 * the properties that matter are the ones the legacy dashboard CTEs lack:
 * depth cap, cycle guard, and terms respected at every level.
 *
 * The wiring half covers the surfaces: leaderboard scope routing and the
 * owner opt-out, the three-level production strip, the feed's upward walk,
 * and every pre-migration window degrading to today's behaviour.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SCOPES, SCOPE_LABELS, SCOPE_DESCRIPTIONS, NO_SCOPE_CAPABILITIES,
  availableScopes, normalizeScope, emptyScopeMessage,
} from "../src/lib/scope";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The scope layer ─────────────────────────────────────────────────────────

check("imo is the fourth scope", SCOPES, ["mine", "team", "agency", "imo"]);

const OWNER_WITH_IMO = { downlineCount: 3, canAgency: true, canEditTeamRecords: true, canImo: true };
const OWNER_NO_CHILDREN = { downlineCount: 3, canAgency: true, canEditTeamRecords: true, canImo: false };
const PLAIN_AGENT = { ...NO_SCOPE_CAPABILITIES };

check("an IMO owner is offered all four", availableScopes(OWNER_WITH_IMO), ["mine", "team", "agency", "imo"]);
check("an owner without opted-in children never sees Total IMO",
  availableScopes(OWNER_NO_CHILDREN), ["mine", "team", "agency"]);
check("a plain agent still sees only their own work", availableScopes(PLAIN_AGENT), ["mine"]);
check("a stale ?scope=imo link narrows for a solo agency, never errors",
  normalizeScope("imo", OWNER_NO_CHILDREN), "mine");
check("…and resolves for an IMO owner", normalizeScope("imo", OWNER_WITH_IMO), "imo");
check("the label says what it totals", SCOPE_LABELS.imo, "Total IMO");
check("the description names the opt-in", /opted in/.test(SCOPE_DESCRIPTIONS.imo), true);
check("the empty state speaks across agencies",
  emptyScopeMessage("imo", OWNER_WITH_IMO, "deals"), "Nobody across your agencies has any deals yet.");
check("pre-migration capabilities default to no IMO", NO_SCOPE_CAPABILITIES.canImo, false);

// ── The SQL arm ─────────────────────────────────────────────────────────────

console.log("");

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MIG = read("supabase/migrations/20260814160000_imo-scope.sql");
check("imo_org_ids respects the terms at every level",
  /r\.status = 'active'\s*\n\s*and r\.include_production/.test(MIG), true);
check("…with a depth cap", /t\.depth < 10/.test(MIG), true);
check("…and a cycle guard", /not \(r\.child_org_id = any\(t\.path\)\)/.test(MIG), true);
check("imo degrades one step at a time, never errors",
  /_scope = 'imo' and not \(select ok from can_imo\)/.test(MIG), true);
check("my_scopes reports can_imo", /'can_imo',/.test(MIG), true);
check("the owner toggles default to participating",
  (MIG.match(/boolean not null default true/g) ?? []).length, 2);
check("the migration names its dependency", /depends on agency_relationships \(20260814150000\)/i.test(MIG), true);

// ── The surfaces ────────────────────────────────────────────────────────────

console.log("");

const DASH = read("src/lib/dashboard.functions.ts");
// Personal and Team joined agency/imo when the board gained the four views the
// brief asks for. Everything beyond Personal still goes through the scope
// layer — Personal is the one case that resolves to a single id without it.
check("the leaderboard routes agency/imo through the scope layer",
  /scope: z\.enum\(\["mine", "team", "agency", "imo"\]\)\.optional\(\)/.test(DASH) &&
  /resolveScopeAgentIdsOrNone\(supabase, data\.scope as any\)/.test(DASH), true);
check("opted-out owners lose their own line only",
  /eq\("show_own_on_leaderboards", false\)/.test(DASH) && /hiddenOwners\.delete\(userId\)/.test(DASH), true);
check("…inside a catch for the pre-migration window",
  /catch \{\s*\n\s*\/\/ Column absent before the imo-scope migration/.test(DASH), true);
check("the three levels come from the same resolver as every scoped page",
  /getProductionByScope/.test(DASH) && /sumFor\("mine"\), sumFor\("agency"\), sumFor\("imo"\)/.test(DASH), true);

const BOARD = read("src/routes/_authenticated/leaderboard.tsx");
const BOARDMOD = read("src/lib/leaderboard/board.ts");
// The switch grew from two options to the four the brief names, so the labels
// moved into the shared module. What must not change is which of them an
// agency without an IMO is offered.
check("the board switch offers My Agency and Total IMO",
  /\{ value: "agency", label: "My Agency" \}/.test(BOARDMOD) &&
  /\{ value: "imo", label: "Total IMO" \}/.test(BOARDMOD), true);
check("…with Total IMO only when the rollup applies",
  /s\.value !== "imo" \|\| caps\.canImo/.test(BOARD), true);
// A team view for somebody with nobody under them is a guaranteed empty board.
check("…and My Team only for somebody who has one",
  /s\.value !== "team" \|\| caps\.downlineCount > 0/.test(BOARD), true);
check("the three-figure strip labels read Personal / My Agency / Total IMO",
  /label="Personal"/.test(BOARD) && /label="My Agency"/.test(BOARD) && /label="Total IMO"/.test(BOARD), true);
check("…and hides without an IMO", /\{caps\.canImo && <ThreeLevels \/>\}/.test(BOARD), true);

const DISCORD = read("src/lib/discord.functions.ts");
check("the feed walks up only through willing relationships",
  /eq\("status", "active"\)\s*\n\s*\.eq\("allow_sales_feed", true\)/.test(DISCORD), true);
check("…depth-capped", /depth < 10/.test(DISCORD), true);
check("an opted-out owner's own deal posts nowhere",
  /show_own_sales_in_feed/.test(DISCORD) && /os\.show_own_sales_in_feed === false\) return/.test(DISCORD), true);
// The ledger insert moved into a helper taking `orgId`, so the literal this
// used to match no longer appears anywhere. The requirement is unchanged and is
// what gets asserted: a delivery row belongs to the org that owns the CHANNEL,
// not the org that owns the policy. In an IMO rollup a child's deal posts to
// the parent's channel, and filing that row under the child would hide it from
// the only owner who can see the channel.
check("ledger rows belong to the channel's org",
  /orgId: c\.organization_id, integrationId: c\.id/.test(DISCORD) &&
  (DISCORD.match(/orgId: cfg\.organization_id/g) ?? []).length >= 3, true);
check("…and never to the policy's",
  /orgId: policy\.organization_id/.test(DISCORD), false);

const ORG_SETTINGS = read("src/lib/org-settings.functions.ts");
check("the visibility toggles save through org settings",
  /show_own_sales_in_feed: z\.boolean\(\)\.optional\(\)/.test(ORG_SETTINGS) &&
  /show_own_on_leaderboards: z\.boolean\(\)\.optional\(\)/.test(ORG_SETTINGS), true);
check("…with the pending-column retry covering them",
  /PENDING_COLUMNS = \["show_own_sales_in_feed", "show_own_on_leaderboards"\]/.test(ORG_SETTINGS), true);

const AGENCY_PAGE = read("src/routes/_authenticated/settings.agency.tsx");
check("the owner sees both toggles in plain words",
  /Show my own sales in the team sales feed/.test(AGENCY_PAGE) &&
  /Show my own numbers on leaderboards/.test(AGENCY_PAGE), true);
check("the copy promises the team is untouched", /your team's numbers are untouched/i.test(AGENCY_PAGE), true);

check("scope capabilities map can_imo from SQL",
  /canImo: Boolean\(\(data as any\)\.can_imo\)/.test(read("src/lib/scope.functions.ts")), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
