import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOnboardingInvites,
  createOnboardingInvite,
  getMyContractedCarriers,
} from "@/lib/onboarding.functions";
import { deleteInvitationLink } from "@/lib/contracting.functions";
import { listCarrierGridLevels } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, Check, Trash2, Lock, Link2, User, Users, Building2, ClipboardList, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/contracting/invite")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Invite Links | Agent Cloud" }] }),
});

type Assignment = {
  carrier_id: string;
  carrier_name: string;
  level_name?: string | null;
  level_pct: number;
  release_needed?: boolean;
};

function InvitePage() {
  const qc = useQueryClient();
  const [success, setSuccess] = useState<{ token: string; linkName: string } | null>(null);
  const [linkName, setLinkName] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [invitedRole, setInvitedRole] = useState<"agent" | "manager" | "agency_owner" | "staff">("agent");
  const { canInviteAgencyOwner, canInviteManager } = useRole();

  const { data: myCarriers } = useQuery({
    queryKey: ["onb", "myCarriers"],
    queryFn: () => getMyContractedCarriers(),
  });
  const { data: invites, isLoading } = useQuery({
    queryKey: ["onb", "invites", "mine"],
    queryFn: () => listOnboardingInvites({ data: { scope: "mine" } }),
  });

  const createFn = useServerFn(createOnboardingInvite);
  const create = useMutation({
    mutationFn: () => createFn({ data: { link_name: linkName, invited_role: invitedRole, assignments } }),
    onSuccess: (res: any) => {
      setSuccess({ token: res.token, linkName });
      qc.invalidateQueries({ queryKey: ["onb", "invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create link"),
  });

  const canCreate = linkName.trim().length > 0;

  function resetForm() {
    setSuccess(null);
    setLinkName("");
    setAssignments([]);
  }

  if (success) {
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/invite/${success.token}`
      : `/invite/${success.token}`;
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Card><CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 grid place-items-center">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Link Created!</h2>
          <p className="text-muted-foreground">Share this link with anyone you want to join your downline as <strong>{success.linkName}</strong>.</p>
          <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
            <code className="flex-1 text-xs text-left truncate">{url}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied!"); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">This link is reusable — anyone who clicks it can create their own account and join your team.</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={resetForm}>Create Another</Button>
          </div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invite Links</h1>
        <p className="text-sm text-muted-foreground">Create a shareable link that places new agents directly in your downline with pre-assigned carriers and commission levels.</p>
      </div>

      <Card><CardContent className="p-6 space-y-5">
        <div>
          <Label>Link Name *</Label>
          <Input
            className="mt-1 max-w-sm"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="e.g. New Agent, New Manager, Regional Lead"
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground mt-1">This is just a label for you — it won't be shown to the person joining.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Invite As</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setInvitedRole("agent")}
              className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${invitedRole === "agent" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
            >
              <div className="font-medium text-sm flex items-center gap-1.5">
                <User className="h-4 w-4" /> Agent
                {invitedRole === "agent" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
              </div>
              <div className="text-[11px] text-muted-foreground">Can work their own pipeline</div>
            </button>

            {canInviteManager && (
              <button
                type="button"
                onClick={() => setInvitedRole("manager")}
                className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${invitedRole === "manager" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> Manager
                  {invitedRole === "manager" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <div className="text-[11px] text-muted-foreground">Can manage a downline team</div>
              </button>
            )}

            {canInviteAgencyOwner && (
              <button
                type="button"
                onClick={() => setInvitedRole("agency_owner")}
                className={`rounded-lg border p-3 text-left transition-all space-y-0.5 col-span-2 ${invitedRole === "agency_owner" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="font-medium text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span>Agency Owner</span>
                  <span className="inline-flex items-center rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-semibold ml-1">
                    White Label
                  </span>
                  {invitedRole === "agency_owner" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Gets their own branded sub-agency on Agent Cloud. They manage their own team independently.
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => setInvitedRole("staff")}
              className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${invitedRole === "staff" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
            >
              <div className="font-medium text-sm flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" /> Staff
                {invitedRole === "staff" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
              </div>
              <div className="text-[11px] text-muted-foreground">Assistant — acts on your behalf</div>
            </button>
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Carriers &amp; Commission Levels</div>
          <p className="text-xs text-muted-foreground mb-3">Optionally pre-assign carriers and commission levels. You can skip this and assign carriers later from the Downline Contracts tab.</p>

          {(myCarriers?.rows ?? []).length === 0 ? (
            <div className="p-6 text-center border rounded-md bg-muted/30">
              <p className="text-sm text-muted-foreground">You don't have any active carrier contracts to assign yet.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="border rounded-lg overflow-hidden divide-y">
              {(myCarriers?.rows ?? []).map((row: any) => {
                const carrier = row.carriers;
                if (!carrier) return null;
                const assignment = assignments.find((a) => a.carrier_id === carrier.id);
                const myPct = Number(row.assigned_pct);
                const isAssigned = !!assignment;
                return (
                  <AccordionItem key={carrier.id} value={carrier.id} className="border-0">
                    <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30 [&>svg]:shrink-0">
                      <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAssignments((a) => [...a, { carrier_id: carrier.id, carrier_name: carrier.name, level_pct: myPct, level_name: null, release_needed: false }]);
                            } else {
                              setAssignments((a) => a.filter((x) => x.carrier_id !== carrier.id));
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="font-medium text-sm truncate">{carrier.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto mr-2 shrink-0">
                          {isAssigned
                            ? (assignment!.level_name || `${assignment!.level_pct}%`)
                            : "Not assigned"}
                        </span>
                      </div>
                    </AccordionTrigger>
                    {isAssigned && assignment && (
                      <AccordionContent className="px-3 pb-3 pt-0 border-t bg-muted/10">
                        <div className="pt-3">
                          <Label className="text-xs">Commission Level</Label>
                          <CarrierLevelSelector
                            carrierId={carrier.id}
                            myPct={myPct}
                            value={assignment.level_name ?? ""}
                            onValueChange={(levelName, levelPct) =>
                              setAssignments((a) =>
                                a.map((x) =>
                                  x.carrier_id === carrier.id
                                    ? { ...x, level_name: levelName, level_pct: levelPct }
                                    : x
                                )
                              )
                            }
                          />
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Applies to all product groups for this carrier.
                          </p>
                        </div>
                      </AccordionContent>
                    )}
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          {assignments.length > 0 && (
            <p className="text-sm text-muted-foreground pt-2">{assignments.length} carrier{assignments.length === 1 ? "" : "s"} assigned</p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending}>
            <Link2 className="h-4 w-4 mr-1" /> {create.isPending ? "Creating..." : "Create Link"}
          </Button>
        </div>
      </CardContent></Card>

      {/* My Links */}
      <div>
        <h2 className="font-semibold mb-3">My Invite Links</h2>
        <Card><CardContent className="p-0">
          {isLoading ? <Skeleton className="h-24 m-4" /> : (invites?.rows.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No invite links created yet.</div>
          ) : (
            <LinksTable rows={invites?.rows ?? []} />
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}


function CarrierLevelSelector({
  carrierId,
  myPct,
  value,
  onValueChange,
}: {
  carrierId: string;
  myPct: number;
  value: string;
  onValueChange: (levelName: string, levelPct: number) => void;
}) {
  const gridLevelsFn = useServerFn(listCarrierGridLevels);
  const { data: carrierLevels = [] } = useQuery({
    queryKey: ["carrier-grid-levels", carrierId],
    queryFn: () => gridLevelsFn({ data: { carrier_id: carrierId } }),
  });
  const allowedLevels = (carrierLevels as any[]).filter((l: any) => l.max_pct <= myPct);

  if (allowedLevels.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-1">No commission levels configured for this carrier.</p>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const found = allowedLevels.find((l: any) => l.level_name === v);
        onValueChange(v, found?.max_pct ?? myPct);
      }}
    >
      <SelectTrigger className="mt-1"><SelectValue placeholder="Select level..." /></SelectTrigger>
      <SelectContent>
        {allowedLevels.map((l: any) => (
          <SelectItem key={l.level_name} value={l.level_name}>
            {l.level_name} ({l.max_pct}%)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LinksTable({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteInvitationLink);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Link deleted"); qc.invalidateQueries({ queryKey: ["onb", "invites"] }); },
  });

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Link Name</TableHead>
        <TableHead>Carriers</TableHead>
        <TableHead>Created</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((r: any) => {
          const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${r.token}` : "";
          const carriers = Array.isArray(r.carrier_assignments) ? r.carrier_assignments : [];
          const name = r.link_name || r.name || "Invite Link";
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell>
                {carriers.length === 0 ? (
                  <span className="text-xs text-muted-foreground">None</span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-left">
                        <Badge variant="outline" className="text-xs cursor-pointer">
                          {carriers.length} carrier{carriers.length === 1 ? "" : "s"} ▾
                        </Badge>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <ul className="space-y-2">
                        {carriers.map((c: any) => (
                          <li key={c.carrier_id} className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium truncate">{c.carrier_name}</span>
                            <span className="text-muted-foreground shrink-0">
                              {c.level_name ? `${c.level_name} (${c.level_pct}%)` : c.level_pct ? `${c.level_pct}%` : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied!"); }}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy Link
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{name}"?</AlertDialogTitle>
                        <AlertDialogDescription>The invite link will stop working immediately.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(r.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function InviteStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-muted text-muted-foreground", label: "Active" },
    in_progress: { color: "bg-blue-500/15 text-blue-700 dark:text-blue-300", label: "In Progress" },
    completed: { color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Completed" },
    expired: { color: "bg-rose-500/15 text-rose-700 dark:text-rose-300", label: "Expired" },
  };
  const cfg = map[status] ?? map.pending;
  return <span className={`px-2 py-0.5 rounded text-xs ${cfg.color}`}>{cfg.label}</span>;
}
