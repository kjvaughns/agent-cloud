import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listMyContracts } from "@/lib/contracting.functions";
import { ContractStatusBadge } from "@/components/contracting/contract-status-badge";
import { ScopeToggle } from "@/components/scope-toggle";
import { useScope } from "@/hooks/use-scope";
import { SCOPES, type Scope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/contracting/commission-levels")({
  validateSearch: (s: Record<string, unknown>): { scope?: Scope } => ({
    scope: SCOPES.includes(s.scope as Scope) ? (s.scope as Scope) : undefined,
  }),
  component: MyCommissionLevelsPage,
  head: () => ({
    meta: [
      { title: "Commission Levels — Agent Cloud" },
      { name: "description", content: "The level you are contracted at with each carrier." },
    ],
  }),
});

/**
 * What you are contracted at, per carrier.
 *
 * The existing compensation page is the agency's — every level for every
 * agent, gated to owners and back-office staff. An agent wanting to know their
 * own level had to ask somebody. This is the same field, for the person it
 * applies to, with a link on to the grid that says what the level actually
 * pays.
 */
function MyCommissionLevelsPage() {
  const fn = useServerFn(listMyContracts);
  const { scope, ready } = useScope();
  const { data, isLoading } = useQuery({
    enabled: ready,
    queryKey: ["contracting", "myContracts", scope],
    queryFn: () => fn({ data: { scope } }),
  });

  const rows = data?.rows ?? [];

  return (
    <PageShell>
      <div className="flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Commission Levels"
          subtitle="What you are contracted at with each carrier."
          actions={<ScopeToggle />}
        />

        {isLoading ? (
          <Panel><Skeleton className="h-40 w-full" /></Panel>
        ) : rows.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted-foreground">
              No carrier contracts yet. Levels appear here once you are appointed.
            </p>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Carrier</th>
                    {scope !== "mine" && <th className="px-4 py-2.5 font-medium">Agent</th>}
                    <th className="px-4 py-2.5 font-medium">Level</th>
                    <th className="px-4 py-2.5 font-medium">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border-soft last:border-0">
                      <td className="px-4 py-2.5 font-medium">{r.carriers?.name ?? "—"}</td>
                      {scope !== "mine" && (
                        <td className="px-4 py-2.5 text-muted-foreground">{r.agent_name ?? "—"}</td>
                      )}
                      <td className="px-4 py-2.5">
                        {r.commission_level
                          ? <span className="font-semibold">{r.commission_level}</span>
                          : <span className="text-muted-foreground">Not set yet</span>}
                      </td>
                      <td className="px-4 py-2.5"><ContractStatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <Panel title="What a level pays">
          <p className="text-sm text-muted-foreground">
            The level is only half the answer — the grid is what turns it into a percentage.
          </p>
          <Link
            to="/contracting"
            search={{ tab: "comp-grids" } as never}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Open comp grids <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      </div>
    </PageShell>
  );
}
