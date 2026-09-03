import { createFileRoute, useHydrated, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Search, Plus, Upload, Download, Heart, Phone, MapPin, Calendar, CheckCircle2, DollarSign } from "lucide-react";
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
import { SampleChip } from "@/components/sample-chip";
import { EmptyState } from "@/components/empty-state";
import { EMPTY_STATES, ghostFor } from "@/lib/empty-states";
import { phone as fmtPhone, money } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { listPipelineClients, createClient, updateClient, importClients } from "@/lib/pipeline.functions";
import { ClientDetailDrawer } from "@/components/pipeline/client-detail-drawer";
import { BookImportDialog } from "@/components/pipeline/book-import-dialog";
import { SoldTab } from "@/components/pipeline/sold-tab";
import { PageShell, HeroBand } from "@/components/page-shell";
import { ScopeToggle, ScopeAgentFilter } from "@/components/scope-toggle";
import { useScope } from "@/hooks/use-scope";
import { SCOPES, type Scope } from "@/lib/scope";

type Stage = "new" | "callback" | "almost_there" | "sold";

const STAGE_COLS: { key: Stage; label: string; tint: string; header: string; badgeCls: string }[] = [
  { key: "new", label: "New / Cold", tint: "bg-surface-2", header: "text-muted-foreground", badgeCls: "bg-surface-2 text-muted-foreground border-border-soft" },
  { key: "callback", label: "Callback", tint: "bg-surface-2", header: "text-warning", badgeCls: "bg-warning text-warning border-warning" },
  { key: "almost_there", label: "Almost There", tint: "bg-surface-2", header: "text-success", badgeCls: "bg-success text-success border-success" },
];

export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (s: Record<string, unknown>): { tab?: "sold" | "pipeline"; client?: string; scope?: Scope } => ({
    scope: SCOPES.includes(s.scope as Scope) ? (s.scope as Scope) : undefined,
    tab: s.tab === "sold" ? "sold" as const : "pipeline" as const,
    // Deep link from global search: opens that client's detail drawer.
    client: typeof s.client === "string" ? s.client : undefined,
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
          <div key={col.key} className={cn("w-80 shrink-0 flex flex-col rounded-[var(--radius)] border border-border-soft", col.tint)}>
            <div className="px-4 py-3 border-b border-border-soft">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex-1 p-2 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="bg-card border border-border rounded-[var(--radius)] p-3 space-y-3">
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
  const { scope: rawScope, ready: scopeReady } = useScope();
  // Client records never roll up across agency boundaries: a parent agency
  // administers its sub-agencies but does not read their pipelines. Total IMO
  // therefore narrows to the caller's own agency here (the server does the
  // same, so this is a label fix, not the boundary).
  const scope = rawScope === "imo" ? "agency" : rawScope;
  // Keyed by scope. A module-level constant key here would hand somebody the
  // previous scope's rows for a beat every time they switch.
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["pipeline", "list", scope],
    queryFn: () => listPipelineClients({ data: { scope } }),
    enabled: hydrated && scopeReady,
  });
  const [query, setQuery] = useState("");
  const { tab: initialTab = "pipeline" } = Route.useSearch();
  const [tab, setTab] = useState<"pipeline" | "sold">(initialTab ?? "pipeline");
  const { client: clientParam } = Route.useSearch();
  const [openId, setOpenId] = useState<string | null>(clientParam ?? null);
  // Follow later navigations to the same route (search -> search).
  useEffect(() => { if (clientParam) setOpenId(clientParam); }, [clientParam]);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bookImportOpen, setBookImportOpen] = useState(false);

  const updateFn = useServerFn(updateClient);
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => updateFn({ data: { id, patch: { stage } } }),
    onMutate: async ({ id, stage }) => {
      // The scoped key, not the prefix. getQueryData and setQueryData match
      // exactly, so writing to ["pipeline","list"] would quietly update
      // nothing and the card would snap back until the refetch landed.
      const key = ["pipeline", "list", scope];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<any[]>(key);
      qc.setQueryData<any[]>(key, (old) => old?.map((c) => c.id === id ? { ...c, stage } : c) ?? []);
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
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
    // Digits only count as a phone search when there are enough of them.
    // Stripping letters to "" made every phone "match" — so search matched all.
    const digits = q.replace(/\D/g, "");
    return clients.filter((c: any) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
      if (name.includes(q)) return true;
      if ((c.email ?? "").toLowerCase().includes(q)) return true;
      const phone = (c.phone ?? "").replace(/\D/g, "");
      return digits.length >= 3 && phone.length > 0 && phone.includes(digits);
    });
  }, [clients, query]);


  const pipelineClients = filtered.filter((c: any) => c.stage !== "sold");
  const soldClients = filtered.filter((c: any) => c.stage === "sold");
  const showSkeleton = !hydrated || isLoading;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Dragging a card writes. The write policies grant that on your own rows
  // only, so outside your own board the drop would be accepted by the UI and
  // silently discarded by the database — a success toast and no change.
  const canDrag = scope === "mine";
  const onDragEnd = (e: DragEndEvent) => {
    if (!canDrag) return;
    const id = String(e.active.id);
    const stage = e.over?.id as Stage | undefined;
    if (!stage) return;
    const current = clients.find((c: any) => c.id === id);
    if (!current || current.stage === stage) return;
    stageMutation.mutate({ id, stage });
  };

  const tabControls = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList className="h-9">
        <TabsTrigger value="pipeline" className="gap-1.5">
          Pipeline
          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-surface-2 text-[10px] font-bold text-foreground border border-border-soft tnum">
            {pipelineClients.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="sold" className="gap-1.5">
          Sold
          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-surface-2 text-[10px] font-bold text-foreground border border-border-soft tnum">
            {soldClients.length}
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <PageShell>
      <div className="flex flex-col gap-4 h-[calc(100vh_-_3.5rem_-_2*var(--gap))] min-h-0">
        <HeroBand
          title="Pipeline"
          subtitle="Track every lead from first touch to sold."
          actions={
            <>
              <ScopeToggle exclude={["imo"]} />
              {tabControls}
              <div className="relative w-full sm:w-56">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone..." className="pl-9 h-9" />
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setBookImportOpen(true)}>
                <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Import book</span>
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">Import</span>
              </Button>
              <Button data-tour="pipeline-add" size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" />Add Client
              </Button>
            </>
          }
        />

        {/* Board content */}
        <div className="flex-1 min-h-0">
        {tab === "pipeline" ? (
          showSkeleton ? (
            <PipelineSkeleton />
          ) : (
            pipelineClients.length === 0 ? (
              /* An entirely empty board teaches once, rather than four columns
                 each saying "no clients here yet" — which is four times the
                 words and none of the help. */
              <div className="p-2">
                <EmptyState
                  title={EMPTY_STATES.pipeline.title}
                  body={EMPTY_STATES.pipeline.body}
                  ghost={ghostFor("pipeline")}
                  action={<Button size="sm" onClick={() => setAddOpen(true)}>Add your first client</Button>}
                  secondary={
                    <Button asChild size="sm" variant="outline">
                      <Link to="/import">Import a list</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div data-tour="pipeline-board" className="h-full overflow-x-auto">
                <div className="flex gap-4 h-full min-w-max pb-2">
                  {STAGE_COLS.map((col) => {
                    const cards = pipelineClients.filter((c: any) => c.stage === col.key);
                    return (
                      <KanbanColumn key={col.key} stage={col.key} label={col.label} tint={col.tint} header={col.header} count={cards.length}>
                        {cards.map((c: any) => (
                          <LeadCard key={c.id} client={c} draggable={canDrag} onClick={() => setOpenId(c.id)} />
                        ))}
                      </KanbanColumn>
                    );
                  })}
                </div>
              </div>
            </DndContext>
            )
          )
        ) : (
          <div className="h-full overflow-y-auto pb-4">
            {soldClients.length === 0 ? (
              <EmptyState
                title="Your sold clients collect here"
                body="Anything you move to Sold appears here with its policies and what they pay."
                ghost={ghostFor("clients")}
              />
            ) : (
              <SoldTab clients={soldClients} onOpen={(id) => setOpenId(id)} />
            )}
          </div>
        )}
        </div>
      </div>

      <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />
      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportClientsDialog open={importOpen} onOpenChange={setImportOpen} />
      <BookImportDialog open={bookImportOpen} onOpenChange={setBookImportOpen} />
    </PageShell>
  );
}

function KanbanColumn({ stage, label, tint, header, count, children }: { stage: Stage; label: string; tint: string; header: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={cn("w-72 sm:w-80 shrink-0 flex flex-col rounded-[var(--radius)] border border-border-soft transition-all", tint, isOver && "ring-2 ring-primary ring-offset-1")}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <div>
          <span className={cn("font-display text-[11px] font-semibold uppercase tracking-[0.09em]", header)} style={{ fontFamily: "var(--font-display)" }}>{label}</span>
          <span className="ml-2 text-muted-foreground text-[11px] font-normal tnum">({count})</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {children}
        {count === 0 && (
          <div className="text-xs text-muted-foreground text-center py-10 px-4 space-y-2">
            <div className="opacity-40 text-2xl">∅</div>
            <div>No clients here yet</div>
            <div className="opacity-70">Drag a card in or add a new client</div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ client, draggable = true, onClick }: { client: any; draggable?: boolean; onClick: () => void }) {
  const nav = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: client.id, disabled: !draggable });
  const pol = client.latest_policy;
  const location = [client.city, client.state].filter(Boolean).join(", ");
  const age = client.date_of_birth
    ? Math.floor((Date.now() - new Date(client.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const locationLine = [location, age != null ? `Age ${age}` : null].filter(Boolean).join(" · ");
  const initials = `${client.first_name?.[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase();
  const effectiveDisplay = pol?.effective_date
    ? new Date(pol.effective_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-[var(--radius)] p-3.5 cursor-pointer select-none transition-all",
        "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
        isDragging && "opacity-50 shadow-xl rotate-1",
      )}
    >
      {/* Row 1: Avatar + Name */}
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center shrink-0 text-xs font-bold text-primary">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm leading-tight truncate">
            {client.first_name} {client.last_name}
          </div>
          {/* Only set outside your own board, where whose lead it is stops
              being obvious. */}
          {client.agent_name && (
            <div className="truncate text-[11px] text-muted-foreground">{client.agent_name}</div>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            {(client.score_pct != null && client.score_pct > 0) && (
              <span className="text-[10px] text-muted-foreground">{client.score_pct}%</span>
            )}
            {/* On the card rather than only in the detail, because the card is
                where somebody decides to pick up the phone. */}
            <SampleChip when={client.is_sample} className="px-1.5 py-0 text-[10px]" />
          </div>
        </div>
      </div>

      {/* Row 2: Phone */}
      {client.phone && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">{fmtPhone(client.phone)}</span>
        </div>
      )}

      {/* Row 3: Location + Age */}
      {locationLine && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{locationLine}</span>
        </div>
      )}

      {/* Row 4: Policy info */}
      {pol ? (
        <div className="mt-2.5 pt-2.5 border-t border-dashed border-border-soft space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{pol.carriers?.name ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {pol.product ?? "—"}{pol.policy_number ? ` · #${pol.policy_number}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold text-success tnum">
                ${Number(pol.monthly_premium ?? 0).toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/mo</span>
              </div>
            </div>
          </div>
          {effectiveDisplay && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-2.5 w-2.5" />
              <span>Effective: {effectiveDisplay}</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {client.beneficiary_of && (
            <div className="mt-2 pt-2 border-t border-dashed border-border-soft">
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                <Heart className="h-2.5 w-2.5" /> Beneficiary of {client.beneficiary_of}
              </span>
            </div>
          )}
          {client.last_opened_at && (
            <div className="mt-1.5 text-[10px] text-muted-foreground text-right">
              {new Date(client.last_opened_at).toLocaleDateString()}
            </div>
          )}
        </>
      )}

      {/* Quick Mark Sold action */}
      <div className="mt-2 pt-2 border-t border-border-soft flex justify-end" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); nav({ to: "/post-deal", search: { client_id: client.id } }); }}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-success hover:underline"
        >
          <DollarSign className="h-3 w-3" /> Mark Sold
        </button>
      </div>
    </div>
  );
}

function PolicyStatusDot({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active:          { cls: "bg-success", label: "Active" },
    submitted:       { cls: "bg-primary/60", label: "Submitted" },
    issued_not_paid: { cls: "bg-warning",   label: "Issued" },
    in_review:       { cls: "bg-primary",  label: "In Review" },
    lapsed:          { cls: "bg-destructive",     label: "Lapsed" },
  };
  const s = map[status] ?? { cls: "bg-muted-foreground", label: status };
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", s.cls)} />
      <span>{s.label}</span>
    </span>
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
        stage: "new",
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
        <p className="text-sm text-muted-foreground">CSV columns: <code>first_name, last_name, phone</code> (required), <code>email, date_of_birth, stage</code> (optional).</p>
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
