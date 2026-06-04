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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Copy, Check, Trash2, Lock, Link2 } from "lucide-react";
import { toast } from "sonner";

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
    mutationFn: () => createFn({ data: { link_name: linkName, assignments } }),
    onSuccess: (res: any) => {
      setSuccess({ token: res.token, linkName });
      qc.invalidateQueries({ queryKey: ["onb", "invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create link"),
  });

  const canCreate = linkName.trim().length > 0 && assignments.length > 0;

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

        <div>
          <div className="text-sm font-medium mb-2">Carriers &amp; Commission Levels</div>
          <p className="text-xs text-muted-foreground mb-3">Select carriers to include and assign a commission level for each. You can only assign levels at or below your own.</p>

          {(myCarriers?.rows ?? []).length === 0 ? (
            <div className="p-6 text-center border rounded-md bg-muted/30">
              <p className="text-sm text-muted-foreground">You don't have any active carrier contracts to assign yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(myCarriers?.rows ?? []).map((row: any) => {
                const carrier = row.carriers;
                if (!carrier) return null;
                const assignment = assignments.find((a) => a.carrier_id === carrier.id);
                const myPct = Number(row.assigned_pct);
                return (
                  <CarrierAssignmentCard
                    key={carrier.id}
                    carrierId={carrier.id}
                    carrierName={carrier.name}
                    myMaxPct={myPct}
                    assignment={assignment}
                    onToggle={(checked) => {
                      if (checked) {
                        setAssignments((a) => [...a, { carrier_id: carrier.id, carrier_name: carrier.name, level_pct: myPct, release_needed: false }]);
                      } else {
                        setAssignments((a) => a.filter((x) => x.carrier_id !== carrier.id));
                      }
                    }}
                    onUpdate={(patch) => setAssignments((a) => a.map((x) => x.carrier_id === carrier.id ? { ...x, ...patch } : x))}
                  />
                );
              })}
            </div>
          )}

          {assignments.length > 0 && (
            <p className="text-sm text-muted-foreground pt-2">{assignments.length} carrier{assignments.length === 1 ? "" : "s"} selected</p>
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

function CarrierAssignmentCard({
  carrierId, carrierName, myMaxPct, assignment, onToggle, onUpdate,
}: {
  carrierId: string;
  carrierName: string;
  myMaxPct: number;
  assignment: Assignment | undefined;
  onToggle: (v: boolean) => void;
  onUpdate: (patch: Partial<Assignment>) => void;
}) {
  const checked = !!assignment;
  const levelOptions: number[] = [];
  for (let p = myMaxPct; p >= 50; p -= 5) levelOptions.push(p);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-muted/30">
        <label className="flex items-center gap-3 cursor-pointer flex-1">
          <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4" />
          <div>
            <div className="font-medium">{carrierName}</div>
            <div className="text-xs text-muted-foreground">Your max: {myMaxPct}%</div>
          </div>
        </label>
        {checked && <Badge variant="secondary">Included</Badge>}
      </div>

      {checked && assignment && (
        <div className="p-3 space-y-3 border-t">
          <div>
            <Label className="text-xs">Commission Level</Label>
            <Select value={String(assignment.level_pct)} onValueChange={(v) => onUpdate({ level_pct: Number(v) })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {levelOptions.map((p) => (
                  <SelectItem key={p} value={String(p)}>{p}%{p === myMaxPct ? " (your level)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Applies to all product groups for this carrier.
            </p>
          </div>
          <div>
            <Label className="text-xs">Release Needed from previous upline?</Label>
            <div className="flex gap-2 mt-1">
              <Button size="sm" type="button" variant={assignment.release_needed ? "default" : "outline"} onClick={() => onUpdate({ release_needed: true })}>Yes</Button>
              <Button size="sm" type="button" variant={!assignment.release_needed ? "default" : "outline"} onClick={() => onUpdate({ release_needed: false })}>No</Button>
            </div>
          </div>
        </div>
      )}
    </div>
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
                <div className="flex flex-wrap gap-1">
                  {carriers.slice(0, 3).map((c: any) => (
                    <Badge key={c.carrier_id} variant="outline" className="text-xs">{c.carrier_name}</Badge>
                  ))}
                  {carriers.length > 3 && <Badge variant="outline" className="text-xs">+{carriers.length - 3} more</Badge>}
                </div>
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
