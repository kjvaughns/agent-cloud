import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { listProspects, createProspect, updateProspectStage } from "@/lib/recruiting.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, UserPlus, Sparkles } from "lucide-react";
import { NurtureDialog } from "@/components/ai/nurture-dialog";
import { toast } from "sonner";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";

export const Route = createFileRoute("/_authenticated/back-office/marketing-tracker")({
  head: () => ({ meta: [
    { title: "Marketing Tracker — Agent Cloud" },
    { name: "description", content: "Track recruiting and client-marketing prospects in one place." },
  ]}),
  component: MarketingTrackerPage,
});

const STAGES = [
  { key: "new", label: "New Inquiries", color: "bg-slate-500" },
  { key: "callback", label: "Callbacks", color: "bg-sky-500" },
  { key: "in_course", label: "In Course", color: "bg-amber-500" },
  { key: "getting_licensed", label: "Getting Licensed", color: "bg-violet-500" },
  { key: "onboarded", label: "Onboarded", color: "bg-emerald-500" },
] as const;

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

const SOURCES = ["Referral", "Indeed", "LinkedIn", "Facebook", "Recruiting Funnel", "Ad", "Website", "Other"];

type TrackerType = "recruiting" | "client";

function daysIn(iso: string | null | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function MarketingTrackerPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProspects);
  const updateFn = useServerFn(updateProspectStage);

  const [type, setType] = useState<"all" | TrackerType>("all");

  const { data: allProspects = [], isLoading } = useQuery({
    queryKey: ["recruiting-prospects"],
    queryFn: () => listFn(),
  });

  const prospects = useMemo(() => {
    if (type === "all") return allProspects as any[];
    return (allProspects as any[]).filter((p) => (p.tracker_type ?? "recruiting") === type);
  }, [allProspects, type]);

  const [nurtureFor, setNurtureFor] = useState<{ id: string; name: string } | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of prospects as any[]) c[p.stage] = (c[p.stage] ?? 0) + 1;
    return c;
  }, [prospects]);

  const updateStage = useMutation({
    mutationFn: (args: { id: string; stage: string }) => updateFn({ data: args as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruiting-prospects"] });
      toast.success("Stage updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update stage"),
  });

  return (
    <PageShell>
      <div className="space-y-6">
        <HeroBand
          title="Marketing Tracker"
          subtitle="Track recruiting and client-marketing prospects from first touch to close."
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={type} onValueChange={(v) => setType(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="recruiting">Recruiting</TabsTrigger>
              <TabsTrigger value="client">Client</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STAGES.map((s) => (
            <div key={s.key} className="rounded-[var(--radius)] border border-border bg-card p-4">
              <div className={`h-1 w-12 rounded-full ${s.color} mb-3`} />
              <StatTile label={s.label} value={counts[s.key] ?? 0} />
            </div>
          ))}
        </div>

        <Panel title="Pipeline" action={<AddProspectDialog defaultType={type === "all" ? "recruiting" : type} />}>
          <div className="rounded-[var(--radius)] border border-border-soft overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : prospects.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <div className="font-medium text-foreground">No entries yet</div>
                <p className="text-sm mt-1">Add your first entry, or share a funnel link to capture inbound prospects automatically.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Days in stage</TableHead>
                    <TableHead className="text-right">AI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(prospects as any[]).map((p) => {
                    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
                    const initials = `${(p.first_name ?? "?")[0] ?? ""}${(p.last_name ?? "")[0] ?? ""}`.toUpperCase();
                    const recruiter = p.recruiter ? `${p.recruiter.first_name ?? ""} ${p.recruiter.last_name ?? ""}`.trim() : "—";
                    const tType = (p.tracker_type ?? "recruiting") as TrackerType;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
                            <div>
                              <div className="font-medium">{name}</div>
                              {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tType === "recruiting" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600"}`}>
                            {tType === "recruiting" ? "Recruiting" : "Client"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.source ?? "—"}</TableCell>
                        <TableCell>
                          <Select value={p.stage} onValueChange={(v) => updateStage.mutate({ id: p.id, stage: v })}>
                            <SelectTrigger className="w-44 h-8">
                              <SelectValue>{STAGE_LABEL[p.stage] ?? p.stage}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{recruiter}</TableCell>
                        <TableCell className="text-right tnum">{daysIn(p.stage_entered_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setNurtureFor({ id: p.id, name })}>
                            <Sparkles className="h-3 w-3 mr-1" /> Nurture
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Panel>

        {nurtureFor && (
          <NurtureDialog
            prospectId={nurtureFor.id}
            prospectName={nurtureFor.name}
            open={!!nurtureFor}
            onOpenChange={(o) => !o && setNurtureFor(null)}
          />
        )}
      </div>
    </PageShell>
  );
}

function AddProspectDialog({ defaultType }: { defaultType: TrackerType }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createProspect);
  const [open, setOpen] = useState(false);
  const [trackerType, setTrackerType] = useState<TrackerType>(defaultType);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("Referral");
  const [stage, setStage] = useState("new");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() || "",
      source,
      notes: notes.trim() || undefined,
      stage: stage as any,
      tracker_type: trackerType,
    }}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruiting-prospects"] });
      setOpen(false);
      setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setNotes(""); setStage("new"); setSource("Referral");
      toast.success("Entry added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add entry"),
  });

  const canSave = firstName.trim() && lastName.trim() && phone.trim().length >= 7;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setTrackerType(defaultType); }}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Entry</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add {trackerType === "recruiting" ? "Recruit" : "Client Prospect"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Type</Label>
            <Select value={trackerType} onValueChange={(v) => setTrackerType(v as TrackerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recruiting">Recruiting</SelectItem>
                <SelectItem value="client">Client Marketing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>First name *</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Last name *</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone *</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Background, availability, follow-up context..." />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving..." : "Add Entry"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
