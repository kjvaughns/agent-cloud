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
  /**
   * The contract number the level's NAME states, when it states one.
   *
   * "RK1 (50)", "Level 50", "50%" all mean the fifty contract. This is not the
   * same number as `pct` and the difference matters: a grid rate is what a
   * product pays at that level, and final expense routinely pays well above
   * street — Transamerica's RK1 can be the 50 contract and still pay 65% on FE
   * Express. Matching an agency position on 50% against "65–80%" compares two
   * different things and picks the wrong rung.
   */
  contractPct: number | null;
  source: LevelSource;
  /** How many distinct products on the grid publish a rate for this level. */
  productCount: number;
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/**
 * The contract number written into a level's name, if there is one.
 *
 * Carriers name levels every way there is — "RK1 (50)", "Level 50", "50%",
 * "GA 80" — and an agency naming its columns "RK1 (50)" is telling us the thing
 * an agency position is actually comparable to. Reading it is what lets the
 * suggestion match a 50% position to the 50 contract instead of to whichever
 * column happens to pay closest to 50 on one product.
 *
 * Three patterns, most explicit first, and nothing else. Guessing is worse than
 * declining here: a wrong number silently maps a rung to the wrong contract,
 * and every agent on it is paid from that mapping.
 *
 *   "55%"        an explicit percent
 *   "RK1 (50)"   parenthesised
 *   "Level 50"   a standalone number token
 *
 * A number glued to letters is deliberately NOT read. "RK10" is the tenth code
 * in a series, not the ten contract, and reading it as 10 would map every
 * position to the wrong rung on exactly the grids this was written for.
 */
export function contractPctFromName(name: string): number | null {
  const s = String(name ?? "");
  const ok = (raw: string | undefined) => {
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 500 ? n : null;
  };
  return (
    ok(s.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]) ??
    ok(s.match(/\((\d+(?:\.\d+)?)\s*%?\)/)?.[1]) ??
    ok(s.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=$|\s)/)?.[1])
  );
}

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
        contractPct: contractPctFromName(rawName),
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
      // Ordered by the same number the matching compares, so the list an owner
      // reads top-down agrees with the suggestion underneath it.
      const ap = a.contractPct ?? a.pct ?? a.maxPct;
      const bp = b.contractPct ?? b.pct ?? b.maxPct;
      if (ap != null && bp != null && ap !== bp) return bp - ap;
      if (ap != null && bp == null) return -1;
      if (ap == null && bp != null) return 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * "RK1 (50) — pays 65–80%".
 *
 * "pays" rather than a bare percentage because two different numbers can appear
 * in one label: the contract the name states, and what its products actually
 * pay. `RK1 (50) — 65–80%` invites the reading that something is inconsistent;
 * `RK1 (50) — pays 65–80%` says plainly that they are different facts.
 */
export function levelLabel(o: CarrierLevelOption): string {
  if (o.pct != null) return `${o.name} — pays ${o.pct}%`;
  if (o.minPct != null && o.maxPct != null) {
    return o.minPct === o.maxPct
      ? `${o.name} — pays ${o.minPct}%`
      : `${o.name} — pays ${o.minPct}–${o.maxPct}%`;
  }
  return o.name;
}

/** "the 50 contract · from the comp grid, 4 products" — why this name is here. */
export function levelOrigin(o: CarrierLevelOption): string {
  const products = o.productCount === 1 ? "1 product" : `${o.productCount} products`;
  const where =
    o.source === "comp_level" ? "carrier level"
      : o.source === "both" ? `carrier level, on the grid for ${products}`
      : `from the comp grid, ${products}`;
  // Named when the level's own name states it, so an owner can see WHY this
  // rung was suggested rather than being handed a match to take on trust.
  return o.contractPct != null ? `the ${o.contractPct} contract · ${where}` : where;
}

/**
 * How far a level sits from a position's own percentage.
 *
 * ── Which number is being compared ──
 *
 * The contract number in the name wins whenever the name states one. An agency
 * position is a contract percentage, and so is "RK1 (50)" — those are the same
 * kind of thing. A grid rate is not: it is what one product pays at that level,
 * and final expense routinely pays above street, so RK1 can be the 50 contract
 * and still show 65–80% across its products. Comparing 50 against 65–80 puts
 * the position on the wrong rung, and every agent on it is then paid from that
 * mapping. Only when the name says nothing do the rates get used, because a
 * rough comparison beats none.
 *
 * A level that pays a range covers everything inside it, so a position at 90%
 * against a level paying 85–100% is a distance of zero — it is genuinely that
 * level. Outside the range it is the distance to the nearer edge. A level with
 * no number of any kind cannot be compared and returns null rather than sorting
 * as if it were zero.
 */
export function levelDistance(o: CarrierLevelOption, basePct: number): number | null {
  if (!Number.isFinite(basePct)) return null;
  if (o.contractPct != null) return Math.abs(o.contractPct - basePct);
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
 *
 * `contractPct` is deliberately NOT used here even though it is a number and
 * this field wants one. "RK1 (50)" names the contract; what the carrier pays on
 * it is 65% on FE Express. Storing 50 would make every deal that misses the
 * grid pay 50% on a product the carrier settles at 65 — an underpayment with a
 * plausible-looking number behind it, which is the hardest kind to notice.
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

/**
 * How far off a level may be before auto-detect refuses it.
 *
 * A suggestion an owner clicks may be loose — they can see it and judge it. An
 * automatic pass across every carrier cannot: mapping a 60% position onto a
 * carrier whose nearest rung is the 90 contract silently changes what everyone
 * on that position is paid. So bulk detection only accepts a rung within this
 * many points of the position, and everything else stays on the position
 * percentage until the agency adds the level.
 */
export const AUTO_MATCH_TOLERANCE_PCT = 2.5;

/**
 * The level to apply automatically, or null to keep the position percentage.
 *
 * Deliberately stricter than `suggestLevel`: nearest-of-whatever-exists is a
 * fine hint but a bad decision. A carrier that simply does not publish this
 * rung must fall back to the position percentage, not be handed the closest
 * unrelated contract.
 */
export function autoMatchLevel(
  options: CarrierLevelOption[],
  basePct: number,
  tolerance: number = AUTO_MATCH_TOLERANCE_PCT,
): CarrierLevelOption | null {
  const best = suggestLevel(options, basePct);
  if (!best) return null;
  const d = levelDistance(best, basePct);
  return d != null && d <= tolerance ? best : null;
}
