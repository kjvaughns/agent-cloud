import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Search, Plus, Upload, Download, Flame, Thermometer, Snowflake, Heart, Phone, MapPin, Calendar, CheckCircle2, DollarSign } from "lucide-react";
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
    <div className="p-4 md:p-6 space-y-4 h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header row: tabs | search | buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="pipeline" className="gap-1.5">
              Pipeline
              <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-background text-[10px] font-bold text-foreground border">
                {pipelineClients.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="sold" className="gap-1.5">
              Sold
              <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-background text-[10px] font-bold text-foreground border">
                {soldClients.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone..." className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setAgentLinkOpen(true)}>
            <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">AgentLink</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add Client
          </Button>
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
              <div className="text-center text-muted-foreground py-16">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No sold clients yet</p>
                <p className="text-sm mt-1">Mark clients as sold from the pipeline or add a policy from the client drawer.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="border rounded-lg p-3 bg-card">
                    <div className="text-xs text-muted-foreground">Total Clients</div>
                    <div className="text-2xl font-bold text-primary">{soldClients.length}</div>
                  </div>
                  <div className="border rounded-lg p-3 bg-card">
                    <div className="text-xs text-muted-foreground">Total Monthly</div>
                    <div className="text-2xl font-bold text-emerald-600">
                      ${soldClients.reduce((s: number, c: any) => s + Number(c.latest_policy?.monthly_premium ?? 0), 0).toFixed(0)}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 bg-card">
                    <div className="text-xs text-muted-foreground">Total Annual</div>
                    <div className="text-2xl font-bold">
                      ${soldClients.reduce((s: number, c: any) => s + Number(c.latest_policy?.annual_premium ?? (c.latest_policy?.monthly_premium ?? 0) * 12), 0).toFixed(0)}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 bg-card">
                    <div className="text-xs text-muted-foreground">With Policy</div>
                    <div className="text-2xl font-bold">{soldClients.filter((c: any) => c.latest_policy).length}</div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {soldClients.map((c: any) => (
                    <SoldCard key={c.id} client={c} onClick={() => setOpenId(c.id)} />
                  ))}
                </div>
              </>
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
    <div ref={setNodeRef} className={cn("w-72 sm:w-80 shrink-0 flex flex-col rounded-xl border transition-all", tint, isOver && "ring-2 ring-primary ring-offset-1")}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <span className={cn("font-bold text-sm", header)}>{label}</span>
          <span className="ml-2 text-muted-foreground text-sm font-normal">({count})</span>
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

function LeadCard({ client, onClick }: { client: any; onClick: () => void }) {
  const nav = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: client.id });
  const t = tempPill[(client.temperature ?? "cold") as Temp];
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
        "bg-card border rounded-xl p-3.5 cursor-pointer select-none transition-all",
        "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
        isDragging && "opacity-50 shadow-xl rotate-1",
      )}
    >
      {/* Row 1: Avatar + Name + Temp badge */}
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center shrink-0 text-xs font-bold text-primary">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm leading-tight truncate">
            {client.first_name} {client.last_name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", t.cls)}>
              <t.Icon className="h-2.5 w-2.5" /> {t.label}
            </span>
            {(client.score_pct != null && client.score_pct > 0) && (
              <span className="text-[10px] text-muted-foreground">{client.score_pct}%</span>
            )}
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
        <div className="mt-2.5 pt-2.5 border-t border-dashed space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{pol.carriers?.name ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {pol.product ?? "—"}{pol.policy_number ? ` · #${pol.policy_number}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold text-emerald-600">
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
            <div className="mt-2 pt-2 border-t border-dashed">
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
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
      <div className="mt-2 pt-2 border-t flex justify-end" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); nav({ to: "/post-deal", search: { client_id: client.id } }); }}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          <DollarSign className="h-3 w-3" /> Mark Sold
        </button>
      </div>
    </div>
  );
}

function SoldCard({ client, onClick }: { client: any; onClick: () => void }) {
  const pol = client.latest_policy;
  const initials = `${client.first_name?.[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase();
  const age = client.date_of_birth
    ? Math.floor((Date.now() - new Date(client.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const location = [client.city, client.state].filter(Boolean).join(", ");
  const effectiveDisplay = pol?.effective_date
    ? new Date(pol.effective_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const annual = pol ? Number(pol.annual_premium ?? (pol.monthly_premium ?? 0) * 12) : 0;

  return (
    <button
      onClick={onClick}
      className="text-left bg-card border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all w-full group"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 grid place-items-center shrink-0 text-sm font-bold text-emerald-700 dark:text-emerald-400">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm leading-tight truncate group-hover:text-primary transition-colors">
            {client.first_name} {client.last_name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold">
              <CheckCircle2 className="h-2.5 w-2.5" /> Sold
            </span>
            {client.phone && (
              <span className="text-[11px] text-muted-foreground">{fmtPhone(client.phone)}</span>
            )}
          </div>
        </div>
      </div>

      {(location || age) && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {[location, age != null ? `Age ${age}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {pol ? (
        <div className="mt-3 pt-3 border-t space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{pol.carriers?.name ?? "Unknown Carrier"}</div>
              <div className="text-xs text-muted-foreground truncate">{pol.product ?? "—"}</div>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <div className="text-base font-bold text-emerald-600">
                ${Number(pol.monthly_premium ?? 0).toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/mo</span>
              </div>
              {annual > 0 && (
                <div className="text-[10px] text-muted-foreground">${annual.toFixed(2)}/yr</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 text-[10px] text-muted-foreground">
            {pol.policy_number && (
              <div><span className="text-muted-foreground/70">Policy # </span><span className="font-mono">{pol.policy_number}</span></div>
            )}
            {effectiveDisplay && (
              <div><span className="text-muted-foreground/70">Effective </span><span>{effectiveDisplay}</span></div>
            )}
            {Number(pol.face_amount ?? 0) > 0 && (
              <div><span className="text-muted-foreground/70">Face </span><span>${Number(pol.face_amount).toLocaleString()}</span></div>
            )}
            {pol.status && <PolicyStatusDot status={pol.status} />}
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground italic">
          No policy on file — click to add
        </div>
      )}
    </button>
  );
}

function PolicyStatusDot({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active:          { cls: "bg-emerald-500", label: "Active" },
    issued_not_paid: { cls: "bg-amber-500",   label: "Issued" },
    in_review:       { cls: "bg-blue-500",    label: "In Review" },
    lapsed:          { cls: "bg-red-500",     label: "Lapsed" },
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
