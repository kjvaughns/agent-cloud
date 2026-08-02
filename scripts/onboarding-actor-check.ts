/**
 * Who the Getting Ready buttons are for.
 *
 * `npx tsx scripts/onboarding-actor-check.ts`
 *
 * `/account/producer-profile` filters everything on `context.userId`, and its
 * `validateSearch` whitelists only `tab` — so an agent id in the URL is
 * stripped. Six CTAs in the onboarding step list pointed there with no params
 * at all, and the component that renders them is reused on both the agent's own
 * dashboard and the agency owner's Getting Ready tab.
 *
 * On the agent's own dashboard that is correct. On the owner's tab, clicking
 * "Open the profile" next to Marcus opened the *owner's* profile. That is why
 * it survived: half the callers were right.
 *
 * Every step now declares an `actor` and the UI branches on it. These checks
 * exist because losing either half puts the bug straight back — a step with no
 * actor falls through to the self-scoped page, and a UI that stops branching
 * sends everybody there regardless.
 *
 * Run alongside `nav-snapshot.ts` and `revocation-check.ts`.
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

const STEPS = readFileSync(join(ROOT, "src/lib/agent-onboarding.functions.ts"), "utf8");
const UI = readFileSync(join(ROOT, "src/components/onboarding/get-ready.tsx"), "utf8");

// Every step literal carries an actor.
const keys = [...STEPS.matchAll(/^\s+key: "([a-z_]+)",$/gm)].map((m) => m[1]);
const actors = [...STEPS.matchAll(/^\s+actor: "(agent|owner)",$/gm)].map((m) => m[1]);

check("onboarding steps were found at all", keys.length > 0, true);
check("every step declares who may act", actors.length, keys.length);

// The specific ones an owner must never do on somebody's behalf. An owner
// filing a background disclosure under another name is a forged record, not a
// convenience.
const AGENT_ONLY = ["identity", "background", "banking"];
for (const key of AGENT_ONLY) {
  const i = keys.indexOf(key);
  check(`${key} is agent-only`, i >= 0 ? actors[i] : "missing", "agent");
}

// The ones the agency legitimately holds and files.
const OWNER_OK = ["documents", "aml", "identification"];
for (const key of OWNER_OK) {
  const i = keys.indexOf(key);
  check(`${key} is owner-actionable`, i >= 0 ? actors[i] : "missing", "owner");
}

// The UI branch itself.
check("get-ready distinguishes self from somebody else", /viewingSelf/.test(UI), true);
check("get-ready branches on the actor", /step\.actor === "owner"/.test(UI), true);
check("agent-only steps offer a reminder, not a destination", /Remind agent/.test(UI), true);
check("owner steps route with the agent id",
  /to="\/agency\/agents\/\$agentId"[\s\S]{0,120}params=\{\{ agentId \}\}/.test(UI), true);

// No bare self-scoped link left in the component.
const bareSelfLink = /<Link\s+to=\{(?:next|s)\.href\}/.test(UI);
check("no bare link straight to step.href remains", bareSelfLink, false);

// The upload-on-behalf path must not accept the agent-only document types.
const RECORDS = readFileSync(join(ROOT, "src/lib/contracting-records.functions.ts"), "utf8");
const upload = RECORDS.slice(RECORDS.indexOf("export const uploadDocumentForAgent"));
const enumLine = upload.slice(0, 900).match(/doc_type: z\.enum\(\[([^\]]+)\]\)/);
check("uploadDocumentForAgent exists", Boolean(enumLine), true);
if (enumLine) {
  const allowed = enumLine[1];
  for (const forbidden of ["banking", "background", "voided_check", "w9", "direct_deposit"]) {
    check(`upload-on-behalf refuses ${forbidden}`, allowed.includes(forbidden), false);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
