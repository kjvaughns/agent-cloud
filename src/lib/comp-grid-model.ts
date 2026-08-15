import type { GridRow } from "@/lib/comp-grid.functions";

/**
 * The comp-grid editor's model: products down the side, levels across the top,
 * age bands as first-class rows — pure, so `scripts/comp-grid-model-check.ts`
 * can hold it still.
 *
 * This replaces pivot logic that lived inside the matrix component, where two
 * of its decisions cost real money:
 *
 *   Cells were keyed on (product, level) alone, so a product whose rates
 *   differ by age — "Ages 18-59: 54%, Ages 60-80: 90%, Ages 81-85: 54%", an
 *   actual Ethos grid — collapsed to whichever row the extraction returned
 *   last. The 90% band vanished and a flat 54% survived, silently.
 *
 *   And `fromMatrix` hardcoded `age_group_min: null`, so even a band that made
 *   it in was destroyed by the first edit to any cell. The reader page renders
 *   age bands correctly; the data just never survived the editor.
 *
 * Age bands are part of a row's identity here: the product axis holds
 * `(product_name, age_group_min, age_group_max)` entries, and two rows
 * differing only by band are two rows.
 *
 * IDENTITY IS A UID, NOT A NAME.
 *
 * Every product row and level column carries a transient uid, and cells are
 * keyed on uids. Names are display data. This is what makes rename, re-band
 * and drag-reorder all trivial — none of them touches a cell key — where the
 * old component had to re-key every cell on every rename and could not
 * reorder at all. Uids never leave the editor; `fromMatrix` emits names.
 */

export type GridCell = {
  year_1_pct: number;
  years_2_5_pct: number | null;
  years_6_plus_pct: number | null;
  /** Came out of "Fill the rest" and has not been touched by a person. */
  is_estimated?: boolean;
};

export type ProductRow = {
  uid: string;
  product_name: string;
  age_group_min: number | null;
  age_group_max: number | null;
};

export type LevelCol = {
  uid: string;
  name: string;
};

export type MatrixState = {
  products: ProductRow[];
  levels: LevelCol[];
  /** `${productUid}\0${levelUid}` → the cell. */
  cells: Map<string, GridCell>;
};

export const BANDS = [
  { key: "year_1_pct", label: "Year 1" },
  { key: "years_2_5_pct", label: "Years 2–5" },
  { key: "years_6_plus_pct", label: "Years 6+" },
] as const;

export type BandKey = (typeof BANDS)[number]["key"];

const SEP = "\u0000";
export const cellKey = (productUid: string, levelUid: string) => `${productUid}${SEP}${levelUid}`;

let uidCounter = 0;
/** Editor-lifetime unique, never persisted — a counter is plenty. */
export function newUid(): string {
  return `u${++uidCounter}`;
}

/** The (name, band) identity used to match rows across uploads. */
const bandIdent = (name: string, min: number | null | undefined, max: number | null | undefined) =>
  `${name.trim().toLowerCase()}${SEP}${min ?? ""}${SEP}${max ?? ""}`;
const levelIdent = (name: string) => name.trim().toLowerCase();

/** "18–59", "60+", "to 80" — for chips and merge summaries. */
export function bandLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  return `to ${max}`;
}

/**
 * Not an empty matrix — a table with no rows has nowhere to type. Three levels
 * and three products, blank and ready. The level placeholders show the form
 * `agent_commission_levels.commission_level` actually uses, because that
 * string match is how Finances pays.
 */
export function starterMatrix(): MatrixState {
  return {
    products: [blankProduct(), blankProduct(), blankProduct()],
    levels: [{ uid: newUid(), name: "100%" }, { uid: newUid(), name: "90%" }, { uid: newUid(), name: "80%" }],
    cells: new Map(),
  };
}

function blankProduct(): ProductRow {
  return { uid: newUid(), product_name: "", age_group_min: null, age_group_max: null };
}

/** Flat rows in, preserving first-appearance order of products, bands and levels. */
export function toMatrix(rows: GridRow[]): MatrixState {
  if (rows.length === 0) return starterMatrix();

  const products: ProductRow[] = [];
  const levels: LevelCol[] = [];
  const productByIdent = new Map<string, ProductRow>();
  const levelByIdent = new Map<string, LevelCol>();
  const cells = new Map<string, GridCell>();

  for (const r of rows) {
    const pi = bandIdent(r.product_name, r.age_group_min, r.age_group_max);
    let p = productByIdent.get(pi);
    if (!p) {
      p = { uid: newUid(), product_name: r.product_name, age_group_min: r.age_group_min ?? null, age_group_max: r.age_group_max ?? null };
      productByIdent.set(pi, p);
      products.push(p);
    }
    const li = levelIdent(r.level_name);
    let l = levelByIdent.get(li);
    if (!l) {
      l = { uid: newUid(), name: r.level_name };
      levelByIdent.set(li, l);
      levels.push(l);
    }
    // No rate is an empty cell, not a zero one. A row that arrives with a
    // null or 0 first-year rate — a product not offered at that level, or a
    // column the extraction could not read — used to become a 0 cell, which
    // then came back out of `fromMatrix` as a row the review blocked on and
    // nobody could find on screen, because a blank cell is what it looks like.
    const y1 = r.year_1_pct;
    if (y1 == null || Number.isNaN(y1) || y1 === 0) continue;
    cells.set(cellKey(p.uid, l.uid), {
      year_1_pct: y1,
      years_2_5_pct: r.years_2_5_pct ?? null,
      years_6_plus_pct: r.years_6_plus_pct ?? null,
      ...(r.is_estimated ? { is_estimated: true } : {}),
    });
  }

  return { products, levels, cells };
}

/**
 * Flat rows out, with the authored order stamped on every row.
 *
 * Empty cells are dropped rather than written as zero — a product not offered
 * at a level is a real thing, and 0% would tell the calculator to pay nothing
 * rather than to look elsewhere. `sort_order` is the product row's position
 * and `level_sort` the level column's, which is all the reader needs to show
 * the grid the way it was arranged here.
 */
export function fromMatrix(m: MatrixState): GridRow[] {
  const out: GridRow[] = [];
  m.products.forEach((p, pi) => {
    if (!p.product_name.trim()) return;
    m.levels.forEach((l, li) => {
      if (!l.name.trim()) return;
      const c = m.cells.get(cellKey(p.uid, l.uid));
      // A blank cell and a 0 cell are the same statement: no rate here.
      if (!c || c.year_1_pct == null || Number.isNaN(c.year_1_pct) || c.year_1_pct === 0) return;

      out.push({
        product_name: p.product_name.trim(),
        level_name: l.name.trim(),
        year_1_pct: c.year_1_pct,
        years_2_5_pct: c.years_2_5_pct,
        years_6_plus_pct: c.years_6_plus_pct,
        age_group_min: p.age_group_min,
        age_group_max: p.age_group_max,
        sort_order: pi,
        level_sort: li,
        is_estimated: Boolean(c.is_estimated),
      });
    });
  });
  return out;
}

export type MergeSummary = {
  merged: MatrixState;
  addedProducts: number;
  addedLevels: string[];
  changedCells: number;
};

/**
 * A new upload lands on top of what is already in the editor.
 *
 * This is the fix for "uploading a different level replaced my current one":
 * the old page did `setRows(out.rows)` — wholesale replacement — so document
 * #2 discarded document #1 before the server was even involved. Union instead:
 * products and levels match by name (and band), incoming cells win where both
 * name the same tuple, and everything else stands. Blank starter rows and
 * blank levels are dropped from the result the moment real data arrives —
 * keeping three empty placeholder rows above a real grid helps nobody.
 */
export function mergeMatrix(current: MatrixState, incoming: MatrixState): MergeSummary {
  const isBlankState = current.products.every((p) => !p.product_name.trim()) && current.cells.size === 0;
  if (isBlankState) {
    return { merged: incoming, addedProducts: incoming.products.length, addedLevels: incoming.levels.map((l) => l.name), changedCells: incoming.cells.size };
  }

  const products = current.products.filter((p) => p.product_name.trim());
  const levels = current.levels.filter((l) => l.name.trim());
  const cells = new Map(current.cells);

  const productByIdent = new Map(products.map((p) => [bandIdent(p.product_name, p.age_group_min, p.age_group_max), p]));
  const levelByIdent = new Map(levels.map((l) => [levelIdent(l.name), l]));

  let addedProducts = 0;
  const addedLevels: string[] = [];
  let changedCells = 0;

  for (const ip of incoming.products) {
    if (!ip.product_name.trim()) continue;
    const ident = bandIdent(ip.product_name, ip.age_group_min, ip.age_group_max);
    if (!productByIdent.has(ident)) {
      const copy = { ...ip };
      productByIdent.set(ident, copy);
      products.push(copy);
      addedProducts++;
    }
  }
  for (const il of incoming.levels) {
    if (!il.name.trim()) continue;
    const ident = levelIdent(il.name);
    if (!levelByIdent.has(ident)) {
      const copy = { ...il };
      levelByIdent.set(ident, copy);
      levels.push(copy);
      addedLevels.push(il.name);
    }
  }

  for (const [key, cell] of incoming.cells) {
    const [pUid, lUid] = key.split(SEP);
    const ip = incoming.products.find((p) => p.uid === pUid);
    const il = incoming.levels.find((l) => l.uid === lUid);
    if (!ip || !il) continue;
    const p = productByIdent.get(bandIdent(ip.product_name, ip.age_group_min, ip.age_group_max));
    const l = levelByIdent.get(levelIdent(il.name));
    if (!p || !l) continue;
    const k = cellKey(p.uid, l.uid);
    const existing = cells.get(k);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(cell)) changedCells++;
    cells.set(k, cell);
  }

  return { merged: { products, levels, cells }, addedProducts, addedLevels, changedCells };
}

// ── Editing operations ──────────────────────────────────────────────────────
// All uid-keyed, so none of them touches a cell key.

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function moveProduct(m: MatrixState, from: number, to: number): MatrixState {
  if (from === to || from < 0 || to < 0 || from >= m.products.length || to >= m.products.length) return m;
  return { ...m, products: arrayMove(m.products, from, to) };
}

export function moveLevel(m: MatrixState, from: number, to: number): MatrixState {
  if (from === to || from < 0 || to < 0 || from >= m.levels.length || to >= m.levels.length) return m;
  return { ...m, levels: arrayMove(m.levels, from, to) };
}

export function renameProduct(m: MatrixState, uid: string, name: string): MatrixState {
  return { ...m, products: m.products.map((p) => (p.uid === uid ? { ...p, product_name: name } : p)) };
}

export function renameLevel(m: MatrixState, uid: string, name: string): MatrixState {
  return { ...m, levels: m.levels.map((l) => (l.uid === uid ? { ...l, name } : l)) };
}

export function setAgeBand(m: MatrixState, uid: string, min: number | null, max: number | null): MatrixState {
  return { ...m, products: m.products.map((p) => (p.uid === uid ? { ...p, age_group_min: min, age_group_max: max } : p)) };
}

export function addProduct(m: MatrixState): MatrixState {
  return { ...m, products: [...m.products, blankProduct()] };
}

export function addLevel(m: MatrixState): MatrixState {
  return { ...m, levels: [...m.levels, { uid: newUid(), name: "" }] };
}

/**
 * A second age band for a product, inserted directly beneath it.
 *
 * The band starts empty on purpose: the person splitting knows the carrier's
 * age breaks and the editor does not, and a guessed range would be saved
 * unnoticed far more often than corrected.
 */
export function splitByAge(m: MatrixState, uid: string): MatrixState {
  const i = m.products.findIndex((p) => p.uid === uid);
  if (i < 0) return m;
  const src = m.products[i];
  const twin: ProductRow = { uid: newUid(), product_name: src.product_name, age_group_min: null, age_group_max: null };
  const products = [...m.products];
  products.splice(i + 1, 0, twin);
  return { ...m, products };
}

export function removeProduct(m: MatrixState, uid: string): MatrixState {
  const cells = new Map(m.cells);
  for (const k of [...cells.keys()]) if (k.startsWith(uid + SEP)) cells.delete(k);
  return { ...m, products: m.products.filter((p) => p.uid !== uid), cells };
}

export function removeLevel(m: MatrixState, uid: string): MatrixState {
  const cells = new Map(m.cells);
  for (const k of [...cells.keys()]) if (k.endsWith(SEP + uid)) cells.delete(k);
  return { ...m, levels: m.levels.filter((l) => l.uid !== uid), cells };
}

/**
 * Set one band of one cell from raw input. Clearing Year 1 clears the cell —
 * there is no renewal without a sale. Any edit clears the estimated flag,
 * because at that point it is the person's number, not a guess.
 */
export function setCell(m: MatrixState, productUid: string, levelUid: string, band: BandKey, raw: string): MatrixState {
  const cells = new Map(m.cells);
  const k = cellKey(productUid, levelUid);
  const existing = cells.get(k) ?? { year_1_pct: 0, years_2_5_pct: null, years_6_plus_pct: null };

  if (raw.trim() === "") {
    if (band === "year_1_pct") cells.delete(k);
    else cells.set(k, { ...existing, [band]: null, is_estimated: false });
  } else {
    const n = Number(raw);
    if (Number.isNaN(n)) return m;
    cells.set(k, { ...existing, [band]: n, is_estimated: false });
  }
  return { ...m, cells };
}

/**
 * Fill the gaps from a row that is already complete.
 *
 * Carrier grids ladder: within a product the rate climbs level by level, and
 * every product climbs in nearly the same proportion. Take the most complete
 * row as the template, express it as ratios of its own highest level, apply
 * those ratios wherever another product has that same anchor level filled.
 * Deliberately arithmetic rather than a model — the relationship *is* a ratio.
 *
 * It is an estimate, not a derivation: checked against a real Transamerica
 * grid one product landed within 0.4 points and another was out by nearly 4.
 * So filled cells carry `is_estimated` and stay highlighted until touched.
 */
export function fillFromTemplate(m: MatrixState, band: BandKey): { next: MatrixState; filled: number; templateProduct: string | null } {
  const valueAt = (p: ProductRow, l: LevelCol) => {
    const v = m.cells.get(cellKey(p.uid, l.uid))?.[band];
    return typeof v === "number" ? v : null;
  };

  const levels = m.levels.filter((l) => l.name.trim());
  const products = m.products.filter((p) => p.product_name.trim());
  if (levels.length < 2 || products.length < 2) return { next: m, filled: 0, templateProduct: null };

  let template: ProductRow | null = null;
  let best = 0;
  for (const p of products) {
    const n = levels.filter((l) => valueAt(p, l) != null).length;
    if (n > best) { best = n; template = p; }
  }
  if (!template || best < 2) return { next: m, filled: 0, templateProduct: null };

  let anchor: LevelCol | null = null;
  let anchorValue = -Infinity;
  for (const l of levels) {
    const v = valueAt(template, l);
    if (v != null && v > anchorValue) { anchorValue = v; anchor = l; }
  }
  if (!anchor || anchorValue <= 0) return { next: m, filled: 0, templateProduct: null };

  const ratio = new Map<string, number>();
  for (const l of levels) {
    const v = valueAt(template, l);
    if (v != null) ratio.set(l.uid, v / anchorValue);
  }

  const cells = new Map(m.cells);
  let filled = 0;
  for (const p of products) {
    if (p.uid === template.uid) continue;
    const own = valueAt(p, anchor);
    if (own == null) continue; // No anchor of its own — nothing to scale from.
    for (const l of levels) {
      if (l.uid === anchor.uid || valueAt(p, l) != null) continue; // Never overwrite.
      const r = ratio.get(l.uid);
      if (r == null) continue;
      const k = cellKey(p.uid, l.uid);
      const existing = cells.get(k) ?? { year_1_pct: 0, years_2_5_pct: null, years_6_plus_pct: null };
      cells.set(k, { ...existing, [band]: Math.round(own * r * 10) / 10, is_estimated: true });
      filled++;
    }
  }

  return { next: { ...m, cells }, filled, templateProduct: template.product_name };
}
