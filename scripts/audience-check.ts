/**
 * Four places that talked to the wrong person.
 *
 * `npx tsx scripts/audience-check.ts`
 *
 * A browser session as a brand-new agent found the product addressing them as
 * somebody else — a subordinate to be coached, a recruiter with a quota, an
 * agent with a book they do not have, and a form that would not tell them what
 * it wanted. None of these were data bugs. Every one was correct data pointed
 * at the wrong reader.
 *
 * The insight one is worth stating precisely, because it was reported as a
 * permissions failure and is not: `getAIInsights` is correctly caller-scoped —
 * the leaderboard RPC is an `auth.uid()`-rooted recursive downline CTE, so for a
 * solo agent it resolves to exactly one row, themselves. The prompt then said
 * "Reference specific agent names from the data" with no notion of who was
 * reading, so the model wrote a manager's note about the only name present.
 *
 * These are string and prompt assertions rather than behaviour, which is a real
 * limit — they prove the instruction is still there, not that the model obeys
 * it. That is worth having anyway: the failure mode was somebody deleting the
 * audience clause without knowing what it was for.
 *
 * Run alongside `onboarding-actor-check.ts` and `licensing-check.ts`.
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

// ── The insight prompt ──────────────────────────────────────────────────

const ANALYTICS = readFileSync(join(ROOT, "src/lib/analytics.functions.ts"), "utf8");

check("the prompt knows who is reading", /const audience = \[/.test(ANALYTICS), true);
check("it looks up the reader's name", /select\("first_name, last_name"\)\.eq\("id", userId\)/.test(ANALYTICS), true);
check("it counts everyone else in the data", /r\.id !== userId/.test(ANALYTICS), true);
check("a solo reader is addressed in the second person",
  /Address them directly as \\"you\\"/.test(ANALYTICS), true);
check("third-person is ruled out explicitly",
  /never in the third person/.test(ANALYTICS), true);

// The exact phrase from the reported card. An insight telling the reader that a
// coaching session is recommended *for them* is the specific thing that landed
// badly, so it is named rather than left to the general instruction.
check("it never recommends coaching the reader",
  /Never recommend that a coaching session be arranged for the reader/.test(ANALYTICS), true);

// The instruction that caused it must not come back unqualified.
const bareNameInstruction =
  /Reference specific agent names from the data\."/.test(ANALYTICS);
check("the bare 'reference agent names' instruction is gone", bareNameInstruction, false);

// ── The recruiting challenge ────────────────────────────────────────────

console.log("");

const MIG = readFileSync(
  join(ROOT, "supabase/migrations/20260803010000_recruiting-challenge-audience.sql"), "utf8");

check("the recruiting seed is gated on having a downline",
  /IF has_downline\s*\n\s*AND NOT EXISTS/.test(MIG), true);
check("the gate excludes revoked agents",
  /status NOT IN \('inactive', 'terminated'\)/.test(MIG), true);

// The three selling goals are the job from day one and must stay unconditional.
for (const [label, marker] of [
  ["daily calls", "Make 10 outbound calls today"],
  ["weekly deals", "Post 3 new deals this week"],
  ["monthly premium", "\\$5,000 in new premium this month"],
] as const) {
  const seeded = new RegExp(`period = '${label.split(" ")[0]}'[\\s\\S]{0,400}?${marker}`).test(MIG);
  check(`${label} is still seeded for everyone`, seeded, true);
}

// ── Nova ────────────────────────────────────────────────────────────────

console.log("");

const NOVA = readFileSync(join(ROOT, "src/routes/_authenticated/ai-assistant.tsx"), "utf8");

check("there is a starter greeting", /STARTER_GREETING/.test(NOVA), true);
check("there is a starter chip set", /STARTER_CHIPS/.test(NOVA), true);
// This used to read the pending-agent flag under the local name `noBookYet`.
// The flag meant membership status, not book size, so it went false the moment
// an owner ticked somebody active — and it disappeared entirely with the
// activation gate. `hasNoBookYet` is the real thing: no posted policies.
check("the page branches on whether there is a book", /hasNoBookYet/.test(NOVA), true);
check("it reads that through the shared nav context, not its own fetch",
  /useNavContext\(\)/.test(NOVA), true);

// The starter greeting must not claim to see things that are not there — that
// assertion is the whole reason this exists.
const starter = NOVA.slice(NOVA.indexOf("const STARTER_GREETING"), NOVA.indexOf("const STARTER_GREETING") + 500);
check("the starter greeting does not claim to see a book",
  /I can see your pipeline, your book/.test(starter), false);

// ── The quoter ──────────────────────────────────────────────────────────

console.log("");

const QUOTER_RAW = readFileSync(join(ROOT, "src/components/ai/quote-recommender.tsx"), "utf8");
// Comments stripped for the "is it gone" assertions. The component's docblock
// deliberately quotes the old disable expression so the next reader knows what
// was wrong, and matching raw text would fail on a correct file — a check that
// can never pass is worse than no check.
const QUOTER = QUOTER_RAW.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

check("required fields are marked", /<Req \/>/.test(QUOTER), true);
check("a hint says what is still missing", /Add \{missing\.length === 1/.test(QUOTER), true);

// budget_monthly is required by the server schema. It was absent from the
// disable expression, so the button could enable and the request still fail.
check("budget is part of the required set", /!budget && "monthly budget"/.test(QUOTER), true);
check("the disable expression uses that set",
  /disabled=\{mut\.isPending \|\| missing\.length > 0\}/.test(QUOTER), true);
check("the old expression that omitted budget is gone",
  /disabled=\{mut\.isPending \|\| !age \|\| !state \|\| !goal\}/.test(QUOTER), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
