import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getContractingSettings, saveContractingSettings } from "@/lib/contracting-ops.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import { INHERITABLE_FIELDS } from "@/lib/contracting-ops/effective-settings";
import { HubCard, HubLayout, PreviewCard, AdvancedDrawer, ChoiceCards, type SaveStatus } from "@/components/settings/hub-card";

const FIELDS = [
  "pdb_refresh_days", "license_expiry_warning_days", "require_manager_review", "require_owner_approval",
  "require_owner_approval_for_comp_change", "require_owner_approval_for_hierarchy", "default_request_priority",
  "request_sla_days", "auto_assign_staff_id", "agents_may_request_contracts", "warn_on_duplicate_requests",
  "notify_on_missing_documents", "notify_on_status_change",
] as const;

export function ContractingHub({ progress, advanced }: { progress?: { done: number; total: number } | null; advanced: ReactNode }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getContractingSettings);
  const saveFn = useServerFn(saveContractingSettings);
  const agentsFn = useServerFn(listOrgAgents);
  const { data, isLoading } = useQuery({ queryKey: ["contracting-ops", "settings"], queryFn: () => getFn() });
  const { data: agentData } = useQuery({ queryKey: ["contracting-ops", "agents"], queryFn: () => agentsFn() });
  const [status, setStatus] = useState<SaveStatus>("idle");

  const d = data as any;
  const s = d?.settings;
  const canEdit = Boolean(d?.access?.isOwner || d?.access?.canManageCarriers);
  const hasParent = Boolean(d?.hasParent);
  const overridden: string[] = d?.overridden ?? [];
  // Inherited fields stay read-only here; overriding lives in Advanced.
  const locked = (f: string) => !canEdit || (hasParent && (INHERITABLE_FIELDS as readonly string[]).includes(f) && !overridden.includes(f));

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => {
      const payload: Record<string, unknown> = {};
      for (const k of FIELDS) payload[k] = { ...s, ...patch }[k];
      if (hasParent) payload.overridden_fields = overridden.filter((f) => (INHERITABLE_FIELDS as readonly string[]).includes(f));
      return saveFn({ data: payload as any });
    },
    onMutate: (patch) => {
      setStatus("saving");
      qc.setQueryData(["contracting-ops", "settings"], (old: any) => old ? { ...old, settings: { ...old.settings, ...patch } } : old);
    },
    onSuccess: () => { setStatus("saved"); qc.invalidateQueries({ queryKey: ["contracting-ops"] }); },
    onError: (e: any) => { setStatus("idle"); toast.error(e?.message ?? "Couldn't save"); qc.invalidateQueries({ queryKey: ["contracting-ops", "settings"] }); },
  });

  if (isLoading || !s) return <Skeleton className="h-80 rounded-2xl" />;
  const agents = (agentData?.agents ?? []) as any[];
  const who = s.agents_may_request_contracts ? (s.require_owner_approval ? "approval" : "anyone") : "managers";
  const sla = Number(s.request_sla_days ?? 0);
  const assignee = agents.find((a) => a.id === s.auto_assign_staff_id)?.name;

  const preview = (
    <PreviewCard>
      <div className="h-1.5 bg-primary" />
      <div className="space-y-2 p-4">
        <p className="text-sm font-semibold">Request a carrier</p>
        {who === "managers" ? (
          <p className="text-xs text-muted-foreground">Ask your manager to request carriers for you.</p>
        ) : (
          <>
            <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Mutual of Omaha</div>
            <span className="inline-block rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-ink-foreground">Send request</span>
            <p className="text-[11px] text-muted-foreground">
              {who === "approval" ? "Your owner approves it first. " : ""}
              {sla ? `Expected within ${sla} day${sla === 1 ? "" : "s"}.` : "No set turnaround."}
              {assignee ? ` Handled by ${assignee}.` : ""}
            </p>
          </>
        )}
      </div>
    </PreviewCard>
  );

  return (
    <HubLayout preview={preview}>
      {progress && progress.total > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <span className="tnum shrink-0 text-xs text-muted-foreground">{progress.done}/{progress.total} contracting steps done</span>
        </div>
      )}

      <HubCard title="How contracting works" blurb="Three questions. Changes save automatically." status={status}>
        <div className="space-y-2">
          <p className="text-sm font-medium">Who can request carriers?</p>
          <ChoiceCards cols={3} value={who} disabled={locked("agents_may_request_contracts") || locked("require_owner_approval")}
            onChange={(v) => save.mutate({ agents_may_request_contracts: v !== "managers", require_owner_approval: v === "approval" })}
            options={[
              { value: "anyone", label: "Any agent", hint: "Requests go straight in" },
              { value: "approval", label: "Needs my approval", hint: "You OK each one" },
              { value: "managers", label: "Managers only", hint: "Agents ask their upline" },
            ]} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">How fast should requests be handled?</p>
          <ChoiceCards cols={4} value={sla} disabled={locked("request_sla_days")} onChange={(v) => save.mutate({ request_sla_days: v })}
            options={[1, 3, 5, 7].map((n) => ({ value: n, label: `${n} day${n === 1 ? "" : "s"}` }))} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Who gets new requests?</p>
          <ChoiceCards cols={2} value={s.auto_assign_staff_id ? "staff" : "me"} disabled={!canEdit}
            onChange={(v) => { if (v === "me") save.mutate({ auto_assign_staff_id: null }); }}
            options={[
              { value: "me", label: "Me", hint: "They land in the shared queue" },
              { value: "staff", label: "A staff member", hint: assignee ?? "Pick below" },
            ]} />
          {(s.auto_assign_staff_id || agents.length > 0) && (
            <select aria-label="Staff member" disabled={!canEdit} value={s.auto_assign_staff_id ?? ""}
              onChange={(e) => save.mutate({ auto_assign_staff_id: e.target.value || null })}
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm disabled:opacity-60">
              <option value="">Nobody — shared queue</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
      </HubCard>

      <HubCard title="License checks" status={status}>
        <div className="divide-y divide-border">
          <label className="flex items-center justify-between gap-3 py-3">
            <span><span className="block text-sm font-medium">Warn me before licenses expire</span><span className="text-xs text-muted-foreground">30 days ahead</span></span>
            <Switch checked={Number(s.license_expiry_warning_days ?? 0) > 0} disabled={locked("license_expiry_warning_days")}
              onCheckedChange={(v) => save.mutate({ license_expiry_warning_days: v ? 30 : 0 })} />
          </label>
          <label className="flex items-center justify-between gap-3 py-3">
            <span><span className="block text-sm font-medium">Ask for a fresh PDB report</span><span className="text-xs text-muted-foreground">Every 90 days</span></span>
            <Switch checked={Number(s.pdb_refresh_days ?? 0) > 0} disabled={locked("pdb_refresh_days")}
              onCheckedChange={(v) => save.mutate({ pdb_refresh_days: v ? 90 : 0 })} />
          </label>
        </div>
      </HubCard>

      <AdvancedDrawer label="every rule, submission templates & audit log">{advanced}</AdvancedDrawer>
    </HubLayout>
  );
}
