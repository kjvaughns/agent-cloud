import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getContractingSettings, saveContractingSettings } from "@/lib/contracting-ops.functions";
import { listContractingAudit } from "@/lib/contracting-workflow.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Contracting Settings | Agent Cloud" }] }),
});

function Toggle({
  label, help, checked, onChange, disabled,
}: {
  label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-3 py-2", disabled && "opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
          checked ? "justify-end bg-primary" : "justify-start border border-border bg-surface-2",
        )}
      >
        <span className={cn("h-4 w-4 rounded-full", checked ? "bg-gold-foreground" : "bg-text-dim")} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {help && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{help}</span>}
      </span>
    </label>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getContractingSettings);
  const saveFn = useServerFn(saveContractingSettings);
  const auditFn = useServerFn(listContractingAudit);
  const agentsFn = useServerFn(listOrgAgents);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "settings"], queryFn: () => getFn(),
  });
  const { data: auditData } = useQuery({
    queryKey: ["contracting-ops", "audit"], queryFn: () => auditFn(),
  });
  const { data: agentData } = useQuery({
    queryKey: ["contracting-ops", "agents"], queryFn: () => agentsFn(),
  });

  const [draft, setDraft] = useState<any | null>(null);
  const s = draft ?? data?.settings;
  const canEdit = data?.access?.isOwner || data?.access?.canManageCarriers;

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => {
      toast.success("Settings saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save settings"),
  });

  if (isLoading || !s) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;
  }

  const set = (k: string, v: any) => setDraft({ ...s, [k]: v });

  return (
    <div className="space-y-4">
      <Panel title="Licensing policy">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pdb-days">Ask for a fresh PDB report every</Label>
            <select
              id="pdb-days"
              value={s.pdb_refresh_days}
              disabled={!canEdit}
              onChange={(e) => set("pdb_refresh_days", Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value={0}>Never</option>
              {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
            <p className="mt-1 text-[11px] text-text-dim">
              Stamped onto a review when it is recorded, so changing this later does not re-date past
              reviews.
            </p>
          </div>
          <div>
            <Label htmlFor="lic-warn">Warn about expiring licences</Label>
            <Input
              id="lic-warn" type="number" min={0} max={365}
              value={s.license_expiry_warning_days}
              disabled={!canEdit}
              onChange={(e) => set("license_expiry_warning_days", Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-text-dim">Days before the expiry date.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Approvals">
        <div className="divide-y divide-border-soft">
          <Toggle
            label="Manager reviews first"
            help="Requests and hierarchy changes stop with the agent's upline before reaching the owner."
            checked={s.require_manager_review} disabled={!canEdit}
            onChange={(v) => set("require_manager_review", v)}
          />
          <Toggle
            label="Owner approves carrier requests"
            help="A request cannot reach ready to submit until the owner has approved it."
            checked={s.require_owner_approval} disabled={!canEdit}
            onChange={(v) => set("require_owner_approval", v)}
          />
          <Toggle
            label="Owner approves compensation changes"
            checked={s.require_owner_approval_for_comp_change} disabled={!canEdit}
            onChange={(v) => set("require_owner_approval_for_comp_change", v)}
          />
          <Toggle
            label="Owner approves hierarchy changes"
            checked={s.require_owner_approval_for_hierarchy} disabled={!canEdit}
            onChange={(v) => set("require_owner_approval_for_hierarchy", v)}
          />
        </div>
      </Panel>

      <Panel title="How requests behave">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sla">Target turnaround (days)</Label>
            <Input id="sla" type="number" min={0} max={365} value={s.request_sla_days} disabled={!canEdit}
                   onChange={(e) => set("request_sla_days", Number(e.target.value))} className="mt-1" />
            <p className="mt-1 text-[11px] text-text-dim">Sets the due date on every new request. 0 means no due date.</p>
          </div>
          <div>
            <Label htmlFor="priority">Default priority</Label>
            <select id="priority" value={s.default_request_priority} disabled={!canEdit}
                    onChange={(e) => set("default_request_priority", e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60">
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="auto-assign">Automatically assign new requests to</Label>
            <select id="auto-assign" value={s.auto_assign_staff_id ?? ""} disabled={!canEdit}
                    onChange={(e) => set("auto_assign_staff_id", e.target.value || null)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60">
              <option value="">Nobody — they land unassigned</option>
              {(agentData?.agents ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-2 divide-y divide-border-soft">
          <Toggle
            label="Agents may open their own carrier requests"
            help="Turn this off if requests should always come from a manager."
            checked={s.agents_may_request_contracts} disabled={!canEdit}
            onChange={(v) => set("agents_may_request_contracts", v)}
          />
          <Toggle
            label="Notify agents when a request changes status"
            checked={s.notify_on_status_change} disabled={!canEdit}
            onChange={(v) => set("notify_on_status_change", v)}
          />
          <Toggle
            label="Notify agents about missing documents"
            checked={s.notify_on_missing_documents} disabled={!canEdit}
            onChange={(v) => set("notify_on_missing_documents", v)}
          />
        </div>
      </Panel>

      {canEdit && draft && (
        <div className="sticky bottom-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">You have unsaved changes.</span>
          <span className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Discard</Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({
              pdb_refresh_days: s.pdb_refresh_days,
              license_expiry_warning_days: s.license_expiry_warning_days,
              require_manager_review: s.require_manager_review,
              require_owner_approval: s.require_owner_approval,
              require_owner_approval_for_comp_change: s.require_owner_approval_for_comp_change,
              require_owner_approval_for_hierarchy: s.require_owner_approval_for_hierarchy,
              default_request_priority: s.default_request_priority,
              request_sla_days: s.request_sla_days,
              auto_assign_staff_id: s.auto_assign_staff_id,
              agents_may_request_contracts: s.agents_may_request_contracts,
              warn_on_duplicate_requests: s.warn_on_duplicate_requests,
              notify_on_missing_documents: s.notify_on_missing_documents,
              notify_on_status_change: s.notify_on_status_change,
            })}>
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
          </span>
        </div>
      )}

      {!canEdit && (
        <p className="text-[11px] text-text-dim">
          These settings are read-only for you. The agency owner, or staff granted carrier management,
          can change them.
        </p>
      )}

      <Panel title="Audit log">
        {(auditData?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet, or you don't hold the permission to read the audit log. Every
            carrier edit, status change, document review, export and approval is written here.
          </p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {(auditData?.rows ?? []).slice(0, 50).map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-2 py-2 text-xs">
                <span className="font-medium text-foreground">{a.action}</span>
                <span className="text-muted-foreground">{a.record_type}</span>
                {a.subject_name && <span className="text-muted-foreground">· {a.subject_name}</span>}
                <span className="ml-auto text-text-dim">
                  {a.actor_name} · {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
