/**
 * Does the CSV parser survive real spreadsheets?
 *
 *   npm run check:csv
 *
 * Every case here is one a real export produces. The quoted-comma case is the
 * one that matters most: it does not throw, it silently shifts every column
 * after it by one — so an import writes a phone number into a policy number
 * and reports success.
 */

import { parseCsv, guessColumnMapping, applyMapping } from "../src/lib/csv";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n1. Parsing");
check("plain rows", JSON.stringify(parseCsv("a,b\n1,2")) === JSON.stringify([["a", "b"], ["1", "2"]]));

// The one that silently corrupts data rather than failing.
const commaInName = parseCsv('carrier,number\n"Mutual of Omaha, Inc.",7841102');
check("a quoted comma does not shift the columns",
  commaInName[1]?.length === 2 && commaInName[1][0] === "Mutual of Omaha, Inc." && commaInName[1][1] === "7841102",
  JSON.stringify(commaInName[1]));

check("doubled quotes unescape",
  parseCsv('a\n"He said ""hi"""')[1][0] === 'He said "hi"',
  JSON.stringify(parseCsv('a\n"He said ""hi"""')[1]));
check("CRLF line endings", parseCsv("a,b\r\n1,2").length === 2);
check("a newline inside a quoted field stays in the field",
  parseCsv('a\n"line one\nline two"')[1][0] === "line one\nline two");
check("trailing newline does not add a phantom row", parseCsv("a,b\n1,2\n").length === 2);
check("blank lines are dropped", parseCsv("a,b\n\n1,2\n\n").length === 2);
check("empty input is empty", parseCsv("").length === 0);

console.log("\n2. Header guessing");
const COLS = [
  { key: "carrier_name", label: "Carrier name" },
  { key: "writing_number", label: "Writing number" },
  { key: "state_code", label: "State" },
];
const m1 = guessColumnMapping(["Carrier Name", "Writing Number", "State"], COLS);
check("matches on label", m1.carrier_name === "0" && m1.writing_number === "1" && m1.state_code === "2", JSON.stringify(m1));

const m2 = guessColumnMapping(["carrier_name", "writing_number", "state_code"], COLS);
check("matches on key", m2.carrier_name === "0" && m2.writing_number === "1", JSON.stringify(m2));

// Exact must win over a loose match that would otherwise eat the column.
const m3 = guessColumnMapping(["Number", "Writing Number"], COLS);
check("an exact match is not stolen by an earlier loose one",
  m3.writing_number === "1", JSON.stringify(m3));

check("one header is never claimed by two columns",
  (() => {
    const m = guessColumnMapping(["Carrier"], COLS);
    return Object.values(m).length === new Set(Object.values(m)).size;
  })());
check("an unrecognised header maps to nothing",
  Object.keys(guessColumnMapping(["Zzz", "Qqq"], COLS)).length === 0,
  JSON.stringify(guessColumnMapping(["Zzz", "Qqq"], COLS)));

console.log("\n3. Applying a mapping");
const rows = applyMapping([["Americo", "AM-1", "TX"]], COLS, { carrier_name: "0", writing_number: "1", state_code: "2" });
check("maps cells by index", rows[0].carrier_name === "Americo" && rows[0].state_code === "TX", JSON.stringify(rows[0]));
check("unmapped columns are absent, not empty",
  !("state_code" in applyMapping([["Americo", "AM-1", ""]], COLS, { carrier_name: "0" })[0]));
check("blank cells are omitted rather than written as empty strings",
  !("state_code" in applyMapping([["Americo", "AM-1", "   "]], COLS, { carrier_name: "0", state_code: "2" })[0]));
check("cells are trimmed",
  applyMapping([["  Americo  "]], COLS, { carrier_name: "0" })[0].carrier_name === "Americo");

console.log(
  `\n${passed} passed, ${failures.length} failed${failures.length ? ":" : "."}\n` +
    failures.map((f) => `  ${f}`).join("\n"),
);
process.exit(failures.length ? 1 : 0);
