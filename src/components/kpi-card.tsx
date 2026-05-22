import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";

export interface KpiCardProps {
  label: string;
  value: string;
  delta?: number; // percent
  change?: string; // pre-formatted, e.g. "+18%"
  icon?: LucideIcon;
  hint?: string;
}

export function KpiCard({ label, value, delta, change, icon: Icon, hint }: KpiCardProps) {
  if (change && typeof delta !== "number") {
    const n = parseFloat(change.replace(/[^\d.\-]/g, ""));
    if (!Number.isNaN(n)) delta = change.trim().startsWith("-") ? -Math.abs(n) : n;
  }

  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {Icon && <div className="h-8 w-8 rounded-md bg-primary/10 text-primary grid place-items-center"><Icon className="h-4 w-4" /></div>}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {typeof delta === "number" && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium",
            positive ? "text-success" : "text-destructive")}>
            {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}
