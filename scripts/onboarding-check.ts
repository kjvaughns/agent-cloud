/**
 * Does the onboarding config say anything untrue?
 *
 *   npx esbuild scripts/onboarding-check.ts --bundle --platform=node \
 *     --format=esm --outfile=.onb.mjs && node .onb.mjs
 *
 * Three things rot silently in a checklist-and-tours system, and none of them
 * throws at runtime:
 *
 *   1. **A tour step pointing at nothing.** Someone renames a div, the
 *      `data-tour` attribute goes with it, and the tour quietly drops to two
 *      steps. Nobody notices, because `runTour` filters missing elements on
 *      purpose so a partial tour still works.
 *   2. **A route that does not exist.** A checklist CTA is a promise; sending
 *      somebody to a 404 during their first ten minutes is worse than not
 *      offering the step.
 *   3. **A role with an unusable list** — no steps, or a first step that is
 *      not the pre-completed one, which is the whole Zeigarnik point.
 *
 * This asserts all three against the source, with no database and no browser.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CHECKLIST, checklistFor, type ChecklistRole,
} from "../src/lib/onboarding-checklist";
import { TOURS, MAX_TOUR_STEPS } from "../src/lib/tours";
import { EMPTY_STATES } from "../src/lib/empty-states";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = sourceFiles(SRC);
const allSource = files.map((f) => readFileSync(f, "utf8")).join("\n");

// ── 1. Every tour step anchors to something that exists ─────────────────────

console.log("\n1. Tour anchors");
for (const [tourId, tour] of Object.entries(TOURS)) {
  check(
    `${tourId} is within the ${MAX_TOUR_STEPS}-step cap`,
    tour.steps.length <= MAX_TOUR_STEPS,
    `${tour.steps.length} steps`,
  );
  for (const step of tour.steps) {
    const sel = typeof step.element === "string" ? step.element : null;
    if (!sel) continue;
    const attr = /\[data-tour="([^"]+)"\]/.exec(sel);
    check(
      `${tourId} → ${attr?.[1] ?? sel} is anchored in the app`,
      attr ? allSource.includes(`data-tour="${attr[1]}"`) : false,
      attr ? "no element carries this data-tour attribute" : "not a data-tour selector",
    );
  }
}

// ── 2. Every CTA route is a real route ──────────────────────────────────────

console.log("\n2. Checklist destinations");

// Routes are file-based; routeTree.gen.ts lists every one as a string literal.
const routeTree = readFileSync(join(SRC, "routeTree.gen.ts"), "utf8");
for (const item of CHECKLIST) {
  // Drop the query string — /contracting-ops/requests?tab=numbers is the
  // requests route with a search param, and the tree only carries the path.
  const path = item.ctaRoute.split("?")[0];
  check(
    `${item.id} → ${path}`,
    routeTree.includes(`'${path}'`) || routeTree.includes(`"${path}"`),
    "not present in routeTree.gen.ts",
  );
}

// ── 3. Every role gets a usable list ────────────────────────────────────────

console.log("\n3. Per-role lists");
const ROLES: ChecklistRole[] = ["owner", "manager", "staff", "agent"];
for (const role of ROLES) {
  const list = checklistFor(role);
  check(`${role} has steps`, list.length >= 3, `${list.length} steps`);
  check(
    `${role}'s list opens with the pre-completed item`,
    list[0]?.id === "account_created",
    `starts with ${list[0]?.id}`,
  );

  // The rule the roadmap cares most about: somebody who joined an existing
  // agency must never be told to stand one up.
  const joined = checklistFor(role, { joinedExistingOrg: true });
  check(
    `${role} joining an existing agency sees no setup steps`,
    joined.every((i) => !i.agencySetup),
    joined.filter((i) => i.agencySetup).map((i) => i.id).join(", "),
  );
}

// ── 4. Ids are unique ───────────────────────────────────────────────────────

console.log("\n4. Config hygiene");
const ids = CHECKLIST.map((i) => i.id);
check("step ids are unique", new Set(ids).size === ids.length);
check(
  "every step names a CTA label",
  CHECKLIST.every((i) => i.ctaLabel.trim().length > 0),
);
check(
  "every tourId used by a step exists in TOURS",
  CHECKLIST.every((i) => !i.tourId || i.tourId in TOURS),
  CHECKLIST.filter((i) => i.tourId && !(i.tourId in TOURS)).map((i) => i.tourId).join(", "),
);

// ── 5. Empty-state copy follows its own rules ───────────────────────────────
//
// These are the rules the file states in prose. Prose does not enforce itself,
// and empty-state copy is exactly the kind of thing that gets edited in a hurry
// by whoever is fixing the page around it.

console.log("\n5. Empty-state copy");

// Words that turn an invitation into an apology. "yet" is on the list because
// "No policies yet" is the shape this rule exists to prevent — it states the
// absence and then softens it, rather than saying what the page is for.
const APOLOGETIC = /\b(oops|sorry|unfortunately|nothing to see|no results found)\b/i;
const sentences = (s: string) => s.split(/[.!?]+/).filter((x) => x.trim().length > 0).length;

for (const [key, copy] of Object.entries(EMPTY_STATES)) {
  check(
    `${key}: title states an outcome, not an absence`,
    !/^(no |nothing |none )/i.test(copy.title),
    `"${copy.title}"`,
  );
  check(`${key}: body is two sentences or fewer`, sentences(copy.body) <= 2, `${sentences(copy.body)} sentences`);
  check(`${key}: no apologetic language`, !APOLOGETIC.test(copy.title + " " + copy.body));
  check(
    `${key}: CTA starts with a verb`,
    /^(add|create|import|post|start|open|invite|set|upload|request|bring|pick|send)\b/i.test(copy.ctaLabel),
    `"${copy.ctaLabel}"`,
  );
  check(`${key}: has a ghost row`, copy.ghost.length > 0);
  check(
    `${key}: ghost rows all have the same number of cells`,
    new Set(copy.ghost.map((r) => r.length)).size === 1,
  );
  check(
    `${key}: cleared copy differs from first-use copy`,
    copy.clearedTitle !== copy.title && copy.clearedBody !== copy.body,
  );
}

console.log(
  `\n${passed} passed, ${failures.length} failed${failures.length ? ":" : "."}\n` +
    failures.map((f) => `  ${f}`).join("\n"),
);
process.exit(failures.length ? 1 : 0);
