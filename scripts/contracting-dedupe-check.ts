/**
 * One home per contracting concept.
 *
 *   npx tsx scripts/contracting-dedupe-check.ts
 *
 * The two contracting trees grew the same features twice, and most of the
 * duplication was already collapsed into redirect stubs before this script
 * existed. What it pins down is the remainder that was still real:
 *
 *   - the comp-grid editor lived inside a route file and was imported across
 *     trees from `@/routes/...` — it is a component and lives with components;
 *   - two redirects hopped through /contracting-ops/compensation, itself a
 *     redirect, to reach the grids tab;
 *   - the agent-facing carrier directory carried its own "+ Add Carrier"
 *     dialog — a second write path beside Carrier Setup's, with fewer checks
 *     and no submission methods;
 *   - dashboard tiles and checklist CTAs linked to redirect stubs, which
 *     works but means every click pays a hop, and a stub can go stale
 *     invisibly (one had: its target was itself a redirect).
 *
 * All string assertions — proof of connection, not behaviour. The stubs
 * themselves are exempt: redirect files SHOULD name the old paths.
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

// ── The editor is a component, mounted where it is used ─────────────────────

const MANAGE = read("src/components/contracting/manage-grids.tsx");
check("the grid editor lives with the components", /export function ManageGridsPage/.test(MANAGE), true);
check("…and declares no route of its own", /createFileRoute|beforeLoad/.test(MANAGE), false);

// The grid reader used to be checked here too, because it carried a "Manage
// grids" toggle into the editor. It no longer mounts the editor at all: the
// standalone reader page became a redirect into the Contracts tab, leaving
// Settings ▸ Comp Grids as the editor's only door. One mount, not two.
check("the settings page imports the editor from components",
  read("src/routes/_authenticated/settings.comp-grids.tsx")
    .includes('from "@/components/contracting/manage-grids"'), true);
check("the grid reader no longer mounts a second copy of it",
  read("src/components/contracting/comp-grids-content.tsx")
    .includes("ManageGridsPage"), false);
check("nothing imports the editor from the old route file",
  /from "@\/routes\/_authenticated\/contracting\.comp-grids-manage"/.test(
    read("src/routes/_authenticated/settings.comp-grids.tsx")), false);

// ── Redirects land in one hop ───────────────────────────────────────────────

console.log("");

// Phase 2 moved the grids editor's home from Carrier Setup to Settings ▸
// Comp Grids; the requirement is unchanged — one hop, no stub-to-stub chains.
const STUB_MANAGE = read("src/routes/_authenticated/contracting.comp-grids-manage.tsx");
const STUB_GRIDS = read("src/routes/_authenticated/contracting-ops/comp-grids.tsx");
check("/contracting/comp-grids-manage goes straight to the editor's home",
  /to: "\/settings\/comp-grids"/.test(STUB_MANAGE), true);
check("/contracting-ops/comp-grids goes straight to the editor's home",
  /to: "\/settings\/comp-grids"/.test(STUB_GRIDS), true);
check("neither hops through another stub",
  /contracting-ops\/(compensation|carriers)/.test(strip(STUB_MANAGE) + strip(STUB_GRIDS)), false);

// ── One write path for carriers ─────────────────────────────────────────────

console.log("");

const DIRECTORY = read("src/routes/_authenticated/contracting/carriers.tsx");
check("the reference directory has no add-carrier dialog", /AddCarrierButton|addCarrier\b/.test(strip(DIRECTORY)), false);
check("…and no leftover dialog imports", /ui\/dialog/.test(DIRECTORY), false);
check("Carrier Setup still has the one add button", /data-tour="carrier-add"/.test(read("src/components/contracting/carrier-setup.tsx")), true);
check("the owner checklist sends owners to Carrier Setup",
  /ctaRoute: "\/settings\/carriers"/.test(read("src/lib/onboarding-checklist.ts")), true);
check("the grid editor keeps its inline add-a-carrier row",
  /addCarrier/.test(MANAGE) && /NEW_CARRIER/.test(MANAGE), true);

// ── In-app links point at real pages, not stubs ─────────────────────────────

console.log("");

// Every route in this list is a beforeLoad-redirect stub. Links elsewhere in
// the app should name the destination, not the stub — a click through a stub
// costs a hop, and a stub whose target moves rots silently.
const STUB_PATHS = [
  "/contracting-ops/compensation",
  "/contracting-ops/comp-grids",
  "/contracting-ops/writing-numbers",
  "/contracting-ops/ready-to-sell",
  "/contracting-ops/hierarchy-changes",
  "/contracting-ops/hierarchies",
  "/contracting-ops/hierarchy",
  "/contracting-ops/inbox",
  "/contracting-ops/pipeline",
  "/contracting-ops/agents",
  "/contracting-ops/onboarding",
  "/contracting-ops/commission-levels",
  "/contracting/comp-grids-manage",
];

const LINK_SITES = [
  "src/routes/_authenticated/contracting-ops/index.tsx",
  "src/routes/_authenticated/agency/index.tsx",
  "src/components/staff-dashboard.tsx",
  "src/lib/work.functions.ts",
  "src/lib/agent-onboarding.functions.ts",
  "src/lib/onboarding-checklist.ts",
  "src/lib/navigation.ts",
];

for (const site of LINK_SITES) {
  const body = strip(read(site));
  const hits = STUB_PATHS.filter((p) => body.includes(`"${p}"`));
  check(`${site} links to no redirect stubs`, hits, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
