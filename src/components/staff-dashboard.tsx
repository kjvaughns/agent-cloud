import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Building2, FilePlus, IdCard, ListTodo, UploadCloud, Users,
} from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { WorkQueue } from "@/components/work-queue";
import { useServerFn } from "@/hooks/use-server-fn";
import { useAuth } from "@/hooks/use-auth";
import { getContractingOverview } from "@/lib/contracting-ops.functions";
import { listTasks } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

/**
 * Home, for somebody who works a queue rather than a book.
 *
 * The producer dashboard answers "how am I doing" — production goal, ALP,
 * leaderboard, commissions, and a checklist telling you to get your first
 * carrier contract. A back-office coordinator has none of those things, so
 * every one of its panels reads as either zero or somebody else's job. That
 * was the audit's first and loudest finding.
 *
 * This answers the question they actually have at 8am: what needs me today.
 * Deliberately assembled from what already exists rather than new endpoints —
 * `getMyWork` already branches for staff and produces the work list, and
 * `getContractingOverview` already computes the counts. A third source of
 * truth about the same queue is how the three onboarding checklists ended up
 * disagreeing with each other.
 */

function firstNameOf(email: string | undefined, fallback = "there") {
  if (!email) return fallback;
  const local = email.split("@")[0] ?? "";
  const word = local.split(/[._-]/)[0] ?? "";
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : fallback;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function QuickAction({ to, search, icon: Icon, label }: {
  to: string; search?: Record<string, string>; icon: any; label: string;
}) {
  return (
    <Link
      to={to}
      search={search as any}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
    >
      <Icon className="h-3.5 w-3.5 text-primary" />
      {label}
    </Link>
  );
}

export function StaffDashboard() {
  const { user } = useAuth();
  const overviewFn = useServerFn(getContractingOverview);
  const tasksFn = useServerFn(listTasks);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "overview"],
    queryFn: () => overviewFn(),
  });

  const { data: taskData } = useQuery({
    queryKey: ["tasks", "mine", "dashboard"],
    queryFn: () => tasksFn({ data: { scope: "mine", status: "open" } }),
    staleTime: 60_000,
  });

  const m = (data as any)?.metrics;
  const today = new Date().toISOString().slice(0, 10);
  const openTasks = ((taskData as any)?.tasks ?? [])
    .filter((t: any) => t.status !== "done" && t.status !== "cancelled");
  const overdueTasks = openTasks.filter((t: any) => t.due_date && t.due_date < today);

  // Only the alerts that are actually non-zero, each pointing at the slice it
  // counted rather than an unfiltered roster.
  const attention = m
    ? [
        { label: "Overdue requests", value: m.overdue, to: "/contracting-ops/queue" },
        { label: "Not in good order", value: m.nigo, to: "/contracting-ops/requests" },
        { label: "Missing PDB reports", value: m.missing_pdb, to: "/contracting-ops/licensing", search: { filter: "missing_pdb" } },
        { label: "PDB reports out of date", value: m.stale_pdb, to: "/contracting-ops/licensing", search: { filter: "stale_pdb" } },
        { label: "Licences expiring soon", value: m.expiring_licenses, to: "/contracting-ops/licensing", search: { filter: "expiring" } },
        { label: "Pending hierarchy changes", value: m.pending_hierarchy_changes, to: "/contracting-ops/requests", search: { tab: "changes" } },
      ].filter((a) => a.value > 0)
    : [];

  return (
    <PageShell>
      <div className="mb-[var(--gap)]">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {greeting()}, {firstNameOf(user?.email)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contracting and licensing for your agency. Here's what's on the board.
        </p>
      </div>

      {/* What needs you today, before any numbers. getMyWork already knows how
          to answer this for staff — overdue requests, NIGO, ready to submit,
          unassigned, documents waiting, licences expiring. */}
      <div className="mb-[var(--gap)]"><WorkQueue /></div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !m ? (
        <Panel title="No agency on your account">
          <p className="text-sm text-muted-foreground">
            Contracting operations work at the agency level. Once your account belongs to an agency,
            this fills in.
          </p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-[var(--gap)]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Requests in progress" value={String(m.in_progress)} />
            <StatTile label="Ready to submit" value={String(m.ready_to_submit)} />
            <StatTile label="Ready to sell" value={`${m.agents_ready_to_sell} of ${m.active_agents}`} />
            <StatTile
              label="Open tasks"
              value={String(openTasks.length)}
              delta={overdueTasks.length ? `${overdueTasks.length} overdue` : undefined}
              tone={overdueTasks.length ? "red" : "default"}
            />
          </div>

          {attention.length > 0 && (
            <Panel title="Needs attention">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {attention.map((a) => (
                  <Link
                    key={a.label}
                    to={a.to}
                    search={(a as any).search}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-primary/40"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.label}</span>
                    <span className="tnum text-sm font-bold text-foreground">{a.value}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-dim" />
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <div className="grid gap-[var(--gap)] lg:grid-cols-[1fr_1fr]">
            <Panel
              title="Your tasks"
              action={<Link to="/tasks" className="text-xs text-primary hover:underline">All tasks</Link>}
            >
              {openTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
              ) : (
                <ul className="divide-y divide-border-soft">
                  {openTasks.slice(0, 6).map((t: any) => {
                    const late = t.due_date && t.due_date < today;
                    return (
                      <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
                        {t.due_date && (
                          <span className={cn("tnum shrink-0 text-xs", late ? "text-destructive" : "text-muted-foreground")}>
                            {t.due_date}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="Quick actions">
              <div className="grid gap-2 sm:grid-cols-2">
                <QuickAction to="/contracting-ops/queue" icon={ListTodo} label="Today's Work" />
                <QuickAction to="/contracting-ops/requests" icon={FilePlus} label="Create a request" />
                <QuickAction to="/contracting-ops/licensing" icon={UploadCloud} label="Upload a PDB report" />
                <QuickAction to="/contracting-ops/requests" search={{ tab: "numbers" }} icon={IdCard} label="Add a writing number" />
                <QuickAction to="/settings/carriers" icon={Building2} label="Carriers & comp" />
                <QuickAction to="/contracting-ops" icon={Users} label="Contracting overview" />
              </div>
              {(data as any)?.access && !(data as any).access.canManageCarriers && (
                <p className="mt-3 text-[11px] text-text-dim">
                  Some actions are limited by your permissions. Your agency owner can grant more.
                </p>
              )}
            </Panel>
          </div>

          <p className="text-[11px] text-text-dim">
            Licensing figures come from PDB reports your team uploads and reviews — Agent Cloud is
            not connected to NIPR, so nothing here is live or automatically synced.
          </p>
        </div>
      )}
    </PageShell>
  );
}
