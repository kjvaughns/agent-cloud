import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { isInactiveAgentId } from "@/lib/agents/inactive";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserPlus, Mail, Phone, Eye, AlertTriangle, Trash2, Users, Loader2, LayoutList, Network, Clock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { fmtCurrency } from "@/lib/format";
import {
  getTeamDownline,
  getTeamRoster,
  type RosterAgent,
  getTeamKpis,
  getTeamAlerts,
  sendAgentReminder,
  getAgentDetail,
  checkIsAdmin,
  getAllAgentsForHierarchy,
  setAgentPosition,
  setAgentStatus,
  type TeamAgent,
} from "@/lib/team.functions";
import { listAgencyLevels } from "@/lib/contracting-records.functions";
import { PositionCell, PositionPill } from "@/components/team/position-pill";
import { needsPosition, positionLabel, sortPositions, type Position } from "@/lib/team/positions";
import { gettingReady, goingQuiet, byQuietest, byLeastReady, QUIET_AFTER_DAYS } from "@/lib/team/needs-you";
import { RANGE_LABELS, producedInRange, rangeBounds, type RangeKey } from "@/lib/team/production";
import { adminMoveAgent } from "@/lib/admin.functions";
import { AgentProfileDrawer } from "@/components/team/agent-profile-drawer";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { getMyAccess } from "@/lib/permissions.functions";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/utils";
import {
  STAGE_LABELS,
  type ComplianceLevel,
  type LifecycleStage,
  type RiskFlag,
} from "@/lib/team-roster";

export const downlineQO = queryOptions({ queryKey: ["team", "downline"], queryFn: () => getTeamDownline() });
export const kpisQO = queryOptions({ queryKey: ["team", "kpis"], queryFn: () => getTeamKpis() });
export const alertsQO = queryOptions({ queryKey: ["team", "alerts"], queryFn: () => getTeamAlerts() });
// The roster needs two things the downline RPC does not carry — compliance and
// days since last sale — so it has its own query rather than making every
// consumer of the downline pay for them.
export const rosterQO = (start: string | null, end: string | null) => queryOptions({
  // The range is part of the key: two windows are two different answers, and
  // caching them together would show last week's numbers under "All".
  queryKey: ["team", "roster", start ?? "all", end ?? "open"],
  queryFn: () => getTeamRoster({ data: { rangeStart: start, rangeEnd: end } }),
});

function TeamPending() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Agent Cloud" }] }),
  // ?agent= opens that person's drawer directly. Search results for an agent
  // used to land here on an unfiltered roster, which is a dead end dressed up
  // as a result — you searched for a name and got a list to search again.
  validateSearch: (s: Record<string, unknown>): { agent?: string } => ({
    ...(typeof s.agent === "string" && s.agent ? { agent: s.agent } : {}),
  }),
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

/** A previous agent has no profile to open. */
function canOpen(id: string) { return !isInactiveAgentId(id); }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    pending: "bg-warning/15 text-warning border-warning/30",
    inactive: "bg-muted text-muted-foreground border-border",
    terminated: "bg-destructive/15 text-destructive border-destructive/30",
    imported: "bg-primary/15 text-primary border-primary/30",
  };
  return <Badge variant="outline" className={map[status] ?? map.pending}>{status}</Badge>;
}

const STAGE_TONE: Record<LifecycleStage, string> = {
  active: "bg-success/15 text-success border-success/30",
  at_risk: "bg-warning/15 text-warning border-warning/30",
  contracted: "bg-primary/15 text-primary border-primary/30",
  licensed: "bg-info/15 text-info border-info/30",
  onboarding: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
  terminated: "bg-destructive/15 text-destructive border-destructive/30",
};

/**
 * The stage, and the reason when there is one.
 *
 * "At risk" on its own is a dead end — it tells you to go and find out why,
 * which is the work the roster is supposed to save. The first reason is shown
 * inline and the rest are on hover, because one line per agent is what makes
 * the list scannable.
 */
function StageBadge({ stage, flags }: { stage: LifecycleStage; flags: RiskFlag[] }) {
  const badge = (
    <Badge variant="outline" className={cn("whitespace-nowrap", STAGE_TONE[stage])}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
  if (flags.length === 0) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex flex-col items-start gap-0.5">
            {badge}
            <span className="max-w-[190px] truncate text-[11px] text-muted-foreground">
              {flags[0].reason}
              {flags.length > 1 ? ` +${flags.length - 1}` : ""}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <ul className="space-y-0.5 text-xs">
            {flags.map((f) => (
              <li key={f.key} className={f.severity === "critical" ? "text-destructive" : ""}>
                {f.reason}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Licences and E&O at a glance.
 *
 * `unknown` is deliberately its own colour rather than folded into green. An
 * agent with no licence record is not compliant — nobody has told us — and
 * showing that as a pass is the mistake this dot exists to prevent.
 */
function ComplianceDot({ level }: { level: ComplianceLevel }) {
  const meta: Record<ComplianceLevel, { cls: string; label: string }> = {
    ok: { cls: "bg-success", label: "Licences and E&O current" },
    warn: { cls: "bg-warning", label: "Something expires soon, or E&O is missing" },
    bad: { cls: "bg-destructive", label: "Expired, or no active licence" },
    unknown: { cls: "bg-muted-foreground/40", label: "Nothing on file yet" },
  };
  const m = meta[level];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn("inline-block h-2.5 w-2.5 rounded-full", m.cls)}
            aria-label={m.label}
          />
        </TooltipTrigger>
        <TooltipContent side="top"><span className="text-xs">{m.label}</span></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const isAdminQO = queryOptions({ queryKey: ["me", "isAdmin"], queryFn: () => checkIsAdmin() });

function TeamPage() {
  const { data: kpis } = useSuspenseQuery(kpisQO);
  const { data: downlineAll } = useSuspenseQuery(downlineQO);
  const downline = useMemo(
    () => downlineAll.filter((a) => !(a as any).is_hidden && a.status !== "terminated" && a.status !== "imported"),
    [downlineAll],
  );
  // The range lives on the page, not inside the table, because it drives the
  // query the table renders.
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [customRange, setCustomRange] = useState<{ from?: string; to?: string }>({});
  const bounds = useMemo(
    () => rangeBounds(rangeKey, Date.now(), customRange),
    [rangeKey, customRange],
  );
  const { data: roster } = useQuery(rosterQO(bounds.start, bounds.end));
  const downlineForRoster = useMemo(
    () => ((roster?.rows ?? []) as RosterAgent[]).filter((a) => !(a as any).is_hidden),
    [roster],
  );
  const { data: adminCheck } = useQuery(isAdminQO);
  const isAdmin = adminCheck?.isAdmin ?? false;
  const { agent: agentParam } = Route.useSearch();
  const [openAgent, setOpenAgent] = useState<string | null>(agentParam ?? null);

  // Following a second search result while the drawer is already open should
  // swap to the new person rather than sit on the old one.
  useEffect(() => {
    if (agentParam) setOpenAgent(agentParam);
  }, [agentParam]);

  // Roles & Permissions moved to Settings; what is left of this here is the
  // permission to assign positions from a roster row.
  const accessFn = useServerFn(getMyAccess);
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => accessFn() });
  // Computed server-side so the row action and the server's own check cannot
  // disagree — gating on isOwner alone hid it from owners whose account was
  // never written into organizations.owner_id.
  const canManageRoles = Boolean(access?.canManageRoles);

  // Which lens on the roster, remembered per person. An owner who thinks in
  // legs and one who thinks in rows should each find the page as they left it.
  const [view, setView] = useState<"table" | "org">(() => {
    if (typeof window === "undefined") return "table";
    return window.localStorage.getItem("team.view") === "org" ? "org" : "table";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("team.view", view);
  }, [view]);

  return (
    <PageShell>
      <div className="space-y-6">
      <HeroBand
        title="Team"
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
      ) : (<>
        <KpiRow />

        {/* Region A. The reason you opened the page: who is stuck, and who has
            gone quiet. Everything below is reference material you go looking
            for. */}
        <NeedsYou rows={downlineForRoster} onOpen={setOpenAgent} />
        {/* Renders nothing when there is nothing wrong. Kept because it
            carries two warnings neither list above covers: lapse-pending
            policies and contract requests stuck in Issue. */}
        <TeamAlertsCard />

        {/* Region B. The same people, two lenses. */}
        <div data-tour="team-roster" className="space-y-3">
          <div className="flex items-center gap-1 rounded-[10px] border border-border-soft bg-surface-2 p-1 w-fit">
            {([["table", "Table", LayoutList], ["org", "Org", Network]] as const).map(([v, label, Ico]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  view === v ? "bg-surface-1 font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Ico className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {view === "table" ? (
            <RosterTable
              downline={downlineForRoster}
              onOpen={setOpenAgent}
              canAssign={canManageRoles}
              rangeKey={rangeKey}
              onRangeKey={setRangeKey}
              customRange={customRange}
              onCustomRange={setCustomRange}
            />
          ) : (
            <OrgList downline={downlineForRoster} onOpen={setOpenAgent} />
          )}
        </div>
      </>)}

      <AgentProfileDrawer agentId={openAgent} onClose={() => setOpenAgent(null)} isAdmin={isAdmin} />
      </div>
    </PageShell>
  );
}

// ============ Region A · Needs you ============
/**
 * Two short lists, derived from roster rows already on the wire.
 *
 * The split is deliberate and the two never overlap: `gettingReady` is people
 * who cannot sell yet, `goingQuiet` is people who could and have stopped.
 * Somebody who has never sold appears only in the first — calling them
 * "slipping" would be wrong, and counting them twice would make both lists
 * untrustworthy. See `lib/team/needs-you.ts` for the thresholds.
 */
function NeedsYou({ rows, onOpen }: { rows: RosterAgent[]; onOpen: (id: string) => void }) {
  const ready = useMemo(() => byLeastReady(gettingReady(rows)), [rows]);
  const quiet = useMemo(() => byQuietest(goingQuiet(rows)), [rows]);

  const qc = useQueryClient();
  const sendReminder = useServerFn(sendAgentReminder);
  const remind = useMutation({
    mutationFn: (agentId: string) => sendReminder({ data: { agentId } }),
    onSuccess: (res, agentId) => {
      const a = rows.find((r) => r.id === agentId);
      const name = `${a?.first_name ?? ""} ${a?.last_name ?? ""}`.trim();
      if (res.ok) toast.success(`Reminder sent to ${name}`);
      else if (res.reason === "throttled") toast.info(`Already reminded ${name} in the last 24 hours`);
      else toast.error("Couldn't send reminder");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Not an error state. Nothing needing attention is the goal, so it reads as
  // the good news it is rather than as an empty table.
  if (ready.length === 0 && quiet.length === 0) {
    return (
      <Panel title="Needs you">
        <p className="py-6 text-center text-sm text-muted-foreground">
          Everyone's active and producing.
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel
        title="Getting ready"
        action={ready.length > 0 ? <Badge variant="secondary" className="tnum">{ready.length}</Badge> : undefined}
      >
        {ready.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Everyone can sell.</p>
        ) : (
          <div className="space-y-2">
            {ready.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface-2 p-2.5">
                <Avatar className="h-8 w-8 shrink-0"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <button onClick={() => canOpen(a.id) && onOpen(a.id)} className="block truncate text-sm font-medium hover:underline text-left">
                    {a.first_name} {a.last_name}
                  </button>
                  <p className="truncate text-xs text-muted-foreground">
                    {(a.missing ?? []).length > 0 ? `Needs ${(a.missing ?? []).join(", ")}` : STAGE_LABELS[a.stage]}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0"
                        onClick={() => remind.mutate(a.id)} disabled={remind.isPending}>
                  <Mail className="mr-1 h-3 w-3" /> Remind
                </Button>
              </div>
            ))}
            {ready.length > 8 && (
              <p className="pt-1 text-xs text-muted-foreground">and {ready.length - 8} more in the roster below</p>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title="Going quiet"
        action={quiet.length > 0 ? <Badge variant="secondary" className="tnum">{quiet.length}</Badge> : undefined}
      >
        {quiet.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nobody has stopped selling.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No posted deal in {QUIET_AFTER_DAYS}+ days.</p>
            {quiet.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface-2 p-2.5">
                <Avatar className="h-8 w-8 shrink-0"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <button onClick={() => canOpen(a.id) && onOpen(a.id)} className="block truncate text-sm font-medium hover:underline text-left">
                    {a.first_name} {a.last_name}
                  </button>
                  <p className="truncate text-xs text-muted-foreground tnum">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {a.days_since_sale} days since last deal
                    {a.last_active_at ? ` · last seen ${timeAgo(a.last_active_at)}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => canOpen(a.id) && onOpen(a.id)}>
                  <Eye className="mr-1 h-3 w-3" /> Open
                </Button>
              </div>
            ))}
            {quiet.length > 8 && (
              <p className="pt-1 text-xs text-muted-foreground">and {quiet.length - 8} more</p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ============ KPI Row ============
function KpiRow() {
  const { data: kpis } = useSuspenseQuery(kpisQO);
  const tiles: { value: number | string; label: string; sub: string; tone?: "default" | "gold" }[] = [
    { value: kpis.total, label: "Total Agents", sub: `${kpis.direct} direct reports` },
    { value: kpis.active, label: "Active", sub: "Ready to sell", tone: "gold" },
    { value: kpis.active_writers, label: "Active Writers", sub: "Sold in last 30 days", tone: "gold" },
    // Legacy only, and shrinking: nobody has started "pending" since new
    // agents began landing active. Kept because agencies with people still in
    // that state need to see them until they move on.
    { value: kpis.pending, label: "Pending", sub: "Awaiting review" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[10px] border border-border-soft bg-surface-2 p-3.5">
          <StatTile label={t.label} value={t.value} tone={t.tone ?? "default"} delta={t.sub} />
        </div>
      ))}
    </div>
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
    <Panel title="Alerts" data-tour="team-alerts">
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.kind} className="flex items-start gap-2 p-3 rounded-lg border border-warning/30 bg-warning/10 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ============ Row Actions ============
/**
 * One menu per row, rather than the three naked icon buttons that were here.
 *
 * Status is the reason this exists. It goes through `setAgentStatus`, which is
 * the one correct path — it archives the membership and blocks that org's
 * login for a termination, which a direct `profiles` write would not. The
 * confirm dialog is only on the two that take access away; making somebody
 * active again is not worth a speed bump.
 *
 * Moving an agent to a different upline is deliberately NOT here. Reparenting
 * runs through the hierarchy-change request flow, which keeps an approval
 * trail; a menu item writing `upline_id` directly would quietly route around
 * it.
 */
function RowActions({
  agent, onOpen, canManage,
}: { agent: RosterAgent; onOpen: (id: string) => void; canManage: boolean }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(setAgentStatus);
  const remindFn = useServerFn(sendAgentReminder);
  const [confirming, setConfirming] = useState<null | "inactive" | "terminated">(null);
  const name = `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || "this agent";

  const setStatus = useMutation({
    mutationFn: (status: "active" | "inactive" | "terminated") =>
      statusFn({ data: { agentId: agent.id, status } }),
    onSuccess: (_r, status) => {
      toast.success(status === "active" ? `${name} is active again` : `${name} is now ${status}`);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remind = useMutation({
    mutationFn: () => remindFn({ data: { agentId: agent.id } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success(`Reminder sent to ${name}`);
      else if (res?.reason === "throttled") toast.info(`Already reminded ${name} in the last 24 hours`);
      else toast.error("Couldn't send reminder");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const COPY = {
    inactive: {
      title: `Make ${name} inactive?`,
      body: "They keep their account and their book, and stop counting as an active agent. You can make them active again at any time.",
      action: "Make inactive",
    },
    terminated: {
      title: `Terminate ${name}?`,
      body: "This archives their membership and blocks them from signing in to this agency. Their policies and history stay where they are.",
      action: "Terminate",
    },
  } as const;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => canOpen(agent.id) && onOpen(agent.id)}>
            <Eye className="mr-2 h-4 w-4" /> Open dashboard
          </DropdownMenuItem>
          {agent.email && (
            <DropdownMenuItem asChild>
              <a href={`mailto:${agent.email}`}><Mail className="mr-2 h-4 w-4" /> Email</a>
            </DropdownMenuItem>
          )}
          {agent.phone && (
            <DropdownMenuItem asChild>
              <a href={`tel:${agent.phone}`}><Phone className="mr-2 h-4 w-4" /> Call</a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => remind.mutate()} disabled={remind.isPending}>
            <Clock className="mr-2 h-4 w-4" /> Send reminder
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              {agent.status !== "active" && (
                <DropdownMenuItem onClick={() => setStatus.mutate("active")}>
                  Set active
                </DropdownMenuItem>
              )}
              {agent.status !== "inactive" && (
                <DropdownMenuItem onClick={() => setConfirming("inactive")}>
                  Set inactive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={() => setConfirming("terminated")}>
                <Trash2 className="mr-2 h-4 w-4" /> Terminate
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{COPY[confirming].title}</AlertDialogTitle>
                <AlertDialogDescription>{COPY[confirming].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { setStatus.mutate(confirming); setConfirming(null); }}
                >
                  {COPY[confirming].action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============ Roster Table ============
/** A column header that sorts. The arrow only shows on the active column. */
function SortHead({
  k, active, dir, onSort, className, children,
}: {
  k: SortKey; active: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void;
  className?: string; children: React.ReactNode;
}) {
  const on = active === k;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground font-semibold")}
        aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {children}
        <span className={cn("text-[10px]", on ? "opacity-100" : "opacity-0")}>{dir === "asc" ? "▲" : "▼"}</span>
      </button>
    </TableHead>
  );
}

type SortKey = "name" | "position" | "upline" | "status" | "own" | "team" | "atrisk" | "contracts" | "active" | "stale" | "compliance";

function RosterTable({
  downline, onOpen, canAssign, rangeKey, onRangeKey, customRange, onCustomRange,
}: {
  downline: RosterAgent[]; onOpen: (id: string) => void; canAssign: boolean;
  rangeKey: RangeKey; onRangeKey: (k: RangeKey) => void;
  customRange: { from?: string; to?: string }; onCustomRange: (r: { from?: string; to?: string }) => void;
}) {
  const qc = useQueryClient();
  const levelsFn = useServerFn(listAgencyLevels);
  const assignFn = useServerFn(setAgentPosition);
  const { data: levelData } = useQuery({ queryKey: ["agency-levels"], queryFn: () => levelsFn() });

  // The catalog, in the shape the pill model wants. base_pct IS the ladder
  // number — see lib/team/positions.ts for why there is no separate integer.
  //
  // An upline who does not manage the ladder may only place somebody BELOW
  // their own rung — the same ceiling invitations enforce. `listAgencyLevels`
  // already hands them their own rung and everything under it, so their own is
  // dropped here: offering a choice the server will refuse is worse than not
  // offering it.
  const positions: Position[] = useMemo(() => {
    const canManage = Boolean((levelData as any)?.canManage);
    const myLevelId = (levelData as any)?.myLevelId ?? null;
    return (((levelData as any)?.rows ?? []) as any[])
      .filter((r) => r.active !== false)
      .filter((r) => canManage || r.id !== myLevelId)
      .map((r) => ({ id: r.id, name: r.name, pct: Number(r.base_pct) }));
  }, [levelData]);

  const assign = useMutation({
    mutationFn: (v: { agentId: string; agencyLevelId: string | null }) => assignFn({ data: v }),
    onSuccess: () => {
      toast.success("Position updated");
      qc.invalidateQueries({ queryKey: ["team", "roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change that position"),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all_except_imported");
  const [depth, setDepth] = useState("all");
  const [stage, setStage] = useState<"all" | LifecycleStage>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [positionFilter, setPositionFilter] = useState("all");
  const [producedOnly, setProducedOnly] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 25;

  const agentById = useMemo(() => new Map(downline.map((a) => [a.id, a])), [downline]);
  const awaitingPosition = useMemo(() => needsPosition(downline, positions), [downline, positions]);

  const filtered = useMemo(() => downline.filter((a) => {
    const q = search.toLowerCase();
    if (q && !`${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q)) return false;
    if (status === "all_except_imported" && (a.status === "imported" || a.status === "terminated")) return false;
    if (status !== "all" && status !== "all_except_imported" && a.status !== status) return false;
    if (depth !== "all" && a.depth_level !== Number(depth)) return false;
    if (stage !== "all" && a.stage !== stage) return false;
    if (pendingOnly && a.agency_level_id) return false;
    if (positionFilter !== "all" && a.agency_level_id !== positionFilter) return false;
    // The reason this table exists: forty agents, three producing.
    if (producedOnly && !producedInRange(a.own, a.team)) return false;
    return true;
  }), [downline, search, status, depth, stage, pendingOnly, positionFilter, producedOnly]);

  // At-risk first regardless of the chosen sort. A flag you have to scroll to
  // find is the same dead end as no flag at all.
  const COMPLIANCE_ORDER: Record<string, number> = { bad: 0, warn: 1, unknown: 2, ok: 3 };
  const sorted = useMemo(() => {
    const worst = (a: RosterAgent) => (a.flags.some((f) => f.severity === "critical") ? 0 : a.flags.length ? 1 : 2);
    const name = (a: RosterAgent) => `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    const uplineName = (a: RosterAgent) => {
      const u = a.upline_id ? agentById.get(a.upline_id) : null;
      return u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : "";
    };
    // Every column compares ascending here; direction is applied once, after.
    const cmp = (a: RosterAgent, b: RosterAgent): number => {
      switch (sortKey) {
        case "position": return (a.position_pct ?? -1) - (b.position_pct ?? -1);
        case "upline": return uplineName(a).localeCompare(uplineName(b));
        case "status": return a.status.localeCompare(b.status);
        case "own": return a.own.premium - b.own.premium;
        case "team": return a.team.premium - b.team.premium;
        case "atrisk": return a.at_risk_monthly - b.at_risk_monthly;
        case "contracts": return a.active_carriers - b.active_carriers;
        case "active": return (a.last_active_at ?? "").localeCompare(b.last_active_at ?? "");
        case "stale": return (a.days_since_sale ?? -1) - (b.days_since_sale ?? -1);
        case "compliance": return COMPLIANCE_ORDER[a.compliance] - COMPLIANCE_ORDER[b.compliance];
        default: return name(a).localeCompare(name(b));
      }
    };
    return [...filtered].sort((a, b) => {
      // At-risk first regardless of the chosen sort — except when the reader
      // has explicitly asked to sort by something, in which case honouring
      // their click matters more than the flag they can already see.
      if (sortKey === "name") {
        const w = worst(a) - worst(b);
        if (w !== 0) return w;
      }
      const c = cmp(a, b);
      return sortDir === "asc" ? c : -c;
    });
  }, [filtered, sortKey, sortDir, agentById]);

  const sortProps = {
    active: sortKey,
    dir: sortDir,
    onSort: (k: SortKey) => {
      // Same column toggles direction; a new column starts descending for the
      // numeric ones, because "who wrote the most" is the question being asked.
      if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else { setSortKey(k); setSortDir(k === "name" || k === "upline" || k === "status" ? "asc" : "desc"); }
      setPage(0);
    },
  };

  const pageRows = sorted.slice(page * perPage, (page + 1) * perPage);
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const depths = Array.from(new Set(downline.map((a) => a.depth_level))).sort((a, b) => a - b);

  return (
    <Panel>
      <div className="space-y-3">
        {/* The range drives every time-bound column at once — both production
            columns move together, so Own and Team are always the same window. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "week", "month", "quarter", "custom"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { onRangeKey(k); setPage(0); }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                rangeKey === k
                  ? "border-primary/40 bg-gold-glow text-gold-bright"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {RANGE_LABELS[k]}
            </button>
          ))}
          {rangeKey === "custom" && (
            <span className="flex items-center gap-1.5">
              <Input
                type="date" className="h-7 w-auto text-xs"
                value={customRange.from?.slice(0, 10) ?? ""}
                onChange={(e) => onCustomRange({ ...customRange, from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date" className="h-7 w-auto text-xs"
                value={customRange.to?.slice(0, 10) ?? ""}
                onChange={(e) => onCustomRange({ ...customRange, to: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              />
            </span>
          )}
          <button
            type="button"
            onClick={() => { setProducedOnly((v) => !v); setPage(0); }}
            className={cn(
              "ml-auto rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              producedOnly
                ? "border-success/50 bg-success/10 text-success"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            Produced in {RANGE_LABELS[rangeKey].toLowerCase()}
          </button>
        </div>

        {/* Stage chips. Counts on the chip so you can see there are four
            at-risk agents without selecting the filter to find out. */}
        <div className="flex flex-wrap gap-1.5">
          {(["all", "at_risk", "onboarding", "licensed", "contracted", "active", "inactive", "terminated"] as const).map((sKey) => {
            const n = sKey === "all" ? downline.length : downline.filter((a) => a.stage === sKey).length;
            if (n === 0 && sKey !== "all") return null;
            return (
              <button
                key={sKey}
                type="button"
                onClick={() => { setStage(sKey); setPage(0); }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  stage === sKey
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {sKey === "all" ? "All" : STAGE_LABELS[sKey]}
                <span className="tnum ml-1 opacity-70">{n}</span>
              </button>
            );
          })}

          {/* Pending positions: the queue of people nobody has placed yet.
              Only offered once a catalog exists — with no positions defined,
              every agent is unassigned and the chip would just say "all". */}
          {awaitingPosition.length > 0 && (
            <button
              type="button"
              onClick={() => { setPendingOnly((v) => !v); setPage(0); }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                pendingOnly
                  ? "border-warning/50 bg-warning/10 text-warning"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              Pending positions <span className="tnum">{awaitingPosition.length}</span>
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
          {/* Sorting moved onto the column headers — every column sorts, which
              a four-option select could never offer. */}
          {positions.length > 0 && (
            <Select value={positionFilter} onValueChange={(v) => { setPositionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All positions</SelectItem>
                {sortPositions(positions).map((pos) => (
                  <SelectItem key={pos.id} value={pos.id}>{positionLabel(pos.name, pos.pct)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
                <SortHead k="name" {...sortProps}>Agent</SortHead>
                <SortHead k="position" {...sortProps}>Position</SortHead>
                <SortHead k="upline" {...sortProps}>Upline</SortHead>
                <SortHead k="status" {...sortProps}>Stage</SortHead>
                <SortHead k="compliance" {...sortProps} className="text-center">Compliance</SortHead>
                <SortHead k="own" {...sortProps}>Production (own)</SortHead>
                <SortHead k="team" {...sortProps}>Production (team)</SortHead>
                <SortHead k="atrisk" {...sortProps}>At risk</SortHead>
                <SortHead k="contracts" {...sortProps}>Contracts</SortHead>
                <SortHead k="active" {...sortProps}>Last active</SortHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No agents match.</TableCell></TableRow>
              ) : pageRows.map((a) => {
                const upline = a.upline_id ? agentById.get(a.upline_id) : null;
                return (
                <TableRow key={a.id}>
                  <TableCell>
                    <button onClick={() => canOpen(a.id) && onOpen(a.id)} className="flex items-center gap-2 text-left hover:underline">
                      <Avatar className="h-8 w-8"><AvatarFallback>{initials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
                      <div>
                        <div className="font-medium">
                          {a.first_name} {a.last_name}
                          {(a as any).is_self && <span className="ml-2 rounded-full border border-border-soft px-1.5 py-0.5 text-[10px] text-muted-foreground">You</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      </div>

                    </button>
                  </TableCell>
                  <TableCell>
                    <PositionCell
                      positionName={a.position_name}
                      positionPct={a.position_pct}
                      agencyLevelId={a.agency_level_id}
                      positions={positions}
                      // An agency admin may place anybody on the roster; an
                      // upline may place their own people, which is every row
                      // this table shows them except themselves. The server
                      // enforces the same rule and the rung ceiling, so a
                      // refusal surfaces as its own message rather than a
                      // hidden control that contradicts the hierarchy.
                      canAssign={canAssign || !(a as any).is_self}
                      pending={assign.isPending}
                      onAssign={(agencyLevelId) => assign.mutate({ agentId: a.id, agencyLevelId })}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {upline
                      ? <span>{upline.first_name} {upline.last_name}</span>
                      : <span className="text-muted-foreground text-xs">{a.upline_id ? "—" : "Root"}</span>
                    }
                  </TableCell>
                  <TableCell><StageBadge stage={a.stage} flags={a.flags} /></TableCell>
                  <TableCell className="text-center"><ComplianceDot level={a.compliance} /></TableCell>
                  {/* Own beside team is the whole point: who writes, versus who
                      has built people who write. */}
                  <TableCell className="tnum">
                    <div>{fmtCurrency(a.own.premium)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.own.policies} deal{a.own.policies === 1 ? "" : "s"}
                    </div>
                  </TableCell>
                  <TableCell className="tnum">
                    {a.team.policies === 0 && a.team.premium === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <>
                        <div>{fmtCurrency(a.team.premium)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {a.team.policies} deal{a.team.policies === 1 ? "" : "s"}
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="tnum">
                    {a.at_risk_cases === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <>
                        {/* Monthly, because premium_at_risk is monthly premium.
                            Saying so is the difference between a number and a
                            wrong number. */}
                        <div className="text-warning">{fmtCurrency(a.at_risk_monthly)}<span className="text-[11px]">/mo</span></div>
                        <div className="text-[11px] text-muted-foreground">
                          {a.at_risk_cases} polic{a.at_risk_cases === 1 ? "y" : "ies"}
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="tnum">{a.active_carriers}</TableCell>
                  <TableCell className="text-xs">
                    {a.last_active_at
                      ? timeAgo(a.last_active_at)
                      : <span className="text-muted-foreground">Never</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions agent={a} onOpen={onOpen} canManage={canAssign} />
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

// ============ Org list ============
//
// A collapsible indented list, deliberately not a canvas.
//
// This was a zoom/pan diagram with drag, scale and a reset control — the
// "Graph" view the pattern this roster copies also ships. A hierarchy diagram
// is the thing everyone asks for and nobody reads twice: it answers "who
// reports to whom" beautifully and every other question badly, and it costs a
// viewport of chrome to do it. What people actually come here for is to look
// somebody up and see where they sit, which an indented list does better at a
// fraction of the weight — and it works on a phone, which the canvas did not.
type TreeNode = RosterAgent & { children: TreeNode[] };

function buildTree(rootId: string, downline: RosterAgent[]): TreeNode[] {
  const byUpline = new Map<string, RosterAgent[]>();
  for (const a of downline) {
    const k = a.upline_id ?? "";
    if (!byUpline.has(k)) byUpline.set(k, []);
    byUpline.get(k)!.push(a);
  }
  // Cycle guard: upline_id is not constrained to be acyclic, and a loop here
  // would recurse until the tab died rather than fail a query. Placing each
  // agent at most once also means a malformed chain loses a subtree instead of
  // duplicating one.
  const placed = new Set<string>();
  const build = (id: string, depth: number): TreeNode[] => {
    if (depth > 50) return [];
    const out: TreeNode[] = [];
    for (const a of byUpline.get(id) ?? []) {
      if (a.id === id || placed.has(a.id)) continue;
      placed.add(a.id);
      out.push({ ...a, children: build(a.id, depth + 1) });
    }
    return out;
  };
  return build(rootId, 0);
}

function OrgList({ downline, onOpen }: { downline: RosterAgent[]; onOpen: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootId = downline[0]?.upline_id ?? "";
  const tree = useMemo(() => buildTree(rootId, downline), [rootId, downline]);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (downline.length === 0) {
    return (
      <Panel>
        <p className="py-8 text-center text-sm text-muted-foreground">Nobody reports to you yet.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Who sits where. Click a name to open them.</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCollapsed(new Set())}>
          Expand all
        </Button>
      </div>
      <ul className="text-sm">
        {tree.map((n) => <OrgRow key={n.id} node={n} depth={0} collapsed={collapsed} toggle={toggle} onOpen={onOpen} />)}
      </ul>
    </Panel>
  );
}

function OrgRow({
  node, depth, collapsed, toggle, onOpen,
}: {
  node: TreeNode; depth: number; collapsed: Set<string>;
  toggle: (id: string) => void; onOpen: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const kids = node.children.length;
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-surface-2"
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        {kids > 0 ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            aria-label={isCollapsed ? `Expand ${node.first_name ?? "agent"}` : `Collapse ${node.first_name ?? "agent"}`}
            className="h-4 w-4 shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <button onClick={() => onOpen(node.id)} className="min-w-0 flex-1 truncate text-left hover:underline">
          {node.first_name} {node.last_name}
        </button>
        {node.position_name != null && node.position_pct != null && (
          <PositionPill name={node.position_name} pct={node.position_pct} />
        )}
        <span className="tnum shrink-0 text-xs text-muted-foreground">
          {node.policies_count} polic{node.policies_count === 1 ? "y" : "ies"}
        </span>
        {kids > 0 && (
          <span className="tnum shrink-0 text-[11px] text-text-dim">{kids} down</span>
        )}
      </div>
      {!isCollapsed && kids > 0 && (
        <ul>
          {node.children.map((c) => (
            <OrgRow key={c.id} node={c} depth={depth + 1} collapsed={collapsed} toggle={toggle} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ============ Move Agent Section ============

// `AgentDetailDrawer` lived here: 147 lines, defined and never rendered —
// line 226 renders `AgentProfileDrawer` instead. It carried its own copy of
// the "Open Profile" bug (a bare navigate to /account/producer-profile with
// no agent id) and was the only caller of `deactivateAgent`, which wrote
// status directly with no row-count check and no membership sync.
