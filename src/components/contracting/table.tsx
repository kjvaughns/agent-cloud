import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./shared";

/**
 * The contracting module's list primitive.
 *
 * Nine surfaces show the same shape — a filtered list of org-scoped records —
 * so the markup lives here once. Columns carry an explicit width class rather
 * than relying on table layout, because these lists become card stacks on a
 * phone and a `<table>` cannot do that without a second markup path.
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Tailwind width/flex class. Defaults to flex-1. */
  className?: string;
  /** Hide below large screens — for columns that are useful, not essential. */
  secondary?: boolean;
  render: (row: T) => React.ReactNode;
};

export function RecordTable<T extends { id: string }>({
  rows, columns, loading, empty, onRowClick, selectable, selected, onToggle,
}: {
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  empty: { title: string; body: string; action?: React.ReactNode };
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="p-4"><EmptyState {...empty} /></div>;
  }

  return (
    <>
      <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:flex">
        {selectable && <span className="w-5" />}
        {columns.map((c) => (
          <span key={c.key} className={cn(c.className ?? "flex-1", c.secondary && "hidden xl:block")}>
            {c.header}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-border-soft">
        {rows.map((row) => (
          <li
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 lg:flex-nowrap",
              onRowClick && "cursor-pointer transition-colors hover:bg-surface-2/40",
            )}
          >
            {selectable && (
              <input
                type="checkbox"
                aria-label="Select row"
                checked={selected?.has(row.id) ?? false}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggle?.(row.id)}
                className="h-4 w-4 shrink-0 accent-[var(--gold)]"
              />
            )}
            {columns.map((c) => (
              <span
                key={c.key}
                className={cn("min-w-0", c.className ?? "flex-1", c.secondary && "hidden xl:block")}
              >
                {c.render(row)}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Two-line cell: a primary value with a quieter second line beneath it. */
export function Stacked({ top, bottom }: { top: React.ReactNode; bottom?: React.ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm text-foreground">{top}</span>
      {bottom != null && (
        <span className="block truncate text-[11px] text-muted-foreground">{bottom}</span>
      )}
    </span>
  );
}

/** Generic status pill for the record surfaces. */
export function Pill({
  children, tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone === "neutral" && "bg-muted text-muted-foreground border-border",
        tone === "info" && "bg-primary/12 text-primary border-primary/30",
        tone === "warning" && "bg-warning/15 text-warning border-warning/30",
        tone === "success" && "bg-success/15 text-success border-success/30",
        tone === "danger" && "bg-destructive/15 text-destructive border-destructive/30",
      )}
    >
      {children}
    </span>
  );
}

/** Filter chips with a persistent "all" option. */
export function FilterChips<T extends string>({
  options, value, onChange, allLabel = "All",
}: {
  options: { value: T; label: string; count?: number }[];
  value: T | "";
  onChange: (v: T | "") => void;
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange("")}
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
          value === "" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === o.value ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.count != null && <span className="tnum ml-1 text-text-dim">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
