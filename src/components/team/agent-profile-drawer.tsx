import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Phone,
  Mail,
  FileText,
  LayoutDashboard,
  MapPin,
  Hash,
  Calendar,
  Clock,
  Users as UsersIcon,
  Briefcase,
  EyeOff,
  Eye,
  BadgeAlert,
} from "lucide-react";
import { MoveAgentSection } from "@/components/team/move-agent-section";
import { getAgentDetail, setAgentHidden, setAgentStatus } from "@/lib/team.functions";

type Props = { agentId: string | null; onClose: () => void; isAdmin: boolean };

function initials(f?: string | null, l?: string | null) {
  return `${(f ?? "?")[0] ?? "?"}${(l ?? "")[0] ?? ""}`.toUpperCase();
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/20 text-on-solid border-success/40",
    pending: "bg-warning/20 text-on-solid border-warning/40",
    not_activated: "bg-muted/20 text-muted-foreground border-border/40",
    hidden: "bg-muted/20 text-muted-foreground border-border/40",
    terminated: "bg-destructive/20 text-on-solid border-destructive/40",
  };
  const label =
    status === "active"
      ? "Active"
      : status === "pending"
      ? "Needs Fix"
      : status === "not_activated"
      ? "Not Activated"
      : status === "terminated"
      ? "Terminated"
      : status === "hidden"
      ? "Hidden"
      : status;
  return (
    <Badge variant="outline" className={`${map[status] ?? map.pending} font-medium uppercase tracking-wide text-[10px]`}>
      <BadgeAlert className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold mt-1 truncate">{value}</div>
    </div>
  );
}

type AccessStatus = "active" | "inactive" | "terminated";

/**
 * Three-way access control.
 *
 * Was a single "Mark Terminated" / "Reinstate" toggle whose dialog said the
 * agent "will no longer appear on default rosters" — which was the whole of
 * what it did. It now revokes access to the agency's data, so the copy says so.
 *
 * Inactive and Terminated both revoke; they differ in whether it is meant to be
 * temporary, and Terminated stamps a date and hides them from rosters.
 */
function StatusControl({
  status, onSet, busy,
}: { status: string; onSet: (s: AccessStatus) => void; busy: boolean }) {
  const [pending, setPending] = useState<AccessStatus | null>(null);
  const revoked = status === "terminated" || status === "inactive";

  const COPY: Record<AccessStatus, { title: string; body: string; cta: string }> = {
    active: {
      title: "Restore this agent's access?",
      body: "They will be able to sign in again and see this agency's data.",
      cta: "Restore access",
    },
    inactive: {
      title: "Suspend this agent's access?",
      body:
        "They will be signed out of this agency's data immediately and cannot sign back in, " +
        "but they stay on the roster and their production, contracts and clients are untouched. " +
        "Use this when you expect them back.",
      cta: "Suspend access",
    },
    terminated: {
      title: "Revoke this agent's access?",
      body:
        "They will be signed out of this agency's data immediately and cannot sign back in. " +
        "Their production, contracts and client records are preserved and stay attributed to " +
        "them. You will still need to notify carriers to terminate their appointments separately.",
      cta: "Revoke access",
    },
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {(["active", "inactive", "terminated"] as const)
          .filter((s) => s !== status)
          .map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              disabled={busy}
              className={s === "active" ? "text-muted-foreground" : "text-destructive"}
              onClick={() => setPending(s)}
            >
              {s === "active" ? (revoked ? "Restore" : "Set Active") : s === "inactive" ? "Suspend" : "Terminate"}
            </Button>
          ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? COPY[pending].title : ""}</AlertDialogTitle>
            <AlertDialogDescription>{pending ? COPY[pending].body : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onSet(pending);
                setPending(null);
              }}
            >
              {pending ? COPY[pending].cta : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AgentProfileDrawer({ agentId, onClose, isAdmin }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const detailFn = useServerFn(getAgentDetail);
  const hideFn = useServerFn(setAgentHidden);
  const statusFn = useServerFn(setAgentStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["team", "agent", agentId],
    queryFn: () => detailFn({ data: { agentId: agentId! } }),
    enabled: !!agentId,
  });

  const hide = useMutation({
    mutationFn: (hidden: boolean) => hideFn({ data: { agentId: agentId!, hidden } }),
    onSuccess: () => {
      toast.success("Updated visibility");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const term = useMutation({
    mutationFn: (next: "active" | "inactive" | "terminated") =>
      statusFn({ data: { agentId: agentId!, status: next } }),
    onSuccess: (_r, next) => {
      // Say what actually happened. "Updated status" was accurate when this
      // only hid them from a roster; it is not accurate now that it revokes
      // access to the agency's data.
      toast.success(
        next === "active"
          ? "Access restored"
          : next === "inactive"
          ? "Access suspended"
          : "Access revoked",
      );
      qc.invalidateQueries({ queryKey: ["team"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = data?.profile;
  const fullName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Agent";
  const status = p?.status ?? "pending";
  const isHidden = (p as any)?.is_hidden ?? false;

  return (
    <Sheet open={!!agentId} onOpenChange={(o) => !o && onClose()}>
      {/* Was a flat w-[440px], which hung 65px off the side of a 375px phone
          and gave every page behind it a horizontal scrollbar. Full width
          below sm, 440px above. */}
      <SheetContent className="w-full sm:w-[440px] sm:max-w-[440px] p-0 overflow-y-auto">
        {isLoading || !p ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Gradient header */}
            <div className="bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 p-6 text-white">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 ring-2 ring-white/30">
                  <AvatarFallback className="text-lg font-semibold bg-white/20 text-white">
                    {initials(p.first_name, p.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-bold leading-tight truncate">{fullName}</div>
                  <div className="text-sm text-white/90 truncate">{p.email}</div>
                  <div className="mt-2">
                    <StatusPill status={status} />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2">
                <InfoTile icon={<Phone className="h-3 w-3" />} label="Phone" value={p.phone ?? "—"} />
                <InfoTile icon={<Hash className="h-3 w-3" />} label="NPN" value={(p as any).npn_number ?? "—"} />
                <InfoTile
                  icon={<MapPin className="h-3 w-3" />}
                  label="Location"
                  value={
                    [(p as any).city, (p as any).state].filter(Boolean).join(", ") || "—"
                  }
                />
                <InfoTile icon={<UsersIcon className="h-3 w-3" />} label="Upline" value={p.upline_id ? "Assigned" : "Root"} />
                <InfoTile
                  icon={<Calendar className="h-3 w-3" />}
                  label="Join Date"
                  value={p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                />
                <InfoTile
                  icon={<Clock className="h-3 w-3" />}
                  label="Last Active"
                  value={p.last_active_at ? timeAgo(p.last_active_at) : "Never"}
                />
                <InfoTile
                  icon={<Briefcase className="h-3 w-3" />}
                  label="Contracts"
                  value={`${data.contracts.filter((c) => !!c.assigned_pct).length} / ${data.contracts.length}`}
                />
                <InfoTile
                  icon={<FileText className="h-3 w-3" />}
                  label="Policies"
                  value={`${data.breakdown.total}`}
                />
              </div>

              {/* Carriers & Levels */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
                  <Briefcase className="h-3.5 w-3.5" /> Carriers & Levels
                </div>
                {data.contracts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No carrier contracts yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.contracts.map((c, i) => {
                      const pct = Number(c.assigned_pct ?? 0);
                      const pctDisplay = pct > 1 ? pct : pct * 100;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm border rounded-lg p-2.5 bg-card">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <span className="font-medium">
                              {(c as { carriers?: { name?: string } }).carriers?.name ?? "Carrier"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {c.commission_level ?? "—"} ({Math.round(pctDisplay)}%)
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">Quick Actions</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => navigate({ to: "/team", search: { agent: agentId } as any })}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => navigate({ to: "/contracting" })}
                  >
                    <FileText className="h-4 w-4 mr-2" /> Contracts
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    asChild
                    disabled={!p.email}
                  >
                    <a href={p.email ? `mailto:${p.email}` : "#"}>
                      <Mail className="h-4 w-4 mr-2" /> Email
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    asChild
                    disabled={!p.phone}
                  >
                    <a href={p.phone ? `tel:${p.phone}` : "#"}>
                      <Phone className="h-4 w-4 mr-2" /> Call
                    </a>
                  </Button>
                </div>
              </div>

              {/* Footer actions */}
              <div className="pt-2 border-t flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => hide.mutate(!isHidden)}
                  disabled={hide.isPending}
                >
                  {isHidden ? <Eye className="h-4 w-4 mr-1.5" /> : <EyeOff className="h-4 w-4 mr-1.5" />}
                  {isHidden ? "Unhide from Team Page" : "Hide from Team Page"}
                </Button>
                {isAdmin && <StatusControl status={status} onSet={(s) => term.mutate(s)} busy={term.isPending} />}
              </div>
            </div>

            {/* Who this agent reports to. Admin only — the internal org chart
                is the agency's to set, and it is what downline scope, the team
                matrix and every reports-to query read. */}
            {isAdmin && (
              <div className="rounded-[var(--radius)] border border-border p-3">
                <div className="text-sm font-medium mb-2">Reports to</div>
                <MoveAgentSection agentId={p.id} currentUplineId={p.upline_id ?? null} />
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
