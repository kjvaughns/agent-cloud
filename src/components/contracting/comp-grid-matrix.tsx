import { useMemo, useState } from "react";
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GripVertical, Plus, SplitSquareVertical, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BANDS, type BandKey, type MatrixState, type ProductRow, type LevelCol,
  cellKey, setCell, renameProduct, renameLevel, setAgeBand, addProduct, addLevel,
  splitByAge, removeProduct, removeLevel, moveProduct, fillFromTemplate,
} from "@/lib/comp-grid-model";

export {
  starterMatrix, toMatrix, fromMatrix, mergeMatrix, type MatrixState,
} from "@/lib/comp-grid-model";

/**
 * A comp grid, shaped the way carriers publish them: products down the side,
 * levels across the top, one band (Year 1 / 2–5 / 6+) editable at a time.
 *
 * The pivot logic lives in `src/lib/comp-grid-model.ts` now — pure and
 * check-scripted — because the version that lived here lost data twice over:
 * cells keyed on (product, level) collapsed age-banded rates to whichever row
 * came last, and the un-pivot hardcoded the age band to null, so the first
 * edit to any cell erased every band. This file is only the rendering.
 *
 * What the model's uid-keyed identity buys the UI: product rows and level
 * columns drag to reorder (dnd-kit — vertical for rows, horizontal for
 * headers, the first horizontal use in the codebase) without a single cell
 * being re-keyed, and a rename is a field write rather than a map rebuild.
 */
export function CompGridMatrix({
  value,
  onChange,
  assignedLevels = [],
}: {
  value: MatrixState;
  onChange: (next: MatrixState) => void;
  /**
   * The level strings agents in this agency are actually contracted at. A
   * column heading matching none of them produces a grid the calculator can
   * never find — `commission_grids.level_name` joins
   * `agent_commission_levels.commission_level` as an exact string, and a miss
   * pays nothing, silently, months later. Warning here is the whole point.
   */
  assignedLevels?: string[];
}) {
  const [band, setBand] = useState<BandKey>("year_1_pct");

  const norm = (s: string) => s.trim().toLowerCase();
  const known = new Map(assignedLevels.map((l) => [norm(l), l]));
  const unmatched = value.levels
    .map((l) => l.name.trim())
    .filter((l) => l && !known.has(norm(l)));

  const canFill = useMemo(() => fillFromTemplate(value, band).filled > 0, [value, band]);

  const filled = useMemo(
    () => value.products.reduce(
      (n, p) => n + value.levels.filter((l) => value.cells.has(cellKey(p.uid, l.uid))).length,
      0,
    ),
    [value],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onProductDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = value.products.findIndex((p) => p.uid === active.id);
    const to = value.products.findIndex((p) => p.uid === over.id);
    onChange(moveProduct(value, from, to));
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
          {filled} rate{filled === 1 ? "" : "s"} across {value.products.length} row
          {value.products.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="p-2 text-left text-xs font-semibold text-muted-foreground min-w-[300px]">
                Product
              </th>
              {value.levels.map((lvl) => (
                <LevelHeader
                  key={lvl.uid}
                  level={lvl}
                  onRename={(name) => onChange(renameLevel(value, lvl.uid, name))}
                  onRemove={() => onChange(removeLevel(value, lvl.uid))}
                />
              ))}
              <th className="p-1.5 w-[110px]">
                <Button
                  type="button" size="sm" variant="ghost"
                  className="w-full text-xs"
                  onClick={() => onChange(addLevel(value))}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Level
                </Button>
              </th>
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProductDragEnd}>
            <SortableContext items={value.products.map((p) => p.uid)} strategy={verticalListSortingStrategy}>
              <tbody>
                {value.products.map((product) => (
                  <ProductTr
                    key={product.uid}
                    product={product}
                    value={value}
                    band={band}
                    onChange={onChange}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(addProduct(value))}>
          <Plus className="mr-1 h-4 w-4" /> Add product
        </Button>

        <Button
          type="button" size="sm" variant="outline"
          disabled={!canFill}
          onClick={() => {
            const { next, filled: n, templateProduct } = fillFromTemplate(value, band);
            if (!n) { toast.info("Nothing to fill — every product already has its rates."); return; }
            onChange(next);
            toast.success(
              `Estimated ${n} rate${n === 1 ? "" : "s"} from ${templateProduct}. Highlighted below — check them before saving.`,
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
            contract exactly — that string is how Finances knows what to pay them. Drag the
            grip on a row or column to put the grid in the carrier's order.
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

function LevelHeader({ level, onRename, onRemove }: {
  level: LevelCol;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  return (
    <th className="p-1.5 min-w-[120px]">
      <div className="flex items-center gap-1">
        <Input
          value={level.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="Level"
          className="h-8 text-xs font-semibold"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-text-dim hover:text-destructive"
          aria-label={`Remove level ${level.name || "column"}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </th>
  );
}

function ProductTr({ product, value, band, onChange }: {
  product: ProductRow;
  value: MatrixState;
  band: BandKey;
  onChange: (next: MatrixState) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.uid });

  const hasBand = product.age_group_min != null || product.age_group_max != null;
  // Age inputs render once a band exists or the row was split; a plain product
  // stays a single uncluttered input, which is most rows on most grids.
  const [showBand, setShowBand] = useState(hasBand);

  const bandInput = (field: "age_group_min" | "age_group_max", placeholder: string) => (
    <Input
      value={product[field] ?? ""}
      inputMode="numeric"
      placeholder={placeholder}
      aria-label={field === "age_group_min" ? "Minimum age" : "Maximum age"}
      onChange={(e) => {
        const raw = e.target.value.trim();
        const n = raw === "" ? null : Number(raw);
        if (n !== null && (Number.isNaN(n) || n < 0 || n > 120)) return;
        onChange(setAgeBand(
          value, product.uid,
          field === "age_group_min" ? n : product.age_group_min,
          field === "age_group_max" ? n : product.age_group_max,
        ));
      }}
      className="h-7 w-12 px-1 text-center text-[11px] tnum"
    />
  );

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn("border-t border-border-soft", isDragging && "relative z-10 bg-card opacity-80")}
    >
      <td className="p-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${product.product_name || "product"}`}
            className="shrink-0 cursor-grab touch-none text-text-dim hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <Input
            value={product.product_name}
            onChange={(e) => onChange(renameProduct(value, product.uid, e.target.value))}
            placeholder="Product name"
            title={product.product_name}
            className="h-8 min-w-[180px] text-xs"
          />
          {showBand && (
            <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
              {bandInput("age_group_min", "18")}
              –
              {bandInput("age_group_max", "80")}
            </span>
          )}
          {!showBand && (
            <button
              type="button"
              onClick={() => setShowBand(true)}
              title="Rates differ by age? Give this row an age range, then Split by age for the others."
              aria-label={`Add an age range to ${product.product_name || "this product"}`}
              className="shrink-0 text-text-dim hover:text-foreground"
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
            </button>
          )}
          {showBand && (
            <button
              type="button"
              onClick={() => onChange(splitByAge(value, product.uid))}
              title="Add another age band for this product"
              aria-label={`Add another age band for ${product.product_name || "this product"}`}
              className="shrink-0 text-text-dim hover:text-foreground"
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(removeProduct(value, product.uid))}
            className="shrink-0 text-text-dim hover:text-destructive"
            aria-label={`Remove ${product.product_name || "product row"}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      {value.levels.map((level) => {
        const cell = value.cells.get(cellKey(product.uid, level.uid));
        const v = cell ? cell[band] : null;
        return (
          <td key={level.uid} className="p-1.5">
            <div className="relative">
              <Input
                value={v ?? ""}
                onChange={(e) => onChange(setCell(value, product.uid, level.uid, band, e.target.value))}
                inputMode="decimal"
                placeholder="—"
                title={cell?.is_estimated ? "Estimated — check this" : undefined}
                className={cn(
                  "h-8 pr-5 text-right text-xs tnum",
                  cell?.is_estimated && "border-warning/60 bg-warning/[0.07] text-warning-foreground",
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
  );
}
