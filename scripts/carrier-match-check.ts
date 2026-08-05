/**
 * Does carrier matching still refuse to guess?
 *
 *   npx esbuild scripts/carrier-match-check.ts --bundle --platform=node \
 *     --format=esm --outfile=.cm.mjs && node .cm.mjs
 *
 * The matcher decides which carrier a policy is filed under. Getting it wrong
 * pays a commission at the wrong level and puts a policy in a book the agent
 * does not hold a contract for — so the interesting assertions here are not
 * "does it match" but **"does it decline to match"**.
 *
 * Every case marked REGRESSION is one the old substring test got wrong.
 */

import {
  matchCarrier, normalizeCarrierName, normalizeNaic, similarity,
  isConfident, CONFIRM_THRESHOLD, type CarrierRecord,
} from "../src/lib/carrier-match";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** A plausible agency's carrier list, including the pairs that trip substrings. */
const CARRIERS: CarrierRecord[] = [
  { id: "moo", name: "Mutual of Omaha", naicCode: "71412", aliases: ["MoO", "United of Omaha", "Omaha Insurance Company"] },
  { id: "amer", name: "Americo", naicCode: "61999", aliases: ["Americo Financial Life and Annuity"] },
  { id: "fore", name: "Foresters Financial", naicCode: "58033", aliases: ["Independent Order of Foresters", "Foresters"] },
  { id: "mony", name: "Mutual of New York", naicCode: "66370", aliases: [] },
  { id: "glic", name: "Guarantee Life", naicCode: "62057", aliases: [] },
  { id: "tran", name: "Transamerica", naicCode: "86231", aliases: ["Transamerica Life Insurance Company"] },
];

console.log("\n1. Normalisation");
check("strips corporate suffixes", normalizeCarrierName("Americo Financial Life and Annuity Insurance Company") === "americo",
  `got "${normalizeCarrierName("Americo Financial Life and Annuity Insurance Company")}"`);
// Names with a distinctive word in them, so the suffix-strip fallback below is
// not what is being observed here.
check("& and 'and' normalise together",
  normalizeCarrierName("Smith & Jones Life Co") === normalizeCarrierName("Smith and Jones Life Company"),
  `"${normalizeCarrierName("Smith & Jones Life Co")}" vs "${normalizeCarrierName("Smith and Jones Life Company")}"`);
// A name made entirely of stripped words must not collapse to the empty string,
// which would make it match every other over-stripped name.
check("a name made only of generic words survives normalisation",
  normalizeCarrierName("Life & Annuity Co").length > 0,
  `got "${normalizeCarrierName("Life & Annuity Co")}"`);
check("over-stripped names stay distinguishable",
  normalizeCarrierName("Life Insurance Company") !== normalizeCarrierName("Annuity Services Group"));
check("punctuation and case are ignored",
  normalizeCarrierName("MUTUAL OF OMAHA, INC.") === normalizeCarrierName("mutual of omaha inc"));
check("NAIC pads to five digits", normalizeNaic("1234") === "01234");
check("NAIC rejects junk", normalizeNaic("not-a-code") === null);
check("NAIC rejects over-long", normalizeNaic("1234567") === null);

console.log("\n2. The four strategies");
check("NAIC wins outright",
  matchCarrier("something unrecognisable", CARRIERS, { naicCode: "71412" }).method === "naic");
check("exact name after normalisation",
  matchCarrier("Mutual of Omaha", CARRIERS).method === "exact");
check("alias resolves", matchCarrier("MoO", CARRIERS).carrierId === "moo");
check("alias resolves a long legal name",
  matchCarrier("United of Omaha", CARRIERS).carrierId === "moo");
check("a typo lands as fuzzy but confident",
  (() => { const m = matchCarrier("Transamerca", CARRIERS); return m.carrierId === "tran" && isConfident(m); })(),
  JSON.stringify(matchCarrier("Transamerca", CARRIERS)));

console.log("\n3. REGRESSIONS — cases the substring test got wrong");

// `name.includes(k)`: "Life" was a substring of two carriers here.
const life = matchCarrier("Life", CARRIERS);
check("REGRESSION: bare 'Life' does not silently match a carrier",
  !isConfident(life),
  `matched ${life.carrierId} at ${life.confidence.toFixed(2)}`);

// `k.includes(name)`: "Mutual of Omaha Life Insurance" contains "Mutual of
// Omaha" — right answer — but also risked hitting "Mutual of New York" logic
// in other orderings. The point is it must resolve deterministically to the
// best candidate, not the first iterated.
const moo = matchCarrier("Mutual of Omaha Life Insurance Company", CARRIERS);
check("REGRESSION: long legal name resolves to the right carrier",
  moo.carrierId === "moo", `got ${moo.carrierId}`);

// The pair that matters most: two real carriers sharing a prefix.
const mony = matchCarrier("Mutual of New York", CARRIERS);
check("REGRESSION: 'Mutual of New York' is not 'Mutual of Omaha'",
  mony.carrierId === "mony", `got ${mony.carrierId}`);

const omahaVsNy = similarity(normalizeCarrierName("Mutual of Omaha"), normalizeCarrierName("Mutual of New York"));
check("two distinct carriers score below the confirm threshold",
  omahaVsNy < CONFIRM_THRESHOLD, `scored ${omahaVsNy.toFixed(2)}`);

// "Guarantee Life" vs "Guaranteed Life Co" — one character, genuinely a typo.
const guar = matchCarrier("Guaranteed Life", CARRIERS);
check("a one-character difference stays confident",
  guar.carrierId === "glic" && isConfident(guar), JSON.stringify(guar));

console.log("\n4. Refusing to answer");
check("empty input returns none", matchCarrier("", CARRIERS).method === "none");
check("null input returns none", matchCarrier(null, CARRIERS).method === "none");
check("a name nothing resembles returns none",
  matchCarrier("Zzyzx Underwriting Collective", CARRIERS).method === "none",
  JSON.stringify(matchCarrier("Zzyzx Underwriting Collective", CARRIERS)));
check("an empty carrier list returns none", matchCarrier("Americo", []).method === "none");
check("fuzzy confidence is capped below exact",
  matchCarrier("Transamerca", CARRIERS).confidence < 0.99);
check("isConfident agrees with the threshold",
  isConfident({ carrierId: "x", confidence: CONFIRM_THRESHOLD, method: "fuzzy" }) &&
  !isConfident({ carrierId: "x", confidence: CONFIRM_THRESHOLD - 0.01, method: "fuzzy" }));
check("a null carrierId is never confident",
  !isConfident({ carrierId: null, confidence: 1, method: "none" }));

console.log(
  `\n${passed} passed, ${failures.length} failed${failures.length ? ":" : "."}\n` +
    failures.map((f) => `  ${f}`).join("\n"),
);
process.exit(failures.length ? 1 : 0);
