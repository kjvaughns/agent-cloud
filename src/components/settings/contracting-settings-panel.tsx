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
import { INHERITABLE_FIELDS, type InheritableField } from "@/lib/contracting-ops/effective-settings";
import { cn } from "@/lib/utils";

function Toggle({
  label, help, checked, onChange, disabled, sourceRow,
}: {
  label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
  sourceRow?: React.ReactNode;
}) {
  return (
    <div className="py-2">
      <label className={cn("flex items-start gap-3", disabled && "opacity-60")}>
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
      {sourceRow}
    </div>
  );
}

/**
 * How contracting works for this agency — org_contracting_settings in plain
 * language, plus the audit log. Mounted by Settings ▸ How Contracting Works;
 * the server functions carry their own capability checks, so this panel just
 * renders read-only for anyone who cannot edit.
 *
 * When the agency has a parent, every policy field shows its state in words —
 * "Inherited from {parent}" or "Set by you" — because the failure mode of
 * every settings cascade is a person changing a value without knowing whose
 * copy they changed. Overriding writes only this agency's row; Reset drops
 * the override and re-adopts whatever the parent currently says.
 */
export function ContractingSettingsPanel() {
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
  const [draftOverridden, setDraftOverridden] = useState<string[] | null>(null);
  const s = draft ?? (data as any)?.settings;
  const canEdit = (data as any)?.access?.isOwner || (data as any)?.access?.canManageCarriers;
  const hasParent = Boolean((data as any)?.hasParent);
  const parentName = (data as any)?.parentName ?? "your parent agency";
  const inheritedValues = ((data as any)?.inheritedValues ?? {}) as Record<string, unknown>;
  const overridden: string[] = draftOverridden ?? (data as any)?.overridden ?? [];
  const dirty = draft !== null || draftOverridden !== null;

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => {
      toast.success("Settings saved");
      setDraft(null);
      setDraftOverridden(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save settings"),
  });

  if (isLoading || !s) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;
  }

  const set = (k: string, v: any) => setDraft({ ...s, [k]: v });

  /** A field is this org's own when it has no parent, or holds an override. */
  const isOwn = (f: InheritableField) => !hasParent || overridden.includes(f);

  const override = (f: InheritableField) => {
    // The value stays what it effectively is — overriding pins the current
    // number rather than surprising anyone with a jump.
    setDraftOverridden([...overridden.filter((x) => x !== f), f]);
    setDraft({ ...s });
  };
  const reset = (f: InheritableField) => {
    setDraftOverridden(overridden.filter((x) => x !== f));
    setDraft({ ...s, [f]: inheritedValues[f] });
  };

  /**
   * The state-in-words row. Rendered only when there is a parent to inherit
   * from — a standalone agency's settings are simply its settings.
   */
  const sourceRow = (f: InheritableField) => {
    if (!hasParent) return null;
    return isOwn(f) ? (
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-text-dim">
        <span>● Set by you</span>
        {canEdit && (
          <button type="button" className="text-primary hover:underline" onClick={() => reset(f)}>
            Reset to {parentName}'s default
          </button>
        )}
      </p>
    ) : (
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-text-dim">
        <span>● Inherited from {parentName}</span>
        {canEdit && (
          <button type="button" className="text-primary hover:underline" onClick={() => override(f)}>
            Override for my agency
          </button>
        )}
      </p>
    );
  };

  /** Disabled when read-only, or when the field is inherited and not yet overridden. */
  const locked = (f: InheritableField) => !canEdit || !isOwn(f);

  return (
    <div className="space-y-4">
      {hasParent && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Your agency belongs to <span className="font-medium text-foreground">{parentName}</span>.
          Settings start out inherited from them; overriding one changes it for your agency only,
          and never theirs.
        </p>
      )}

      <Panel title="Licensing policy">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pdb-days">Ask for a fresh PDB report every</Label>
            <select
              id="pdb-days"
              value={s.pdb_refresh_days}
              disabled={locked("pdb_refresh_days")}
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
            {sourceRow("pdb_refresh_days")}
          </div>
          <div>
            <Label htmlFor="lic-warn">Warn about expiring licences</Label>
            <Input
              id="lic-warn" type="number" min={0} max={365}
              value={s.license_expiry_warning_days}
              disabled={locked("license_expiry_warning_days")}
              onChange={(e) => set("license_expiry_warning_days", Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-text-dim">Days before the expiry date.</p>
            {sourceRow("license_expiry_warning_days")}
          </div>
        </div>
      </Panel>

      <Panel title="Approvals">
        <div className="divide-y divide-border-soft">
          <Toggle
            label="Manager reviews first"
            help="Requests and hierarchy changes stop with the agent's upline before reaching the owner."
            checked={s.require_manager_review} disabled={locked("require_manager_review")}
            onChange={(v) => set("require_manager_review", v)}
            sourceRow={sourceRow("require_manager_review")}
          />
          <Toggle
            label="Owner approves carrier requests"
            help="A request cannot reach ready to submit until the owner has approved it."
            checked={s.require_owner_approval} disabled={locked("require_owner_approval")}
            onChange={(v) => set("require_owner_approval", v)}
            sourceRow={sourceRow("require_owner_approval")}
          />
          <Toggle
            label="Owner approves compensation changes"
            checked={s.require_owner_approval_for_comp_change} disabled={locked("require_owner_approval_for_comp_change")}
            onChange={(v) => set("require_owner_approval_for_comp_change", v)}
            sourceRow={sourceRow("require_owner_approval_for_comp_change")}
          />
          <Toggle
            label="Owner approves hierarchy changes"
            checked={s.require_owner_approval_for_hierarchy} disabled={locked("require_owner_approval_for_hierarchy")}
            onChange={(v) => set("require_owner_approval_for_hierarchy", v)}
            sourceRow={sourceRow("require_owner_approval_for_hierarchy")}
          />
        </div>
      </Panel>

      <Panel title="How requests behave">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sla">Target turnaround (days)</Label>
            <Input id="sla" type="number" min={0} max={365} value={s.request_sla_days} disabled={locked("request_sla_days")}
                   onChange={(e) => set("request_sla_days", Number(e.target.value))} className="mt-1" />
            <p className="mt-1 text-[11px] text-text-dim">Sets the due date on every new request. 0 means no due date.</p>
            {sourceRow("request_sla_days")}
          </div>
          <div>
            <Label htmlFor="priority">Default priority</Label>
            <select id="priority" value={s.default_request_priority} disabled={locked("default_request_priority")}
                    onChange={(e) => set("default_request_priority", e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60">
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {sourceRow("default_request_priority")}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="auto-assign">Automatically assign new requests to</Label>
            <select id="auto-assign" value={s.auto_assign_staff_id ?? ""} disabled={!canEdit}
                    onChange={(e) => set("auto_assign_staff_id", e.target.value || null)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60">
              <option value="">Nobody — they land unassigned</option>
              {(agentData?.agents ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {/* Never inherited: it names a person in THIS agency. */}
          </div>
        </div>

        <div className="mt-2 divide-y divide-border-soft">
          <Toggle
            label="Agents may open their own carrier requests"
            help="Turn this off if requests should always come from a manager."
            checked={s.agents_may_request_contracts} disabled={locked("agents_may_request_contracts")}
            onChange={(v) => set("agents_may_request_contracts", v)}
            sourceRow={sourceRow("agents_may_request_contracts")}
          />
          <Toggle
            label="Warn about duplicate requests"
            help="Flags a new request when the same agent and carrier already have one open."
            checked={s.warn_on_duplicate_requests} disabled={locked("warn_on_duplicate_requests")}
            onChange={(v) => set("warn_on_duplicate_requests", v)}
            sourceRow={sourceRow("warn_on_duplicate_requests")}
          />
          <Toggle
            label="Notify agents when a request changes status"
            checked={s.notify_on_status_change} disabled={locked("notify_on_status_change")}
            onChange={(v) => set("notify_on_status_change", v)}
            sourceRow={sourceRow("notify_on_status_change")}
          />
          <Toggle
            label="Notify agents about missing documents"
            checked={s.notify_on_missing_documents} disabled={locked("notify_on_missing_documents")}
            onChange={(v) => set("notify_on_missing_documents", v)}
            sourceRow={sourceRow("notify_on_missing_documents")}
          />
        </div>
      </Panel>

      {canEdit && dirty && (
        <div className="sticky bottom-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">You have unsaved changes.</span>
          <span className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDraft(null); setDraftOverridden(null); }}>Discard</Button>
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
              // Only meaningful for a child agency; the server pins a root
              // agency to all-local regardless.
              ...(hasParent ? { overridden_fields: overridden.filter((f) => (INHERITABLE_FIELDS as readonly string[]).includes(f)) } : {}),
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
