import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getUsageReport } from "@/lib/usage.functions";
import { useServerFn } from "@/hooks/use-server-fn";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agency/usage")({
  component: UsagePage,
  head: () => ({ meta: [{ title: "What people use | Agent Cloud" }] }),
});

/**
 * What people actually use.
 *
 * Not a dashboard — a decision tool. It produces three lists so that removing
 * a page becomes a question of evidence rather than of whose feature it was.
 */
function UsagePage() {
  const fn = useServerFn(getUsageReport);
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["usage-report", days],
    queryFn: () => fn({ data: { days } }),
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">
          This report is available to the agency owner and admins.
        </p>
      </PageShell>
    );
  }

  const used = data.pages.filter((p) => p.views > 0);
  const barely = used.filter((p) => p.people <= 1 && p.views < 5);

  return (
    <PageShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">What people use</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Which pages get opened, and which never do. Use this before removing anything.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                days === d
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              Last {d} days
            </button>
          ))}
          <span className="tnum ml-auto text-xs text-muted-foreground">
            {data.total_events.toLocaleString()} events
          </span>
        </div>

        {!data.tracking_live && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Nothing recorded yet.</strong> Tracking starts the
              next time someone opens a page. Give it about a week before drawing conclusions —
              a page nobody opened in two days might just be a page nobody needed this week.
            </p>
          </div>
        )}

        <Panel title={`Never opened — ${data.never_opened.length} pages`}>
          {data.never_opened.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every page has been opened at least once.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Not opened once in {data.days} days. These are the first candidates to merge or
                remove — but check the list against seasonality before deleting anything.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.never_opened.map((p) => (
                  <span
                    key={p.path}
                    title={p.path}
                    className="rounded-md border border-border bg-surface-2/60 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {p.label}
                    <span className="ml-1.5 text-text-dim">{p.area}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>

        {barely.length > 0 && (
          <Panel title={`Barely used — ${barely.length} pages`}>
            <p className="mb-3 text-xs text-muted-foreground">
              One person, fewer than five visits. Usually means it was built for a request that
              never generalised.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {barely.map((p) => (
                <span key={p.path} className="rounded-md border border-border bg-surface-2/60 px-2 py-1 text-[11px] text-muted-foreground">
                  {p.label} <span className="tnum text-text-dim">{p.views}</span>
                </span>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Most used pages" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2 text-left font-semibold">Page</th>
                  <th className="px-4 py-2 text-left font-semibold">Area</th>
                  <th className="px-4 py-2 text-right font-semibold">Opens</th>
                  <th className="px-4 py-2 text-right font-semibold">People</th>
                  <th className="px-4 py-2 text-right font-semibold">Avg. time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {used.slice(0, 30).map((p) => (
                  <tr key={p.path}>
                    <td className="px-4 py-2 text-foreground">{p.label}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.area}</td>
                    <td className="tnum px-4 py-2 text-right">{p.views}</td>
                    <td className="tnum px-4 py-2 text-right text-muted-foreground">{p.people}</td>
                    <td className={cn(
                      "tnum px-4 py-2 text-right text-muted-foreground",
                      // Under five seconds means opened and abandoned, which is
                      // what a confusing page looks like in data.
                      p.avg_seconds != null && p.avg_seconds < 5 && "text-warning",
                    )}>
                      {p.avg_seconds != null ? `${p.avg_seconds}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {data.actions.length > 0 && (
          <Panel title="Actions taken" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-2 text-left font-semibold">Action</th>
                    <th className="px-4 py-2 text-right font-semibold">Times</th>
                    <th className="px-4 py-2 text-right font-semibold">People</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {data.actions.map((a) => (
                    <tr key={a.action}>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{a.action}</td>
                      <td className="tnum px-4 py-2 text-right">{a.count}</td>
                      <td className="tnum px-4 py-2 text-right text-muted-foreground">{a.people}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <p className="text-[11px] text-text-dim">
          No personal data is recorded — a page, an action name and a role. Events are deleted
          after 90 days.
        </p>
      </div>
    </PageShell>
  );
}
