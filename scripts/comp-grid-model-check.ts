/**
 * The comp-grid editor's model: age bands that survive, uploads that add up,
 * order that persists.
 *
 *   npx tsx scripts/comp-grid-model-check.ts
 *
 * The pure half exercises `src/lib/comp-grid-model.ts` against the shape that
 * started all this: a real Ethos grid where TruStage Advantage Whole Life pays
 * 54% at ages 18-59, 90% at 60-80 and 54% at 81-85. The old pivot keyed cells
 * on (product, level) alone, so those three rows collapsed to one — the 90%
 * band vanished and a flat 54% saved. A silently wrong commission rate is the
 * most expensive kind of bug this product can have, so that exact document is
 * the fixture.
 *
 * The wiring half is string assertions — proof of connection, not behaviour —
 * which matters here because both halves of the "second upload replaced my
 * grid" bug were wiring: a `setRows(out.rows)` that discarded the editor, and
 * a save that defaulted to clearing the carrier.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  toMatrix, fromMatrix, mergeMatrix, moveProduct, moveLevel, setCell,
  renameLevel, setAgeBand, splitByAge, removeLevel, fillFromTemplate, bandLabel,
  cellKey,
} from "../src/lib/comp-grid-model";
import type { GridRow } from "../src/lib/comp-grid.functions";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const row = (over: Partial<GridRow>): GridRow => ({
  product_name: "P", level_name: "Advanced", year_1_pct: 85,
  years_2_5_pct: null, years_6_plus_pct: null,
  age_group_min: null, age_group_max: null, ...over,
});

// ── The Ethos regression, verbatim ──────────────────────────────────────────

const ETHOS: GridRow[] = [
  row({ product_name: "TruStage Advantage WL", year_1_pct: 54, age_group_min: 18, age_group_max: 59 }),
  row({ product_name: "TruStage Advantage WL", year_1_pct: 90, age_group_min: 60, age_group_max: 80 }),
  row({ product_name: "TruStage Advantage WL", year_1_pct: 54, age_group_min: 81, age_group_max: 85 }),
  row({ product_name: "Ethos Term Life Prime", year_1_pct: 85 }),
];

{
  const m = toMatrix(ETHOS);
  check("three age bands are three rows, not one", m.products.length, 4);
  const back = fromMatrix(m);
  check("the round trip loses nothing", back.length, 4);
  check("the 60-80 band keeps its 90%",
    back.find((r) => r.age_group_min === 60)?.year_1_pct, 90);
  check("bands survive an edit to an unrelated cell",
    fromMatrix(setCell(m, m.products[3].uid, m.levels[0].uid, "year_1_pct", "86"))
      .filter((r) => r.age_group_min != null).length, 3);
  // The old fromMatrix hardcoded age_group_min: null. This is the assertion
  // that hardcoding cannot come back.
  check("no band is nulled on the way out",
    back.filter((r) => r.product_name.includes("TruStage")).every((r) => r.age_group_min != null), true);
}

// ── Merge: the second document adds, never replaces ─────────────────────────

console.log("");

const LEVEL_A: GridRow[] = [
  row({ product_name: "Term", level_name: "Advanced", year_1_pct: 85 }),
  row({ product_name: "IUL", level_name: "Advanced", year_1_pct: 80 }),
];
const LEVEL_B: GridRow[] = [
  row({ product_name: "Term", level_name: "110", year_1_pct: 110 }),
  row({ product_name: "IUL", level_name: "110", year_1_pct: 105 }),
];

{
  const { merged, addedLevels, addedProducts } = mergeMatrix(toMatrix(LEVEL_A), toMatrix(LEVEL_B));
  const out = fromMatrix(merged);
  check("uploading level B keeps level A", out.filter((r) => r.level_name === "Advanced").length, 2);
  check("and adds level B", out.filter((r) => r.level_name === "110").length, 2);
  check("the summary names the new level", addedLevels, ["110"]);
  check("shared products are matched, not duplicated", addedProducts, 0);
  check("no product row doubled", merged.products.length, 2);
}

{
  // Same tuple in both: the fresh upload wins — it is the document in hand.
  const older = toMatrix([row({ product_name: "Term", year_1_pct: 80 })]);
  const newer = toMatrix([row({ product_name: "Term", year_1_pct: 85 })]);
  const out = fromMatrix(mergeMatrix(older, newer).merged);
  check("a re-upload of the same cell takes the new number", out[0].year_1_pct, 85);
}

{
  // Merging into the blank starter must not keep three empty placeholder rows.
  const { merged } = mergeMatrix(toMatrix([]), toMatrix(LEVEL_A));
  check("starter placeholders vanish when real data arrives",
    merged.products.every((p) => p.product_name.trim() !== ""), true);
}

{
  // Bands are identity in a merge too: the same product at a different band
  // is a new row, not a conflict.
  const flat = toMatrix([row({ product_name: "WL", year_1_pct: 54 })]);
  const banded = toMatrix([row({ product_name: "WL", year_1_pct: 90, age_group_min: 60, age_group_max: 80 })]);
  const out = fromMatrix(mergeMatrix(flat, banded).merged);
  check("a banded row lands beside the flat row", out.length, 2);
}

// ── Order ───────────────────────────────────────────────────────────────────

console.log("");

{
  const m = toMatrix(ETHOS);
  const moved = moveProduct(m, 3, 0);
  check("a dragged product row moves", moved.products[0].product_name, "Ethos Term Life Prime");
  const out = fromMatrix(moved);
  check("sort_order records the new arrangement",
    out.find((r) => r.product_name === "Ethos Term Life Prime")?.sort_order, 0);
  check("moves out of range are ignored", moveProduct(m, 0, 99), m);
}

{
  const m = toMatrix(LEVEL_A.concat(LEVEL_B));
  const moved = moveLevel(m, 1, 0);
  check("a dragged level column moves", moved.levels[0].name, "110");
  check("level_sort records the column order",
    fromMatrix(moved).find((r) => r.level_name === "110")?.level_sort, 0);
  // The uid-keyed cells are the reason reordering cannot lose data.
  check("no cell is lost in a column move", fromMatrix(moved).length, 4);
}

// ── Editing operations ──────────────────────────────────────────────────────

console.log("");

{
  const m = toMatrix(LEVEL_A);
  const renamed = renameLevel(m, m.levels[0].uid, "Advanced 85");
  check("renaming a level carries its cells", fromMatrix(renamed).length, 2);
  check("…under the new name", fromMatrix(renamed)[0].level_name, "Advanced 85");

  const banded = setAgeBand(m, m.products[0].uid, 18, 59);
  check("setting a band re-keys nothing", fromMatrix(banded).length, 2);
  check("…and the band lands on the row", fromMatrix(banded)[0].age_group_min, 18);

  const split = splitByAge(m, m.products[0].uid);
  check("split-by-age inserts the twin directly beneath", split.products[1].product_name, "Term");
  check("the twin starts with no band to guess", split.products[1].age_group_min, null);

  const gone = removeLevel(m, m.levels[0].uid);
  check("removing a level removes its cells", fromMatrix(gone).length, 0);
}

{
  // Clearing Year 1 deletes the cell; estimates die on human touch.
  const m = toMatrix(LEVEL_A);
  const { next, filled } = fillFromTemplate(
    { ...m, levels: [...m.levels, { uid: "L2", name: "GA" }],
      cells: new Map(m.cells).set(cellKey(m.products[0].uid, "L2"), { year_1_pct: 70, years_2_5_pct: null, years_6_plus_pct: null }) },
    "year_1_pct",
  );
  check("fill estimates the missing cell", filled, 1);
  const estKey = cellKey(next.products[1].uid, "L2");
  check("…marked as an estimate", next.cells.get(estKey)?.is_estimated, true);
  check("…which save now carries", fromMatrix(next).find((r) => r.product_name === "IUL" && r.level_name === "GA")?.is_estimated, true);
  const touched = setCell(next, next.products[1].uid, "L2", "year_1_pct", "66");
  check("touching an estimate makes it a fact", touched.cells.get(estKey)?.is_estimated, false);

  const cleared = setCell(m, m.products[0].uid, m.levels[0].uid, "year_1_pct", "");
  check("clearing year 1 clears the cell", fromMatrix(cleared).length, 1);
}

check("band labels read like a person wrote them",
  [bandLabel(18, 59), bandLabel(60, null), bandLabel(null, 80), bandLabel(null, null)],
  ["18–59", "60+", "to 80", null]);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = readFileSync(join(ROOT, "src/components/contracting/manage-grids.tsx"), "utf8");
const MATRIX = readFileSync(join(ROOT, "src/components/contracting/comp-grid-matrix.tsx"), "utf8");
const MODEL = readFileSync(join(ROOT, "src/lib/comp-grid-model.ts"), "utf8");
const FNS = readFileSync(join(ROOT, "src/lib/comp-grid.functions.ts"), "utf8");
const READER = readFileSync(join(ROOT, "src/routes/_authenticated/contracting/commission-grids.tsx"), "utf8");

// Multi-file.
check("the file input accepts several files", /multiple\s*\n?\s*accept=/.test(PAGE) || /multiple\b/.test(strip(PAGE).match(/<input[\s\S]{0,400}?\/>/)?.[0] ?? ""), true);
check("uploads pool into one extraction call", /const images: string\[\] = \[\]/.test(PAGE) && /for \(const file of files\)/.test(PAGE), true);

// The two halves of "a second upload replaced my grid".
check("an upload merges into the editor", /mergeMatrix\(matrix, toMatrix\(out\.rows\)\)/.test(PAGE), true);
check("bare state replacement is gone", /setRows\(out\.rows\)/.test(strip(PAGE)), false);
check("picking a carrier loads its existing grid", /function selectCarrier/.test(PAGE) && /selectCarrier\(v\)/.test(PAGE), true);
check("save declares its mode instead of leaning on the default", /mode: "replace"/.test(PAGE), true);

// The latent server half: merge deletes per (level, products), never
// product-wide across levels.
check("merge scopes its delete to the level it rewrites",
  /\.eq\("level_name", level\)\s*\n\s*\.in\("product_name"/.test(FNS), true);
check("save tolerates the order columns not existing yet",
  /PGRST204/.test(FNS) && /dropPending/.test(FNS), true);
check("estimates are saved as estimates", /is_estimated: r\.is_estimated \?\? false/.test(FNS), true);

// Age bands.
check("the model keys rows on (product, band)", /bandIdent/.test(MODEL), true);
check("the age-null hardcoding cannot return",
  /age_group_min: null,\s*\n\s*age_group_max: null,\s*\n\s*\}\);/.test(strip(MODEL)), false);
check("the extraction prompt forbids flattening age bands",
  /one row PER age range/.test(FNS), true);
check("extraction output can no longer be truncated at 4000 tokens", /maxTokens: 4000/.test(strip(FNS)), false);

// Reordering.
check("product rows are sortable", /verticalListSortingStrategy/.test(MATRIX), true);
check("level columns are sortable", /horizontalListSortingStrategy/.test(MATRIX), true);
check("the reader honours authored row order", /r\.sort_order/.test(READER), true);
check("the reader honours authored column order", /level_sort/.test(READER), true);
check("the editor list is no longer heap-ordered", /entry\.rows\.sort/.test(FNS), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
