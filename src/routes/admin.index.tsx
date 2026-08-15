import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@/hooks/use-server-fn";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, FileSignature, LifeBuoy, Building2, UserPlus, ShieldCheck, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

/** A missing or unparseable timestamp must render as a dash, not crash the page. */
function ago(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : formatDistanceToNow(d, { addSuffix: true });
}
import { toast } from "sonner";
import { runCommissionBackfill } from "@/lib/admin.functions";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { SectionLabel } from "@/components/ui/section-label";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Admin Overview — Agent Cloud" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-warning/15 text-warning",
  submitted: "bg-primary/15 text-primary",
  active: "bg-success/15 text-success",
  issue: "bg-destructive/15 text-destructive",
  declined: "bg-muted/15 text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-destructive/15 text-destructive",
  high: "bg-warning/15 text-warning",
  normal: "bg-muted/15 text-muted-foreground",
  low: "bg-success/15 text-success",
};

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: number | null; icon: any; loading: boolean }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <StatTile label={title} value={loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (value ?? 0)} />
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Panel>
  );
}

function AdminOverview() {
  const [stats, setStats] = useState({ agents: null as number | null, contracts: null as number | null, tickets: null as number | null, carriers: null as number | null });
  const [contracts, setContracts] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [newAgents, setNewAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfillResult, setBackfillResult] = useState<{ processed: number; errors: number; remaining: number } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [nullCarrierPolicies, setNullCarrierPolicies] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [fixRow, setFixRow] = useState<any | null>(null);
  const [fixCarrierId, setFixCarrierId] = useState("");
  const [fixing, setFixing] = useState(false);
  const backfillFn = useServerFn(runCommissionBackfill);

  useEffect(() => {
    async function load() {
      const [agentsRes, contractsRes, ticketsRes, carriersRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).neq("status", "terminated"),
        supabase.from("contract_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "submitted"]),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        supabase.from("carriers").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      setStats({
        agents: agentsRes.count,
        contracts: contractsRes.count,
        tickets: ticketsRes.count,
        carriers: carriersRes.count,
      });

      const [recentContracts, recentTickets, recentAgents] = await Promise.all([
        // `requested_at`, not `updated_at`. contract_requests has no
        // updated_at column — its timestamps are requested_at, submitted_at
        // and activated_at — so both the select and the order named a column
        // that does not exist and PostgREST answered 400. That is the
        // "HTTP 400 /rest/v1/contract_requests" the audit saw for owner and
        // manager and not for agent or staff: before the portal was narrowed
        // to super_admin, those were exactly the roles that could open it.
        supabase
          .from("contract_requests")
          .select("id, status, requested_at, profiles!agent_id(first_name, last_name), carriers(name)")
          .order("requested_at", { ascending: false })
          .limit(10),
        // No profiles embed here. support_tickets.agent_id references
        // auth.users, not public.profiles, so PostgREST has no relationship to
        // traverse and refuses the whole query — the second 400. The name is
        // fetched separately below, which costs one round trip and returns
        // rows instead of an error.
        supabase
          .from("support_tickets")
          .select("id, subject, priority, status, created_at, agent_id")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, created_at")
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("created_at", { ascending: false }),
      ]);
      setContracts(recentContracts.data ?? []);
      setNewAgents(recentAgents.data ?? []);

      // The name the embed used to supply, fetched on its own because
      // support_tickets.agent_id points at auth.users and PostgREST cannot
      // join it to profiles. A ticket whose author has no profile row still
      // renders — it just shows no name, rather than taking the page down.
      const ticketRows = recentTickets.data ?? [];
      const authorIds = [...new Set(ticketRows.map((t: any) => t.agent_id).filter(Boolean))];
      const authors = new Map<string, { first_name: string | null; last_name: string | null }>();
      if (authorIds.length) {
        const { data: people } = await supabase
          .from("profiles").select("id, first_name, last_name").in("id", authorIds);
        for (const person of people ?? []) authors.set(person.id, person as any);
      }
      setTickets(ticketRows.map((t: any) => ({ ...t, profiles: authors.get(t.agent_id) ?? null })));

      // Maintenance: null carrier policies + carriers list
      const [nullCarriersRes, carriersListRes] = await Promise.all([
        supabase.from("policies")
          .select("id, product, monthly_premium, agent_id, profiles!agent_id(first_name, last_name), clients(first_name, last_name)")
          .is("carrier_id", null)
          .limit(20),
        supabase.from("carriers").select("id, name").eq("active", true).order("name"),
      ]);
      setNullCarrierPolicies(nullCarriersRes.data ?? []);
      setCarriers(carriersListRes.data ?? []);

      setLoading(false);
    }
    load();
  }, []);

  async function runBackfill() {
    setBackfilling(true);
    try {
      const result = await backfillFn({ data: {} });
      setBackfillResult(result);
      toast.success(`Backfill complete: ${result.processed} processed, ${result.errors} errors`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setBackfilling(false);
  }

  async function fixCarrier(policyId: string, carrierId: string) {
    setFixing(true);
    const { error } = await supabase.from("policies").update({ carrier_id: carrierId }).eq("id", policyId);
    setFixing(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Carrier assigned");
    setFixRow(null);
    setNullCarrierPolicies((prev) => prev.filter((p) => p.id !== policyId));
  }

  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand title="Admin Overview" subtitle="Platform-wide metrics and activity" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--gap)]">
          <StatCard title="Total Agents" value={stats.agents} icon={Users} loading={loading} />
          <StatCard title="Pending Contracts" value={stats.contracts} icon={FileSignature} loading={loading} />
          <StatCard title="Open Tickets" value={stats.tickets} icon={LifeBuoy} loading={loading} />
          <StatCard title="Active Carriers" value={stats.carriers} icon={Building2} loading={loading} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/contracting/invite"><UserPlus className="h-3.5 w-3.5 mr-1.5" />Invite Agent</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/carriers"><Building2 className="h-3.5 w-3.5 mr-1.5" />Add Carrier</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/roles"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Manage Roles</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/support"><LifeBuoy className="h-3.5 w-3.5 mr-1.5" />All Tickets</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-[var(--gap)]">
          <Panel title="Recent Contract Activity" className="xl:col-span-2">
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No contracts yet</p>
              ) : contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border-soft last:border-0">
                  <div>
                    <p className="text-sm font-medium">{c.profiles?.first_name} {c.profiles?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{c.carriers?.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs font-medium", STATUS_COLORS[c.status] ?? "bg-muted/15 text-muted-foreground")}>{c.status}</Badge>
                    <span className="text-xs text-muted-foreground tnum">{ago(c.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="space-y-[var(--gap)]">
            <Panel title="Recent Support Tickets">
              <div className="space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No tickets</p>
                ) : tickets.map((t) => (
                  <div key={t.id} className="space-y-1 py-2 border-b border-border-soft last:border-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate flex-1 mr-2">{t.subject}</p>
                      <Badge className={cn("text-xs shrink-0", PRIORITY_COLORS[t.priority] ?? "bg-muted/15 text-muted-foreground")}>{t.priority}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{t.profiles?.first_name} {t.profiles?.last_name}</p>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" asChild>
                        <Link to="/admin/support">Respond</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="New Agents (last 7 days)">
              <div className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : newAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No new agents</p>
                ) : newAgents.map((a) => (
                  <div key={a.id} className="space-y-1">
                    <p className="text-sm font-medium">{a.first_name} {a.last_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                    <p className="text-xs text-muted-foreground tnum">{ago(a.created_at)}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3 text-muted-foreground">
            <Wrench className="h-4 w-4" />
            <SectionLabel>Maintenance</SectionLabel>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--gap)]">
            <Panel title="Commission Backfill">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Run the JS commission calculator on all policies that have premium but no commission rows.
                  Process 50 at a time. Run multiple times until remaining = 0.
                </p>
                {backfillResult && (
                  <div className="text-xs space-y-1 tnum">
                    <div>Processed: <span className="font-semibold text-success">{backfillResult.processed}</span></div>
                    <div>Errors: <span className="font-semibold text-destructive">{backfillResult.errors}</span></div>
                    <div>Remaining: <span className="font-semibold">{backfillResult.remaining}</span></div>
                  </div>
                )}
                <Button size="sm" onClick={runBackfill} disabled={backfilling}>
                  {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                  Run Backfill (50 at a time)
                </Button>
              </div>
            </Panel>

            <Panel title="Null Carrier Policies">
              {nullCarrierPolicies.length === 0 ? (
                <p className="text-xs text-muted-foreground">No policies with missing carrier. ✓</p>
              ) : (
                <div className="space-y-2">
                  {nullCarrierPolicies.map((p) => {
                    const client = p.clients as any;
                    const agent = p.profiles as any;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-b border-border-soft pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{client ? `${client.first_name} ${client.last_name}` : "—"}</div>
                          <div className="text-muted-foreground">{p.product} · Agent: {agent ? `${agent.first_name} ${agent.last_name}` : "—"}</div>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={() => { setFixRow(p); setFixCarrierId(""); }}>Fix</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      <Dialog open={!!fixRow} onOpenChange={(o) => !o && setFixRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Carrier</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={fixCarrierId} onValueChange={setFixCarrierId}>
              <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
              <SelectContent>
                {carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixRow(null)}>Cancel</Button>
            <Button onClick={() => fixRow && fixCarrierId && fixCarrier(fixRow.id, fixCarrierId)} disabled={!fixCarrierId || fixing}>
              {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
