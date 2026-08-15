/**
 * Checks for Import's three decision layers: what kind of document arrived,
 * what records are in it, and which of those we already have.
 *
 *   npm run check:import
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
import {
  clientsFromCsv, clientsFromDocument,
  contractingRowsFromCsv, contractingRowsFromDocument,
  rosterFromCsv, rosterFromDocument,
} from "../src/lib/import-extract-rows";
import { readBlock, isSubtotalRow, carrierFromLabel } from "../src/lib/sheet-shape";

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
  if (ok) pass++;
  else fail++;
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


// ── Contracting record mapping ─────────────────────────────────────────
console.log("");

const cwn = contractingRowsFromCsv(
  ["Agent NPN,Carrier Name,Writing Number,Type,State,Effective Date",
   "12345678,Mutual of Omaha,MOO-991,Individual,TX,2026-01-05"].join("\n"), "writing_numbers");
check("writing numbers: one row", cwn.length, 1);
check("maps to importer column names", Object.keys(cwn[0]).sort(),
  ["agent_npn","carrier_name","effective_date","number_type","state_code","writing_number"]);
check("values carried as strings", cwn[0].writing_number, "MOO-991");

const clic = contractingRowsFromCsv(
  ["Agent Email,State,License Number,LOA,Resident,Expires",
   "a@x.com,TX,TX-55,Life,Yes,2027-03-01"].join("\n"), "licenses");
check("licenses: mapped", [clic[0].state_code, clic[0].loa, clic[0].is_resident], ["TX","Life","Yes"]);

const car = contractingRowsFromCsv(
  ["Carrier Name,Contracting Email,Turnaround","Foresters,c@f.com,5"].join("\n"), "carriers");
check("carriers: mapped", [car[0].carrier_name, car[0].turnaround_days], ["Foresters","5"]);

// A sheet lacking the identifying column yields nothing rather than blank rows.
check("no writing-number column → nothing",
  contractingRowsFromCsv("Agent NPN,State\n123,TX", "writing_numbers").length, 0);

// Rows missing the required value are dropped.
check("blank required value dropped",
  contractingRowsFromCsv(["Carrier Name,Writing Number","GTL,","GTL,W-1"].join("\n"), "writing_numbers").length, 1);

// Quoted comma inside a carrier name must not shift columns.
const cq = contractingRowsFromCsv(
  ['Carrier Name,Writing Number','"Smith, Jones & Co",W-9'].join("\n"), "writing_numbers");
check("quoted comma safe", [cq[0].carrier_name, cq[0].writing_number], ["Smith, Jones & Co","W-9"]);

// Multi-sheet.
check("finds rows on a later sheet",
  contractingRowsFromDocument(
    "=== Sheet: Cover ===\nx,y\n1,2\n\n=== Sheet: Numbers ===\nCarrier,Writing Number\nGTL,W-3", "writing_numbers").length, 1);


// ── Agent roster ───────────────────────────────────────────────────────
console.log("");

const ros = rosterFromCsv(["Agent Name,Email,Depth,Status,Date Joined",
  "Dana Okafor,DANA@x.com,3,Active,2025-06-01",
  "Luis Ruiz,luis@x.com,2,Pending,2025-07-14"].join("\n"));
check("two roster rows", ros.length, 2);
check("email lowercased", ros[0].email, "dana@x.com");
check("full name split", [ros[0].first_name, ros[0].last_name], ["Dana","Okafor"]);
check("depth carried", ros[0].depth, "3");

// Explicit first/last columns win over a full-name column.
const ros2 = rosterFromCsv("First Name,Last Name,Email\nAna,Ruiz,ana@x.com");
check("explicit name columns", [ros2[0].first_name, ros2[0].last_name], ["Ana","Ruiz"]);

// A roster with no email column is unusable — pending_agents is keyed on it.
check("no email column → nothing", rosterFromCsv("Agent Name,Depth\nDana,3").length, 0);
// Rows without a usable email are dropped rather than proposed.
check("rows without email dropped", rosterFromCsv("Agent Name,Email\nX,\nY,y@x.com").length, 1);
check("non-email value dropped", rosterFromCsv("Agent Name,Email\nX,notanemail").length, 0);
check("finds roster on a later sheet",
  rosterFromDocument("=== Sheet: Cover ===\na,b\n1,2\n\n=== Sheet: Team ===\nAgent Name,Email\nZed,z@x.com").length, 1);

// ── The shape of a real spreadsheet ─────────────────────────────────────────
//
// Every case below imported *nothing* before, or imported a subtotal as a
// person, and in both cases said it had succeeded. That silence is the whole
// reason this section is worth its length.

console.log("\nSheet shape");

// A banner above the header. The commonest single reason a good file imports
// nothing: line 0 is the agency's name, so no column is recognised.
const bannered = [
  "Kingdom Financial Group",
  "Book of Business as of 08/01/2026",
  "",
  "First Name,Last Name,Phone,Policy Number,Monthly Premium",
  "Willie,Jenkins,555-201-3344,MUT-4820193,62.40",
].join("\n");
check("the header is found under a banner", readBlock(bannered).headerIndex, 3);
check("banner rows are counted, not silently eaten", readBlock(bannered).skipped.banner, 3);
check("a bannered file still yields its client", clientsFromCsv(bannered).length, 1);
check("and the policy came with it", clientsFromCsv(bannered)[0].policies?.[0].policy_number, "MUT-4820193");
check("routing sees past the banner too", headerRowOf(bannered).includes("Policy Number"), true);

// A two-row header stack over a merged span. Read either row alone and
// "Monthly" and "Annual" lose the word that says what they are.
const stacked = [
  "Client,Premium,,Face",
  "Name,Monthly,Annual,Amount",
  "Willie Jenkins,62.40,748.80,250000",
].join("\n");
check("a merged span is filled and joined",
  readBlock(stacked).headers, ["Client Name", "Premium Monthly", "Premium Annual", "Face Amount"]);
check("the stacked header row is not read as data", readBlock(stacked).rows.length, 1);
check("and the joined name is what the mapper matches on",
  clientsFromCsv(stacked)[0].policies?.[0].face_amount, 250000);

// A trailing empty in a stacked header is an unnamed column, not the tail of
// the span next to it — filling it would name it after its neighbour.
check("a span does not run off the end",
  readBlock("Client,Premium,,Face,\nName,Monthly,Annual,Amount,Note\nA,1,2,3,x").headers,
  ["Client Name", "Premium Monthly", "Premium Annual", "Face Amount", "Note"]);

// A lone header row must NOT be forward-filled — an unnamed trailing column
// named after its neighbour gets mapped, which is worse than being ignored.
check("a lone header keeps its empty columns empty",
  readBlock("First Name,Last Name,,\nA,B,x,y").headers, ["First Name", "Last Name", "", ""]);

// Subtotals. These have a premium and no name, so they survive every
// "does this row have anything in it" test and land in the book as a client
// called nothing holding the sum of twelve other policies.
check("a labelled subtotal is dropped",
  isSubtotalRow(["Subtotal", "", "", "1,240.00"]), true);
check("a grand total is dropped", isSubtotalRow(["", "Grand Total", "4,980.00"]), true);
check("a bare arithmetic line is dropped", isSubtotalRow(["", "", "", "1,240.00"]), true);
// The one that matters in the other direction: a carrier whose name contains
// the word must not be swept up with them.
check("a labelled per-agent subtotal is dropped",
  isSubtotalRow(["Total for J. Smith", "", "", "1,240.00"]), true);
// The other direction, which matters more: a real row deleted is invisible,
// a subtotal kept is right there in the review screen.
check("a carrier called Total Life survives",
  isSubtotalRow(["Willie Jenkins", "Total Life Insurance Company", "62.40"]), false);
check("an ordinary row survives", isSubtotalRow(["Willie", "Jenkins", "62.40"]), false);
check("a two-column row with a name is not arithmetic",
  isSubtotalRow(["Willie Jenkins", "62.40"]), false);

const withTotals = [
  "First Name,Last Name,Phone,Monthly Premium",
  "Willie,Jenkins,555-201-3344,62.40",
  "Ana,Ruiz,555-201-9911,88.00",
  "Total,,,150.40",
].join("\n");
check("subtotals never become clients", clientsFromCsv(withTotals).length, 2);
check("and the count of what was dropped is kept", readBlock(withTotals).skipped.subtotal, 1);

// The carrier in the tab name rather than a column — the commonest workbook
// shape in this industry, and the field a column-only reader loses entirely.
const carriers = [
  { id: "moo", name: "Mutual of Omaha" },
  { id: "for", name: "Foresters Financial" },
];
const perCarrier = [
  "=== Sheet: Mutual of Omaha 2026 ===",
  "Client Name,Policy Number,Monthly Premium",
  "Willie Jenkins,MUT-4820193,62.40",
].join("\n");
const stamped = clientsFromDocument(perCarrier, carriers);
check("the carrier is read out of the tab name", stamped[0].policies?.[0].carrier_id, "moo");
check("and it says where that came from", stamped[0].policies?.[0].carrier_source, "sheet_name");

// A column always wins — the tab name is a label somebody typed for themselves.
const bothSources = [
  "=== Sheet: Mutual of Omaha ===",
  "Client Name,Carrier,Policy Number",
  "Willie Jenkins,Foresters Financial,F-99",
].join("\n");
check("a carrier column beats the tab name",
  clientsFromDocument(bothSources, carriers)[0].policies?.[0].carrier_name, "Foresters Financial");

// Structural tab names must not be dragged onto a carrier by edit distance.
check("Summary is not a carrier", carrierFromLabel("Summary", carriers), null);
check("Sheet1 is not a carrier", carrierFromLabel("Sheet1", carriers), null);
check("an unknown tab name is not forced onto the nearest carrier",
  carrierFromLabel("Q3 Leads", carriers), null);
check("noise around the name is stripped",
  carrierFromLabel("Foresters Financial - Book (2026)", carriers)?.carrierId, "for");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
