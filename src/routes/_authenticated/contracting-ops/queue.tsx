import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@/hooks/use-server-fn";
import { bulkAssignRequests, getStaffQueue } from "@/lib/contracting-workflow.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import { Column, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { AgePill, StatusBadge } from "@/components/contracting/shared";
import { cn } from "@/lib/utils";
import { ghostFor } from "@/lib/empty-states";

export const Route = createFileRoute("/_authenticated/contracting-ops/queue")({
  component: StaffQueuePage,
  head: () => ({ meta: [{ title: "Staff Queue | Agent Cloud" }] }),
});

type Scope = "all" | "mine" | "unassigned" | "overdue";

function StaffQueuePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const queueFn = useServerFn(getStaffQueue);
  const agentsFn = useServerFn(listOrgAgents);
  const assignFn = useServerFn(bulkAssignRequests);

  const [scope, setScope] = useState<Scope>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "queue"],
    queryFn: () => queueFn(),
  });
  const { data: agentData } = useQuery({
    queryKey: ["contracting-ops", "agents"],
    queryFn: () => agentsFn(),
  });

  const assign = useMutation({
    mutationFn: (v: { ids: string[]; assigned_to: string | null }) => assignFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success(`${r?.count ?? 0} request${r?.count === 1 ? "" : "s"} reassigned`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not assign"),
  });

  const all = (data?.rows ?? []) as any[];
  const me = data?.me;

  const rows = useMemo(() => {
    if (scope === "mine") return all.filter((r) => r.assigned_to === me);
    if (scope === "unassigned") return all.filter((r) => !r.assigned_to);
    if (scope === "overdue") return all.filter((r) => r.is_overdue);
    return all;
  }, [all, scope, me]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const columns: Column<any>[] = [
    { key: "ref", header: "Request", className: "flex-[2]",
      render: (r) => <Stacked top={r.agent_name} bottom={`${r.reference ?? ""} · ${r.carrier_name}`} /> },
    { key: "status", header: "Status", className: "flex-1", render: (r) => <StatusBadge status={r.status} /> },
    { key: "ready", header: "Readiness", className: "w-24",
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
            <span className={cn("block h-full rounded-full", r.readiness_pct === 100 ? "bg-success" : "bg-primary")}
                  style={{ width: `${r.readiness_pct}%` }} />
          </span>
          <span className="tnum text-[11px] text-muted-foreground">{r.readiness_pct}%</span>
        </span>
      ) },
    { key: "assignee", header: "Assigned to", className: "flex-1",
      render: (r) => r.assignee_name
        ? <span className="truncate text-sm text-muted-foreground">{r.assignee_name}</span>
        : <span className="text-xs text-text-dim">Unassigned</span> },
    { key: "priority", header: "Priority", className: "w-20", secondary: true,
      render: (r) => <Pill tone={r.priority === "urgent" ? "danger" : r.priority === "high" ? "warning" : "neutral"}>{r.priority}</Pill> },
    { key: "age", header: "Age", className: "w-28",
      render: (r) => <AgePill days={r.days_open} overdue={r.is_overdue} /> },
  ];

  const staff = (data?.staff ?? []) as any[];

  return (
    <div className="space-y-4">
      {staff.length > 0 && (
        <Panel title="Workload" data-tour="queue-filters">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {staff.map((s) => (
              <div key={s.id ?? "unassigned"} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="truncate text-xs font-medium text-foreground">{s.name}</div>
                <div className="tnum mt-1 text-lg font-bold text-foreground">{s.count}</div>
                {s.overdue > 0 && (
                  <div className="tnum text-[10px] font-medium text-destructive">{s.overdue} overdue</div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "mine", "unassigned", "overdue"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              scope === s ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "Everything" : s === "mine" ? "Mine" : s === "unassigned" ? "Unassigned" : "Overdue"}
          </button>
        ))}

        {data?.canAssign && selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => assign.mutate({ ids: [...selected], assigned_to: me ?? null })}
              disabled={assign.isPending}
            >
              <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Claim
            </Button>
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                assign.mutate({ ids: [...selected], assigned_to: e.target.value === "none" ? null : e.target.value });
                e.currentTarget.value = "";
              }}
              defaultValue=""
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
            >
              <option value="">Assign to…</option>
              <option value="none">Unassign</option>
              {(agentData?.agents ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Panel pad={false} data-tour="queue-list">
        <RecordTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          selectable={data?.canAssign}
          selected={selected}
          onToggle={toggle}
          onRowClick={(r) => navigate({ to: "/contracting-ops/requests/$requestId", params: { requestId: r.id } })}
          empty={{
            // Two states, two messages: a genuinely empty queue is good news,
            // a filtered-to-nothing one is a wrong turn.
            kind: scope === "all" ? "first-use" : "cleared",
            ghost: scope === "all" ? ghostFor("contracting-requests") : undefined,
            title: scope === "all" ? "The queue is clear" : "Nothing here",
            body: scope === "all"
              ? "Open contracting requests appear here with an owner, an age and a due date. Nothing is waiting right now."
              : "Try a different filter — there is work on the board, just not in this slice.",
          }}
        />
      </Panel>
    </div>
  );
}
