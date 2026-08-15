/**
 * Agency Settings tabs are gated, and gated in one place.
 *
 *   npx tsx scripts/tab-access-check.ts
 *
 * ── The defect ──
 *
 * Agency Settings became eight tabs on one route. Nothing decided who could
 * open which, so every tab was reachable by anybody who could reach the route
 * — including Carriers, which decides what agents are paid, and Roles and
 * Permissions, which decides who can change that.
 *
 * ── Why the negative cases carry the weight ──
 *
 * A permission test that only checks "the owner can" passes on a module that
 * returns true for everybody. Every tab here is checked from three sides: the
 * owner, somebody holding exactly the right toggle, and somebody holding every
 * OTHER toggle. The third is the one that catches a mapping that reads the
 * wrong key.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SETTINGS_TABS, TAB_LABEL, TAB_PERMISSION, GRID_PERMISSION,
  canOpenTab, canEditGrids, visibleTabs, defaultTab, canOpenAgencySettings,
  refusalReason, type AccessContext, type SettingsTab,
} from "../src/lib/settings/tab-access";
import { ADMIN_PERMS, STAFF_PERMS } from "../src/lib/permissions.functions";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const owner: AccessContext = { isOwner: true, isPlatformAdmin: false, isStaff: true, perms: {} };
const agent: AccessContext = { isOwner: false, isPlatformAdmin: false, isStaff: false, perms: {} };
const staff = (perms: AccessContext["perms"]): AccessContext =>
  ({ isOwner: false, isPlatformAdmin: false, isStaff: true, perms });

// ── The eight, in the brief's order ─────────────────────────────────────────

check("the eight the brief names, in order", [...SETTINGS_TABS], [
  "general", "roles", "levels", "carriers",
  "contracting", "notifications", "automations", "integrations",
]);
// Levels before Carriers is deliberate: an agency builds its ladder before
// mapping it onto carrier levels.
check("levels comes before carriers",
  SETTINGS_TABS.indexOf("levels") < SETTINGS_TABS.indexOf("carriers"), true);
check("every tab has a label", SETTINGS_TABS.every((t) => TAB_LABEL[t].length > 2), true);

// ── Owner and agent ─────────────────────────────────────────────────────────

check("an owner sees all eight", visibleTabs(owner).length, 8);
// They are who grants the toggles; requiring them to hold one is circular.
check("…without holding any toggle", canOpenTab("carriers", owner), true);
check("a regular agent sees none", visibleTabs(agent), []);
check("…and cannot open Agency Settings at all", canOpenAgencySettings(agent), false);
// Somebody with no tabs must be sent away, not shown an empty shell.
check("…so there is no tab to land them on", defaultTab(agent), null);

// ── Each tab needs its own permission, and only its own ─────────────────────

const GATED = SETTINGS_TABS.filter((t) => TAB_PERMISSION[t] !== null);

for (const tab of GATED) {
  const key = TAB_PERMISSION[tab]!;
  check(`${tab} opens with ${key}`, canOpenTab(tab, staff({ [key]: true })), true);

  // Everything except the one it needs. This is the case that catches a
  // mapping reading a neighbour's key.
  const everythingElse: Record<string, boolean> = {};
  for (const k of [...ADMIN_PERMS, ...STAFF_PERMS]) if (k !== key) everythingElse[k] = true;
  check(`…and stays shut with every other permission`,
    canOpenTab(tab, staff(everythingElse)), false);
}

// Notifications only ever edits your own preferences. Gating it would stop
// somebody turning off their own email.
check("notifications needs nothing beyond a seat",
  canOpenTab("notifications", staff({})), true);
check("…but an agent still does not get it", canOpenTab("notifications", agent), false);

// ── The two that were reused rather than reinvented ─────────────────────────

check("roles reuses the existing staff-config permission",
  TAB_PERMISSION.roles, "admin_manage_staff_configs");
check("contracting reuses the existing contract permission",
  TAB_PERMISSION.contracting, "staff_edit_contracts");
// `staff_manage_resources` grants the handbook, scripts and academy. An agency
// that lets a trainer edit the script library has not said they may change
// what every agent is paid.
check("carriers does not borrow the resources permission",
  TAB_PERMISSION.carriers === "staff_manage_resources", false);

// ── Grids are their own permission inside Carriers ──────────────────────────

check("editing grids is separate from managing carriers",
  GRID_PERMISSION === TAB_PERMISSION.carriers, false);
check("somebody who manages carriers cannot edit grids by default",
  canEditGrids(staff({ admin_manage_carriers: true })), false);
check("…and somebody who edits grids can",
  canEditGrids(staff({ admin_manage_grids: true })), true);
check("an owner can", canEditGrids(owner), true);

// ── Landing ─────────────────────────────────────────────────────────────────

check("an owner lands on general", defaultTab(owner), "general");
check("a requested tab is honoured", defaultTab(owner, "carriers"), "carriers");
// A staff member deep-linked to a tab they cannot open must land somewhere
// real rather than on a blank one.
check("a tab they cannot open falls back to one they can",
  defaultTab(staff({ admin_manage_carriers: true }), "roles"), "carriers");
check("nonsense falls back too", defaultTab(owner, "not-a-tab"), "general");

// A staff member with one permission sees exactly one gated tab plus the
// ungated one, and a dropped tab is dropped rather than disabled.
check("a narrow seat sees only what it holds",
  visibleTabs(staff({ admin_manage_levels: true })), ["levels", "notifications"]);

// ── The refusal says what to grant ──────────────────────────────────────────

check("a refusal names the permission's home",
  /Roles and Permissions/.test(refusalReason("carriers")), true);
check("…and the tab that was refused",
  /Carriers/.test(refusalReason("carriers")), true);

// ── The keys exist in the shared vocabulary ─────────────────────────────────
//
// A tab mapped to a key nothing else knows about would compile, render a
// hidden tab forever, and never appear on the Roles screen for an owner to
// grant.

const KNOWN = new Set<string>([...ADMIN_PERMS, ...STAFF_PERMS]);
check("every tab permission is a real permission key",
  SETTINGS_TABS.filter((t) => TAB_PERMISSION[t] !== null && !KNOWN.has(TAB_PERMISSION[t]!)), []);
check("…including the grid one", KNOWN.has(GRID_PERMISSION), true);

// ── Hiding a button is not enough ───────────────────────────────────────────

console.log("");

const PERMS = strip(readFileSync(join(process.cwd(), "src/lib/permissions.functions.ts"), "utf8"));
check("the six new keys live with the existing ones",
  ["admin_manage_agency_profile", "admin_manage_levels", "admin_manage_carriers",
   "admin_manage_grids", "admin_manage_automations", "admin_manage_integrations"]
    .every((k) => PERMS.includes(`"${k}"`)), true);
// A second list is how two lists drift.
check("…and not in a second list of their own",
  (PERMS.match(/export const [A-Z_]+_PERMS = \[/g) ?? []).length, 3);

const PAGE = strip(readFileSync(join(process.cwd(), "src/routes/_authenticated/settings.agency.tsx"), "utf8"));
check("the page asks this module which tabs to show",
  /canOpenTab\("carriers", ctx\)/.test(PAGE), true);
check("…for all eight",
  SETTINGS_TABS.every((t) => new RegExp(`canOpenTab\\("${t}", ctx\\)`).test(PAGE)), true);
// A hidden trigger is not a gate if the landing tab can still be one they
// cannot open.
check("…and lands them on one they are allowed",
  /defaultTab\(ctx, tab \?\? null\)/.test(PAGE), true);
check("…moving them if a permission changes underneath them",
  /if \(landing && !allowed\.includes\(active\)\) setActive\(landing\)/.test(PAGE), true);
// The labels come from the module, so a tab renamed in one place is renamed
// everywhere.
check("the labels are not retyped in the page",
  /TAB_LABEL\.carriers/.test(PAGE), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
