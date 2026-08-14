/**
 * A posted deal tells the agent whether it will actually pay.
 *
 *   npx tsx scripts/post-deal-compensation-check.ts
 *
 * Two failures met here, and both were silent.
 *
 * The carrier picker offered every active agency carrier, including ones an
 * owner had not finished setting up — so an agent could write business on a
 * carrier with no resolvable compensation and no advance option, and find out
 * only when the commission never arrived.
 *
 * And the calculation was fire-and-forget: `catch { console.error }`, with the
 * response saying "Deal posted!" regardless. The deal being written and the
 * deal being payable are different facts, and the agent needs both.
 *
 * The deal must still be recorded when compensation cannot resolve — losing a
 * policy because its commission could not be worked out would be the worse
 * bug — so these assert that it is written AND that the outcome is reported.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const FN = read("src/lib/post-deal.functions.ts");
const CODE = strip(FN);

// ── Only carriers an agent may actually sell on ─────────────────────────────

check(
  "the picker filters on the agency's post-deal control",
  /r\.enabled !== false && r\.available_for_post_deal !== false/.test(CODE),
  true,
);
// `!== false` rather than `=== true`: before the migration the columns are
// absent, and every active carrier should keep showing exactly as today.
check(
  "…tolerantly, so the pending window behaves as it does now",
  /available_for_post_deal === true/.test(CODE),
  false,
);
check(
  "the agency row is read with select(*) for the same reason",
  /\.from\("org_carriers"\)\s*\n\s*\.select\("\*, carriers \( id, name, active \)"\)/.test(CODE),
  true,
);

// ── The outcome reaches the agent ───────────────────────────────────────────

console.log("");

check(
  "the deal is still written when compensation cannot resolve",
  // The calculation stays inside its own try/catch: the policy exists by then.
  /try \{[\s\S]{0,600}calculateAndInsertAllCommissions\(supabase/.test(CODE),
  true,
);
check(
  "the outcome is read back rather than inferred from no exception",
  /\.from\("commission_setup_issues"\)/.test(CODE),
  true,
);
check(
  "…and returned to the caller",
  /return \{ policyId: policy\.id, clientId, compensation \}/.test(CODE),
  true,
);
// A thrown calculation must not be reported as success either.
check(
  "a thrown calculation still reports a problem",
  /catch \(e: any\) \{[\s\S]{0,300}compensation = \{\s*ok: false/.test(CODE),
  true,
);

const PAGE = strip(read("src/routes/_authenticated/post-deal.tsx"));
check(
  "the agent is warned rather than congratulated",
  /res\.compensation\.ok === false/.test(PAGE),
  true,
);
check("…and told what is missing", /res\.compensation\.messages/.test(PAGE), true);
// The deal did post. Saying otherwise would send them to re-enter it.
check(
  "…while still being told the deal posted",
  /Deal posted — but the commission could not be worked out/.test(PAGE),
  true,
);
check(
  "a clean post still reads as a plain success",
  /toast\.success\("Deal posted! Client moved to Sold tab\."\)/.test(PAGE),
  true,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
