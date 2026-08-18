/**
 * A carrier's product dropdown shows that carrier's products.
 *
 *   npx tsx scripts/carrier-products-check.ts
 *
 * ── The defect ──
 *
 * `getCarrierDealOptions` took an `orgCarrierId` and looked it up as the
 * primary key of `org_carriers`. Post a Deal passed `selectedCarrier.id`, and
 * `listCarriersForDeal` maps `id: r.carrier_id` — a `carriers.id`. Two
 * different tables' primary keys, both uuids, one parameter name. The lookup
 * never matched a row.
 *
 * What made it survive two releases is the fallback. `getCarrierDealOptions`
 * answered `{ available: false, products: [] }`, and the form read that as
 * "this agency has no grid for this carrier" and drew the generic eight-item
 * catalogue — Term Life, Whole Life, Final Expense, and so on. A plausible
 * list of products is not a visible failure, so the screen looked finished
 * while the feature had never once run.
 *
 * ── What is asserted here ──
 *
 * The wiring, mostly, because the bug was entirely in the wiring: the pure
 * grouping logic was always correct and always fed the wrong id. So these
 * checks read the source and assert that the two ends agree — that the caller
 * sends `carrierId`, that the resolver filters on `carrier_id`, and that
 * neither list function has quietly grown its own second copy of the grouping
 * again.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { gridProductsByCarrier } from "../src/lib/carriers/grid-products";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The grouping ────────────────────────────────────────────────────────────

const ORG = "11111111-1111-1111-1111-111111111111";
const TRANS = "aaaaaaaa-0000-0000-0000-000000000001";
const ETHOS = "bbbbbbbb-0000-0000-0000-000000000002";

/** A `supabase` stand-in: one table, one `.or()`, whatever rows we hand it. */
const db = (rows: any[] | null, error: any = null) => ({
  from: () => ({ select: () => ({ or: async () => ({ data: rows, error }) }) }),
});

const g = (carrier_id: string, product_name: string | null, organization_id: string | null) =>
  ({ carrier_id, product_name, organization_id });

{
  const rows = [
    g(TRANS, "Trendsetter Super", null),
    g(TRANS, "FE Express", null),
    g(ETHOS, "Ethos Term", null),
  ];
  const out = await gridProductsByCarrier(db(rows), ORG);
  check("shared library groups per carrier", out.get(TRANS), ["FE Express", "Trendsetter Super"]);
  check("a second carrier is its own list", out.get(ETHOS), ["Ethos Term"]);
  check("a carrier with no grid is absent, not empty", out.get("nope"), undefined);
}

{
  // The shadowing rule, which is the one that reads as "Save grid did nothing"
  // when it is missing: once an agency has authored anything for a carrier,
  // that authored grid is the whole grid for that carrier.
  const rows = [
    g(TRANS, "Trendsetter Super", null),
    g(TRANS, "Old Discontinued Plan", null),
    g(TRANS, "Immediate Solution", ORG),
    g(ETHOS, "Ethos Term", null),
  ];
  const out = await gridProductsByCarrier(db(rows), ORG);
  check("the agency's own rows shadow the shared ones", out.get(TRANS), ["Immediate Solution"]);
  check("shadowing is per carrier, not global", out.get(ETHOS), ["Ethos Term"]);
}

{
  const rows = [
    g(TRANS, "  Trendsetter Super  ", null),
    g(TRANS, "Trendsetter Super", null),
    g(TRANS, "", null),
    g(TRANS, null, null),
  ];
  const out = await gridProductsByCarrier(db(rows), ORG);
  check("names are trimmed and deduped, blanks dropped", out.get(TRANS), ["Trendsetter Super"]);
}

{
  // ── A failed read is not "no grid" ──
  //
  // This is the whole reason the original bug was invisible for two releases:
  // an empty answer and a broken answer rendered identically, as the generic
  // catalogue. Throwing is what makes the difference reach a human.
  let threw = false;
  try {
    await gridProductsByCarrier(db(null, { code: "42P01", message: "relation does not exist" }), ORG);
  } catch {
    threw = true;
  }
  check("a failed grid read throws rather than reading as empty", threw, true);
}

// ── The wiring ──────────────────────────────────────────────────────────────

const PRICING = strip(read("src/lib/compensation/deal-pricing.server.ts"));
const POSTDEAL_FN = strip(read("src/lib/post-deal.functions.ts"));
const PIPELINE_FN = strip(read("src/lib/pipeline.functions.ts"));
const POSTDEAL_UI = strip(read("src/routes/_authenticated/post-deal.tsx"));

// The defect itself: the caller's id and the resolver's filter must name the
// same table's key.
check(
  "post a deal sends a carrierId",
  /getCarrierDealOptions\(\{\s*data:\s*\{\s*carrierId:/.test(POSTDEAL_UI),
  true,
);
check(
  "post a deal no longer sends the org-carrier key",
  /getCarrierDealOptions\([^)]*orgCarrierId/.test(POSTDEAL_UI),
  false,
);
check(
  "the resolver accepts a carrierId",
  /carrierId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(PRICING),
  true,
);
check(
  "the resolver filters org_carriers on carrier_id",
  /\.eq\("carrier_id",\s*data\.carrierId\)/.test(PRICING),
  true,
);
check(
  "exactly one id is required, so neither can be silently ignored",
  /\.refine\(\(v\) => Boolean\(v\.carrierId\) !== Boolean\(v\.orgCarrierId\)/.test(PRICING),
  true,
);
check(
  "the grid loads from the carrier, not from the agency link row",
  /loadGridRows\(supabase,\s*orgId,\s*carrierId\)/.test(PRICING),
  true,
);
check(
  "a read-only lookup never mints an org_carriers row",
  /resolveOrgCarrierId/.test(PRICING),
  false,
);

// Both list functions answer the products question the same way, from one
// place. The drawer had this and Post a Deal did not, which is how the two
// screens came to disagree about what Transamerica sells.
for (const [name, src] of [
  ["post a deal", POSTDEAL_FN],
  ["pipeline", PIPELINE_FN],
] as const) {
  check(`${name} takes products from the shared grid module`, /gridProductsByCarrier\(/.test(src), true);
  check(
    `${name} has no second copy of the grouping`,
    /\.from\("commission_grids"\)/.test(src),
    false,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
