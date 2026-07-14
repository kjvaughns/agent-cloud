import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { UserPlus, Mail, Phone, Eye, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtCurrency } from "@/lib/format";
import {
  getTeamDownline,
  getTeamKpis,
  getTeamAlerts,
  sendAgentReminder,
  getAgentDetail,
  deactivateAgent,
  checkIsAdmin,
  getAllAgentsForHierarchy,
  type TeamAgent,
} from "@/lib/team.functions";
import { adminMoveAgent } from "@/lib/admin.functions";
import { AgentProfileDrawer } from "@/components/team/agent-profile-drawer";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/utils";

const downlineQO = queryOptions({ queryKey: ["team", "downline"], queryFn: () => getTeamDownline() });
const kpisQO = queryOptions({ queryKey: ["team", "kpis"], queryFn: () => getTeamKpis() });
const alertsQO = queryOptions({ queryKey: ["team", "alerts"], queryFn: () => getTeamAlerts() });

function TeamPending() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team Command Center — Agent Cloud" }] }),
  pendingComponent: TeamPending,
  loader: async ({ context }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(downlineQO),
        context.queryClient.ensureQueryData(kpisQO),
        context.queryClient.ensureQueryData(alertsQO),
      ]);
    } catch {
      // queries have built-in fallbacks; let the component handle empty state
    }
  },
  component: TeamPage,
});

function initials(f?: string | null, l?: string | null) {
  return `${(f ?? "?")[0] ?? "?"}${(l ?? "")[0] ?? ""}`.toUpperCase();
}

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/15 text-green-600 border-green-500/30",
    pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    inactive: "bg-muted text-muted-foreground border-border",
    terminated: "bg-red-500/15 text-red-600 border-red-500/30",
    imported: "bg-primary/15 text-primary border-primary/30",
  };
  return <Badge variant="outline" className={map[status] ?? map.pending}>{status}</Badge>;
}

const isAdminQO = queryOptions({ queryKey: ["me", "isAdmin"], queryFn: () => checkIsAdmin() });

function TeamPage() {
  const { data: kpis } = useSuspenseQuery(kpisQO);
  const { data: downlineAll } = useSuspenseQuery(downlineQO);
  const downline = useMemo(
    () => downlineAll.filter((a) => !(a as any).is_hidden && a.status !== "terminated" && a.status !== "imported"),
    [downlineAll],
  );
  const downlineForRoster = useMemo(
    () => downlineAll.filter((a) => !(a as any).is_hidden),
    [downlineAll],
  );
  const { data: adminCheck } = useQuery(isAdminQO);
  const isAdmin = adminCheck?.isAdmin ?? false;
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  return (
    <PageShell>
      <div className="space-y-6">
      <HeroBand
        title="Team Command Center"
        subtitle={
          <>
            <span className="tnum">{kpis.total}</span> agent{kpis.total === 1 ? "" : "s"} · <span className="tnum">{kpis.max_depth}</span> depth level{kpis.max_depth === 1 ? "" : "s"}
          </>
        }
        actions={
          <Button asChild>
            <Link to="/contracting/invite"><UserPlus className="h-4 w-4 mr-2" />Invite</Link>
          </Button>
        }
      />

      {downline.length === 0 ? (
        <Panel>
          <div className="py-16 text-center space-y-4">
            <Users className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No team members yet.</p>
            <Button asChild><Link to="/contracting/invite"><UserPlus className="h-4 w-4 mr-2" />Invite Your First Agent</Link></Button>
          </div>
        </Panel>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="org">Organization</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            <KpiRow />
            <DepthChart />
            <TeamAlertsCard />
            <ActivationQueue downline={downline} onOpen={setOpenAgent} />
            <div className="grid md:grid-cols-2 gap-4">
              <NewAgents downline={downline} onOpen={setOpenAgent} />
              <RecentlyActive downline={downline} onOpen={setOpenAgent} />
            </div>
          </TabsContent>

          <TabsContent value="roster" className="space-y-6 mt-4">
            <KpiRow />
            <DepthChart />
            <RosterTable downline={downlineForRoster} onOpen={setOpenAgent} />
          </TabsContent>

          <TabsContent value="org" className="mt-4">
            <OrgChart downline={downline} onOpen={setOpenAgent} />
          </TabsContent>
        </Tabs>
      )}

      <AgentProfileDrawer agentId={openAgent} onClose={() => setOpenAgent(null)} isAdmin={isAdmin} />
      </div>
    </PageShell>
  );
}

// ============ KPI Row ============
function KpiRow() {
  const { data: kpis } = useSuspenseQuery(kpisQO);
  const tiles: { value: number | string; label: string; sub: string; tone?: "default" | "gold" }[] = [
    { value: kpis.total, label: "Total Agents", sub: `${kpis.direct} direct reports` },
    { value: kpis.active, label: "Active", sub: "Ready to sell", tone: "gold" },
    { value: kpis.active_writers, label: "Active Writers", sub: "Sold in last 30 days", tone: "gold" },
    { value: kpis.pending, label: "Pending", sub: "Awaiting review" },
    { value: kpis.contracts_total, label: "Contracts", sub: `${kpis.contracts_active_pct}% active rate` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[10px] border border-border-soft bg-surface-2 p-3.5">
          <StatTile label={t.label} value={t.value} tone={t.tone ?? "default"} delta={t.sub} />
        </div>
      ))}
    </div>
  );
}

// ============ Depth Chart ============
function DepthChart() {
  const { data: kpis } = useSuspenseQuery(kpisQO);
  const dist = kpis.depth_distribution ?? [];
  const max = Math.max(1, ...dist.map((d) => d.count));
  return (
    <Panel title="Team Depth Distribution">
      <div className="space-y-2">
        {dist.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents yet.</p>
        ) : dist.map((d) => (
          <div key={d.level} className="flex items-center gap-3">
            <div className="w-12 text-xs font-medium tnum">L{d.level}{d.level === 1 ? " (Direct)" : ""}</div>
            <div className="flex-1 h-6 bg-surface-2 rounded overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <div className="w-20 text-xs text-right tnum">{d.count} agent{d.count === 1 ? "" : "s"}</div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground pt-2">Levels deep in your organization</p>
      </div>
    </Panel>
  );
}

// ============ Alerts ============
function TeamAlertsCard() {
  const { data: alerts } = useSuspenseQuery(alertsQO);
  const items: { kind: string; text: string }[] = [];
  if (alerts.stale.length > 0) items.push({ kind: "stale", text: `${alerts.stale.length} agent${alerts.stale.length === 1 ? "" : "s"} haven't been active for 14+ days: ${alerts.stale.slice(0, 3).map((a) => a.name).join(", ")}` });
  if (alerts.lapse.length > 0) items.push({ kind: "lapse", text: `${alerts.lapse.length} agent${alerts.lapse.length === 1 ? "" : "s"} have lapse-pending policies that need follow-up` });
  if (alerts.stuck_contracts.length > 0) items.push({ kind: "stuck", text: `${alerts.stuck_contracts.length} contract request${alerts.stuck_contracts.length === 1 ? "" : "s"} in 'Issue' status for 7+ days` });
  if (items.length === 0) return null;
  return (
    <Panel title="Alerts">
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.kind} className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ============ Activation Queue ============
function ActivationQueue({ downline, onOpen }: { downline: TeamAgent[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const sendReminder = useServerFn(sendAgentReminder);
  const incomplete = downline.filter((a) => a.completion_pct < 100);
  const m = useMutation({
    mutationFn: (agentId: string) => sendReminder({ data: { agentId } }),
    onSuccess: (res, agentId) => {
      const agent = downline.find((a) => a.id === agentId);
      const name = `${agent?.first_name ?? ""} ${agent?.last_name ?? ""}`.trim();
      if (res.ok) toast.success(`Reminder sent to ${name}`);
      else if (res.reason === "throttled") toast.info(`Already reminded ${name} in the last 24 hours`);
      else toast.error("Couldn't send reminder");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel
      title="Activation Queue"
      action={incomplete.length > 0 ? <Badge variant="destructive" className="tnum">{incomplete.length} Needs Fix</Badge> : undefined}
    >
      {incomplete.length === 0 ? (
        <p className="text-sm text-muted-foreground">All agents have complete profiles. Nice.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">These agents have incomplete profiles and cannot be fully contracted.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {incomplete.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-9 w-9"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.first_name} {a.last_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.email}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 shrink-0">Needs Fix</Badge>
                </div>
                <div className="text-xs">
                  Profile: <span className="font-medium tnum">{a.completion_pct}% complete</span>
                </div>
                <Progress value={a.completion_pct} className="h-1.5" />
                {a.missing.length > 0 && (
                  <div className="text-xs text-muted-foreground">Missing: {a.missing.join(", ")}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => m.mutate(a.id)} disabled={m.isPending}>
                    <Mail className="h-3 w-3 mr-1" /> Send Reminder
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(a.id)}>
                    <Eye className="h-3 w-3 mr-1" /> View Profile
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ============ New Agents / Recently Active ============
function NewAgents({ downline, onOpen }: { downline: TeamAgent[]; onOpen: (id: string) => void }) {
  const cutoff = Date.now() - 7 * 86400000;
  const recent = downline.filter((a) => new Date(a.created_at).getTime() > cutoff).slice(0, 5);
  return (
    <Panel title="New Agents (Last 7 Days)">
      <div className="space-y-2">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new agents this week.</p>
        ) : recent.map((a) => (
          <button key={a.id} onClick={() => onOpen(a.id)} className="w-full flex items-center gap-3 p-2 rounded hover:bg-surface-2 text-left transition-colors">
            <Avatar className="h-8 w-8"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-medium truncate">{a.first_name} {a.last_name}</div>
              <div className="text-xs text-muted-foreground tnum">Joined {new Date(a.created_at).toLocaleDateString()} · {a.contracts_count} contracts · {a.policies_count} policies</div>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function RecentlyActive({ downline, onOpen }: { downline: TeamAgent[]; onOpen: (id: string) => void }) {
  const sorted = [...downline]
    .filter((a) => a.last_active_at)
    .sort((a, b) => new Date(b.last_active_at!).getTime() - new Date(a.last_active_at!).getTime())
    .slice(0, 5);
  return (
    <Panel title="Recently Active">
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        ) : sorted.map((a) => (
          <button key={a.id} onClick={() => onOpen(a.id)} className="w-full flex items-center gap-3 p-2 rounded hover:bg-surface-2 text-left transition-colors">
            <Avatar className="h-8 w-8"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-medium truncate">{a.first_name} {a.last_name}</div>
              <div className="text-xs text-muted-foreground tnum">Last active {timeAgo(a.last_active_at)} · {a.policies_count} policies · {fmtCurrency(Number(a.premium_total))}</div>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

// ============ Roster Table ============
function RosterTable({ downline, onOpen }: { downline: TeamAgent[]; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all_except_imported");
  const [depth, setDepth] = useState("all");
  const [page, setPage] = useState(0);
  const perPage = 25;

  const agentById = useMemo(() => new Map(downline.map((a) => [a.id, a])), [downline]);

  const filtered = useMemo(() => downline.filter((a) => {
    const q = search.toLowerCase();
    if (q && !`${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q)) return false;
    if (status === "all_except_imported" && (a.status === "imported" || a.status === "terminated")) return false;
    if (status !== "all" && status !== "all_except_imported" && a.status !== status) return false;
    if (depth !== "all" && a.depth_level !== Number(depth)) return false;
    return true;
  }), [downline, search, status, depth]);

  const pageRows = filtered.slice(page * perPage, (page + 1) * perPage);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const depths = Array.from(new Set(downline.map((a) => a.depth_level))).sort((a, b) => a - b);

  return (
    <Panel>
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_except_imported">Active / Pending / Inactive</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="imported">Imported (Not Joined)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={depth} onValueChange={(v) => { setDepth(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depth Levels</SelectItem>
              {depths.map((d) => <SelectItem key={d} value={String(d)}>L{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Upline</TableHead>
                <TableHead>Depth</TableHead>
                <TableHead>Carriers</TableHead>
                <TableHead>Policies</TableHead>
                <TableHead>Production</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No agents match.</TableCell></TableRow>
              ) : pageRows.map((a) => {
                const upline = a.upline_id ? agentById.get(a.upline_id) : null;
                return (
                <TableRow key={a.id}>
                  <TableCell>
                    <button onClick={() => onOpen(a.id)} className="flex items-center gap-2 text-left hover:underline">
                      <Avatar className="h-8 w-8"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
                      <div>
                        <div className="font-medium">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-sm">
                    {upline
                      ? <span>{upline.first_name} {upline.last_name}</span>
                      : <span className="text-muted-foreground text-xs">{a.upline_id ? "—" : "Root"}</span>
                    }
                  </TableCell>
                  <TableCell className="tnum">L{a.depth_level}</TableCell>
                  <TableCell className="tnum">{a.contracts_count} active</TableCell>
                  <TableCell className="tnum">{a.policies_count}</TableCell>
                  <TableCell className="tnum">{fmtCurrency(Number(a.premium_total))}</TableCell>
                  <TableCell className="tnum">{timeAgo(a.last_active_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => onOpen(a.id)}><Eye className="h-4 w-4" /></Button>
                    {a.email && (
                      <Button variant="ghost" size="icon" asChild><a href={`mailto:${a.email}`}><Mail className="h-4 w-4" /></a></Button>
                    )}
                    {a.phone && (
                      <Button variant="ghost" size="icon" asChild><a href={`tel:${a.phone}`}><Phone className="h-4 w-4" /></a></Button>
                    )}
                  </TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground tnum">{filtered.length} total</div>
            <div className="flex gap-2 items-center">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <div className="px-3 py-1 tnum">Page {page + 1} of {pages}</div>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ============ Org Chart ============
type TreeNode = TeamAgent & { children: TreeNode[] };

function buildTree(rootId: string, downline: TeamAgent[]): TreeNode[] {
  const byUpline = new Map<string, TeamAgent[]>();
  for (const a of downline) {
    const k = a.upline_id ?? "";
    if (!byUpline.has(k)) byUpline.set(k, []);
    byUpline.get(k)!.push(a);
  }
  const build = (id: string): TreeNode[] =>
    (byUpline.get(id) ?? []).map((a) => ({ ...a, children: build(a.id) }));
  return build(rootId);
}

function OrgChart({ downline, onOpen }: { downline: TeamAgent[]; onOpen: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (downline.length > 50) return new Set(downline.filter((a) => a.depth_level >= 1).map((a) => a.id));
    return new Set();
  });

  const rootId = downline[0]?.upline_id ?? "";
  const tree = useMemo(() => buildTree(rootId, downline), [rootId, downline]);

  const toggle = (id: string) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <Panel>
      <header className="flex items-center justify-between gap-3 mb-3.5">
        <div>
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>Organization Chart</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Visual hierarchy of your team</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </header>
      <div>
        <div
          className="border border-border rounded-lg bg-surface-2 overflow-hidden h-[600px] relative cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
          onPointerMove={(e) => dragging && setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y })}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
        >
          <div className="absolute inset-0 flex items-start justify-center pt-8" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "top center" }}>
            <TooltipProvider>
              <div className="flex flex-col items-center gap-6">
                <RootNode />
                <div className="flex gap-6 items-start">
                  {tree.map((n) => <OrgNode key={n.id} node={n} collapsed={collapsed} toggle={toggle} onOpen={onOpen} />)}
                </div>
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function RootNode() {
  return (
    <div className="border border-primary/40 rounded-lg bg-gold-glow px-4 py-3 text-center min-w-[140px]">
      <div className="font-medium text-sm text-gold-bright">You</div>
      <div className="text-xs text-muted-foreground">Upline</div>
    </div>
  );
}

function OrgNode({ node, collapsed, toggle, onOpen }: { node: TreeNode; collapsed: Set<string>; toggle: (id: string) => void; onOpen: (id: string) => void }) {
  const isCollapsed = collapsed.has(node.id);
  const borderColor = node.status === "active" ? "border-l-green-500" : node.status === "pending" ? "border-l-amber-500" : node.status === "imported" ? "border-l-primary" : "border-l-muted-foreground";
  const dotColor = node.status === "active" ? "bg-green-500" : node.status === "pending" ? "bg-amber-500" : node.status === "imported" ? "bg-primary" : "bg-muted-foreground";
  const isActive = node.status === "active";
  return (
    <div className="flex flex-col items-center gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => toggle(node.id)} className={cn("border border-border border-l-4 rounded-lg px-3 py-2 min-w-[140px] hover:shadow-md transition-shadow", borderColor, isActive ? "bg-gold-glow" : "bg-card")}>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials(node.first_name, node.last_name)}</AvatarFallback></Avatar>
              <div className="text-left">
                <div className="font-medium text-sm leading-tight">{node.first_name} {node.last_name}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                  <span className="tnum">{node.contracts_count}</span> contracts
                </div>
              </div>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <div className="font-medium">{node.first_name} {node.last_name}</div>
            <div>{node.email}</div>
            <div>Production: {fmtCurrency(Number(node.premium_total))}</div>
            <div>Policies: {node.policies_count}</div>
            <div>Last active: {timeAgo(node.last_active_at)}</div>
            <Button size="sm" variant="outline" className="w-full mt-1" onClick={(e) => { e.stopPropagation(); onOpen(node.id); }}>
              <Eye className="h-3 w-3 mr-1" /> View
            </Button>
          </div>
        </TooltipContent>
      </Tooltip>
      {!isCollapsed && node.children.length > 0 && (
        <div className="flex gap-4 items-start pt-2 border-t-2 border-border">
          {node.children.map((c) => <OrgNode key={c.id} node={c} collapsed={collapsed} toggle={toggle} onOpen={onOpen} />)}
        </div>
      )}
      {isCollapsed && node.children.length > 0 && (
        <div className="text-xs text-muted-foreground">+{node.children.length} hidden</div>
      )}
    </div>
  );
}

// ============ Move Agent Section ============
function MoveAgentSection({ agentId, currentUplineId }: { agentId: string; currentUplineId: string | null }) {
  const qc = useQueryClient();
  const allAgentsFn = useServerFn(getAllAgentsForHierarchy);
  const moveFn = useServerFn(adminMoveAgent);
  const [newUplineId, setNewUplineId] = useState("");

  const { data: allAgents = [] } = useQuery({
    queryKey: ["team", "allAgentsForHierarchy"],
    queryFn: () => allAgentsFn(),
  });

  const candidates = (allAgents as any[]).filter((a: any) => a.id !== agentId);
  const current = (allAgents as any[]).find((a: any) => a.id === currentUplineId);

  const move = useMutation({
    mutationFn: () => moveFn({ data: { agent_id: agentId, new_upline_id: newUplineId === "__none__" ? null : newUplineId } }),
    onSuccess: () => {
      toast.success("Upline updated");
      qc.invalidateQueries({ queryKey: ["team"] });
      setNewUplineId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Current upline: {current ? `${current.first_name} ${current.last_name}` : "None (root)"}
      </div>
      <Select value={newUplineId} onValueChange={setNewUplineId}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select new upline..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No upline (make root)</SelectItem>
          {candidates.map((a: any) => (
            <SelectItem key={a.id} value={a.id}>
              {a.first_name} {a.last_name} {a.email ? `(${a.email})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!newUplineId || move.isPending}
        onClick={() => move.mutate()}
      >
        {move.isPending ? "Moving..." : "Move Agent"}
      </Button>
    </div>
  );
}

// ============ Agent Detail Drawer ============
function AgentDetailDrawer({ agentId, onClose, isAdmin }: { agentId: string | null; onClose: () => void; isAdmin: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const detailFn = useServerFn(getAgentDetail);
  const deactivateFn = useServerFn(deactivateAgent);
  const { data, isLoading } = useQuery({
    queryKey: ["team", "agent", agentId],
    queryFn: () => detailFn({ data: { agentId: agentId! } }),
    enabled: !!agentId,
  });
  const { data: downline } = useSuspenseQuery(downlineQO);
  const summary = downline.find((a) => a.id === agentId);

  const deactivate = useMutation({
    mutationFn: () => deactivateFn({ data: { agentId: agentId! } }),
    onSuccess: () => {
      toast.success("Agent deactivated");
      qc.invalidateQueries({ queryKey: ["team"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={!!agentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] sm:w-[400px] overflow-y-auto">
        {!data || isLoading ? (
          <div className="space-y-3 pt-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12"><AvatarFallback>{initials(data.profile?.first_name, data.profile?.last_name)}</AvatarFallback></Avatar>
                <div>
                  <SheetTitle>{data.profile?.first_name} {data.profile?.last_name}</SheetTitle>
                  <StatusBadge status={data.profile?.status ?? "pending"} />
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-4 mt-4 text-sm">
              <div className="space-y-1">
                <div>{data.profile?.email}</div>
                <div>{data.profile?.phone ?? "—"}</div>
                <div className="text-xs text-muted-foreground">Joined {data.profile?.created_at ? new Date(data.profile.created_at).toLocaleDateString() : "—"}</div>
              </div>

              {summary && (
                <div>
                  <div className="font-medium mb-1">Profile Completion</div>
                  <Progress value={summary.completion_pct} className="h-2" />
                  <div className="text-xs mt-1">{summary.completion_pct}% complete</div>
                  {summary.missing.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">Missing: {summary.missing.join(", ")}</div>
                  )}
                </div>
              )}

              <div>
                <div className="font-medium mb-2">Active Contracts</div>
                {data.contracts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active contracts.</p>
                ) : (
                  <div className="space-y-1">
                    {data.contracts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs border rounded p-2">
                        <span>{(c as { carriers?: { name?: string } }).carriers?.name ?? "Carrier"}</span>
                        <Badge variant="outline">{c.commission_level ?? `${Number(c.assigned_pct ?? 0) * 100}%`}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="font-medium mb-2">Production</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Total Policies: <span className="font-medium">{data.breakdown.total}</span></div>
                  <div>Total Premium: <span className="font-medium">{fmtCurrency(data.breakdown.premium)}</span></div>
                  <div>Active: <span className="font-medium text-green-600">{data.breakdown.active}</span></div>
                  <div>Lapsed: <span className="font-medium text-red-600">{data.breakdown.lapsed}</span></div>
                  <div>In Review: <span className="font-medium text-amber-600">{data.breakdown.in_review}</span></div>
                </div>
              </div>

              <div>
                <div className="font-medium mb-2">Recent Activity</div>
                {data.recent.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent activity.</p>
                ) : (
                  <div className="space-y-1">
                    {data.recent.map((p) => (
                      <div key={p.id} className="text-xs border rounded p-2">
                        <div className="font-medium">{p.product ?? "Policy"} — {(p as { carriers?: { name?: string } }).carriers?.name ?? ""}</div>
                        <div className="text-muted-foreground">{new Date(p.posted_at).toLocaleDateString()} · {fmtCurrency(Number(p.annual_premium ?? 0))} · {p.status}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <div>
                  <div className="font-medium mb-2">Move Agent</div>
                  <MoveAgentSection agentId={agentId!} currentUplineId={data.profile?.upline_id ?? null} />
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate({ to: "/account/producer-profile" })}>View Full Profile</Button>
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" disabled={deactivate.isPending}>
                        <Trash2 className="h-4 w-4 mr-1" /> Deactivate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate agent?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark the agent as inactive. They will lose access to Agent Cloud. This action can be reversed by an admin.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deactivate.mutate()}
                        >
                          Deactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
