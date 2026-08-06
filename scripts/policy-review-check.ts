/**
 * Does the review prep find real gaps, and refuse to invent ones?
 *
 *   npm run check:policy-review
 *
 * A policy review is a meeting with a client. Every line this produces is a
 * line an agent will read out loud to somebody, so a manufactured finding is
 * not a false positive — it is an agent telling a client they are underinsured
 * when the system simply did not know their income.
 *
 * That is why the needs calculation returns null rather than zero, and why
 * roughly half of these assert that nothing is claimed.
 */

import {
  findGaps, needsEstimate, isTerm, isDisability, termYears,
  summariseGaps, MISSING_INPUTS, UNSTATED_INCOME, type ReviewClient, type ReviewPolicy,
} from "../src/lib/policy-review";

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

const TODAY = "2026-08-06";
const pol = (over: Partial<ReviewPolicy> = {}): ReviewPolicy => ({
  id: "p1", product: "Whole Life", carrierName: "Mutual of Omaha",
  faceAmount: 250_000, monthlyPremium: 62.4, effectiveDate: "2020-01-01",
  status: "active", ...over,
});
const client = (over: Partial<ReviewClient> = {}): ReviewClient => ({
  id: "c1", name: "Willie Jenkins", dateOfBirth: "1975-04-02",
  beneficiaryCount: 1, policies: [pol()], asOf: TODAY, ...over,
});
const has = (c: ReviewClient, id: string) => findGaps(c).some((g) => g.id === id);

console.log("\n1. Reading a free-text product name");

check("Term 20 is term", isTerm("Term 20"), true);
check("20-Year Level Term is term", isTerm("20-Year Level Term"), true);
check("Whole Life is not", isTerm("Whole Life"), false);
check("GUL is not", isTerm("GUL"), false);
// "Term" appears inside "terminal illness rider", which is not a term policy.
check("a terminal illness rider is not a term policy", isTerm("Terminal Illness Rider"), false);

check("the term length is read", termYears("20-Year Level Term"), 20);
// Guessing 20 would put a conversion deadline on the agenda that nobody can
// defend to the client.
check("an unstated term length is null, not a guess", termYears("Level Term"), null);

check("DI is disability", isDisability("DI"), true);
check("Income Protection is disability", isDisability("Income Protection"), true);
check("Whole Life is not disability", isDisability("Whole Life"), false);

console.log("\n2. The conversion deadline — urgent because it expires");

const ending = client({ policies: [pol({ product: "Term 20", effectiveDate: "2008-01-01" })] });
check("a term ending soon is raised", has(ending, "term_conversion"), true);
check("and it is urgent", findGaps(ending).find((g) => g.id === "term_conversion")?.severity, "high");

const fresh = client({ policies: [pol({ product: "Term 30", effectiveDate: "2024-01-01" })] });
check("a term with 27 years left is not", has(fresh, "term_conversion"), false);

// A seasoned term of unknown length is worth asking about, without asserting a
// date the record cannot support.
const unknownLength = client({ policies: [pol({ product: "Level Term", effectiveDate: "2015-01-01" })] });
check("a seasoned term of unknown length is raised gently",
  findGaps(unknownLength).find((g) => g.id === "term_conversion")?.severity, "low");
check("and says the length is not recorded",
  /term length isn't recorded/.test(
    findGaps(unknownLength).find((g) => g.id === "term_conversion")?.detail ?? ""), true);

console.log("\n3. Beneficiaries");

check("no beneficiary is raised", has(client({ beneficiaryCount: 0 }), "no_beneficiary"), true);
check("and it is urgent",
  findGaps(client({ beneficiaryCount: 0 })).find((g) => g.id === "no_beneficiary")?.severity, "high");
check("probate is the reason given",
  /probate/.test(findGaps(client({ beneficiaryCount: 0 })).find((g) => g.id === "no_beneficiary")?.agenda ?? ""), true);
check("a named beneficiary is not a gap", has(client({ beneficiaryCount: 2 }), "no_beneficiary"), false);

console.log("\n4. Income — the one the schema cannot answer");

// The point of this section. Without an income there is no defensible number,
// and zero would read as "you need no cover" rather than "unknown".
check("no income means no needs estimate", needsEstimate(null, 250_000), null);
check("zero income too", needsEstimate(0, 250_000), null);
check("and no underinsured finding", has(client(), "underinsured"), false);

check("ten times income, less what is in force",
  needsEstimate(90_000, 250_000), { recommended: 900_000, shortfall: 650_000 });
check("already covered means no shortfall",
  needsEstimate(20_000, 250_000), { recommended: 200_000, shortfall: 0 });

const short = client({ statedAnnualIncome: 90_000 });
check("a shortfall is raised when income is given", has(short, "underinsured"), true);
// Said out loud in the finding itself, because an agent is going to read this
// sentence to a client.
check("and it says ten-times-income is a rule of thumb",
  /rule of thumb/.test(findGaps(short).find((g) => g.id === "underinsured")?.detail ?? ""), true);
check("well-covered clients are not told they are short",
  has(client({ statedAnnualIncome: 20_000 }), "underinsured"), false);

console.log("\n5. Disability, and concentration");

check("a life-only book is raised", has(client(), "no_disability"), true);
check("a book with DI is not",
  has(client({ policies: [pol(), pol({ id: "p2", product: "DI Income Protection" })] }), "no_disability"), false);

const oneCarrier = client({
  policies: [pol({ id: "a" }), pol({ id: "b" }), pol({ id: "c" })],
});
check("three policies with one carrier is noted", has(oneCarrier, "single_carrier"), true);
check("but only as low", findGaps(oneCarrier).find((g) => g.id === "single_carrier")?.severity, "low");
check("two policies is not a concentration",
  has(client({ policies: [pol({ id: "a" }), pol({ id: "b" })] }), "single_carrier"), false);

console.log("\n6. Refusing to manufacture a review");

// No in-force cover short-circuits: every other finding would restate it.
const uncovered = client({ policies: [pol({ status: "lapsed" })], beneficiaryCount: 0 });
check("no in-force cover is the only finding", findGaps(uncovered).map((g) => g.id), ["no_coverage"]);

// A complete client produces nothing, and nothing is the honest answer.
const complete = client({
  beneficiaryCount: 2,
  statedAnnualIncome: 20_000,
  policies: [pol({ id: "a" }), pol({ id: "b", product: "DI", carrierName: "Assurity" })],
});
check("a client with no gaps produces none", findGaps(complete), []);
check("and the summary says so", summariseGaps([]), "No gaps found.");

console.log("\n7. Shape");

const messy = findGaps(client({ beneficiaryCount: 0, statedAnnualIncome: 200_000 }));
check("urgent findings sort first", messy[0].severity, "high");
check("every gap has something to say in the meeting",
  messy.every((g) => g.agenda.length > 25), true);
check("and a headline a person can read",
  messy.every((g) => g.headline.length > 5 && !/undefined|NaN/.test(g.headline)), true);
check("the summary counts what to raise first",
  /to raise first/.test(summariseGaps(messy)), true);

console.log("\n8. Naming what the review could not see");

check("one input is named as missing", MISSING_INPUTS.length, 1);
check("life events is it", MISSING_INPUTS.some((m) => /life event/i.test(m.input)), true);
check("stated income no longer is — clients store it now",
  MISSING_INPUTS.some((m) => /income/i.test(m.input)), false);
check("the unstated-income note still explains itself",
  UNSTATED_INCOME.why.length > 40, true);
check("and each explains itself", MISSING_INPUTS.every((m) => m.why.length > 40), true);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
