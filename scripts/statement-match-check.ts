/**
 * Does the fallback matcher find the right policy, and refuse when it cannot?
 *
 *   npm run check:statement-match
 *
 * Two failure modes, and they are not symmetric.
 *
 * A missed match costs a line in the unmatched pile, which is where it already
 * was — visible, and a person can fix it. A *wrong* match attributes somebody
 * else's commission to a producer and reports a variance against a policy that
 * never had one: silent, plausible, and found a quarter later if at all.
 *
 * So roughly half of what follows asserts that the matcher says nothing.
 */

import {
  suggestForLine, scoreCandidate, isStrong, SUGGEST_FLOOR, STRONG_MATCH,
  type MatchCandidate, type MatchLine,
} from "../src/lib/statement-match";

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

const willie: MatchCandidate = {
  policyId: "p1", policyNumber: "MUT-4820193-01", insuredName: "Willie Jenkins",
  agentId: "a1", agentName: "D. Okafor",
  monthlyPremium: 62.4, annualPremium: 748.8, effectiveDate: "2026-05-01", expected: 412,
};
const ana: MatchCandidate = {
  policyId: "p2", policyNumber: "FOR-99120", insuredName: "Ana Ruiz",
  agentId: "a1", agentName: "D. Okafor",
  monthlyPremium: 155, annualPremium: 1860, effectiveDate: "2026-06-15", expected: 1890,
};
// Same surname, different person, different policy — the case that punishes a
// name-only matcher.
const otherJenkins: MatchCandidate = {
  policyId: "p3", policyNumber: "MUT-7710044", insuredName: "Wanda Jenkins",
  agentId: "a2", agentName: "M. Delgado",
  monthlyPremium: 40, annualPremium: 480, effectiveDate: "2026-09-01", expected: 300,
};
const book = [willie, ana, otherJenkins];

const line = (over: Partial<MatchLine> = {}): MatchLine => ({
  lineId: "L1", policyNumber: null, insuredName: null, agentName: null,
  paidAmount: 412, paidDate: "2026-07-15", ...over,
});

console.log("\n1. The policy number the carrier printed");

// The carrier prints the base number; we store it with a prefix and a suffix.
check("a bare number finds the decorated one",
  suggestForLine(line({ policyNumber: "4820193" }), book)[0]?.policyId, "p1");
check("and it reads as strong",
  isStrong(suggestForLine(line({ policyNumber: "4820193" }), book)[0]), true);

// Short numeric fragments are contained in half the book. Nothing is offered.
check("a two-digit fragment matches nothing",
  suggestForLine(line({ policyNumber: "01", insuredName: null }), book).length, 0);

console.log("\n2. The name, written how a ledger writes it");

check("surname-first is the same person",
  suggestForLine(line({ insuredName: "Jenkins, Willie" }), book)[0]?.policyId, "p1");
check("a middle name on one side only",
  suggestForLine(line({ insuredName: "Willie J Jenkins" }), book)[0]?.policyId, "p1");
check("case and punctuation are irrelevant",
  suggestForLine(line({ insuredName: "WILLIE  JENKINS." }), book)[0]?.policyId, "p1");

// The one that matters: a shared surname is not a match.
const wandaAmount = line({ insuredName: "Jenkins", paidAmount: 412 });
check("a surname alone is not enough to name a person",
  suggestForLine(wandaAmount, book).length, 0);

console.log("\n3. The date, which is mostly evidence against");

// Commission is paid after a policy takes effect, never four months before it.
// Wanda's policy is written 2026-09-01; a July payment cannot be hers.
check("a payment before the policy existed is refused outright",
  scoreCandidate(line({ insuredName: "Wanda Jenkins", paidDate: "2026-07-15" }), otherJenkins), null);

// Same name, same everything, but now the date is possible.
const wandaLater = line({ insuredName: "Wanda Jenkins", paidDate: "2026-10-01", paidAmount: 300 });
check("and accepted once the date is possible",
  scoreCandidate(wandaLater, otherJenkins)?.policyId, "p3");

console.log("\n4. Chargebacks");

// −1890 against an expected +1890 is the *same* policy — the commission coming
// back. Signing this comparison would make every chargeback look like a
// mismatch, which is the opposite of what reconciliation is for.
const chargeback = line({ insuredName: "Ana Ruiz", paidAmount: -1890, paidDate: "2026-07-15" });
const cb = suggestForLine(chargeback, book)[0];
check("a chargeback matches its policy", cb?.policyId, "p2");
check("and it is strong, not marginal", isStrong(cb), true);
check("the variance is the full swing", cb?.variance, -3780);

console.log("\n5. Refusing");

// Nothing identifying. An amount and a date describe half the book.
check("an amount and a date alone suggest nothing",
  suggestForLine(line({ paidAmount: 412, paidDate: "2026-07-15" }), book).length, 0);
check("an empty book suggests nothing", suggestForLine(line({ insuredName: "Willie Jenkins" }), []).length, 0);
check("a blank name is not a match for a blank name",
  suggestForLine(line({ insuredName: "" }), [{ ...willie, insuredName: null }]).length, 0);

// Never more than three, however many plausible candidates exist.
const manyJenkins = Array.from({ length: 9 }, (_, i) => ({
  ...willie, policyId: `x${i}`, policyNumber: `MUT-482019${i}`, effectiveDate: "2026-01-01",
}));
check("at most three suggestions", suggestForLine(line({ insuredName: "Willie Jenkins" }), manyJenkins).length, 3);

console.log("\n6. The thresholds mean what they say");

check("the suggest floor is below the strong bar", SUGGEST_FLOOR < STRONG_MATCH, true);
check("nothing below the floor is ever returned",
  suggestForLine(line({ insuredName: "Willie Jenkins" }), book).every((s) => s.confidence >= SUGGEST_FLOOR), true);
check("suggestions come back best first", (() => {
  const s = suggestForLine(line({ insuredName: "Willie Jenkins", policyNumber: "4820193" }), book);
  return s.every((x, i) => i === 0 || s[i - 1].confidence >= x.confidence);
})(), true);
check("every suggestion says why", (() => {
  const s = suggestForLine(line({ insuredName: "Willie Jenkins", policyNumber: "4820193" }), book);
  return s.every((x) => x.reasons.length > 0);
})(), true);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
