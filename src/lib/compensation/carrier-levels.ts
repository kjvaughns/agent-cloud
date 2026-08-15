/**
 * A carrier's own level names, wherever the agency happened to record them.
 *
 * ── The bug this fixes ──
 *
 * "Match carrier levels" on an agency position offers one dropdown per carrier
 * so an owner can say "our Training Agent is the carrier's Level 40". It built
 * that dropdown from `carrier_comp_levels` alone — a table an owner fills in by
 * hand, one row at a time, on a screen most never open. So the list was empty
 * for every carrier, the dropdown showed nothing but "Use position percentage"
 * and "Enter it manually…", and the suggestion button never appeared. The
 * feature looked broken because it was reading a table nobody writes to.
 *
 * Meanwhile the level names WERE in the database, on the carrier's uploaded
 * comp grid: `commission_grids.level_name` is exactly the carrier's vocabulary,
 * because a grid is keyed by it. An agency that uploads a Transamerica grid has
 * already told us Transamerica's levels; asking them to retype the names into a
 * second table is asking for the same fact twice.
 *
 * So this reads both, and neither is a copy of the other:
 *
 *   carrier_comp_levels   entered deliberately, one percentage per level,
 *                         carries advance and renewal terms
 *   commission_grids      extracted or uploaded, one level appearing across
 *                         many products and age bands at different rates
 *
 * ── A grid level has a range, not a number ──
 *
 * "Level 40" on a grid pays 100% on Final Expense and 85% on Term. There is no
 * single percentage to show, and inventing one — the first row, the highest,
 * the average — would be a number nobody chose, which is the thing this
 * codebase already banned once. So a grid-derived level carries `minPct` and
 * `maxPct`, the label says `100–115%` when they differ, and `pct` is null
 * rather than a guess.
 *
 * That matters at the point of saving: `agency_level_carrier_mappings.carrier_pct`
 * takes one number. A level whose rates vary by product saves the NAME and
 * leaves the percentage null, which is correct — the grid prices the deal from
 * the level name, and a flat number stored beside it would only ever be a stale
 * second opinion. `mappingFor` is where that decision lives, once.
 */

/** Where a level name came from. Shown, because the two mean different things. */
export type LevelSource = "comp_level" | "grid" | "both";

export type CarrierLevelOption = {
  /** Stable value for a select. Derived from the name, so it survives a refetch. */
  id: string;
  /** The carrier's own name for the level, in the carrier's own casing. */
  name: string;
  /**
   * The one percentage this level pays, or null when it varies by product.
   * Stored form: 80 means 80%.
   */
  pct: number | null;
  minPct: number | null;
  maxPct: number | null;
  source: LevelSource;
  /** How many distinct products on the grid publish a rate for this level. */
  productCount: number;
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Raw shapes, as the two tables come back from PostgREST. */
export type CompLevelRow = {
  id?: string;
  level_name?: string | null;
  commission_pct?: number | string | null;
  status?: string | null;
  sort_order?: number | null;
};
export type GridLevelRow = {
  level_name?: string | null;
  level_sort?: number | null;
  product_name?: string | null;
  year_1_pct?: number | string | null;
};

/**
 * Every level this carrier has a name for, best first.
 *
 * Deduped on the normalised name, because "Level 40" typed into comp levels and
 * "level 40" extracted from a grid are one level, and showing them twice is how
 * an owner picks the one that happens to be listed first.
 *
 * Ordered by percentage descending — a comp ladder reads top-down — with levels
 * that have no percentage after them, alphabetically, so a grid whose rates
 * failed to extract is still pickable rather than shuffled arbitrarily.
 */
export function carrierLevelOptions(carrier: {
  carrier_comp_levels?: CompLevelRow[] | null;
  carrier_grid_levels?: GridLevelRow[] | null;
}): CarrierLevelOption[] {
  const byKey = new Map<string, CarrierLevelOption & { products: Set<string> }>();

  const touch = (rawName: string, key: string) => {
    let o = byKey.get(key);
    if (!o) {
      o = {
        id: `lvl:${key}`,
        name: rawName,
        pct: null,
        minPct: null,
        maxPct: null,
        source: "grid",
        productCount: 0,
        products: new Set<string>(),
      };
      byKey.set(key, o);
    }
    return o;
  };

  // Comp levels first, so their casing is the one shown and their single
  // percentage is the authoritative one. An inactive level is history: offering
  // it would map a position onto terms the agency has retired.
  for (const l of carrier.carrier_comp_levels ?? []) {
    const name = String(l.level_name ?? "").trim();
    if (!name) continue;
    if (l.status && l.status !== "active") continue;
    const o = touch(name, norm(name));
    o.source = "comp_level";
    const pct = num(l.commission_pct);
    if (pct != null && Number.isFinite(pct)) {
      o.pct = pct;
      o.minPct = pct;
      o.maxPct = pct;
    }
  }

  for (const g of carrier.carrier_grid_levels ?? []) {
    const name = String(g.level_name ?? "").trim();
    if (!name) continue;
    const key = norm(name);
    const existed = byKey.has(key);
    const o = touch(name, key);
    o.source = existed && o.source === "comp_level" ? "both" : existed ? o.source : "grid";

    const product = String(g.product_name ?? "").trim();
    if (product) o.products.add(norm(product));

    const pct = num(g.year_1_pct);
    if (pct == null || !Number.isFinite(pct)) continue;
    // The range widens across every grid row carrying this level. A comp level
    // that already stated one figure keeps it as `pct` — the owner typed it on
    // purpose — while the range still records what the grid actually pays, so
    // the label can show both without either overwriting the other.
    o.minPct = o.minPct == null ? pct : Math.min(o.minPct, pct);
    o.maxPct = o.maxPct == null ? pct : Math.max(o.maxPct, pct);
  }

  return [...byKey.values()]
    .map(({ products, ...o }) => ({ ...o, productCount: products.size }))
    .sort((a, b) => {
      const ap = a.pct ?? a.maxPct;
      const bp = b.pct ?? b.maxPct;
      if (ap != null && bp != null && ap !== bp) return bp - ap;
      if (ap != null && bp == null) return -1;
      if (ap == null && bp != null) return 1;
      return a.name.localeCompare(b.name);
    });
}

/** "Level 40 — 100%", or "Level 40 — 85–100%" when the grid varies by product. */
export function levelLabel(o: CarrierLevelOption): string {
  if (o.pct != null) return `${o.name} — ${o.pct}%`;
  if (o.minPct != null && o.maxPct != null) {
    return o.minPct === o.maxPct
      ? `${o.name} — ${o.minPct}%`
      : `${o.name} — ${o.minPct}–${o.maxPct}%`;
  }
  return o.name;
}

/** "from the comp grid, 4 products" — why this name is on the list. */
export function levelOrigin(o: CarrierLevelOption): string {
  const products = o.productCount === 1 ? "1 product" : `${o.productCount} products`;
  if (o.source === "comp_level") return "carrier level";
  if (o.source === "both") return `carrier level, on the grid for ${products}`;
  return `from the comp grid, ${products}`;
}

/**
 * How far a level sits from a position's own percentage.
 *
 * A level that pays a range covers everything inside it, so a position at 90%
 * on a level paying 85–100% is a distance of zero — it is genuinely that level.
 * Outside the range it is the distance to the nearer edge. A level with no
 * percentage anywhere cannot be compared and returns null rather than sorting
 * as if it were zero.
 */
export function levelDistance(o: CarrierLevelOption, basePct: number): number | null {
  if (!Number.isFinite(basePct)) return null;
  const lo = o.pct ?? o.minPct;
  const hi = o.pct ?? o.maxPct;
  if (lo == null || hi == null) return null;
  if (basePct < lo) return lo - basePct;
  if (basePct > hi) return basePct - hi;
  return 0;
}

/**
 * The closest level to a position's percentage, or null when nothing compares.
 *
 * A suggestion, never an application: it renders as a line the owner clicks.
 * Carriers do not name their levels after agency positions, and a wrong guess
 * applied silently would change what every agent on that rung is paid.
 */
export function suggestLevel(
  options: CarrierLevelOption[],
  basePct: number,
): CarrierLevelOption | null {
  let best: CarrierLevelOption | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const d = levelDistance(o, basePct);
    if (d == null || d >= bestD) continue;
    best = o;
    bestD = d;
  }
  return best;
}

/**
 * What to store on `agency_level_carrier_mappings` for a chosen level.
 *
 * The name always. The percentage only when the level genuinely has one — a
 * level whose grid rates vary by product saves null, and the grid prices each
 * deal from the name. Writing a flat number there would silently outrank the
 * grid for every product except the one it came from.
 */
export function mappingFor(o: CarrierLevelOption): {
  carrier_level_name: string;
  carrier_pct: number | null;
} {
  const single =
    o.pct != null
      ? o.pct
      : o.minPct != null && o.minPct === o.maxPct
        ? o.minPct
        : null;
  return { carrier_level_name: o.name, carrier_pct: single };
}

/** Find the option a saved mapping refers to, matching the carrier's casing. */
export function findLevel(
  options: CarrierLevelOption[],
  levelName: string | null | undefined,
): CarrierLevelOption | null {
  if (!levelName) return null;
  const key = norm(levelName);
  return options.find((o) => norm(o.name) === key) ?? null;
}
