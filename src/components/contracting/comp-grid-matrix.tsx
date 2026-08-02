import { useMemo, useState } from "react";
import type { GridRow } from "@/lib/comp-grid.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * A comp grid, shaped the way carriers publish them.
 *
 * The table stores one row per product *and* level, which is the right shape
 * for the calculator — it looks up exactly one (carrier, product, level) —
 * and the wrong shape for a person. Nobody reads a comp grid as a list of
 * eighteen rows; they read it as products down the side and levels across the
 * top, which is how it arrives from the carrier in the first place.
 *
 * So this is a pivot, not a schema change. What goes back out is the same
 * flat rows.
 *
 * The one thing a carrier's printed grid does not have is the year bands: the
 * table carries three percentages per cell (first year, years 2–5, years 6+).
 * Nine columns of three-way input would be unreadable, so the bands are a
 * switch above the grid and you edit one at a time.
 */

const BANDS = [
  { key: "year_1_pct", label: "Year 1" },
  { key: "years_2_5_pct", label: "Years 2–5" },
  { key: "years_6_plus_pct", label: "Years 6+" },
] as const;

type BandKey = (typeof BANDS)[number]["key"];

/**
 * Row identity.
 *
 * Separated on NUL rather than a space: every real product name contains
 * spaces ("Term Life", "Final Expense"), so a space would make the split
 * ambiguous and renaming a level would move the wrong cells.
 */
const SEP = "\u0000";
const keyOf = (product: string, level: string) => `${product}${SEP}${level}`;

export type MatrixState = {
  products: string[];
  levels: string[];
  /** `${product}\0${level}` → the three percentages. */
  cells: Map<string, { year_1_pct: number; years_2_5_pct: number | null; years_6_plus_pct: number | null }>;
};

/**
 * What an empty grid starts as.
 *
 * Not an empty matrix. A table with no columns and no rows has nowhere to
 * type — the first version of this shipped that way and the only way in was
 * to find a plus icon in a table header, which is not a thing anyone should
 * have to find. Three levels and three products, blank and ready.
 *
 * The level names are the agent's contract level, and they have to match
 * `agent_commission_levels.commission_level` exactly for Finances to pay on
 * them — so the placeholders show the form people actually use.
 */
export function starterMatrix(): MatrixState {
  return {
    products: ["", "", ""],
    levels: ["100%", "90%", "80%"],
    cells: new Map(),
  };
}

/** Flat rows in. Preserves the order each product and level first appears. */
export function toMatrix(rows: GridRow[]): MatrixState {
  if (rows.length === 0) return starterMatrix();
  const products: string[] = [];
  const levels: string[] = [];
  const cells = new Map<string, any>();
  for (const r of rows) {
    if (!products.includes(r.product_name)) products.push(r.product_name);
    if (!levels.includes(r.level_name)) levels.push(r.level_name);
    cells.set(keyOf(r.product_name, r.level_name), {
      year_1_pct: r.year_1_pct ?? 0,
      years_2_5_pct: r.years_2_5_pct ?? null,
      years_6_plus_pct: r.years_6_plus_pct ?? null,
    });
  }
  return { products, levels, cells };
}

/**
 * Flat rows out.
 *
 * Empty cells are dropped rather than written as zero. A grid where a product
 * is not offered at a level is a real thing, and saving 0% would tell the
 * calculator to pay nothing rather than to look elsewhere.
 */
export function fromMatrix(m: MatrixState): GridRow[] {
  const out: GridRow[] = [];
  for (const product of m.products) {
    if (!product.trim()) continue;
    for (const level of m.levels) {
      if (!level.trim()) continue;
      const c = m.cells.get(keyOf(product, level));
      if (!c || c.year_1_pct == null) continue;
      out.push({
        product_name: product.trim(),
        level_name: level.trim(),
        year_1_pct: c.year_1_pct,
        years_2_5_pct: c.years_2_5_pct,
        years_6_plus_pct: c.years_6_plus_pct,
        age_group_min: null,
        age_group_max: null,
      });
    }
  }
  return out;
}

/**
 * Fill the gaps from a row that is already complete.
 *
 * Carrier grids ladder: within a product the rate climbs level by level, and
 * every product climbs in nearly the same proportion. On a real Transamerica
 * grid the ratios to each product's top level came out at 0.76 / 0.82 / 0.91
 * for one product and 0.77 / 0.82 / 0.87 for the next — close enough that the
 * shape of one finished row predicts the rest.
 *
 * So: take the most complete row as the template, express it as ratios of its
 * own highest level, and apply those ratios to whatever each other product has
 * at that same highest level. A product with nothing at the top level is left
 * alone — there is nothing to scale from, and inventing an anchor would be
 * inventing the number.
 *
 * Deliberately arithmetic rather than a model. The relationship *is* a ratio,
 * so a model would be slower, cost money, and occasionally disagree with the
 * carrier's own maths.
 *
 * It is an estimate, not a derivation, and the error is worth knowing:
 * checked against a real Transamerica grid, one product came back within 0.4
 * points of the carrier's own numbers and another was out by nearly 4,
 * because its ladder is shallower than the template's. So filled cells are
 * marked in the table until they are touched, and nothing is written until
 * Save.
 */
export function fillFromTemplate(
  m: MatrixState,
  band: BandKey,
): { next: MatrixState; filled: number; templateProduct: string | null; keys: string[] } {
  const valueAt = (p: string, l: string) => {
    const c = m.cells.get(keyOf(p, l));
    const v = c?.[band];
    return typeof v === "number" ? v : null;
  };

  const levels = m.levels.filter((l) => l.trim());
  const products = m.products.filter((p) => p.trim());
  if (levels.length < 2 || products.length < 2) {
    return { next: m, filled: 0, templateProduct: null, keys: [] };
  }

  // The template is the row with the most rates filled in; ties go to the
  // first, which is the one somebody just typed.
  let template: string | null = null;
  let best = 0;
  for (const p of products) {
    const n = levels.filter((l) => valueAt(p, l) != null).length;
    if (n > best) { best = n; template = p; }
  }
  if (!template || best < 2) return { next: m, filled: 0, templateProduct: null, keys: [] };

  // The main level: where the template row pays most.
  let anchor: string | null = null;
  let anchorValue = -Infinity;
  for (const l of levels) {
    const v = valueAt(template, l);
    if (v != null && v > anchorValue) { anchorValue = v; anchor = l; }
  }
  if (!anchor || anchorValue <= 0) return { next: m, filled: 0, templateProduct: null, keys: [] };

  const ratio = new Map<string, number>();
  for (const l of levels) {
    const v = valueAt(template, l);
    if (v != null) ratio.set(l, v / anchorValue);
  }

  const cells = new Map(m.cells);
  const keys: string[] = [];
  let filled = 0;
  for (const p of products) {
    if (p === template) continue;
    const own = valueAt(p, anchor);
    if (own == null) continue; // No anchor of its own — nothing to scale.
    for (const l of levels) {
      if (l === anchor || valueAt(p, l) != null) continue; // Never overwrite.
      const r = ratio.get(l);
      if (r == null) continue;
      const k = keyOf(p, l);
      const existing = cells.get(k) ?? { year_1_pct: 0, years_2_5_pct: null, years_6_plus_pct: null };
      cells.set(k, { ...existing, [band]: Math.round(own * r * 10) / 10 });
      keys.push(k);
      filled++;
    }
  }

  return { next: { ...m, cells }, filled, templateProduct: template, keys };
}

export function CompGridMatrix({
  value,
  onChange,
  assignedLevels = [],
}: {
  value: MatrixState;
  onChange: (next: MatrixState) => void;
  /**
   * The level strings agents in this agency are actually contracted at.
   *
   * A column heading that matches none of them produces a grid the
   * calculator can never find: it joins `commission_grids.level_name` to
   * `agent_commission_levels.commission_level` as an exact string, and a miss
   * returns no row at all — so the agent is paid nothing, silently, months
   * later, and nothing points back here. Warning is the whole point of
   * knowing this.
   */
  assignedLevels?: string[];
}) {
  const [band, setBand] = useState<BandKey>("year_1_pct");
  // Cells the fill guessed. Cleared per-cell the moment somebody edits one,
  // because at that point it is their number, not an estimate.
  const [estimated, setEstimated] = useState<Set<string>>(new Set());

  // Case- and space-insensitive, because "GA " and "ga" are somebody's typo
  // rather than somebody's intent. The database comparison is stricter than
  // this, so anything flagged here is definitely wrong; something unflagged
  // could still differ by case, which is why the hint names the exact string.
  const norm = (s: string) => s.trim().toLowerCase();
  const known = new Map(assignedLevels.map((l) => [norm(l), l]));
  const unmatched = value.levels
    .map((l) => l.trim())
    .filter((l) => l && !known.has(norm(l)));

  // Only offer the fill when it would actually do something.
  const canFill = useMemo(() => fillFromTemplate(value, band).filled > 0, [value, band]);

  const filled = useMemo(
    () => value.products.reduce(
      (n, p) => n + value.levels.filter((l) => value.cells.has(keyOf(p, l))).length,
      0,
    ),
    [value],
  );

  function setCell(product: string, level: string, raw: string) {
    const cells = new Map(value.cells);
    const k = keyOf(product, level);
    const existing = cells.get(k) ?? { year_1_pct: 0, years_2_5_pct: null, years_6_plus_pct: null };
    if (raw.trim() === "") {
      // Clearing Year 1 clears the cell — there is no renewal without a sale.
      if (band === "year_1_pct") cells.delete(k);
      else cells.set(k, { ...existing, [band]: null });
    } else {
      const n = Number(raw);
      if (Number.isNaN(n)) return;
      cells.set(k, { ...existing, [band]: n });
    }
    setEstimated((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev); next.delete(k); return next;
    });
    onChange({ ...value, cells });
  }

  /** Renaming has to carry the cells with it, or the row silently empties. */
  function renameAxis(axis: "products" | "levels", index: number, next: string) {
    const prev = value[axis][index];
    const list = [...value[axis]];
    list[index] = next;
    const cells = new Map<string, any>();
    for (const [k, v] of value.cells) {
      const [p, l] = k.split(SEP);
      const np = axis === "products" && p === prev ? next : p;
      const nl = axis === "levels" && l === prev ? next : l;
      cells.set(keyOf(np, nl), v);
    }
    onChange({ ...value, [axis]: list, cells });
  }

  function removeAxis(axis: "products" | "levels", index: number) {
    const gone = value[axis][index];
    const list = value[axis].filter((_, i) => i !== index);
    const cells = new Map(value.cells);
    for (const k of [...cells.keys()]) {
      const [p, l] = k.split(SEP);
      if ((axis === "products" ? p : l) === gone) cells.delete(k);
    }
    onChange({ ...value, [axis]: list, cells });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {BANDS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBand(b.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                band === b.key
                  ? "border-primary/40 bg-gold-glow text-gold-bright"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground tnum">
          {filled} rate{filled === 1 ? "" : "s"} across {value.products.length} product
          {value.products.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="p-2 text-left text-xs font-semibold text-muted-foreground min-w-[180px]">
                Product
              </th>
              {value.levels.map((lvl, i) => (
                <th key={i} className="p-1.5 min-w-[110px]">
                  <div className="flex items-center gap-1">
                    <Input
                      value={lvl}
                      onChange={(e) => renameAxis("levels", i, e.target.value)}
                      placeholder="Level"
                      className="h-8 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => removeAxis("levels", i)}
                      className="shrink-0 text-text-dim hover:text-destructive"
                      aria-label={`Remove level ${lvl || i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-1.5 w-[120px]">
                <Button
                  type="button" size="sm" variant="ghost"
                  className="w-full text-xs"
                  onClick={() => onChange({ ...value, levels: [...value.levels, ""] })}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Level
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {value.products.map((product, pi) => (
              <tr key={pi} className="border-t border-border-soft">
                <td className="p-1.5">
                  <div className="flex items-center gap-1">
                    <Input
                      value={product}
                      onChange={(e) => renameAxis("products", pi, e.target.value)}
                      placeholder="Product name"
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeAxis("products", pi)}
                      className="shrink-0 text-text-dim hover:text-destructive"
                      aria-label={`Remove product ${product || pi + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                {value.levels.map((level, li) => {
                  const cell = value.cells.get(keyOf(product, level));
                  const v = cell ? cell[band] : null;
                  return (
                    <td key={li} className="p-1.5">
                      <div className="relative">
                        <Input
                          value={v ?? ""}
                          onChange={(e) => setCell(product, level, e.target.value)}
                          inputMode="decimal"
                          placeholder="—"
                          title={estimated.has(keyOf(product, level)) ? "Estimated — check this" : undefined}
                          className={cn(
                            "h-8 pr-5 text-right text-xs tnum",
                            estimated.has(keyOf(product, level)) &&
                              "border-warning/60 bg-warning/[0.07] text-warning-foreground",
                          )}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-dim">
                          %
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button" size="sm" variant="outline"
          onClick={() => onChange({ ...value, products: [...value.products, ""] })}
        >
          <Plus className="mr-1 h-4 w-4" /> Add product
        </Button>

        <Button
          type="button" size="sm" variant="outline"
          disabled={!canFill}
          onClick={() => {
            const { next, filled, templateProduct, keys } = fillFromTemplate(value, band);
            if (!filled) { toast.info("Nothing to fill — every product already has its rates."); return; }
            setEstimated((prev) => new Set([...prev, ...keys]));
            onChange(next);
            toast.success(
              `Estimated ${filled} rate${filled === 1 ? "" : "s"} from ${templateProduct}. Highlighted below — check them before saving.`,
            );
          }}
        >
          <Wand2 className="mr-1 h-4 w-4" /> Fill the rest
        </Button>
      </div>

      {unmatched.length > 0 && assignedLevels.length > 0 && (
        <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/[0.07] p-3">
          <p className="text-xs font-semibold text-foreground">
            {unmatched.length === 1
              ? `No agent is contracted at "${unmatched[0]}".`
              : `No agent is contracted at ${unmatched.map((l) => `"${l}"`).join(", ")}.`}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            These rates will save, but nothing will pay on them — a level is matched to a
            contract by its exact text. Levels in use here:{" "}
            <span className="font-medium text-foreground">{assignedLevels.join(", ")}</span>.
          </p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {band === "year_1_pct" ? (
          <>
            Column headings are contract levels and must match the level on the agent's
            contract exactly — that string is how Finances knows what to pay them.
          </>
        ) : (
          <>
            Renewal rates. A blank cell means this carrier pays no renewal at that level —
            leave it empty rather than entering 0.
          </>
        )}
      </p>
    </div>
  );
}
