/**
 * Checks for Import's three decision layers: what kind of document arrived,
 * what records are in it, and which of those we already have.
 *
 * `npx tsx scripts/import-check.ts`
 *
 * Three of these guard against a specific way things went wrong before:
 *
 *   a different area code must not match on the last seven digits, which is
 *   what the previous implementation compared
 *
 *   two clients who share a name and nothing else must reach a human rather
 *   than be merged into one record, which is what the previous implementation
 *   did at 50% confidence
 *
 *   a file whose columns say "book of business" while its description says
 *   "commission grid" must refuse to route itself rather than pick a side —
 *   the grid path deletes every row it holds for that carrier
 *
 * Run alongside `nav-snapshot.ts` and `commission-check.ts`.
 */

import { buildMatchIndex, classifyClient, rowKey, normalizeEmail, normalizePhone10, normName } from "../src/lib/import-match";
import { resolveKind, guessFromHeaders, guessFromNote, headerRowOf, allHeaderRows } from "../src/lib/import-router";
import { clientsFromCsv, clientsFromDocument } from "../src/lib/import-extract-rows";

const clients = [
  { id: "c1", agent_id: "a", first_name: "John",  last_name: "Smith", phone: "(555) 201-3344", email: "j.smith+book@gmail.com", date_of_birth: "1960-04-02" },
  { id: "c2", agent_id: "a", first_name: "John",  last_name: "Smith", phone: null,             email: null,                     date_of_birth: null },
  { id: "c3", agent_id: "a", first_name: "Maria", last_name: "Gonzàlez", phone: null,          email: "maria@example.com",      date_of_birth: "1975-11-30" },
  { id: "c4", agent_id: "a", first_name: "Ana",   last_name: "Ruiz",  phone: null,             email: null,                     date_of_birth: "1980-01-15" },
];
const policies = [{ agent_id: "a", policy_number: "POL-77" }];

function fakeSupabase() {
  return {
    from(table: string) {
      const rows: any[] = table === "clients" ? clients : policies;
      const q: any = {
        select: () => q, in: () => q,
        range: (a: number, b: number) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      };
      return q;
    },
  };
}

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

const idx = await buildMatchIndex(fakeSupabase(), ["a"]);

check("index loaded 4 clients", idx.size, 4);

// Phone: different formatting, same number.
check("phone match is exact",
  (({verdict,reason}) => ({verdict,reason}))(classifyClient(idx, { phone: "555.201.3344" })),
  { verdict: "exact", reason: "phone" });

// The old code compared last 7 digits: a different area code would collide.
check("different area code is NOT a match",
  classifyClient(idx, { phone: "(212) 201-3344" }).verdict, "new");

// Gmail dots and +tag normalise to the same mailbox.
check("gmail dots/+tag match",
  classifyClient(idx, { email: "jsmith@gmail.com" }).verdict, "exact");

// Name + DOB.
check("name+dob is exact",
  classifyClient(idx, { first_name: "Maria", last_name: "Gonzalez", date_of_birth: "1975-11-30" }).verdict,
  "exact");

// THE BUG: two John Smiths, nothing to tell them apart. Old code merged at 50%.
const js = classifyClient(idx, { first_name: "John", last_name: "Smith" });
check("ambiguous name → fuzzy, not a merge", js.verdict, "fuzzy");
check("ambiguous name offers both candidates", js.candidateIds.length, 2);

// Spouse: same surname + DOB, different first name.
check("same surname+dob different first → fuzzy",
  classifyClient(idx, { first_name: "Luis", last_name: "Ruiz", date_of_birth: "1980-01-15" }).verdict,
  "fuzzy");

check("genuinely new is new",
  classifyClient(idx, { first_name: "Dee", last_name: "Okafor", phone: "9995551212" }).verdict, "new");

// In-file dedupe.
check("same phone → same rowKey",
  rowKey("clients", { phone: "555-201-3344" }) === rowKey("clients", { phone: "(555) 2013344" }), true);
check("grid rowKey is carrier+product+level",
  rowKey("commission_grids", { carrier_name: "GTL", product_name: "Term", level_name: "100%" }),
  "grid|gtl|term|100%|");

check("normName strips accents", normName("Gonzàlez"), "gonzalez");
check("normalizePhone10 rejects short", normalizePhone10("12345"), "");
check("normalizeEmail non-gmail keeps dots", normalizeEmail("A.B@corp.com"), "a.b@corp.com");


// ── Classification router ──────────────────────────────────────────────
console.log("");

const book = ["First Name","Last Name","Phone","Policy Number","Carrier","Annual Premium","Face Amount"];
const grid = ["Product","Level","Year 1","Years 2-5","Years 6+"];
const wn   = ["Agent NPN","Carrier Name","Writing Number","Number Type","Effective Date"];
const lic  = ["Agent Email","State","License Number","LOA","Resident","Expires Date"];
const roster=["Agent Name","Email","Upline","Depth","NPN"];

check("book from headers", guessFromHeaders(book).kind, "book_of_business");
check("grid from headers", guessFromHeaders(grid).kind, "commission_grid");
check("writing numbers from headers", guessFromHeaders(wn).kind, "writing_numbers");
check("licenses from headers", guessFromHeaders(lic).kind, "state_licenses");
check("roster from headers", guessFromHeaders(roster).kind, "agent_roster");

check("note: comp grid beats commission", guessFromNote("here is my comp grid for GTL"), "commission_grid");
check("note: book", guessFromNote("this is my entire book of business"), "book_of_business");
check("note: empty", guessFromNote(""), "unknown");

check("agreement → confidence 1", resolveKind(grid, "my comp grid").confidence, 1);
check("headers alone → 0.85", resolveKind(book, null).confidence, 0.85);

// The important one: mislabelled file must NOT route to the destructive path.
const conflict = resolveKind(book, "this is our commission grid");
check("conflict → unknown", conflict.kind, "unknown");
check("conflict names both sides", conflict.conflict, { fromHeaders: "book_of_business", fromNote: "commission_grid" });
console.log("        message:", conflict.reason);

// Note alone, unrecognisable columns (a scan with no header row).
check("note alone when headers useless", resolveKind(["Col1","Col2"], "my book of business").kind, "book_of_business");
check("nothing → unknown", resolveKind([], null).kind, "unknown");

check("headerRowOf splits csv", headerRowOf('a,b,c\n1,2,3'), ["a","b","c"]);
check("allHeaderRows spans sheets",
  allHeaderRows("=== Sheet: One ===\nx,y\n1,2\n\n=== Sheet: Two ===\nPolicy Number,Face Amount\n9,9").includes("Policy Number"),
  true);


// ── Row extraction ─────────────────────────────────────────────────────
console.log("");

const csv = [
  "First Name,Last Name,Phone,Email,DOB,Policy Number,Carrier,Annual Premium,Face Amount",
  'John,Smith,(555) 201-3344,j@x.com,04/02/1960,POL-1,GTL,1200,10000',
  'Ana,Ruiz,555-999-0000,,1980-01-15,POL-2,Mutual of Omaha,"$2,400",25000',
].join("\n");
const r = clientsFromCsv(csv);
check("two rows", r.length, 2);
check("names", [r[0].first_name, r[0].last_name], ["John","Smith"]);
check("dob normalised US order", r[0].date_of_birth, "1960-04-02");
check("iso dob passes through", r[1].date_of_birth, "1980-01-15");
check("currency stripped", r[1].policies[0].annual_premium, 2400);
check("policy attached", r[0].policies[0].policy_number, "POL-1");

// Quoted comma in a name must not shift the columns.
const quoted = [
  "Name,Phone,Policy Number",
  '"Smith, John Jr.",5552013344,POL-9',
].join("\n");
const q = clientsFromCsv(quoted);
check("quoted comma keeps columns aligned", q[0].phone, "5552013344");
check("surname-first split", [q[0].first_name, q[0].last_name], ["John Jr.","Smith"]);

// "Full Name" in natural order.
const nat = clientsFromCsv("Client Name,Phone\nMaria Elena Gonzalez,5551112222");
check("natural order full name", [nat[0].first_name, nat[0].last_name], ["Maria","Elena Gonzalez"]);

// Tab-separated.
check("tabs work", clientsFromCsv("First Name\tPhone\nDee\t5551234567").length, 1);

// A sheet with no identifying columns yields nothing rather than blank records.
check("junk sheet yields nothing", clientsFromCsv("Total,Amount\n5,10").length, 0);

// Rows with no name and no phone are dropped.
check("empty rows dropped", clientsFromCsv("First Name,Phone\n,\nDee,5551234567").length, 1);

// Multi-sheet: the book is on the second tab.
const multi = "=== Sheet: Summary ===\nTotal,Count\n5,10\n\n=== Sheet: Book ===\nFirst Name,Last Name,Phone\nZed,Ali,5550001111";
check("finds the book on sheet two", clientsFromDocument(multi).length, 1);

// Ambiguous month>12 rejected rather than guessed.
check("impossible month → null", clientsFromCsv("First Name,DOB\nX,13/05/1990")[0].date_of_birth, null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
