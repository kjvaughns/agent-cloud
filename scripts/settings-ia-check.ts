/**
 * Configuration lives in Settings; work stays in the work tabs.
 *
 *   npx tsx scripts/settings-ia-check.ts
 *
 * Phase 2 of the consolidation moved the agency's contracting configuration —
 * carriers, comp grids, the promotion ladder, the contracting policy, the
 * submission templates — out of /contracting-ops/* and under /settings/*.
 * The failure mode this guards against is the one the audit found twice: a
 * concept rendering from two files, and links or checklists still sending
 * people to a page that can no longer do the thing.
 *
 * All string assertions — proof of connection, not behaviour. Redirect stubs
 * are exempt from the stale-path sweep: they SHOULD name the old paths.
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

// ── One file per concept, mounted as a tab of Agency settings ───────────────

const AGENCY = read("src/routes/_authenticated/settings.agency.tsx");

const CONCEPTS: [string, string, string, string][] = [
  // [concept, component file, exported name, tab it renders under]
  ["carrier setup", "src/components/contracting/carrier-setup.tsx", "CarrierDirectoryPage", "carriers"],
  ["comp-grid editor", "src/components/contracting/manage-grids.tsx", "ManageGridsPage", "carriers"],
  ["levels ladder", "src/components/contracting/levels-panel.tsx", "LevelsPanel", "levels"],
  ["contracting policy", "src/components/settings/contracting-settings-panel.tsx", "ContractingSettingsPanel", "contracting"],
  ["submission templates", "src/components/settings/templates-panel.tsx", "TemplatesPanel", "contracting"],
  ["roles & permissions", "src/components/agency-team-page.tsx", "AgencyTeamPage", "roles"],
  ["notification prefs", "src/components/settings/notifications-panel.tsx", "NotificationsPanel", "notifications"],
  ["integrations catalogue", "src/components/settings/integrations-catalog.tsx", "IntegrationsCatalog", "integrations"],
];

for (const [concept, compFile, exported, tab] of CONCEPTS) {
  const comp = read(compFile);
  check(`${concept}: component exports ${exported}`, comp.includes(`export function ${exported}`), true);
  check(`${concept}: component declares no route`, /createFileRoute/.test(comp), false);
  check(`${concept}: Agency settings mounts it`, AGENCY.includes(`<${exported}`), true);
  check(`${concept}: its tab exists`, AGENCY.includes(`"${tab}"`), true);
}

// The eight tabs, in the order the work happens.
check("Agency settings declares the eight tabs in order",
  /"general",\s*\n\s*"roles",\s*\n\s*"levels",\s*\n\s*"carriers",\s*\n\s*"contracting",\s*\n\s*"notifications",\s*\n\s*"automations",\s*\n\s*"integrations",/.test(AGENCY),
  true);
check("the setup strip is above the tabs", /<AgencySetupProgress/.test(AGENCY), true);

// ── The pages that became tabs redirect into them, in one hop ───────────────

console.log("");

const TAB_REDIRECTS: [string, string][] = [
  ["src/routes/_authenticated/settings.carriers.tsx", "carriers"],
  ["src/routes/_authenticated/settings.comp-grids.tsx", "carriers"],
  ["src/routes/_authenticated/settings.levels.tsx", "levels"],
  ["src/routes/_authenticated/settings.contracting.tsx", "contracting"],
  ["src/routes/_authenticated/settings.templates.tsx", "contracting"],
  ["src/routes/_authenticated/settings.notifications.tsx", "notifications"],
  ["src/routes/_authenticated/settings.roles.tsx", "roles"],
  ["src/routes/_authenticated/settings.automations.tsx", "automations"],
  ["src/routes/_authenticated/settings.integrations.tsx", "integrations"],
];
for (const [file, tab] of TAB_REDIRECTS) {
  const s = read(file);
  check(`${file.split("/").pop()} → ?tab=${tab}`,
    s.includes(`"/settings/agency"`) && s.includes(`tab: "${tab}"`) && /beforeLoad/.test(s), true);
  check(`${file.split("/").pop()} renders nothing itself`, /component:/.test(s), false);
}


// ── The old ops homes land on the right tab, in one hop ─────────────────────

console.log("");

const REDIRECTS: [string, string, string][] = [
  ["src/routes/_authenticated/contracting-ops/settings.tsx", "contracting", "ops contracting settings"],
  ["src/routes/_authenticated/contracting-ops/templates.tsx", "contracting", "ops templates"],
  ["src/routes/_authenticated/contracting-ops/comp-grids.tsx", "carriers", "ops comp-grids"],
  ["src/routes/_authenticated/contracting-ops/commission-levels.tsx", "levels", "ops commission-levels"],
  ["src/routes/_authenticated/contracting.comp-grids-manage.tsx", "carriers", "comp-grids-manage"],
];
for (const [file, tab, name] of REDIRECTS) {
  const s = read(file);
  check(`${name} redirects to ?tab=${tab}`,
    s.includes(`"/settings/agency"`) && s.includes(`tab: "${tab}"`) && /beforeLoad/.test(s), true);
  // Two hops is how a link rots silently: the first stub keeps working while
  // the second one's target moves.
  check(`${name} does not hop through another stub`,
    /"\/settings\/(carriers|levels|comp-grids|contracting|templates|roles|notifications)"/.test(strip(s)), false);
}

const CARRIERS_STUB = read("src/routes/_authenticated/contracting-ops/carriers.tsx");
check("ops carriers stub maps carriers/levels/grids tabs",
  CARRIERS_STUB.includes(`"/settings/agency"`) &&
  ["carriers: \"carriers\"", "levels: \"levels\"", "grids: \"carriers\""].every((p) => CARRIERS_STUB.includes(p)), true);
const COMPENSATION_STUB = read("src/routes/_authenticated/contracting-ops/compensation.tsx");
check("compensation stub maps grids vs levels",
  COMPENSATION_STUB.includes('"carriers" : "levels"'), true);

// ── Nothing outside the stubs names the old homes ───────────────────────────

console.log("");

// The moved config pages. Anything still linking here pays a redirect hop and
// rots silently if the stub's target moves again.
const MOVED = [
  "/contracting-ops/carriers",
  "/contracting-ops/settings",
  "/contracting-ops/templates",
  "/contracting-ops/compensation",
  "/contracting-ops/comp-grids",
];
const LINK_SITES = [
  "src/routes/_authenticated/contracting-ops/index.tsx",
  "src/routes/_authenticated/contracting-ops.tsx",
  "src/routes/_authenticated/contracting/index.tsx",
  "src/routes/_authenticated/contracting/carriers.tsx",
  "src/routes/_authenticated/resources/new-agent-guide.tsx",
  "src/routes/_authenticated/agency/index.tsx",
  "src/components/staff-dashboard.tsx",
  "src/lib/onboarding-checklist.ts",
  "src/lib/navigation.ts",
  "src/lib/work.functions.ts",
  "src/lib/agent-onboarding.functions.ts",
];
for (const site of LINK_SITES) {
  const body = strip(read(site));
  const hits = MOVED.filter((p) => body.includes(`"${p}"`));
  check(`${site} names no moved config path`, hits, []);
}

// ── Settings itself is five rows ────────────────────────────────────────────

console.log("");

const NAV = read("src/lib/navigation.ts");
check("Settings lists five rows and no groups",
  /settings: \[\s*\n\s*\{ label: "", ids: \["agency-settings", "security", "billing", "nova-pro", "support-desk"\] \},\s*\n\s*\],/.test(NAV),
  true);
check("the ops hub is daily work only", /label: "Set up contracting"/.test(NAV), false);
// The configuration entries stay in the registry — the palette still knows
// those names — but they resolve to a tab, and none of them is a sidebar child
// of Settings any more.
for (const id of [
  "carriers-setup", "comp-grids-setup", "agency-levels",
  "contracting-settings", "contracting-templates",
  "agency-roles", "notif-settings", "agency-automations", "integrations",
]) {
  const line = NAV.split("\n").find((l) => l.includes(`id: "${id}"`)) ?? "";
  check(`nav entry ${id} resolves to an Agency settings tab`, /path: "\/settings\/agency\?tab=/.test(line), true);
  check(`nav entry ${id} is not a Settings sidebar row`, /parent: "settings"/.test(line), false);
}
check("White label is gone from navigation", /id: "white-label"/.test(NAV), false);
check("the Emails page is gone from navigation", /id: "agency-emails"/.test(NAV), false);


// ── The policy page finally renders its stored toggle ───────────────────────

console.log("");

const POLICY = read("src/components/settings/contracting-settings-panel.tsx");
check("warn_on_duplicate_requests has a control at last",
  /Warn about duplicate requests/.test(POLICY) && /set\("warn_on_duplicate_requests", v\)/.test(POLICY), true);
check("the save payload still carries it", /warn_on_duplicate_requests: s\.warn_on_duplicate_requests/.test(POLICY), true);

// ── The agent request surface still offers its three doors ──────────────────

const HOME = read("src/routes/_authenticated/contracting/index.tsx");
check("agents can request a carrier", /createContractRequest/.test(HOME), true);
check("agents can request a level change", /requestCommissionLevel/.test(HOME), true);
check("agents can request a hierarchy transfer", /TransferRequestsTab/.test(HOME), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
