/**
 * Draft dates, and the Social Security deposit they have to clear.
 *
 *   npx tsx scripts/draft-date-check.ts
 *
 * Final-expense clients commonly pay out of their Social Security deposit.
 * Draft a day early and the account is empty, the payment bounces, and a
 * perfectly good policy lapses over timing — so the rule the SSA pays by is
 * worth getting exactly right rather than approximately right.
 *
 * The pure half is the whole of the risk here: a date calculation that is
 * quietly off by a week is invisible in review and expensive in the field.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, draftSummary, nthWednesday, ordinalDay,
  ssPayWeekFromDob, ssWeekLabel, suggestedDraftDay,
} from "../src/lib/deals/social-security";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The SSA's rule, at its boundaries ───────────────────────────────────────

check("born on the 1st is the 2nd Wednesday", ssPayWeekFromDob("1948-06-01"), 2);
check("born on the 10th is still the 2nd", ssPayWeekFromDob("1948-06-10"), 2);
check("the 11th crosses to the 3rd", ssPayWeekFromDob("1948-06-11"), 3);
check("the 20th is still the 3rd", ssPayWeekFromDob("1948-06-20"), 3);
check("the 21st crosses to the 4th", ssPayWeekFromDob("1948-06-21"), 4);
check("the 31st is the 4th", ssPayWeekFromDob("1948-12-31"), 4);

// A birthday is read off the string, not through Date, so a client born on the
// 1st is not shifted into the previous month — and the wrong week — for
// anybody west of UTC.
check("a date is not shifted by the reader's timezone", ssPayWeekFromDob("1954-03-01"), 2);
check("no date of birth means no suggestion", ssPayWeekFromDob(null), null);
check("an unparseable date means no suggestion", ssPayWeekFromDob("last tuesday"), null);
check("the weeks read like a person says them",
  [ssWeekLabel(2), ssWeekLabel(3), ssWeekLabel(4)],
  ["2nd Wednesday", "3rd Wednesday", "4th Wednesday"]);

// ── Which day that actually is ──────────────────────────────────────────────

console.log("");

// August 2026 opens on a Saturday, so its Wednesdays are the 5th, 12th, 19th
// and 26th.
check("the Nth Wednesday of a known month",
  [nthWednesday(2026, 7, 2), nthWednesday(2026, 7, 3), nthWednesday(2026, 7, 4)],
  [12, 19, 26]);
// February 2026 opens on a Sunday: Wednesdays are 4, 11, 18, 25.
check("…and of a short month",
  [nthWednesday(2026, 1, 2), nthWednesday(2026, 1, 4)], [11, 25]);
// A month opening ON a Wednesday is the edge that off-by-one errors love.
check("…and of a month that begins on a Wednesday",
  [nthWednesday(2026, 3, 2), nthWednesday(2026, 3, 4)], [8, 22]);

{
  // The load-bearing property: every answer this can ever give already fits
  // the 1–28 cap the draft day is limited to, so a suggestion never needs
  // clamping and never proposes a day some months do not have.
  let lo = 99;
  let hi = 0;
  for (let year = 2026; year <= 2031; year++) {
    for (let m = 0; m < 12; m++) {
      for (const w of [2, 3, 4] as const) {
        const d = nthWednesday(year, m, w);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
    }
  }
  check("six years of answers all fit the 1–28 draft cap", [lo >= 1, hi <= 28], [true, true]);
  check("…and the true range is the 8th to the 28th", [lo, hi], [8, 28]);
}

check("a suggestion is the deposit day for the posting month",
  suggestedDraftDay("1948-06-15", new Date(Date.UTC(2026, 7, 3))), 19);
check("no DOB, no suggested day", suggestedDraftDay(null, new Date(Date.UTC(2026, 7, 3))), null);

// ── How it reads back ───────────────────────────────────────────────────────

console.log("");

check("ordinals are English",
  [ordinalDay(1), ordinalDay(2), ordinalDay(3), ordinalDay(4), ordinalDay(11), ordinalDay(21), ordinalDay(28)],
  ["1st", "2nd", "3rd", "4th", "11th", "21st", "28th"]);
// These strings go straight into a CHECK-constrained column, so the list is
// the database's vocabulary, not a convenient one.
check("the methods are the ones the column accepts",
  [...PAYMENT_METHODS],
  ["bank_draft", "credit_card", "money_order", "direct_express", "social_security"]);
check("…each with a plain-language label",
  PAYMENT_METHODS.map((m) => PAYMENT_METHOD_LABELS[m]),
  ["Bank draft", "Credit card", "Money order", "Direct Express", "Social Security"]);
check("a full row reads as a sentence",
  draftSummary("social_security", 3), "3rd of the month · Social Security");
check("a method with no day still says something", draftSummary("bank_draft", null), "Bank draft");
check("the drawer's existing vocabulary reads back", draftSummary("credit_card", 9), "9th of the month · Credit card");
check("a day with no method still says something", draftSummary(null, 15), "15th of the month");
// A policy with no billing on file must not read as one that drafts on the 1st.
check("nothing on file is nothing, never a default", draftSummary(null, null), null);
check("an unknown method is shown, not swallowed", draftSummary("cash", null), "cash");

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SS = read("src/lib/deals/social-security.ts");
check("the pre-1997 exception is documented as uncomputable",
  /before May 1997/.test(SS) && /cannot tell you|not a fact this product holds/.test(SS), true);

// The constraint that would have rejected the headline case. Every value the
// TS list offers has to be one the column accepts.
const MIG = read("supabase/migrations/20260814180000_social-security-payment-method.sql");
check("social_security is added to the payment-method CHECK",
  /'bank_draft', 'credit_card', 'money_order', 'direct_express', 'social_security'/.test(MIG), true);
check("…without removing a value that was already legal",
  ["bank_draft", "credit_card", "money_order", "direct_express"].every((v) => MIG.includes(`'${v}'`)), true);
for (const m of PAYMENT_METHODS) {
  check(`the CHECK accepts ${m}`, MIG.includes(`'${m}'`), true);
}

const FNS = read("src/lib/post-deal.functions.ts");
check("the deal schema takes an optional billing block",
  /billing: z\.object\(\{/.test(FNS) && /payment_method: z\.enum\(PAYMENT_METHODS\)\.optional\(\)/.test(FNS), true);
check("the draft day is capped at 28 on the way in",
  /draft_date: z\.number\(\)\.int\(\)\.min\(1\)\.max\(28\)\.optional\(\)/.test(FNS), true);
// A row of nulls is indistinguishable from "we asked and they said none".
check("nothing is written when both are blank",
  /if \(data\.billing\?\.payment_method \|\| data\.billing\?\.draft_date\)/.test(FNS), true);
check("the upsert is keyed on the client", /onConflict: "client_id"/.test(FNS), true);
// Partial upsert: naming only the collected columns means the pipeline
// drawer's bank details survive a re-post.
check("only the collected fields are named",
  /\.\.\.\(data\.billing\.payment_method \? \{ payment_method/.test(FNS), true);
check("a billing failure cannot lose the policy",
  /\[post-deal\] client_banking/.test(FNS), true);
check("no account or routing number is collected",
  /routing_number|account_number/.test(FNS), false);
check("the prefill reads billing back", /\.select\("payment_method, draft_date"\)/.test(FNS), true);
// The form annualises by twelve, so the mode is a fact rather than a guess.
check("a manually posted deal now records its premium mode",
  /premium_mode: "monthly"/.test(FNS), true);

const FORM = read("src/routes/_authenticated/post-deal.tsx");
check("the form offers the methods and a 1–28 day",
  /PAYMENT_METHODS\.map/.test(FORM) && /Array\.from\(\{ length: 28 \}/.test(FORM), true);
check("the Social Security hint is a suggestion with an opt-in",
  /ssHint/.test(FORM) && /Use the \{ordinalDay\(ssHint\.day\)\}/.test(FORM), true);
check("billing rides along on submit", /billing: \{/.test(FORM), true);
check("…and prefills on a re-post", /setValue\("payment_method", prefill\.billing\.payment_method\)/.test(FORM), true);

for (const [name, file] of [
  ["the policy sheet", "src/components/book-of-business/policy-detail-sheet.tsx"],
  ["the client drawer", "src/components/pipeline/client-detail-drawer.tsx"],
  ["the sold card", "src/components/pipeline/sold-tab.tsx"],
] as const) {
  check(`${name} shows the draft line`, /draftSummary\(/.test(read(file)), true);
}
check("the sold list carries banking without a query per card",
  /\.in\("client_id", soldIds\)/.test(read("src/lib/pipeline.functions.ts")), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
