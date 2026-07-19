import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Crown } from "lucide-react";
import { toast } from "sonner";
import {
  listOrgMembers, updateMemberPermissions, applyStaffPreset, setMemberRole,
} from "@/lib/permissions.functions";

export const Route = createFileRoute("/_authenticated/agency/team")({
  head: () => ({ meta: [{ title: "Team & Permissions — Agent Cloud" }] }),
  component: AgencyTeamPage,
});

const MANAGER_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: "Team Access",
    items: [
      { key: "mgr_view_all_agents", label: "View all agents (off = assigned agents only)" },
      { key: "mgr_edit_agent_profiles", label: "Edit agent profiles" },
      { key: "mgr_post_deals_for_agents", label: "Post deals on behalf of agents" },
    ],
  },
  {
    label: "Visibility",
    items: [
      { key: "mgr_view_agent_commissions", label: "View agent commissions" },
      { key: "mgr_view_team_analytics", label: "View team analytics" },
      { key: "mgr_view_client_records", label: "View client records" },
      { key: "mgr_edit_client_records", label: "Edit client records" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "mgr_access_recruiting", label: "Access recruiting pipeline" },
      { key: "mgr_submit_carrier_requests", label: "Submit carrier requests" },
      { key: "mgr_manage_onboarding", label: "Manage agent onboarding" },
    ],
  },
];

const STAFF_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: "CRM & Clients",
    items: [
      { key: "staff_view_clients", label: "View clients" },
      { key: "staff_edit_clients", label: "Edit clients" },
      { key: "staff_delete_clients", label: "Delete clients" },
    ],
  },
  {
    label: "Policies",
    items: [
      { key: "staff_view_policies", label: "View policies" },
      { key: "staff_post_policies", label: "Post policies" },
      { key: "staff_edit_policies", label: "Edit policies" },
    ],
  },
  {
    label: "Commissions",
    items: [{ key: "staff_view_commissions", label: "View commissions (read-only)" }],
  },
  {
    label: "Recruiting",
    items: [
      { key: "staff_view_recruiting", label: "View pipeline" },
      { key: "staff_edit_recruiting", label: "Edit candidates" },
      { key: "staff_move_recruiting_stages", label: "Move stages" },
    ],
  },
  {
    label: "Contracting",
    items: [
      { key: "staff_view_contracts", label: "View contracts" },
      { key: "staff_submit_carrier_requests", label: "Submit carrier requests" },
      { key: "staff_edit_contracts", label: "Edit contracting records" },
    ],
  },
  {
    label: "Analytics",
    items: [{ key: "staff_view_analytics", label: "View agency analytics" }],
  },
  {
    label: "Support",
    items: [
      { key: "staff_view_all_tickets", label: "View all agency tickets" },
      { key: "staff_respond_tickets", label: "Respond to tickets" },
    ],
  },
  {
    label: "Nova AI Pro",
    items: [{ key: "staff_nova_pro_enabled", label: "Allow this staff member to subscribe to Nova Pro" }],
  },
];

const ADMIN_EXTRAS: { key: string; label: string }[] = [
  { key: "admin_manage_staff_configs", label: "Manage other staff configurations" },
  { key: "admin_view_billing_readonly", label: "View billing (read-only)" },
  { key: "admin_invite_users", label: "Invite agents and staff" },
  { key: "admin_view_agency_tickets", label: "View agency support tickets" },
];

const PRESETS = [
  { id: "admin", label: "Admin" },
  { id: "recruiter", label: "Recruiter" },
  { id: "contracting_specialist", label: "Contracting" },
  { id: "client_services", label: "Client Services" },
] as const;

function AgencyTeamPage() {
  const listFn = useServerFn(listOrgMembers);
  const { data, isLoading, error } = useQuery({ queryKey: ["agency", "members"], queryFn: () => listFn(), retry: false });
  const [selected, setSelected] = useState<any | null>(null);

  if (isLoading) return <PageShell><Skeleton className="h-72" /></PageShell>;
  if (error || !data) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto">
          <Panel><div className="py-10 text-center text-sm text-muted-foreground">{(error as any)?.message ?? "Only agency owners and admin staff can manage permissions."}</div></Panel>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Team & Permissions"
          subtitle="Set each member's role and exactly what they can see and do. Changes take effect immediately."
          actions={<Button asChild variant="outline" size="sm"><Link to="/team">Team Command Center →</Link></Button>}
        />
        <Panel pad={false}>
          <div className="divide-y divide-border-soft">
            {data.members.map((m: any) => {
              const role = m.isOwner ? "agency_owner" : (m.roles.find((r: string) => ["manager", "staff"].includes(r)) ?? "agent");
              return (
                <div key={m.id} className="flex items-center gap-3 p-4 text-sm">
                  {m.isOwner ? <Crown className="h-4 w-4 text-gold-bright shrink-0" /> : <Shield className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.first_name} {m.last_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                  <Badge variant={m.isOwner ? "gold" : role === "manager" ? "info" : role === "staff" ? "warning" : "outline"} className="capitalize text-[10px]">
                    {m.isOwner ? "Owner" : role}
                  </Badge>
                  {m.permissions?.staff_preset && (
                    <Badge variant="outline" className="text-[10px] capitalize">{String(m.permissions.staff_preset).replace(/_/g, " ")}</Badge>
                  )}
                  {!m.isOwner && (
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setSelected(m)}>
                      Configure
                    </Button>
                  )}
                </div>
              );
            })}
            {data.members.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No team members yet. <Link to="/contracting/invite" className="text-primary hover:underline">Send your first invite →</Link>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {selected && (
        <MemberConfigDialog member={selected} orgId={data.orgId} onClose={() => setSelected(null)} />
      )}
    </PageShell>
  );
}

function MemberConfigDialog({ member, orgId, onClose }: { member: any; orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const roleFn = useServerFn(setMemberRole);
  const permFn = useServerFn(updateMemberPermissions);
  const presetFn = useServerFn(applyStaffPreset);

  const initialRole = member.roles.find((r: string) => ["manager", "staff"].includes(r)) ?? "agent";
  const [role, setRole] = useState<string>(initialRole);
  const [perms, setPerms] = useState<Record<string, any>>({ ...(member.permissions ?? {}) });

  const refresh = () => qc.invalidateQueries({ queryKey: ["agency", "members"] });

  const changeRole = useMutation({
    mutationFn: (r: string) => roleFn({ data: { member_id: member.id, organization_id: orgId, role: r as any } }),
    onSuccess: (_r, r) => { setRole(r); toast.success("Role updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't change role"),
  });

  const toggle = useMutation({
    mutationFn: (patch: Record<string, boolean>) =>
      permFn({ data: { member_id: member.id, organization_id: orgId, patch } }),
    onSuccess: () => refresh(),
    onError: (e: any) => { toast.error(e?.message ?? "Couldn't save"); refresh(); },
  });

  const preset = useMutation({
    mutationFn: (p: string) => presetFn({ data: { member_id: member.id, organization_id: orgId, preset: p as any } }),
    onSuccess: (_r, p) => {
      toast.success("Preset applied");
      // reflect locally
      setPerms((prev) => ({ ...prev, staff_preset: p }));
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't apply preset"),
  });

  const flip = (key: string) => (v: boolean) => {
    setPerms((p) => ({ ...p, [key]: v, ...(p.staff_preset ? { staff_preset: "custom" } : {}) }));
    toggle.mutate({ [key]: v });
  };

  const groups = role === "manager" ? MANAGER_GROUPS : STAFF_GROUPS;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member.first_name} {member.last_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium mb-1.5">Role</div>
            <Select value={role} onValueChange={(r) => changeRole.mutate(r)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {role === "agent"
                ? "Agents have fixed personal-scope access — nothing to configure."
                : role === "manager"
                ? "Managers always see their own production and can use Nova Pro. Configure the rest below."
                : "Staff see only what you grant. Training & resources are always available."}
            </p>
          </div>

          {role === "staff" && (
            <div>
              <div className="text-sm font-medium mb-1.5">Quick Setup</div>
              <div className="flex gap-1.5 flex-wrap">
                {PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={perms.staff_preset === p.id ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => preset.mutate(p.id)}
                    disabled={preset.isPending}
                  >
                    {p.label}
                  </Button>
                ))}
                <Badge variant="outline" className={perms.staff_preset === "custom" ? "border-primary/40 text-gold-bright" : ""}>Custom</Badge>
              </div>
            </div>
          )}

          {role !== "agent" && groups.map((g) => (
            <div key={g.label}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground mb-2">{g.label}</div>
              <div className="space-y-2.5">
                {g.items.map((it) => (
                  <label key={it.key} className="flex items-center justify-between gap-3 text-sm">
                    <span>{it.label}</span>
                    <Switch checked={!!perms[it.key]} onCheckedChange={flip(it.key)} />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {role === "staff" && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground mb-2">Admin Access</div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Enable admin permissions</span>
                <Switch checked={!!perms.staff_is_admin} onCheckedChange={flip("staff_is_admin")} />
              </label>
              {perms.staff_is_admin && (
                <div className="mt-2.5 pl-3 border-l-2 border-primary/30 space-y-2.5">
                  {ADMIN_EXTRAS.map((it) => (
                    <label key={it.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{it.label}</span>
                      <Switch checked={!!perms[it.key]} onCheckedChange={flip(it.key)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
