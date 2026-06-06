import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { getAgentDetail, setAgentHidden, setAgentTerminated } from "@/lib/team.functions";

type Props = { agentId: string | null; onClose: () => void; isAdmin: boolean };

function initials(f?: string | null, l?: string | null) {
  return `${(f ?? "?")[0] ?? "?"}${(l ?? "")[0] ?? ""}`.toUpperCase();
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/20 text-green-100 border-green-300/40",
    pending: "bg-amber-500/20 text-amber-100 border-amber-300/40",
    not_activated: "bg-slate-500/20 text-slate-100 border-slate-300/40",
    hidden: "bg-slate-500/20 text-slate-100 border-slate-300/40",
    terminated: "bg-red-500/20 text-red-100 border-red-300/40",
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

export function AgentProfileDrawer({ agentId, onClose, isAdmin }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const detailFn = useServerFn(getAgentDetail);
  const hideFn = useServerFn(setAgentHidden);
  const termFn = useServerFn(setAgentTerminated);

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
    mutationFn: (terminated: boolean) => termFn({ data: { agentId: agentId!, terminated } }),
    onSuccess: () => {
      toast.success("Updated status");
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
      <SheetContent className="w-[440px] sm:w-[440px] p-0 overflow-y-auto">
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
                            <span className="h-2 w-2 rounded-full bg-violet-500" />
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
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive">
                        {status === "terminated" ? "Reinstate" : "Mark Terminated"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {status === "terminated" ? "Reinstate this agent?" : "Terminate this agent?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Production records remain attributed to the agent. They will{" "}
                          {status === "terminated" ? "appear again on rosters." : "no longer appear on default rosters."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => term.mutate(status !== "terminated")}>
                          Confirm
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
