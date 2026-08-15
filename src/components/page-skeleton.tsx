import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * What a page looks like before its data arrives.
 *
 * Pages were each inventing this, and the cheapest version — one `h-64` grey
 * rectangle — is worse than nothing: the screen jumps from a single block to a
 * header, four metrics and two panels, so every load reads as a re-render
 * rather than a page filling in.
 *
 * A skeleton's only job is to hold the shape the content will take, so the
 * arrival is a fade and not a jolt.
 */
export function PageSkeleton({
  /** Metric tiles across the top. 0 for a page that has none. */
  metrics = 4,
  /** Body panels below the metrics. */
  panels = 2,
  className,
}: {
  metrics?: number;
  panels?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-[var(--gap)]", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      {/* Title + subtitle */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {metrics > 0 && (
        <div className="grid gap-[var(--gap)] grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: metrics }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius)] border border-border bg-card p-[var(--pad)] space-y-3"
            >
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {panels > 0 && (
        <div className={cn("grid gap-[var(--gap)]", panels > 1 && "lg:grid-cols-2")}>
          {Array.from({ length: panels }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius)] border border-border bg-card p-[var(--pad)] space-y-3"
            >
              <Skeleton className="h-4 w-32" />
              {[0, 1, 2, 3].map((r) => (
                <div key={r} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 w-14 shrink-0" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
