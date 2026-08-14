/**
 * Positions: a ladder the roster can actually show, and a chain that reaches
 * the agent.
 *
 *   npx tsx scripts/team-positions-check.ts
 *
 * The bug this exists to keep fixed: the invite screen has required a position
 * for every agent and manager invite since it shipped, and
 * `createOnboardingInvite`'s zod schema did not name the field — so zod
 * stripped it, the insert never carried it, `invitation_links.agency_level_id`
 * stayed null, and both accept paths copied that null onto the new profile.
 * The owner was forced to answer a question whose answer was thrown away, and
 * no agent in the product has ever held a position. A POSITION column built on
 * top of that would have rendered an em dash for the entire roster forever.
 *
 * The pure half covers how a position reads and which ones still need placing.
 * The wiring half walks the chain end to end, because every break in it was a
 * missing connection rather than a wrong computation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  positionTone, positionLabel, sortPositions, catalogExists, needsPosition,
  POSITION_TONE_CLASS, type Position,
} from "../src/lib/team/positions";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── How a position reads ────────────────────────────────────────────────────

// The ladder from the spec: Owner 100 · MGA 90 · GA 85 · GA 80 · SA 75 · SA 70
// · BA 65 · Brokerage 60 · Training 50.
check("the principal tier is its own colour", positionTone(100), "principal");
check("MGA and GA 85 read as senior", [positionTone(90), positionTone(85)], ["senior", "senior"]);
check("the writing tiers are mid", [positionTone(80), positionTone(75)], ["mid", "mid"]);
check("BA and SA 70 are junior", [positionTone(70), positionTone(65)], ["junior", "junior"]);
check("brokerage and training are entry", [positionTone(60), positionTone(50)], ["entry", "entry"]);
check("every tone has a class", Object.keys(POSITION_TONE_CLASS).length, 5);

check("a pill says the name and the number", positionLabel("GA", 80), "GA 80");
check("whole numbers lose the decimal", positionLabel("Owner", 100), "Owner 100");
// 77.5 is a real comp level; rounding it to 78 in a pill misstates a contract.
check("a fractional level keeps its precision", positionLabel("SA", 77.5), "SA 77.5");
check("a nameless position still shows its number", positionLabel("  ", 65), "65");

check("the ladder sorts highest first",
  sortPositions([
    { name: "SA", pct: 70 }, { name: "Owner", pct: 100 }, { name: "GA", pct: 80 },
  ]).map((p) => p.name),
  ["Owner", "GA", "SA"]);
check("…and ties break by name, stably",
  sortPositions([{ name: "GA West", pct: 80 }, { name: "GA East", pct: 80 }]).map((p) => p.name),
  ["GA East", "GA West"]);

// ── Who still needs placing ─────────────────────────────────────────────────

console.log("");

const CATALOG: Position[] = [
  { id: "l1", name: "GA", pct: 80 },
  { id: "l2", name: "SA", pct: 70 },
];
const ROSTER = [
  { id: "a", agency_level_id: null, status: "active" },
  { id: "b", agency_level_id: "l1", status: "active" },
  { id: "c", agency_level_id: null, status: "terminated" },
  { id: "d", agency_level_id: null, status: "imported" },
];

check("a catalog with positions exists", catalogExists(CATALOG), true);
check("an empty catalog does not", catalogExists([]), false);
check("only live, unplaced agents are pending",
  needsPosition(ROSTER, CATALOG).map((r) => r.id), ["a"]);
// With nothing to assign, a queue naming every agent is noise, not a task.
check("with no catalog nobody is pending", needsPosition(ROSTER, []), []);

// ── The chain, end to end ───────────────────────────────────────────────────

console.log("");

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ONB = read("src/lib/onboarding.functions.ts");
check("the invite schema names the position",
  /agency_level_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(ONB), true);
check("…and the insert carries it", /agency_level_id: agencyLevelId,/.test(ONB), true);
check("a position from another agency is refused",
  /eq\("organization_id", inviterProfile\?\.organization_id \?\? ""\)/.test(ONB) &&
  /not one of your agency's/.test(ONB), true);
// The upline value moved into a named variable upstream; what this guards is
// unchanged — two separate writes, each refusing to overwrite a value the
// agent already has.
check("the accept path sets upline and position separately",
  /update\(\{ upline_id: inviteUplineId \}\)[\s\S]{0,120}is\("upline_id", null\)/.test(ONB) &&
  /update\(\{ agency_level_id: inv\.agency_level_id \}\)[\s\S]{0,80}is\("agency_level_id", null\)/.test(ONB), true);

const INVITE_UI = read("src/routes/_authenticated/contracting/invite.tsx");
check("the invite screen still sends what it requires",
  /agency_level_id: agencyLevelId \|\| null/.test(INVITE_UI) &&
  /needsAgencyLevel/.test(INVITE_UI), true);

const TEAM_FNS = read("src/lib/team.functions.ts");
check("assignment checks both ends against the caller's org",
  /That agent is not in your agency/.test(TEAM_FNS) &&
  /That position is not one of your agency's/.test(TEAM_FNS), true);
// profiles RLS grants updates on the org-OWNER branch only, narrower than the
// is_org_admin that may edit the catalog — so a refusal is a real outcome and
// must not read as success.
check("…and asserts its row count rather than trusting RLS",
  /\.select\("id"\);[\s\S]{0,200}Only the agency owner can change an agent's position/.test(TEAM_FNS), true);
check("clearing a position is allowed", /agencyLevelId: z\.string\(\)\.uuid\(\)\.nullable\(\)/.test(TEAM_FNS), true);
check("the roster carries the position per agent",
  /position_name: level\?\.name \?\? null/.test(TEAM_FNS) &&
  /position_pct: level \? level\.base_pct : null/.test(TEAM_FNS), true);
check("…resolving only the positions in use",
  /const levelIds = Array\.from\(new Set\(/.test(TEAM_FNS), true);

const TEAM_UI = read("src/routes/_authenticated/team.tsx");
// The header became sortable when the production columns landed; what this
// asserts is that the column still exists and still says Position.
check("the roster renders a Position column", /<SortHead k="position"[\s\S]{0,80}>Position<\/SortHead>/.test(TEAM_UI), true);
check("…wired to the assignment mutation",
  /onAssign=\{\(agencyLevelId\) => assign\.mutate\(\{ agentId: a\.id, agencyLevelId \}\)\}/.test(TEAM_UI), true);
check("the pending-positions quick view exists", /Pending positions/.test(TEAM_UI), true);
check("only role-managers may reassign", /canAssign=\{canManageRoles\}/.test(TEAM_UI), true);
// Eleven now: Agent, Position, Upline, Stage, Compliance, Own, Team,
// At risk, Contracts, Last active, Actions.
check("the empty-state row spans every column",
  /colSpan=\{11\}/.test(strip(TEAM_UI)) && !/colSpan=\{(9|10)\}/.test(strip(TEAM_UI)), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
