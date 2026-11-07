import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listOrgMembers } from "@/lib/permissions.functions";
import { sendTeamInvites } from "@/lib/self-serve.functions";
import { AgencyTeamPage } from "@/components/agency-team-page";
import { UpgradeToAgency } from "@/components/access-gate";
import { HubCard, HubLayout, AdvancedDrawer } from "@/components/settings/hub-card";

const ROLE_CARDS = [
  { id: "agency_owner", label: "Owner", can: "Everything, including billing and payouts" },
  { id: "admin", label: "Admin staff", can: "Runs the agency day to day, manages staff" },
  { id: "manager", label: "Manager", can: "Leads a team, sees their downline's book" },
  { id: "agent", label: "Agent", can: "Their own clients, policies and commissions" },
];

function roleOf(m: any) {
  if (m.isOwner) return "agency_owner";
  if (m.isAdmin) return "admin";
  return m.roles?.find((r: string) => ["manager", "staff"].includes(r)) ?? "agent";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InviteBox() {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendTeamInvites);
  const [rows, setRows] = useState<string[]>([""]);
  const valid = rows.map((r) => r.trim()).filter((r) => EMAIL.test(r));
  const send = useMutation({
    mutationFn: () => sendFn({ data: { emails: valid } }),
    onSuccess: (r: any) => { toast.success(`Invite${r.count === 1 ? "" : "s"} sent.`); setRows([""]); qc.invalidateQueries({ queryKey: ["agency", "members"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't send invites"),
  });
  return (
    <HubCard title="Invite agents" blurb="They get an email with a link to join your agency.">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input type="email" placeholder="agent@email.com" value={r} aria-label={`Invite email ${i + 1}`}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => { if (e.key === "Enter" && EMAIL.test(r.trim())) setRows([...rows, ""]); }} />
            {rows.length > 1 && (
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setRows([...rows, ""])}><Plus className="mr-1.5 h-4 w-4" /> Add</Button>
        <Button variant="ink" className="rounded-full" disabled={!valid.length || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send {valid.length || ""} invite{valid.length === 1 ? "" : "s"}
        </Button>
      </div>
    </HubCard>
  );
}

export function TeamHub({ isSolo, isOwner }: { isSolo: boolean; isOwner: boolean }) {
  const listFn = useServerFn(listOrgMembers);
  const { data, isLoading } = useQuery({ queryKey: ["agency", "members"], queryFn: () => listFn(), retry: false });
  const [adv, setAdv] = useState(false);
  if (isSolo) return <UpgradeToAgency isOwner={isOwner} />;
  const members = ((data as any)?.members ?? []) as any[];
  const counts = members.reduce<Record<string, number>>((acc, m) => { const r = roleOf(m); acc[r] = (acc[r] ?? 0) + 1; return acc; }, {});

  return (
    <HubLayout>
      {isOwner && <InviteBox />}

      <HubCard title="Roles" blurb="What each role can do. Change a person's role under Advanced.">
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLE_CARDS.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-3">
              <p className="flex items-center justify-between text-sm font-medium">{r.label}<span className="tnum text-xs text-muted-foreground">{counts[r.id === "admin" ? "admin" : r.id] ?? 0}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.can}</p>
            </div>
          ))}
        </div>
      </HubCard>

      <HubCard title="Your team" blurb={`${members.length} ${members.length === 1 ? "person" : "people"}`}>
        {isLoading ? <Skeleton className="h-40" /> : (
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const role = roleOf(m);
              const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email;
              return (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {m.isOwner ? <Crown className="h-4 w-4" /> : name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <Badge variant={m.isOwner ? "gold" : "outline"} className="shrink-0 text-[10px]">
                    {ROLE_CARDS.find((r) => r.id === role)?.label ?? (role === "staff" ? "Staff" : role)}
                  </Badge>
                  {!m.isOwner && (
                    <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => setAdv(true)}>Edit</Button>
                  )}
                </li>
              );
            })}
            {members.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No one yet — invite your first agent above.</li>}
          </ul>
        )}
      </HubCard>

      <AdvancedDrawer label="roles, presets & per-permission switches" open={adv} onOpenChange={setAdv}>
        <AgencyTeamPage embedded />
      </AdvancedDrawer>
    </HubLayout>
  );
}
