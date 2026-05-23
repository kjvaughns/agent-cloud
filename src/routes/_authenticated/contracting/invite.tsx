import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOnboardingInvites,
  createOnboardingInvite,
  getMyContractedCarriers,
  resendInvite,
  searchDownlineAgents,
  getMyInviteSignature,
  saveInviteSignature,
  addCarriersToInvite,
  updateInviteCarrierLevel,
} from "@/lib/onboarding.functions";
import { deleteInvitationLink } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Copy, Check, Send, Trash2, RefreshCw, Plus, ChevronDown, ChevronRight, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/contracting/invite")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Invite Agent | Agent Cloud" }] }),
});

type Assignment = {
  carrier_id: string;
  carrier_name: string;
  level_name?: string | null;
  level_pct: number;
  release_needed?: boolean;
};

function InvitePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [success, setSuccess] = useState<{ token: string; email: string } | null>(null);

  // Step 1 state
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [existingAgent, setExistingAgent] = useState<{ id: string; name: string } | null>(null);
  const [agentMode, setAgentMode] = useState<"new" | "existing">("new");
  const [useSignature, setUseSignature] = useState(false);
  const [signature, setSignature] = useState("");
  const [agentSearch, setAgentSearch] = useState("");

  // Step 2 state
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Data
  const { data: myCarriers } = useQuery({
    queryKey: ["onb","myCarriers"],
    queryFn: () => getMyContractedCarriers(),
  });
  const { data: invites, isLoading } = useQuery({
    queryKey: ["onb","invites","mine"],
    queryFn: () => listOnboardingInvites({ data: { scope: "mine" } }),
  });
  const { data: savedSig } = useQuery({
    queryKey: ["onb","sig"],
    queryFn: () => getMyInviteSignature(),
  });
  const { data: agentSearchResults } = useQuery({
    queryKey: ["onb","search", agentSearch],
    queryFn: () => searchDownlineAgents({ data: { query: agentSearch } }),
    enabled: agentMode === "existing",
  });

  const createFn = useServerFn(createOnboardingInvite);
  const saveSigFn = useServerFn(saveInviteSignature);
  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        new_agent_first_name: agentMode === "new" ? firstName : null,
        new_agent_last_name: agentMode === "new" ? lastName : null,
        new_agent_email: email,
        existing_agent_id: agentMode === "existing" ? existingAgent?.id ?? null : null,
        invite_signature_html: useSignature && signature ? signature : null,
        assignments,
      },
    }),
    onSuccess: (res: any) => {
      setSuccess({ token: res.token, email });
      qc.invalidateQueries({ queryKey: ["onb","invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send invite"),
  });

  const canStep1 = email.includes("@") && (agentMode === "existing" ? !!existingAgent : (firstName.trim() && lastName.trim()));
  const canSend = assignments.length > 0;

  function resetForm() {
    setStep(1); setSuccess(null); setEmail(""); setFirstName(""); setLastName("");
    setAssignments([]); setExistingAgent(null); setUseSignature(false);
  }

  if (success) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${success.token}` : `/invite/${success.token}`;
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card><CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 grid place-items-center">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Invite Sent!</h2>
          <p className="text-muted-foreground">An invite is ready for <strong>{success.email}</strong>. Share the link below.</p>
          <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
            <code className="flex-1 text-xs text-left truncate">{url}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied!"); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={resetForm}>Send Another</Button>
            <Link to="/contracting/onboarding"><Button>View Onboarding Dashboard →</Button></Link>
          </div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contract Agent</h1>
        <p className="text-sm text-muted-foreground">Invite a new or existing agent to start contracting</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 text-sm">
        <div className={`flex items-center gap-2 ${step === 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          <div className={`h-6 w-6 rounded-full grid place-items-center text-xs ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>1</div>
          Agent Info
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className={`flex items-center gap-2 ${step === 2 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          <div className={`h-6 w-6 rounded-full grid place-items-center text-xs ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>2</div>
          Carriers & Levels
        </div>
      </div>

      {step === 1 && (
        <Card><CardContent className="p-6 space-y-5">
          <div>
            <Label>Direct Upline</Label>
            <Input value={user?.email ?? ""} readOnly className="mt-1 bg-muted/50" />
            <p className="text-xs text-muted-foreground mt-1">You're sending this invite. The new agent will be in your downline.</p>
          </div>

          <div>
            <Label className="mb-2 block">Is this agent already on Agent Cloud?</Label>
            <div className="flex gap-2">
              <Button type="button" variant={agentMode === "new" ? "default" : "outline"} size="sm" onClick={() => setAgentMode("new")}>New Agent</Button>
              <Button type="button" variant={agentMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setAgentMode("existing")}>Existing Agent</Button>
            </div>
          </div>

          {agentMode === "existing" ? (
            <div>
              <Label>Search agent</Label>
              <Input value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} placeholder="Search by name..." className="mt-1" />
              {agentSearchResults && agentSearch && !existingAgent && (
                <div className="mt-2 border rounded-md max-h-48 overflow-auto">
                  {(agentSearchResults.agents ?? []).length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No matches</div>
                  ) : agentSearchResults.agents.map((a: any) => (
                    <button key={a.id} type="button" onClick={() => { setExistingAgent({ id: a.id, name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() }); setAgentSearch(""); }}
                      className="w-full text-left p-2 hover:bg-muted text-sm border-b last:border-0">
                      {a.first_name} {a.last_name}
                    </button>
                  ))}
                </div>
              )}
              {existingAgent && (
                <div className="mt-2 flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <span className="flex-1 text-sm">{existingAgent.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => setExistingAgent(null)}>Clear</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}

          <div>
            <Label>Email Address *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="agent@example.com" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Add your signature to the invite?</Label>
              <Switch checked={useSignature} onCheckedChange={(v) => { setUseSignature(v); if (v && savedSig?.signature_html && !signature) setSignature(savedSig.signature_html); }} />
            </div>
            {useSignature && (
              <>
                <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={4} placeholder="Best,&#10;Your Name&#10;Your Agency" />
                <Button size="sm" variant="outline" onClick={async () => {
                  await saveSigFn({ data: { signature_html: signature } });
                  toast.success("Signature saved");
                }}>Save Signature</Button>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!canStep1}>Next →</Button>
          </div>
        </CardContent></Card>
      )}

      {step === 2 && (
        <Card><CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose carriers and assign commission levels. You can only assign levels at or below your own.
          </p>

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

          <div className="text-sm text-muted-foreground pt-2">{assignments.length} carrier{assignments.length === 1 ? "" : "s"} selected</div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
            <Button onClick={() => create.mutate()} disabled={!canSend || create.isPending}>
              <Send className="h-4 w-4 mr-1" /> {create.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </div>
        </CardContent></Card>
      )}

      {/* Sent Invites */}
      <div className="pt-4">
        <h2 className="font-semibold mb-3">My Sent Invites</h2>
        <Card><CardContent className="p-0">
          {isLoading ? <Skeleton className="h-24 m-4" /> : (invites?.rows.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No invites sent yet.</div>
          ) : (
            <SentInvitesTable rows={invites?.rows ?? []} />
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
  // Build level options: full integer steps from 50 to myMaxPct
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

function SentInvitesTable({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deleteFn = useServerFn(deleteInvitationLink);
  const resendFn = useServerFn(resendInvite);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["onb","invites"] }); },
  });
  const resend = useMutation({
    mutationFn: (id: string) => resendFn({ data: { invite_id: id } }),
    onSuccess: () => toast.success("Invite resent"),
  });

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead className="w-8" /><TableHead>Agent</TableHead><TableHead>Email</TableHead>
        <TableHead>Carriers</TableHead><TableHead>Sent</TableHead><TableHead>Status</TableHead>
        <TableHead>Step</TableHead><TableHead className="text-right">Actions</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((r: any) => {
          const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${r.token}` : "";
          const carriers = Array.isArray(r.carrier_assignments) ? r.carrier_assignments : [];
          const agentName = r.linked_agent ? `${r.linked_agent.first_name ?? ""} ${r.linked_agent.last_name ?? ""}`.trim()
            : `${r.new_agent_first_name ?? ""} ${r.new_agent_last_name ?? ""}`.trim() || "—";
          const isExpanded = expandedId === r.id;
          return (
            <>
              <TableRow key={r.id}>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </TableCell>
                <TableCell className="font-medium">{agentName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.new_agent_email}</TableCell>
                <TableCell>{carriers.length}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell><InviteStatusBadge status={r.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{stepLabel(r.onboarding_step)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" title="Resend" onClick={() => resend.mutate(r.id)}><RefreshCw className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Copy link" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete invite?</AlertDialogTitle>
                          <AlertDialogDescription>The invite link will stop working immediately.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(r.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
              {isExpanded && (
                <TableRow key={r.id + "-exp"}>
                  <TableCell colSpan={8} className="bg-muted/20">
                    <div className="space-y-2">
                      {carriers.length === 0 ? <span className="text-sm text-muted-foreground">No carriers</span> : carriers.map((c: any) => (
                        <div key={c.carrier_id} className="flex items-center gap-3 text-sm">
                          <Badge variant="outline">{c.carrier_name}</Badge>
                          <span>Level: {c.level_pct}%</span>
                          {c.release_needed && <Badge variant="secondary">Release needed</Badge>}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}

function stepLabel(step: number): string {
  return ["Not started","Personal Info","Carrier Selection","Agreement","SuranceBay"][step] ?? "—";
}

export function InviteStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-muted text-muted-foreground", label: "Pending" },
    in_progress: { color: "bg-blue-500/15 text-blue-700 dark:text-blue-300", label: "In Progress" },
    in_surelc: { color: "bg-purple-500/15 text-purple-700 dark:text-purple-300", label: "In SuranceBay" },
    completed: { color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Completed" },
    expired: { color: "bg-rose-500/15 text-rose-700 dark:text-rose-300", label: "Expired" },
  };
  const cfg = map[status] ?? map.pending;
  return <span className={`px-2 py-0.5 rounded text-xs ${cfg.color}`}>{cfg.label}</span>;
}
