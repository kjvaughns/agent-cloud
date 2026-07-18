import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";
import { getPlatformSubscriptions } from "@/lib/billing.functions";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — Agent Cloud Admin" }] }),
  component: SubscriptionsPage,
});

const STATUS_BADGE: Record<string, any> = {
  active: "success", trialing: "info", past_due: "warning", cancelled: "destructive", inactive: "outline",
};

function SubscriptionsPage() {
  const fn = useServerFn(getPlatformSubscriptions);
  const { data: d, isLoading, error } = useQuery({
    queryKey: ["admin", "subscriptions"],
    queryFn: () => fn(),
    retry: false,
  });

  if (isLoading) return <PageShell><Skeleton className="h-80" /></PageShell>;
  if (error || !d) {
    return (
      <PageShell>
        <Panel><div className="py-10 text-center text-sm text-muted-foreground">{(error as any)?.message ?? "Super admin only."}</div></Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-[var(--gap)]">
        <HeroBand title="Platform Subscriptions" subtitle="MRR, plan mix, and account health across all organizations" />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-[var(--gap)]">
          <Panel><StatTile label="Total MRR" value={money(d.mrrTotal)} tone="gold" /></Panel>
          <Panel><StatTile label="Agency Plans" value={String(d.counts.agency)} delta={`${d.counts.white_label} white-label`} /></Panel>
          <Panel><StatTile label="Solo Agents" value={String(d.counts.solo)} /></Panel>
          <Panel><StatTile label="Nova Pro Subscribers" value={String(d.counts.nova_total)} delta={`${d.counts.nova_by_source.personal ?? 0} personal · ${d.counts.nova_by_source.agency ?? 0} seats · ${d.counts.nova_by_source.solo ?? 0} solo`} /></Panel>
        </div>

        <div className="grid sm:grid-cols-3 gap-[var(--gap)]">
          <Panel><StatTile label="Past Due" value={String(d.counts.past_due)} tone={d.counts.past_due > 0 ? "red" : "default"} /></Panel>
          <Panel><StatTile label="Cancelled (recent)" value={String(d.counts.cancelled30d)} /></Panel>
          <Panel><StatTile label="Partner Payouts (30d)" value={money(d.partnerPayoutsThisMonth)} delta="Nova Partner credits applied" /></Panel>
        </div>

        <Panel title="MRR by Product Line">
          <div className="text-sm divide-y divide-border-soft">
            {Object.entries(d.mrr).map(([k, v]) => (
              <div key={k} className="flex justify-between py-2">
                <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                <span className="tnum">{money(v as number)}/mo</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Organizations">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-2 py-2">Organization</th>
                  <th className="px-2 py-2">Plan</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Nova Seats</th>
                  <th className="px-2 py-2">Period Ends</th>
                </tr>
              </thead>
              <tbody>
                {d.orgs.map((o: any) => (
                  <tr key={o.id} className="border-t border-border-soft">
                    <td className="px-2 py-2 font-medium">{o.name}</td>
                    <td className="px-2 py-2 capitalize text-muted-foreground">{(o.plan_type ?? "agency").replace("_", "-")}</td>
                    <td className="px-2 py-2"><Badge variant={STATUS_BADGE[o.subscription_status ?? "inactive"]}>{o.subscription_status ?? "inactive"}</Badge></td>
                    <td className="px-2 py-2 tnum">{o.nova_seats_purchased ?? 0}</td>
                    <td className="px-2 py-2 tnum text-muted-foreground">{o.subscription_current_period_end ? new Date(o.subscription_current_period_end).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
