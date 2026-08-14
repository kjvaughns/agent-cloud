import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Building2, FilePlus, IdCard, Percent, UploadCloud, Users,
} from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getContractingOverview } from "@/lib/contracting-ops.functions";
import { REQUEST_STATUS_META, type RequestStatus } from "@/lib/contracting-ops/types";
import { EmptyState } from "@/components/contracting/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/")({
  component: OverviewPage,
  head: () => ({ meta: [{ title: "Contracting Overview | Agent Cloud" }] }),
});

/** A number that means something, with the thing it means underneath it. */
function Metric({
  label, value, sub, tone = "neutral", to,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "neutral" | "warning" | "danger" | "success";
  to?: string;
}) {
  const body = (
    <div
      className={cn(
        "h-full rounded-xl border bg-card p-4 transition-colors",
        to && "hover:border-primary/40",
        tone === "warning" && "border-warning/30",
        tone === "danger" && "border-destructive/30",
        tone === "success" && "border-success/30",
        tone === "neutral" && "border-border",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="tnum mt-1.5 text-2xl font-bold leading-none text-foreground">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function QuickAction({ to, icon: Icon, label, search }: { to: string; icon: any; label: string; search?: Record<string, string> }) {
  return (
    <Link
      to={to}
      search={search}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
    >
      <Icon className="h-3.5 w-3.5 text-primary" />
      {label}
    </Link>
  );
}

function OverviewPage() {
  const fn = useServerFn(getContractingOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "overview"],
    queryFn: () => fn(),
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const m = data?.metrics;
  const access = data?.access;

  if (!m) {
    return (
      <EmptyState
        title="No organization on your account"
        body="Contracting Operations works at the agency level. Once your account belongs to an agency, this overview fills in."
      />
    );
  }

  const attention = [
    { label: "Overdue requests", value: m.overdue, to: "/contracting-ops/queue" },
    { label: "Not in good order", value: m.nigo, to: "/contracting-ops/requests" },
    // Each of these lands on the slice it counted. A tile that opens an
    // unfiltered roster makes the reader redo the filtering the number did.
    { label: "Missing PDB reports", value: m.missing_pdb, to: "/contracting-ops/licensing", search: { filter: "missing_pdb" } },
    { label: "PDB reports out of date", value: m.stale_pdb, to: "/contracting-ops/licensing", search: { filter: "stale_pdb" } },
    { label: "Licenses expiring soon", value: m.expiring_licenses, to: "/contracting-ops/licensing", search: { filter: "expiring" } },
    { label: "Pending hierarchy changes", value: m.pending_hierarchy_changes, to: "/contracting-ops/requests", search: { tab: "changes" } },
  ].filter((a) => a.value > 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active agents" value={m.active_agents} />
        <Metric
          label="Ready to sell"
          value={m.agents_ready_to_sell}
          sub={`of ${m.active_agents} agents`}
          tone={m.agents_ready_to_sell > 0 ? "success" : "neutral"}
          to="/contracting-ops/requests"
        />
        <Metric label="Requests in progress" value={m.in_progress} to="/contracting-ops/requests" />
        <Metric
          label="Ready to submit"
          value={m.ready_to_submit}
          sub="Nothing outstanding"
          tone={m.ready_to_submit > 0 ? "success" : "neutral"}
          to="/contracting-ops/queue"
        />
      </div>

      {attention.length > 0 && (
        <Panel title="Needs attention">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                search={(a as any).search}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.label}</span>
                <span className="tnum text-sm font-bold text-foreground">{a.value}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-dim" />
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Requests by status">
          {Object.keys(m.by_status).length === 0 ? (
            <EmptyState
              title="No contracting requests yet"
              body="Create a contracting request when an agent needs a new carrier contract, transfer, state appointment or hierarchy change."
              action={
                <Link to="/contracting-ops/requests">
                  <Button size="sm">Create a request</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-1.5">
              {Object.entries(m.by_status)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([status, count]) => {
                  const meta = REQUEST_STATUS_META[status as RequestStatus];
                  const max = Math.max(...Object.values(m.by_status).map(Number));
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
                        {meta?.label ?? status}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${max ? (Number(count) / max) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="tnum w-8 text-right text-xs font-semibold text-foreground">
                        {String(count)}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Carrier turnaround">
            {m.avg_turnaround_days === null ? (
              <p className="text-sm text-muted-foreground">
                Measured once requests have been both submitted and approved. Nothing has completed
                that round trip yet.
              </p>
            ) : (
              <>
                <div className="tnum text-3xl font-bold text-foreground">
                  {m.avg_turnaround_days}
                  <span className="ml-1 text-base font-normal text-muted-foreground">days</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Average from submission to carrier approval, across your own history.
                </p>
              </>
            )}
          </Panel>

          <Panel title="Quick actions">
            <div className="grid gap-2 sm:grid-cols-2">
              <QuickAction to="/settings/carriers" icon={Building2} label="Add a carrier" />
              <QuickAction to="/contracting-ops/requests" icon={FilePlus} label="Create a request" />
              <QuickAction to="/contracting-ops/licensing" icon={UploadCloud} label="Upload a PDB report" />
              <QuickAction to="/contracting-ops/requests" search={{ tab: "numbers" }} icon={IdCard} label="Add a writing number" />
              <QuickAction to="/settings/levels" icon={Percent} label="Add a comp level" />
              <QuickAction to="/contracting-ops/queue" icon={Users} label="Staff queue" />
            </div>
            {access && !access.canManageCarriers && (
              <p className="mt-3 text-[11px] text-text-dim">
                Some actions are limited by your permissions. Your agency owner can grant more.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
