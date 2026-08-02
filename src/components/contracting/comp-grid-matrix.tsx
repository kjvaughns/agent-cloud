import { useMemo, useState } from "react";
import type { GridRow } from "@/lib/comp-grid.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
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

export function CompGridMatrix({
  value,
  onChange,
}: {
  value: MatrixState;
  onChange: (next: MatrixState) => void;
}) {
  const [band, setBand] = useState<BandKey>("year_1_pct");

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
                          className="h-8 pr-5 text-right text-xs tnum"
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

      <Button
        type="button" size="sm" variant="outline"
        onClick={() => onChange({ ...value, products: [...value.products, ""] })}
      >
        <Plus className="mr-1 h-4 w-4" /> Add product
      </Button>

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
