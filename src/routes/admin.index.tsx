import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@/hooks/use-server-fn";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, FileSignature, LifeBuoy, Building2, UserPlus, ShieldCheck, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { runCommissionBackfill } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Admin Overview — Agent Cloud" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-yellow-500/15 text-yellow-600",
  submitted: "bg-primary/15 text-primary",
  active: "bg-emerald-500/15 text-emerald-600",
  issue: "bg-red-500/15 text-red-600",
  declined: "bg-slate-500/15 text-slate-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-600",
  high: "bg-amber-500/15 text-amber-600",
  normal: "bg-slate-500/15 text-slate-500",
  low: "bg-emerald-500/15 text-emerald-600",
};

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: number | null; icon: any; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
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
        supabase
          .from("contract_requests")
          .select("id, status, updated_at, profiles!agent_id(first_name, last_name), carriers(name)")
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("support_tickets")
          .select("id, subject, priority, status, created_at, profiles!agent_id(first_name, last_name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, created_at")
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("created_at", { ascending: false }),
      ]);
      setContracts(recentContracts.data ?? []);
      setTickets(recentTickets.data ?? []);
      setNewAgents(recentAgents.data ?? []);

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-wide">Admin Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform-wide metrics and activity</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent Contract Activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No contracts yet</p>
            ) : contracts.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.profiles?.first_name} {c.profiles?.last_name}</p>
                  <p className="text-xs text-muted-foreground">{c.carriers?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs font-medium", STATUS_COLORS[c.status] ?? "bg-slate-500/15 text-slate-500")}>{c.status}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Support Tickets</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tickets</p>
              ) : tickets.map((t) => (
                <div key={t.id} className="space-y-1 py-2 border-b border-border last:border-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate flex-1 mr-2">{t.subject}</p>
                    <Badge className={cn("text-xs shrink-0", PRIORITY_COLORS[t.priority] ?? "bg-slate-500/15 text-slate-500")}>{t.priority}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{t.profiles?.first_name} {t.profiles?.last_name}</p>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" asChild>
                      <Link to="/admin/support">Respond</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">New Agents (last 7 days)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : newAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No new agents</p>
              ) : newAgents.map((a) => (
                <div key={a.id} className="space-y-1">
                  <p className="text-sm font-medium">{a.first_name} {a.last_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4" /> Maintenance
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Commission Backfill</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Run the JS commission calculator on all policies that have premium but no commission rows.
                Process 50 at a time. Run multiple times until remaining = 0.
              </p>
              {backfillResult && (
                <div className="text-xs space-y-1">
                  <div>Processed: <span className="font-semibold text-emerald-600">{backfillResult.processed}</span></div>
                  <div>Errors: <span className="font-semibold text-red-600">{backfillResult.errors}</span></div>
                  <div>Remaining: <span className="font-semibold">{backfillResult.remaining}</span></div>
                </div>
              )}
              <Button size="sm" onClick={runBackfill} disabled={backfilling}>
                {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                Run Backfill (50 at a time)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Null Carrier Policies</CardTitle></CardHeader>
            <CardContent>
              {nullCarrierPolicies.length === 0 ? (
                <p className="text-xs text-muted-foreground">No policies with missing carrier. ✓</p>
              ) : (
                <div className="space-y-2">
                  {nullCarrierPolicies.map((p) => {
                    const client = p.clients as any;
                    const agent = p.profiles as any;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-b pb-2 last:border-0 last:pb-0">
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
            </CardContent>
          </Card>
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
    </div>
  );
}
