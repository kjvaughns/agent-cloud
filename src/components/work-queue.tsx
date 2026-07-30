import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getMyWork, type WorkItem } from "@/lib/work.functions";
import { cn } from "@/lib/utils";

/**
 * What needs you today.
 *
 * Sits above the numbers on the dashboard. The scoreboard tells you how you're
 * doing; this tells you what to do, and only one of those is useful first
 * thing in the morning.
 *
 * When the list is empty it says so plainly rather than disappearing — "you're
 * clear" is information, and a block that silently vanishes makes people
 * wonder whether it's broken.
 */

const TONE: Record<WorkItem["urgency"], string> = {
  overdue: "border-destructive/40 bg-destructive/[0.04]",
  today: "border-warning/35 bg-warning/[0.04]",
  soon: "border-border bg-surface-2/40",
};

const DOT: Record<WorkItem["urgency"], string> = {
  overdue: "bg-destructive",
  today: "bg-warning",
  soon: "bg-text-dim",
};

const LABEL: Record<WorkItem["urgency"], string> = {
  overdue: "Overdue",
  today: "Today",
  soon: "Soon",
};

export function WorkQueue() {
  const fn = useServerFn(getMyWork);
  const { data, isLoading } = useQuery({
    queryKey: ["my-work"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-40 rounded" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <section aria-labelledby="work-heading" className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <h2 id="work-heading" className="text-base font-bold text-foreground">
          What needs you today
        </h2>
        {items.length > 0 && (
          <span className="tnum text-xs text-muted-foreground">{items.length} things</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/[0.04] px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <p className="text-sm text-foreground">
            You're clear. Nothing is overdue and nothing is waiting on you.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <Link
              key={it.id}
              to={it.href}
              className={cn(
                "group flex items-start gap-2.5 rounded-xl border px-3.5 py-3 transition-colors",
                "hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                TONE[it.urgency],
              )}
            >
              {/* Urgency is carried by the label as well as the colour — the
                  people who live in this screen all day shouldn't have to
                  distinguish amber from red to know what's on fire. */}
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[it.urgency])} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{it.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {it.detail}
                </span>
                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim">
                  {LABEL[it.urgency]}
                </span>
              </span>
              <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-dim transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
