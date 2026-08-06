/**
 * Does the compliance screen catch what gets agencies fined, and stay quiet
 * on ordinary sentences?
 *
 *   npm run check:compliance
 *
 * Both halves matter and the second is the harder one. A screen that flags
 * every message gets switched off within a week, and a switched-off screen is
 * worth less than no screen at all — because the agency believes it has one.
 *
 * Every "must not flag" case below is a sentence a real agent would really
 * send.
 */

import {
  screenMessage, summariseScreen, rulesetVersion, RULES,
} from "../src/lib/compliance-screen";

let pass = 0;
const failures: string[] = [];
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  }
}
const fired = (text: string, ruleId: string) =>
  screenMessage(text).findings.some((f) => f.ruleId === ruleId);

console.log("\n1. Blocking claims — wrong on the facts, not merely unwise");

check("a guaranteed return",
  fired("This policy gives you a guaranteed 8% return every year.", "guaranteed_return"), true);
check("guaranteed growth",
  fired("Your cash value has guaranteed growth.", "guaranteed_return"), true);
check("you can't lose money",
  fired("With an IUL you can't lose money in a down market.", "cannot_lose"), true);
check("never lose principal",
  fired("You will never lose your principal.", "cannot_lose"), true);

// A life policy is not a security. This is the one that can turn a sales
// conversation into an unregistered securities offering.
check("calling it an investment",
  fired("This is a great investment for your retirement.", "investment"), true);
check("or investing",
  fired("You'd be investing about $200 a month.", "investment"), true);

check("free insurance",
  fired("Ask me how to get free coverage for your kids.", "free_insurance"), true);
check("guaranteed approval",
  fired("Guaranteed approval, no questions asked.", "guaranteed_approval"), true);
check("everyone qualifies",
  fired("Everyone qualifies regardless of health.", "guaranteed_approval"), true);
check("government backed",
  fired("It's a federally backed program for seniors.", "government_backing"), true);
check("FDIC",
  fired("Your money is FDIC insured.", "government_backing"), true);

check("a blocking finding fails the screen",
  screenMessage("This is a great investment.").passed, false);

console.log("\n2. Warnings — read it, then decide");

check("tax-free", fired("You get tax-free income in retirement.", "tax_free"), true);
check("an illustration stated as fact",
  fired("At 65 you'll have $340,000 in the policy.", "illustration_as_fact"), true);
check("manufactured urgency",
  fired("Rates go up tomorrow, so we should lock this in.", "urgency_pressure"), true);
check("act now", fired("Act now before this window closes.", "urgency_pressure"), true);
check("a fear appeal",
  fired("Without this your family will be destitute.", "fear_appeal"), true);
check("disparaging term",
  fired("Term insurance is throwing your money away.", "disparagement"), true);
check("an unsubstantiated superlative",
  fired("They're the best carrier in the country.", "unqualified_rating"), true);

// A warning is a note, not a gate. An agent who reads it and sends anyway has
// made a decision, and the log records that they made it.
check("a warning does not block the send",
  screenMessage("You get tax-free income in retirement.").passed, true);
check("but it is still flagged",
  screenMessage("You get tax-free income in retirement.").flagged, true);

console.log("\n3. Ordinary messages must pass untouched");

const ordinary = [
  "Hi Willie — happy birthday! Hope you have a great one.",
  "Just checking in to make sure your beneficiary details are still current.",
  "I noticed your draft didn't go through this month. Want me to call the carrier?",
  "Your policy anniversary is coming up — worth a quick review?",
  "Following up on our chat Tuesday. Let me know what works for a call.",
  "Your coverage is $250,000 with a monthly premium of $62.40.",
  "The carrier approved your application today. Congratulations!",
  "Free parking is available at our office if you'd like to come in.",
  "I'm free Thursday afternoon if that suits you.",
  "This is a whole life policy with a guaranteed death benefit.",
];
for (const msg of ordinary) {
  check(`clean: "${msg.slice(0, 44)}…"`, screenMessage(msg).flagged, false);
}

console.log("\n4. Word boundaries — the reason a screen survives a week");

// An unbounded /free/ matches "freedom" and "carefree", an unbounded /invest/
// matches "investigation". A screen that cries wolf gets switched off.
check("freedom is not free insurance", screenMessage("Financial freedom is the goal.").flagged, false);
check("carefree is not free", screenMessage("A carefree retirement.").flagged, false);
check("investigation is not investing",
  screenMessage("The carrier opened an investigation into the claim.").flagged, false);
// "guaranteed death benefit" is a real and correct thing to say about whole life.
check("a guaranteed death benefit is accurate and allowed",
  screenMessage("The death benefit is guaranteed for life.").flagged, false);

console.log("\n5. Shape of the result");

const messy = screenMessage(
  "This investment has a guaranteed 8% return and you can't lose money — act now!",
);
check("several rules can fire at once", messy.findings.length >= 3, true);
check("and it does not pass", messy.passed, false);
check("every finding says what to do instead",
  messy.findings.every((f) => f.instead.length > 20), true);
check("every finding quotes the text that triggered it",
  messy.findings.every((f) => f.matched.length > 0), true);
check("and where it was",
  messy.findings.every((f) => f.index >= 0), true);

// One finding per rule, not one per occurrence — a message saying "investment"
// four times is one problem.
const repeated = screenMessage("An investment. A good investment. Really, an investment.");
check("a repeated phrase is one finding",
  repeated.findings.filter((f) => f.ruleId === "investment").length, 1);

check("empty text passes", screenMessage("").passed, true);
check("null passes", screenMessage(null).passed, true);
check("null is not flagged", screenMessage(null).flagged, false);

console.log("\n6. Reproducibility — the property that makes it a control");

const twice = [screenMessage("This is an investment."), screenMessage("This is an investment.")];
check("the same text screens the same way twice",
  JSON.stringify(twice[0]), JSON.stringify(twice[1]));
check("the ruleset has a version", /^v1:\d+:\d+$/.test(rulesetVersion()), true);
check("every rule has a distinct id", new Set(RULES.map((r) => r.id)).size, RULES.length);
check("every rule explains itself", RULES.every((r) => r.reason.length > 40), true);

console.log("\n7. The summary line");

check("nothing found", summariseScreen(screenMessage("Happy birthday!")), "No compliance issues found.");
check("a block is counted",
  /1 blocking issue/.test(summariseScreen(screenMessage("This is an investment."))), true);
check("warnings are counted separately",
  /to review/.test(summariseScreen(screenMessage("You get tax-free income."))), true);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
