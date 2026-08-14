/**
 * The Agency area is three rows and one Team page.
 *
 *   npx tsx scripts/agency-area-check.ts
 *
 * It used to be five rows, three of which opened the same URL, in front of a
 * five-tab page called "Team Command Center". The tabs were the tell: Overview
 * and Roster were the same people twice, and "Getting agents ready" was a
 * roster with a progress bar sitting one tab away from the roster.
 *
 * Now: a header, the two lists an owner actually needs on arrival, and the
 * roster under a Table/Org toggle. The pure half below exercises those two
 * lists for real — they are the only new decisions on the page, and the thing
 * most likely to be quietly wrong is double-counting somebody into both.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PAGES, hubGroupsFor, type NavContext } from "../src/lib/navigation";
import { gettingReady, goingQuiet, byQuietest, byLeastReady, QUIET_AFTER_DAYS } from "../src/lib/team/needs-you";

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

// ── The two lists ───────────────────────────────────────────────────────────

const row = (o: Partial<Parameters<typeof gettingReady>[0][number]> & { id: string }) => ({
  status: "active", stage: "active", days_since_sale: null, ...o,
}) as any;

const ROWS = [
  row({ id: "onboarding", stage: "onboarding", days_since_sale: null }),
  row({ id: "licensed", stage: "licensed", days_since_sale: null }),
  row({ id: "contracted", stage: "contracted", days_since_sale: null }),
  row({ id: "selling", stage: "active", days_since_sale: 3 }),
  row({ id: "quiet", stage: "active", days_since_sale: 45 }),
  row({ id: "just-over", stage: "active", days_since_sale: QUIET_AFTER_DAYS }),
  row({ id: "just-under", stage: "active", days_since_sale: QUIET_AFTER_DAYS - 1 }),
  row({ id: "never-sold", stage: "contracted", days_since_sale: null }),
  row({ id: "gone", stage: "terminated", status: "terminated", days_since_sale: 200 }),
  row({ id: "imported", stage: "onboarding", status: "imported", days_since_sale: null }),
  row({ id: "at-risk", stage: "at_risk", days_since_sale: 90 }),
];

check("getting ready is everybody who cannot sell yet",
  gettingReady(ROWS).map((r) => r.id), ["onboarding", "licensed", "contracted", "never-sold"]);
// A terminated agent is a settled state, not somebody waiting on you.
check("…and never a terminated or imported row",
  gettingReady(ROWS).some((r) => r.id === "gone" || r.id === "imported"), false);

check("going quiet is people who sold and stopped",
  goingQuiet(ROWS).map((r) => r.id), ["quiet", "just-over", "at-risk"]);
check("…the threshold is inclusive at the boundary",
  goingQuiet(ROWS).some((r) => r.id === "just-over"), true);
check("…and one day under does not count",
  goingQuiet(ROWS).some((r) => r.id === "just-under"), false);
// The bug that would make both lists useless: somebody who has never sold is
// not "slipping", and counting them twice makes neither list trustworthy.
check("somebody who never sold is not going quiet",
  goingQuiet(ROWS).some((r) => r.id === "never-sold"), false);
check("the two lists never overlap",
  gettingReady(ROWS).map((r) => r.id).filter((id) => goingQuiet(ROWS).some((q) => q.id === id)), []);
check("a terminated agent is in neither",
  [...gettingReady(ROWS), ...goingQuiet(ROWS)].some((r) => r.id === "gone"), false);

check("quietest first", byQuietest(goingQuiet(ROWS)).map((r) => r.id), ["at-risk", "quiet", "just-over"]);
check("least ready first",
  byLeastReady([row({ id: "a", completion_pct: 80 }), row({ id: "b", completion_pct: 20 })] as any)
    .map((r: any) => r.id), ["b", "a"]);

// ── The nav ─────────────────────────────────────────────────────────────────

console.log("");

const agencyPages = PAGES.filter((p) => p.area === "Agency" && p.parent === "agency");
check("the Agency group is Team, Announcements, Sub-Agencies and Leaderboard",
  agencyPages.map((p) => p.id).sort(),
  ["announcements", "leaderboard", "sub-agencies-nav", "team"]);
// Three rows opening the same URL is exactly what this replaced.
check("no two Agency rows share a path",
  agencyPages.length, new Set(agencyPages.map((p) => p.path)).size);
for (const gone of ["my-agents", "agency-overview", "onboarding", "recruiting"]) {
  check(`the ${gone} row is gone`, PAGES.some((p) => p.id === gone), false);
}

const OWNER: NavContext = {
  audience: "core", inAgency: true, canSeeAgency: true, downlineCount: 0,
  canWorkTickets: false, canEditResources: false, hasSubAgencies: false,
  hasNoBookYet: false, perms: {},
};
const MANAGER: NavContext = { ...OWNER, canSeeAgency: false, downlineCount: 4 };
const PLAIN: NavContext = { ...OWNER, canSeeAgency: false, downlineCount: 0 };

// navFor returns the top-level hub rows; what sits *inside* the Agency hub
// comes from hubGroupsFor, which is what the sidebar actually expands.
const rows = (ctx: NavContext) =>
  hubGroupsFor("agency", ctx).flatMap((g) => g.items).map((i) => i.id);

// Both halves of the gate matter: an owner before their first hire, and a
// manager with people but no admin rights.
check("an owner with no downline still reaches Team", rows(OWNER).includes("team"), true);
check("a manager with a downline reaches Team", rows(MANAGER).includes("team"), true);
check("a plain agent does not", rows(PLAIN).includes("team"), false);

// ── The page ────────────────────────────────────────────────────────────────

console.log("");

const TEAM = read("src/routes/_authenticated/team.tsx");
check("the tab shell is gone", /<Tabs|TabsTrigger|TabsContent/.test(TEAM), false);
check("the page is called Team", /title="Team"/.test(TEAM), true);
check("…everywhere, including the tab title", /Command Center/.test(TEAM), false);
check("the two lists render from the pure module",
  /gettingReady\(rows\)/.test(TEAM) && /goingQuiet\(rows\)/.test(TEAM), true);
check("an all-clear reads as good news, not an empty table",
  /Everyone's active and producing/.test(TEAM), true);
check("the roster has a Table⇄Org toggle", /view === "table" \?/.test(TEAM), true);
check("…remembered per person", /localStorage\.setItem\("team\.view"/.test(TEAM), true);

// Row actions.
check("rows carry one action menu", /<RowActions agent=/.test(TEAM), true);
check("status goes through the existing server fn", /setAgentStatus/.test(TEAM), true);
check("taking access away asks first",
  /confirming !== null/.test(TEAM) && /Terminate \$\{name\}\?/.test(TEAM), true);
// Reparenting keeps its approval trail; a menu item writing upline_id would
// route around the hierarchy-change flow entirely.
check("moving an agent is not one of the row actions",
  /Move agent/.test(strip(TEAM)), false);

// Dead code from the tab era.
for (const gone of ["function DepthChart", "function ActivationQueue", "function NewAgents", "function RecentlyActive"]) {
  check(`${gone.replace("function ", "")} went with the Overview tab`, TEAM.includes(gone), false);
}
check("the ?tab= param has nothing left to select", /tab\?: string/.test(TEAM), false);

// ── What moved rather than died ─────────────────────────────────────────────

console.log("");

check("/agency is a redirect, not a page",
  /throw redirect\(\{ to: "\/team" \}\)/.test(read("src/routes/_authenticated/agency/index.tsx")), true);
check("nothing still links at the onboarding tab",
  /tab: "onboarding"/.test(read("src/routes/_authenticated/onboarding.tsx")), false);
// Roles & Permissions lives in Settings now; the page it moved to must exist.
check("Roles & Permissions still has a home", existsSync(join(ROOT, "src/routes/_authenticated/settings.roles.tsx")), true);
check("the org list survived as the second lens", /function OrgList/.test(TEAM), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
