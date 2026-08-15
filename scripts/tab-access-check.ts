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

// Seven, not the brief's eight. Notifications moved out to
// /settings/notifications: it edits YOUR preferences rather than the agency's,
// so it was the one tab that could not be gated — and a page anybody may open
// does not belong behind a hub that needs an agency permission to reach.
check("the seven agency tabs, in order", [...SETTINGS_TABS], [
  "general", "roles", "levels", "carriers",
  "contracting", "automations", "integrations",
]);
// Levels before Carriers is deliberate: an agency builds its ladder before
// mapping it onto carrier levels.
check("levels comes before carriers",
  SETTINGS_TABS.indexOf("levels") < SETTINGS_TABS.indexOf("carriers"), true);
check("every tab has a label", SETTINGS_TABS.every((t) => TAB_LABEL[t].length > 2), true);

// ── Owner and agent ─────────────────────────────────────────────────────────

check("an owner sees all seven", visibleTabs(owner).length, 7);
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

// Every remaining tab is gated, which is what makes the hub itself a
// permission boundary rather than a folder.
check("every tab needs a permission",
  SETTINGS_TABS.filter((t) => TAB_PERMISSION[t] === null), []);
// The panel still exists; it is reachable at its own route instead.
check("notifications has its own destination",
  readFileSync(join(process.cwd(), "src/routes/_authenticated/settings.notifications.tsx"), "utf8")
    .includes("<NotificationsPanel />"), true);
check("…and is listed in the Settings hub",
  /ids: \["agency-settings", "notif-settings", "security", "billing", "nova-pro", "support-desk"\]/
    .test(readFileSync(join(process.cwd(), "src/lib/navigation.ts"), "utf8")), true);

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
  visibleTabs(staff({ admin_manage_levels: true })), ["levels"]);

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
// The rail renders `visibleTabs` rather than testing each trigger, so a tab
// added to the module appears without touching the page — and one somebody
// cannot open cannot be left behind by a forgotten guard.
check("the rail renders only the tabs this module allows",
  /\{allowed\.map\(\(t\) => \(/.test(PAGE), true);
check("…from visibleTabs", /const allowed = visibleTabs\(ctx\);/.test(PAGE), true);
// A hidden trigger is not a gate if the landing tab can still be one they
// cannot open.
check("…and lands them on one they are allowed",
  /defaultTab\(ctx, tab \?\? null\)/.test(PAGE), true);
check("…moving them if a permission changes underneath them",
  /if \(landing && !allowed\.includes\(active\)\) setActive\(landing\)/.test(PAGE), true);
// The labels come from the module, so a tab renamed in one place is renamed
// everywhere.
check("the labels are not retyped in the page",
  /\{TAB_LABEL\[t\]\}/.test(PAGE), true);
// A second list of tab names is how the rail, the permission map and the
// alias table stop agreeing about what exists.
check("…and the page derives its tab list rather than keeping its own",
  /const TABS = SETTINGS_TABS;/.test(PAGE), true);

// ── Hiding a button is not enough ───────────────────────────────────────────
//
// Anybody can post to a server function with a fetch. Until the guard existed
// the six permissions were advisory: somebody without `admin_manage_carriers`
// could still save a carrier by calling the endpoint directly.

console.log("");

const GUARD = strip(readFileSync(join(process.cwd(), "src/lib/settings/tab-guard.server.ts"), "utf8"));
// The decision lives in one place; the server imports it rather than restating
// it, or the two drift and the interface starts lying.
check("the server reuses the same decision function",
  /import \{[\s\S]*?canOpenTab[\s\S]*?\} from "\.\/tab-access"/.test(GUARD), true);
check("…and the same refusal wording", /refusalReason\(tab\)/.test(GUARD), true);
// `agency_owner` alone names no organization — that is what 20260815050000 was
// about — so it only counts alongside an active membership in THIS org.
check("owner status requires membership in this org, not a bare role",
  /membership\?\.status === "active" &&/.test(GUARD), true);

const CARRIERS = strip(readFileSync(join(process.cwd(), "src/lib/contracting-ops.functions.ts"), "utf8"));
check("saving a carrier is refused without the permission",
  /await assertTabPermission\(userId, "carriers", orgId\)/.test(CARRIERS), true);

const GRIDS = strip(readFileSync(join(process.cwd(), "src/lib/comp-grid.functions.ts"), "utf8"));
check("saving a grid needs the grid permission, not the carrier one",
  /await assertCanEditGrids\(userId, orgId\)/.test(GRIDS), true);
// Before the write, or it is not a guard.
check("…checked before the rows are written",
  GRIDS.indexOf("assertCanEditGrids") < GRIDS.indexOf("writeGridRows(supabase"), true);

const DISCORD = strip(readFileSync(join(process.cwd(), "src/lib/discord.functions.ts"), "utf8"));
check("saving a Discord channel needs the automations permission",
  /await assertTabPermission\(userId, "automations", orgId\)/.test(DISCORD), true);
// A webhook URL is a bearer credential. Widening from owner-only to a
// permission must not accidentally drop the check entirely.
check("…and the old owner-only check is not simply gone",
  /assertOrgOwner/.test(DISCORD), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
