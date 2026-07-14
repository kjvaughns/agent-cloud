import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Premium metric block: micro label → display-font tabular value → delta.
 * Used in hero KPI grids and module cards. Presentational only.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaUp,
  tone = "default",
  className,
  style,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Pre-formatted delta string, e.g. "+18%", "-4% MoM", "+3 today". */
  delta?: React.ReactNode;
  /** true = green, false = red. Omit for muted. */
  deltaUp?: boolean;
  /** value color: default (foreground) or gold (headline metric). */
  tone?: "default" | "gold" | "red";
  className?: string;
  style?: React.CSSProperties;
}) {
  const valueColor = tone === "gold" ? "text-gold-bright" : tone === "red" ? "text-destructive" : "text-foreground";
  const deltaColor = deltaUp === undefined ? "text-muted-foreground" : deltaUp ? "text-success" : "text-destructive";
  return (
    <div className={cn("flex flex-col justify-center min-w-0", className)} style={style}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div
        className={cn("tnum font-display font-bold mt-1.5 text-[22px] leading-none", valueColor)}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      {delta !== undefined && (
        <div className={cn("text-[11px] font-semibold mt-1", deltaColor)}>{delta}</div>
      )}
    </div>
  );
}
