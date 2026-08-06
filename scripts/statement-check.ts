/**
 * Does the commission statement importer read what carriers actually send?
 *
 *   npm run check:statements
 *
 * Reconciliation exists to catch two things: a policy paid at the wrong rate,
 * and a chargeback nobody recorded. Both are *signed* differences, so every
 * case below that concerns a sign is a case where getting it wrong does not
 * merely lose the finding — it reports the opposite one. A chargeback read as
 * a payment moves the variance by twice the amount and in the wrong direction.
 */

import {
  parseStatementAmount, parseStatementCsv, mapStatementColumns,
} from "../src/lib/statement-parse";

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

console.log("\n1. Amounts, as a carrier ledger writes them");

check("a plain amount", parseStatementAmount("1,234.56"), 1234.56);
check("with a currency symbol", parseStatementAmount("$1,234.56"), 1234.56);

// The one that was wrong. `money2` stripped the parentheses along with the
// dollar sign, so a chargeback read as a payment of the same size.
check("an accounting negative is negative", parseStatementAmount("(1,234.56)"), -1234.56);
check("and with a symbol inside", parseStatementAmount("($1,890.00)"), -1890);

// Mainframe exports. Extremely common on carrier statements, and a trailing
// minus is not something any consumer spreadsheet produces.
check("a trailing minus is negative", parseStatementAmount("1,234.56-"), -1234.56);
check("a leading minus still works", parseStatementAmount("-1,234.56"), -1234.56);

// Ledger suffixes: DR is money coming back off you.
check("DR is a debit", parseStatementAmount("1,234.56 DR"), -1234.56);
check("CR is a credit", parseStatementAmount("1,234.56 CR"), 1234.56);
check("lower case dr", parseStatementAmount("412.00 dr"), -412);
check("a trailing period after the suffix", parseStatementAmount("412.00 CR."), 412);

// Two negatives are not a positive here — "1,234.56- DR" is one amount written
// two ways by a system that does both, not a double negation.
check("a trailing minus and DR do not cancel", parseStatementAmount("1,234.56- DR"), -1234.56);

check("zero is zero, not nothing", parseStatementAmount("0.00"), 0);
check("a bare number passes through", parseStatementAmount(62.4), 62.4);

// Zero would reconcile as "the carrier paid nothing for this policy", which is
// a specific claim. Null says "nobody could read this line", which is true.
check("unreadable returns null, not zero", parseStatementAmount("see note"), null);
check("empty returns null", parseStatementAmount(""), null);
check("null in, null out", parseStatementAmount(null), null);

console.log("\n2. Which column is which");

// The bug: a loose match on "policy" consumed Policy Holder, and the real
// policy number was never reached.
const stolen = mapStatementColumns(["Policy Holder", "Policy Number", "Commission Amount"]);
check("an exact header beats a loose one on an earlier column",
  [stolen.policy_number, stolen.insured_name], [1, 0]);

// Same shape, different field: "amount" would have claimed Face Amount.
const faces = mapStatementColumns(["Insured", "Face Amount", "Commission Amount"]);
check("commission amount beats face amount", faces.paid_amount, 2);

check("no column is claimed twice", (() => {
  const m = mapStatementColumns(["Agent", "Agent Name", "Policy", "Amount"]);
  const used = Object.values(m);
  return used.length === new Set(used).size;
})(), true);

const spelled = mapStatementColumns(["Cert Number", "Member Name", "Writing Agent", "Net Commission", "Process Date"]);
check("a statement that spells everything differently still maps",
  [spelled.policy_number, spelled.insured_name, spelled.agent_name, spelled.paid_amount, spelled.paid_date],
  [0, 1, 2, 3, 4]);

console.log("\n3. A statement as it actually arrives");

// Banner rows, a subtotal after the agent block, and a grand total. Every one
// of these would have been read as a policy line by the old parser.
const real = [
  "Kingdom Financial Group",
  "Commission Statement — Mutual of Omaha",
  "Period: 07/01/2026 - 07/31/2026",
  "",
  "Policy Number,Insured Name,Writing Agent,Commission Amount,Paid Date",
  "MUT-4820193,Willie Jenkins,D. Okafor,412.00,07/15/2026",
  "MUT-4820194,Ana Ruiz,D. Okafor,(1890.00),07/15/2026",
  "Subtotal,,,-1478.00,",
  "MUT-4820195,Sean O'Connor,M. Delgado,624.50,07/22/2026",
  "Grand Total,,,-853.50,",
].join("\n");

const parsed = parseStatementCsv(real);
check("the banner is skipped, not parsed", parsed.skipped.banner, 4);
check("three policy lines, no totals", parsed.lines.length, 3);
check("the subtotal and the grand total are both dropped", parsed.skipped.subtotal, 2);
check("the chargeback kept its sign", parsed.lines[1].paid_amount, -1890);
check("the paid date survives", parsed.lines[0].paid_date, "2026-07-15");
check("the insured came through", parsed.lines[2].insured_name, "Sean O'Connor");
check("and the total is what the statement says",
  parsed.lines.reduce((a, l) => a + l.paid_amount, 0), -853.5);
check("no problem reported on a readable file", parsed.problem, null);

console.log("\n4. Refusing, rather than importing nonsense");

const noAmount = parseStatementCsv("Policy Number,Insured\nMUT-1,Willie");
check("a file with no amount column is refused",
  /commission amount column/i.test(noAmount.problem ?? ""), true);
check("and no lines come out of it", noAmount.lines.length, 0);

// A line with no policy number is the *most* interesting kind, not the least —
// it is exactly what reconciliation is meant to surface. Kept, not dropped.
const noPolicy = parseStatementCsv("Policy Number,Insured,Commission\n,Willie Jenkins,412.00");
check("a line with no policy number is kept for review", noPolicy.lines.length, 1);
check("with its policy number null rather than blank", noPolicy.lines[0].policy_number, null);

// A whole column of unreadable amounts means the wrong column was mapped.
// Counting them is what turns an empty result into an explanation.
const unreadable = parseStatementCsv("Policy,Commission\nMUT-1,see attached\nMUT-2,pending");
check("unreadable amounts are counted", unreadable.skipped.unreadableAmount, 2);
check("and the file says why it produced nothing",
  /couldn't read an amount/i.test(unreadable.problem ?? ""), true);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
