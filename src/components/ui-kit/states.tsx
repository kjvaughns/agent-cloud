/** Shared empty, loading and filter pieces in the Agency-settings style. */
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyCard({ icon, title, body, action, className }: {
  icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center", className)}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">{icon ?? <Inbox className="h-5 w-5" />}</span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>
      <Skeleton className="h-5 w-40 rounded-full" />
      <Skeleton className="h-3.5 w-64 rounded-full" />
      <div className="space-y-2.5 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 flex-1 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FilterChips<T extends string>({ value, options, onChange, className }: {
  value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "border-ink bg-ink text-ink-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
          {o.label}
          {o.count != null && <span className="tnum opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
