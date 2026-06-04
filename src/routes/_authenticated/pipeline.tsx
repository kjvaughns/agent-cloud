import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Search, Plus, Upload, Download, Flame, Thermometer, Snowflake, Heart, Phone } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { phone as fmtPhone, money } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { listPipelineClients, createClient, updateClient, importClients } from "@/lib/pipeline.functions";
import { ClientDetailDrawer } from "@/components/pipeline/client-detail-drawer";
import { AgentLinkImportDialog } from "@/components/pipeline/agentlink-import-dialog";

type Stage = "new" | "callback" | "almost_there" | "sold";
type Temp = "hot" | "warm" | "cold";

const STAGE_COLS: { key: Stage; label: string; tint: string; header: string; badgeCls: string }[] = [
  { key: "new", label: "New / Cold", tint: "bg-slate-50 dark:bg-slate-900/30", header: "text-slate-600 dark:text-slate-300", badgeCls: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "callback", label: "Callback", tint: "bg-amber-50 dark:bg-amber-900/20", header: "text-amber-700 dark:text-amber-300", badgeCls: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "almost_there", label: "Almost There", tint: "bg-emerald-50 dark:bg-emerald-900/20", header: "text-emerald-700 dark:text-emerald-300", badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

const tempPill: Record<Temp, { cls: string; Icon: any; label: string }> = {
  hot: { cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900", Icon: Flame, label: "Hot" },
  warm: { cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900", Icon: Thermometer, label: "Warm" },
  cold: { cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900", Icon: Snowflake, label: "Cold" },
};

const pipelineQO = queryOptions({
  queryKey: ["pipeline", "list"],
  queryFn: () => listPipelineClients(),
});

export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: s.tab === "sold" ? "sold" as const : "pipeline" as const,
  }),
  head: () => ({ meta: [
    { title: "Pipeline — Agent Cloud" },
    { name: "description", content: "Kanban CRM for tracking your insurance leads through every stage." },
  ]}),
  component: PipelinePage,
});

function PipelineSkeleton() {
  return (
    <div className="h-full overflow-x-auto">
      <div className="flex gap-4 h-full min-w-max pb-2">
        {STAGE_COLS.map((col) => (
          <div key={col.key} className={cn("w-80 shrink-0 flex flex-col rounded-xl border", col.tint)}>
            <div className="px-4 py-3 border-b">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex-1 p-2 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="bg-card border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelinePage() {
  const qc = useQueryClient();
  const hydrated = useHydrated();
  const { data: clients = [], isLoading } = useQuery({ ...pipelineQO, enabled: hydrated });
  const [query, setQuery] = useState("");
  const { tab: initialTab } = Route.useSearch();
  const [tab, setTab] = useState<"pipeline" | "sold">(initialTab ?? "pipeline");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [agentLinkOpen, setAgentLinkOpen] = useState(false);

  const updateFn = useServerFn(updateClient);
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => updateFn({ data: { id, patch: { stage } } }),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["pipeline", "list"] });
      const prev = qc.getQueryData<any[]>(["pipeline", "list"]);
      qc.setQueryData<any[]>(["pipeline", "list"], (old) => old?.map((c) => c.id === id ? { ...c, stage } : c) ?? []);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pipeline", "list"], ctx.prev);
      toast.error("Failed to move client");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pipeline", "list"] }),
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("pipeline-clients")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
        qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c: any) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [clients, query]);

  const pipelineClients = filtered.filter((c: any) => c.stage !== "sold");
  const soldClients = filtered.filter((c: any) => c.stage === "sold");
  const showSkeleton = !hydrated || isLoading;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const stage = e.over?.id as Stage | undefined;
    if (!stage) return;
    const current = clients.find((c: any) => c.id === id);
    if (!current || current.stage === stage) return;
    stageMutation.mutate({ id, stage });
  };

  return (
    <div className="p-6 space-y-4 h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header row: tabs | search | buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline ({pipelineClients.length})</TabsTrigger>
            <TabsTrigger value="sold">Sold ({soldClients.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone..." className="pl-8" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => setAgentLinkOpen(true)}><Download className="h-4 w-4 mr-1" /> Import from AgentLink</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Clients</Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Client</Button>
        </div>
      </div>

      {/* Board content */}
      <div className="flex-1 min-h-0">
        {tab === "pipeline" ? (
          showSkeleton ? (
            <PipelineSkeleton />
          ) : (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div className="h-full overflow-x-auto">
                <div className="flex gap-4 h-full min-w-max pb-2">
                  {STAGE_COLS.map((col) => {
                    const cards = pipelineClients.filter((c: any) => c.stage === col.key);
                    return (
                      <KanbanColumn key={col.key} stage={col.key} label={col.label} tint={col.tint} header={col.header} count={cards.length}>
                        {cards.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-8 px-2">
                            No clients here yet. Drag a card or add a new client.
                          </div>
                        )}
                        {cards.map((c: any) => (
                          <LeadCard key={c.id} client={c} onClick={() => setOpenId(c.id)} />
                        ))}
                      </KanbanColumn>
                    );
                  })}
                </div>
              </div>
            </DndContext>
          )
        ) : (
          <div className="h-full overflow-y-auto">
            {soldClients.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">No sold clients yet.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-4">
                {soldClients.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="text-left bg-card border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition"
                  >
                    <div className="font-medium">{c.first_name} {c.last_name}</div>
                    {c.latest_policy ? (
                      <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                        <div>{c.latest_policy.carriers?.name ?? "—"} · {c.latest_policy.product ?? "—"}</div>
                        <div>Policy: {c.latest_policy.policy_number ?? "—"}</div>
                        <div>Effective: {c.latest_policy.effective_date ?? "—"}</div>
                        <div className="text-emerald-600 font-medium">{money(c.latest_policy.monthly_premium)}/mo</div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-2">No policy on file</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />
      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportClientsDialog open={importOpen} onOpenChange={setImportOpen} />
      <AgentLinkImportDialog open={agentLinkOpen} onOpenChange={setAgentLinkOpen} />
    </div>
  );
}

function KanbanColumn({ stage, label, tint, header, count, children }: { stage: Stage; label: string; tint: string; header: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={cn("w-80 shrink-0 flex flex-col rounded-xl border", tint, isOver && "ring-2 ring-primary")}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className={cn("font-semibold text-sm", header)}>{label} <span className="text-muted-foreground font-normal">({count})</span></div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">{children}</div>
    </div>
  );
}

function LeadCard({ client, onClick }: { client: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: client.id });
  const t = tempPill[(client.temperature ?? "cold") as Temp];
  const score = client.score_pct ?? 0;
  const scoreCls = score > 70 ? "bg-emerald-100 text-emerald-700" : score >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  const col = STAGE_COLS.find((c) => c.key === client.stage);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn("bg-card border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition", isDragging && "opacity-50")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">{client.first_name} {client.last_name}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", t.cls)}>
            <t.Icon className="h-3 w-3" /> {t.label}
          </span>
          {client.score_pct != null && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", scoreCls)}>{score}%</span>
          )}
        </div>
      </div>
      {col && (
        <div className="mt-1.5">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", col.badgeCls)}>
            {col.label}
          </span>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Phone className="h-3 w-3" /> {fmtPhone(client.phone) || "—"}
      </div>
      {client.last_opened_at && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Last opened: {new Date(client.last_opened_at).toLocaleDateString()}
        </div>
      )}
      {client.beneficiary_of && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
          <Heart className="h-3 w-3" /> Beneficiary of {client.beneficiary_of}
        </div>
      )}
    </div>
  );
}

// ============ Add Client Dialog ============
function AddClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const mut = useMutation({
    mutationFn: () => createFn({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        phone_type: "Mobile",
        email: "", date_of_birth: "", street_address: "",
        city: "", state: "", zip_code: "",
        temperature: "cold", stage: "new",
      },
    }),
    onSuccess: () => {
      toast.success("Client added");
      qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
      onOpenChange(false);
      setFirstName(""); setLastName(""); setPhone("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const valid = firstName.trim() && lastName.trim() && phone.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Add a name and phone to create the card. Fill in details from the client drawer.
        </p>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name *">
              <Input
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && valid && mut.mutate()}
                placeholder="Jane"
              />
            </Field>
            <Field label="Last Name *">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && valid && mut.mutate()}
                placeholder="Smith"
              />
            </Field>
          </div>
          <Field label="Phone Number *">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valid && mut.mutate()}
              placeholder="(555) 000-0000"
            />
          </Field>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !valid}>
            {mut.isPending ? "Adding…" : "Add Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

// ============ Import Clients Dialog ============
function ImportClientsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importClients);
  const [rows, setRows] = useState<any[]>([]);
  const [filename, setFilename] = useState("");

  const onFile = (file: File) => {
    setFilename(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cleaned = (res.data as any[])
          .map((r) => ({
            first_name: String(r.first_name ?? "").trim(),
            last_name: String(r.last_name ?? "").trim(),
            phone: String(r.phone ?? "").trim(),
            email: r.email ? String(r.email).trim() : "",
            date_of_birth: r.date_of_birth ? String(r.date_of_birth).trim() : "",
            stage: r.stage ? String(r.stage).trim() : undefined,
            temperature: r.temperature ? String(r.temperature).trim() : undefined,
          }))
          .filter((r) => r.first_name && r.last_name && r.phone);
        setRows(cleaned);
      },
    });
  };

  const mut = useMutation({
    mutationFn: () => importFn({ data: { rows } }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r.count} clients`);
      qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
      onOpenChange(false);
      setRows([]); setFilename("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import Clients</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">CSV columns: <code>first_name, last_name, phone</code> (required), <code>email, date_of_birth, stage, temperature</code> (optional).</p>
        <Input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {filename && <div className="text-xs text-muted-foreground">{filename} — {rows.length} valid rows</div>}
        {rows.length > 0 && (
          <div className="border rounded-md max-h-60 overflow-auto">
            <table className="text-xs w-full">
              <thead className="bg-muted/40"><tr><th className="text-left p-2">First</th><th className="text-left p-2">Last</th><th className="text-left p-2">Phone</th><th className="text-left p-2">Email</th></tr></thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{r.first_name}</td><td className="p-2">{r.last_name}</td><td className="p-2">{r.phone}</td><td className="p-2">{r.email}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={rows.length === 0 || mut.isPending}>Import {rows.length} Clients</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
