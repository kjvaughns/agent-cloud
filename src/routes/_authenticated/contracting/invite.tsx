import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInvitationLinks, createInvitationLink, deleteInvitationLink, listCarriers, listMyCarrierLevels } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Copy, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracting/invite")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Agent Network | Agent Cloud" }] }),
});

type Assignment = { carrier_id: string; carrier_name: string; level_name?: string; level_pct: number };

function InvitePage() {
  const qc = useQueryClient();
  const { data: carriers } = useQuery({ queryKey: ["contracting","carriers"], queryFn: () => listCarriers() });
  const { data: myLevels } = useQuery({ queryKey: ["contracting","myLevels"], queryFn: () => listMyCarrierLevels() });
  const { data: links, isLoading } = useQuery({ queryKey: ["contracting","invitations"], queryFn: () => listInvitationLinks() });

  const [name, setName] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [levelPct, setLevelPct] = useState("");
  const [levelName, setLevelName] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const createFn = useServerFn(createInvitationLink);
  const deleteFn = useServerFn(deleteInvitationLink);
  const create = useMutation({
    mutationFn: () => createFn({ data: { name, assignments } }),
    onSuccess: () => {
      toast.success("Invitation link created");
      setName(""); setAssignments([]);
      qc.invalidateQueries({ queryKey: ["contracting","invitations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["contracting","invitations"] }); },
  });

  const myCarrierMap = new Map<string, number>();
  (myLevels?.rows ?? []).forEach((r: any) => myCarrierMap.set(r.carrier_id, Number(r.assigned_pct)));

  function addAssignment() {
    if (!carrierId || !levelPct) return;
    const carrier = carriers?.carriers.find((c: any) => c.id === carrierId);
    if (!carrier) return;
    const myPct = myCarrierMap.get(carrierId);
    const pct = Number(levelPct);
    if (myPct !== undefined && pct > myPct) {
      toast.error(`Cannot exceed your level (${myPct}%) for ${carrier.name}`);
      return;
    }
    if (assignments.some(a => a.carrier_id === carrierId)) {
      toast.error("Carrier already added");
      return;
    }
    setAssignments(a => [...a, { carrier_id: carrierId, carrier_name: carrier.name, level_pct: pct, level_name: levelName || undefined }]);
    setCarrierId(""); setLevelPct(""); setLevelName("");
  }

  const canSubmit = name.trim().length > 0 && assignments.length > 0;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Network</h1>
        <p className="text-sm text-muted-foreground">Create and manage invitation links for new agents</p>
      </div>

      <Card><CardContent className="p-6 space-y-4">
        <div>
          <Label>Link Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0,120))} className="mt-1" placeholder="e.g., New Agent, Senior Manager" />
          <p className="text-xs text-muted-foreground mt-1">Give this link a memorable name so you can easily identify it.</p>
        </div>

        <div className="space-y-2">
          <Label>Commission Level Assignments *</Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Select value={carrierId} onValueChange={setCarrierId}>
                <SelectTrigger><SelectValue placeholder="Carrier..." /></SelectTrigger>
                <SelectContent>
                  {(carriers?.carriers ?? []).map((c: any) => {
                    const myPct = myCarrierMap.get(c.id);
                    return <SelectItem key={c.id} value={c.id}>{c.name}{myPct !== undefined ? ` (max ${myPct}%)` : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <Input type="number" min={0} max={200} value={levelPct} onChange={(e) => setLevelPct(e.target.value)} placeholder="Level %" className="w-28" />
            <Input value={levelName} onChange={(e) => setLevelName(e.target.value)} placeholder="Code (opt.)" className="w-32" />
            <Button onClick={addAssignment} variant="outline"><Plus className="h-4 w-4" /> Add</Button>
          </div>

          {assignments.length === 0 ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>No commission levels assigned yet. Please add at least one carrier assignment before creating the invitation.</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Carrier</TableHead><TableHead>Level Code</TableHead><TableHead>Level %</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>
                {assignments.map((a, i) => (
                  <TableRow key={a.carrier_id}>
                    <TableCell>{a.carrier_name}</TableCell>
                    <TableCell className="font-mono text-xs">{a.level_name ?? "—"}</TableCell>
                    <TableCell className="font-mono">{a.level_pct}%</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => setAssignments(arr => arr.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()} className="w-full">
          {create.isPending ? "Creating..." : "Create Invitation Link"}
        </Button>
      </CardContent></Card>

      <div>
        <h2 className="font-semibold mb-3">My Invitation Links</h2>
        <Card><CardContent className="p-0">
          {isLoading ? <Skeleton className="h-24 m-4" /> : (links?.rows.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No invitation links yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Link Name</TableHead><TableHead>Carriers Assigned</TableHead><TableHead>Date Created</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(links?.rows ?? []).map((l: any) => {
                  const url = typeof window !== "undefined" ? `${window.location.origin}/join/${l.token}` : `/join/${l.token}`;
                  const count = Array.isArray(l.carrier_assignments) ? l.carrier_assignments.length : 0;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>{count} carrier{count === 1 ? "" : "s"}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => {
                          navigator.clipboard?.writeText(url);
                          toast.success("Copied!");
                        }}><Copy className="h-4 w-4" /> Copy Link</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete invitation link?</AlertDialogTitle>
                              <AlertDialogDescription>"{l.name}" will stop working immediately.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(l.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
