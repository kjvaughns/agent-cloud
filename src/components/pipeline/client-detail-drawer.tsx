import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, MessageSquare, Mail, CheckCircle2, Send, FileText, Plus, Trash2, Pencil, AlertTriangle, Flame, Thermometer, Snowflake, Heart, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "isomorphic-dompurify";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { phone as fmtPhone, money, formatPhone, formatDob, formatRouting } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  getClientDetail, touchLastOpened, updateClient, markClientSold, upsertFinancials,
  saveBeneficiary, deleteBeneficiary, addLifeEvent, deleteLifeEvent,
  logContact, saveNeedsAnswer, scheduleEvent, upsertClientHealth, upsertClientBanking,
  listCarriers, addPolicy,
} from "@/lib/pipeline.functions";
import { NotesTab } from "@/components/pipeline/notes-tab";

type Stage = "new" | "callback" | "almost_there" | "sold";
type Temp = "hot" | "warm" | "cold";

const tempPill: Record<Temp, { cls: string; Icon: any; label: string }> = {
  hot: { cls: "bg-red-100 text-red-700 border-red-200", Icon: Flame, label: "Hot" },
  warm: { cls: "bg-orange-100 text-orange-700 border-orange-200", Icon: Thermometer, label: "Warm" },
  cold: { cls: "bg-blue-100 text-blue-700 border-blue-200", Icon: Snowflake, label: "Cold" },
};

const STAGES: { key: Stage; label: string }[] = [
  { key: "new", label: "New / Initial" },
  { key: "callback", label: "Callback" },
  { key: "almost_there", label: "Almost There" },
  { key: "sold", label: "Sold" },
];

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const detailQO = (id: string) => queryOptions({
  queryKey: ["pipeline", "detail", id],
  queryFn: () => getClientDetail({ data: { id } }),
  enabled: !!id,
});

export function ClientDetailDrawer({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const open = !!clientId;
  const qc = useQueryClient();
  const touchFn = useServerFn(touchLastOpened);

  useEffect(() => {
    if (clientId) {
      touchFn({ data: { id: clientId } }).catch(() => {});
      const ch = supabase
        .channel(`pipeline-detail-${clientId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "contact_history", filter: `client_id=eq.${clientId}` }, () => {
          qc.invalidateQueries({ queryKey: ["pipeline", "detail", clientId] });
        })
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [clientId, qc, touchFn]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 overflow-y-auto">
        <SheetTitle className="sr-only">Client Detail</SheetTitle>
        {clientId && <DrawerBody clientId={clientId} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery(detailQO(clientId));

  if (isLoading || !data?.client) {
    return <div className="p-6 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-12" /><Skeleton className="h-60" /></div>;
  }

  const c = data.client;
  const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
  const t = tempPill[(c.temperature ?? "cold") as Temp];

  return (
    <div className="flex flex-col">
      <Header client={c} initials={initials} t={t} />
      <StageBar client={c} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        <ContactInfo client={c} />
        <RightTabs detail={data} />
      </div>
    </div>
  );
}

function Header({ client, initials, t }: { client: any; initials: string; t: any }) {
  const qc = useQueryClient();
  const markSoldFn = useServerFn(markClientSold);
  const soldMut = useMutation({
    mutationFn: () => markSoldFn({ data: { id: client.id } }),
    onSuccess: () => {
      toast.success("Marked as sold");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  return (
    <div className="p-6 border-b">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-xl font-bold">{client.first_name} {client.last_name}</div>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium mt-1", t.cls)}>
              <t.Icon className="h-3 w-3" /> {t.label}
            </span>
            <div className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> {fmtPhone(client.phone) || "—"}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex gap-2">
            {client.phone && <Button size="sm" variant="outline" asChild><a href={`tel:${client.phone}`}><Phone className="h-4 w-4" /> Call</a></Button>}
            <Button size="sm" variant="outline"><MessageSquare className="h-4 w-4" /> SMS</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">Submit Case for Design</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => soldMut.mutate()} disabled={client.stage === "sold"}>
              <CheckCircle2 className="h-4 w-4" /> Mark Sold
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageBar({ client }: { client: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const mut = useMutation({
    mutationFn: (stage: Stage) => updateFn({ data: { id: client.id, patch: { stage } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });
  const currentIdx = STAGES.findIndex((s) => s.key === client.stage);
  return (
    <div className="px-6 py-4 border-b bg-muted/30">
      <div className="flex items-center gap-1">
        {STAGES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => mut.mutate(s.key)}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-medium rounded-md transition",
              i <= currentIdx ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
              i === currentIdx && "ring-2 ring-primary/40 animate-pulse",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ Contact info (inline edit) ============
function ContactInfo({ client }: { client: any }) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold">Contact Information</div>
      <div className="grid grid-cols-2 gap-3">
        <EditableField label="First Name" client={client} field="first_name" />
        <EditableField label="Last Name" client={client} field="last_name" />
        <EditableField label="Phone" client={client} field="phone" />
        <EditableField label="Phone Type" client={client} field="phone_type" select={["Mobile","Home","Work"]} />
        <EditableField label="Email" client={client} field="email" />
        <EditableField label="Date of Birth" client={client} field="date_of_birth" type="date" />
      </div>
      <div className="text-sm font-semibold pt-2">Address</div>
      <div className="grid grid-cols-2 gap-3">
        <EditableField label="Street Address" client={client} field="street_address" />
        <EditableField label="City" client={client} field="city" />
        <EditableField label="State" client={client} field="state" />
        <EditableField label="ZIP Code" client={client} field="zip_code" />
        <EditableField label="Born" client={client} field="born_country_state" />
      </div>
    </div>
  );
}

function EditableField({ label, client, field, type, select }: { label: string; client: any; field: string; type?: string; select?: string[] }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(client[field] ?? "");
  useEffect(() => setVal(client[field] ?? ""), [client, field]);

  const mut = useMutation({
    mutationFn: (v: string) => updateFn({ data: { id: client.id, patch: { [field]: v } } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const save = () => {
    setEditing(false);
    if (val !== (client[field] ?? "")) mut.mutate(val);
  };

  if (editing) {
    if (select) {
      return (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Select value={val} onValueChange={(v) => { setVal(v); setTimeout(save, 50); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{select.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input autoFocus type={type} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="text-left space-y-1 group">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm border-b border-transparent group-hover:border-muted-foreground/30 py-1.5 min-h-[2rem] flex items-center justify-between">
        <span className={cn(!client[field] && "text-muted-foreground italic")}>{client[field] || "—"}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition" />
      </div>
    </button>
  );
}

// ============ Right column tabs ============
function RightTabs({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => updateFn({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  // Contact form state
  const [contactForm, setContactForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (detail?.client) {
      setContactForm({
        first_name: detail.client.first_name ?? "",
        last_name: detail.client.last_name ?? "",
        phone: detail.client.phone ?? "",
        phone_type: detail.client.phone_type ?? "mobile",
        email: detail.client.email ?? "",
        date_of_birth: detail.client.date_of_birth ?? "",
        street_address: detail.client.street_address ?? "",
        city: detail.client.city ?? "",
        state: detail.client.state ?? "",
        zip_code: detail.client.zip_code ?? "",
      });
    }
  }, [detail?.client?.id]);

  const streetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!streetRef.current || !(window as any).google?.maps?.places) return;
    const ac = new (window as any).google.maps.places.Autocomplete(streetRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const comps = place.address_components ?? [];
      const get = (type: string, short = false) => comps.find((c: any) => c.types.includes(type))?.[short ? "short_name" : "long_name"] ?? "";
      const street = `${get("street_number")} ${get("route")}`.trim();
      const city = get("locality") || get("sublocality");
      const state = get("administrative_area_level_1", true);
      const zip = get("postal_code");
      setContactForm(f => ({ ...f, street_address: street, city, state, zip_code: zip }));
      updateMut.mutate({ id: detail.client.id, patch: { street_address: street, city, state, zip_code: zip } });
    });
  }, [detail?.client?.id]);

  const saveField = (key: string, value: string) => {
    updateMut.mutate({ id: detail.client.id, patch: { [key]: value } });
  };

  // Health form state
  const [healthForm, setHealthForm] = useState<Record<string, any>>({});
  useEffect(() => {
    if (detail?.health) setHealthForm(detail.health);
  }, [detail?.health]);

  const upsertHealthFn = useServerFn(upsertClientHealth);
  const healthMut = useMutation({
    mutationFn: (patch: any) => upsertHealthFn({ data: { client_id: detail.client.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });
  const saveHealth = (key: string, value: any) => healthMut.mutate({ [key]: value });

  // Banking form state
  const [bankingForm, setBankingForm] = useState<Record<string, any>>({});
  const [showAcct, setShowAcct] = useState(false);
  useEffect(() => {
    if (detail?.banking) setBankingForm(detail.banking);
  }, [detail?.banking]);

  const upsertBankingFn = useServerFn(upsertClientBanking);
  const bankingMut = useMutation({
    mutationFn: (patch: any) => upsertBankingFn({ data: { client_id: detail.client.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });
  const saveBanking = (key: string, value: any) => bankingMut.mutate({ [key]: value });

  return (
    <Tabs defaultValue="needs">
      <TabsList className="flex flex-wrap h-auto justify-start">
        <TabsTrigger value="contact">Contact</TabsTrigger>
        <TabsTrigger value="needs">Needs Analysis</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
        <TabsTrigger value="referrals">Referrals</TabsTrigger>
        <TabsTrigger value="financials">Financials</TabsTrigger>
        <TabsTrigger value="care">Client Care</TabsTrigger>
        <TabsTrigger value="health">Health</TabsTrigger>
        <TabsTrigger value="banking">Banking</TabsTrigger>
        <TabsTrigger value="policies">Policies</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
      </TabsList>

      <TabsContent value="contact" className="mt-4">
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name</Label>
              <Input value={contactForm.first_name ?? ""} onChange={e => setContactForm(f => ({...f, first_name: e.target.value}))} onBlur={e => saveField("first_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input value={contactForm.last_name ?? ""} onChange={e => setContactForm(f => ({...f, last_name: e.target.value}))} onBlur={e => saveField("last_name", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Phone</Label>
            <div className="flex gap-2">
              <Input className="flex-1" value={contactForm.phone ?? ""}
                onChange={e => setContactForm(f => ({...f, phone: formatPhone(e.target.value)}))}
                onBlur={e => saveField("phone", e.target.value)}
                placeholder="(555) 555-5555" />
              <Select value={contactForm.phone_type ?? "mobile"} onValueChange={v => { setContactForm(f => ({...f, phone_type: v})); saveField("phone_type", v); }}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={contactForm.email ?? ""} onChange={e => setContactForm(f => ({...f, email: e.target.value}))} onBlur={e => saveField("email", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Date of Birth</Label>
            <Input value={contactForm.date_of_birth ?? ""} placeholder="MM/DD/YYYY"
              onChange={e => setContactForm(f => ({...f, date_of_birth: formatDob(e.target.value)}))}
              onBlur={e => saveField("date_of_birth", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Street Address</Label>
            <Input ref={streetRef} value={contactForm.street_address ?? ""}
              onChange={e => setContactForm(f => ({...f, street_address: e.target.value}))}
              onBlur={e => saveField("street_address", e.target.value)}
              placeholder="123 Main St" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1">
              <Label>City</Label>
              <Input value={contactForm.city ?? ""} onChange={e => setContactForm(f => ({...f, city: e.target.value}))} onBlur={e => saveField("city", e.target.value)} />
            </div>
            <div className="col-span-1 space-y-1">
              <Label>State</Label>
              <Select value={contactForm.state ?? ""} onValueChange={v => { setContactForm(f => ({...f, state: v})); saveField("state", v); }}>
                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 space-y-1">
              <Label>ZIP</Label>
              <Input value={contactForm.zip_code ?? ""} onChange={e => setContactForm(f => ({...f, zip_code: e.target.value.replace(/\D/g, "").slice(0, 5)}))} onBlur={e => saveField("zip_code", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Temperature</Label>
            <div className="flex gap-2">
              {(["hot","warm","cold"] as const).map(t => (
                <Button key={t} size="sm" variant={detail.client.temperature === t ? "default" : "outline"}
                  className={detail.client.temperature === t ? (t === "hot" ? "bg-red-600 hover:bg-red-700 border-red-600" : t === "warm" ? "bg-orange-500 hover:bg-orange-600 border-orange-500" : "") : ""}
                  onClick={() => { updateMut.mutate({ id: detail.client.id, patch: { temperature: t } }); }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Stage</Label>
            <div className="flex gap-2 flex-wrap">
              {(["new","callback","almost_there","sold"] as const).map(s => {
                const STAGE_LABELS: Record<string, string> = { new: "New", callback: "Callback", almost_there: "Almost There", sold: "Sold" };
                return (
                  <Button key={s} size="sm" variant={detail.client.stage === s ? "default" : "outline"}
                    onClick={() => { updateMut.mutate({ id: detail.client.id, patch: { stage: s } }); }}>
                    {STAGE_LABELS[s]}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="needs" className="mt-4"><NeedsAnalysisTab detail={detail} /></TabsContent>
      <TabsContent value="notes" className="mt-4"><NotesTab clientId={detail.client.id} entries={detail.contact_history.filter((h: any) => h.contact_type === "note" || h.contact_type === "medical_note")} /></TabsContent>
      <TabsContent value="schedule" className="mt-4"><ScheduleTab detail={detail} /></TabsContent>
      <TabsContent value="beneficiaries" className="mt-4"><BeneficiariesTab detail={detail} /></TabsContent>
      <TabsContent value="referrals" className="mt-4"><ReferralsTab detail={detail} /></TabsContent>
      <TabsContent value="financials" className="mt-4"><FinancialsTab detail={detail} /></TabsContent>
      <TabsContent value="care" className="mt-4"><ClientCareTab detail={detail} /></TabsContent>

      <TabsContent value="health" className="mt-4">
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Height (ft)</Label>
              <Input type="number" min={0} max={9} value={healthForm.height_ft ?? ""} onChange={e => setHealthForm(f => ({...f, height_ft: e.target.value}))} onBlur={e => saveHealth("height_ft", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <Label>Height (in)</Label>
              <Input type="number" min={0} max={11} value={healthForm.height_in ?? ""} onChange={e => setHealthForm(f => ({...f, height_in: e.target.value}))} onBlur={e => saveHealth("height_in", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <Label>Weight (lbs)</Label>
              <Input type="number" min={0} value={healthForm.weight_lbs ?? ""} onChange={e => setHealthForm(f => ({...f, weight_lbs: e.target.value}))} onBlur={e => saveHealth("weight_lbs", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tobacco Use</Label>
            <div className="flex gap-2">
              <Button size="sm" variant={healthForm.tobacco_use ? "default" : "outline"} onClick={() => { setHealthForm(f => ({...f, tobacco_use: true})); saveHealth("tobacco_use", true); }}>Yes</Button>
              <Button size="sm" variant={!healthForm.tobacco_use ? "default" : "outline"} onClick={() => { setHealthForm(f => ({...f, tobacco_use: false})); saveHealth("tobacco_use", false); }}>No</Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Primary Physician</Label>
            <Input value={healthForm.primary_physician ?? ""} onChange={e => setHealthForm(f => ({...f, primary_physician: e.target.value}))} onBlur={e => saveHealth("primary_physician", e.target.value || null)} />
          </div>

          <div className="space-y-1">
            <Label>Physician Phone</Label>
            <Input value={healthForm.primary_physician_phone ?? ""} onChange={e => setHealthForm(f => ({...f, primary_physician_phone: formatPhone(e.target.value)}))} onBlur={e => saveHealth("primary_physician_phone", e.target.value || null)} />
          </div>

          <div className="space-y-1">
            <Label>Medical Conditions</Label>
            <textarea className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={healthForm.conditions ?? ""} onChange={e => setHealthForm(f => ({...f, conditions: e.target.value}))} onBlur={e => saveHealth("conditions", e.target.value || null)} placeholder="List conditions..." />
          </div>

          <div className="space-y-1">
            <Label>Current Medications</Label>
            <textarea className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={healthForm.medications ?? ""} onChange={e => setHealthForm(f => ({...f, medications: e.target.value}))} onBlur={e => saveHealth("medications", e.target.value || null)} placeholder="List medications..." />
          </div>

          <div className="space-y-1">
            <Label>Medical Notes</Label>
            <textarea className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={healthForm.medical_notes ?? ""} onChange={e => setHealthForm(f => ({...f, medical_notes: e.target.value}))} onBlur={e => saveHealth("medical_notes", e.target.value || null)} placeholder="Clinical notes..." />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="banking" className="mt-4">
        <div className="space-y-4 p-1">
          <div className="space-y-1">
            <Label>Bank Name</Label>
            <Input value={bankingForm.bank_name ?? ""} onChange={e => setBankingForm(f => ({...f, bank_name: e.target.value}))} onBlur={e => saveBanking("bank_name", e.target.value || null)} />
          </div>

          <div className="space-y-1">
            <Label>Account Type</Label>
            <Select value={bankingForm.account_type ?? "checking"} onValueChange={v => { setBankingForm(f => ({...f, account_type: v})); saveBanking("account_type", v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Routing Number</Label>
            <Input value={bankingForm.routing_number ?? ""} onChange={e => setBankingForm(f => ({...f, routing_number: formatRouting(e.target.value)}))} onBlur={e => saveBanking("routing_number", e.target.value || null)} placeholder="9 digits" />
          </div>

          <div className="space-y-1">
            <Label>Account Number</Label>
            <div className="relative">
              <Input type={showAcct ? "text" : "password"} value={bankingForm.account_number_masked ?? ""} onChange={e => setBankingForm(f => ({...f, account_number_masked: e.target.value}))} onBlur={e => saveBanking("account_number_masked", e.target.value || null)} className="pr-10" />
              <button type="button" onClick={() => setShowAcct(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAcct ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Draft Date</Label>
            <Select value={String(bankingForm.draft_date ?? "")} onValueChange={v => { setBankingForm(f => ({...f, draft_date: Number(v)})); saveBanking("draft_date", Number(v)); }}>
              <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
              <SelectContent>
                {Array.from({length: 28}, (_, i) => i + 1).map(d => (
                  <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Payment Method</Label>
            <Select value={bankingForm.payment_method ?? "bank_draft"} onValueChange={v => { setBankingForm(f => ({...f, payment_method: v})); saveBanking("payment_method", v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_draft">Bank Draft</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="money_order">Money Order</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="policies" className="mt-4"><PoliciesTab detail={detail} /></TabsContent>
      <TabsContent value="email" className="mt-4"><EmailTab detail={detail} /></TabsContent>
    </Tabs>
  );
}

// ----- Needs Analysis -----
const NEEDS_QUESTIONS = [
  { key: "children", q: "Do you have any children?", type: "yesno", tip: "If yes, ask about ages. Young children = higher coverage need for income replacement and education funding." },
  { key: "health", q: "Do you have any health conditions I should know about?", type: "yesno", tip: "If yes, follow up to understand the condition. This impacts product eligibility." },
  { key: "income", q: "Roughly, what is your monthly household income?", type: "number", tip: "Use this to calculate coverage as 10x annual income for income replacement." },
  { key: "coverage", q: "How much coverage are you looking for?", type: "select", options: ["$10K-$25K", "$25K-$50K", "$50K-$100K", "$100K+"], tip: "Match coverage to their stated need plus 20%." },
  { key: "budget", q: "What's a comfortable monthly budget for coverage?", type: "number", tip: "Stay within budget. Suggest term if budget is tight." },
];

function NeedsAnalysisTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveNeedsAnswer);
  const [step, setStep] = useState(0);
  const q = NEEDS_QUESTIONS[step];
  const existing = useMemo(() => Object.fromEntries((detail.needs_analysis ?? []).map((r: any) => [r.question_key, r.response])), [detail.needs_analysis]);
  const [val, setVal] = useState<string>(existing[q.key] ?? "");
  useEffect(() => setVal(existing[q.key] ?? ""), [step, existing, q.key]);

  const mut = useMutation({
    mutationFn: (response: string) => saveFn({ data: { client_id: detail.client.id, question_key: q.key, response } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });

  const persist = (v: string) => { setVal(v); mut.mutate(v); };

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Step {step + 1} of {NEEDS_QUESTIONS.length}</span>
        <span>{Math.round(((step + 1) / NEEDS_QUESTIONS.length) * 100)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / NEEDS_QUESTIONS.length) * 100}%` }} /></div>

      <div className="rounded-lg border bg-card p-5">
        <div className="text-base font-medium mb-4">💬 "{q.q}"</div>
        {q.type === "yesno" && (
          <div className="flex gap-2">
            <Button variant={val === "yes" ? "default" : "outline"} onClick={() => persist("yes")}>✓ Yes</Button>
            <Button variant={val === "no" ? "default" : "outline"} onClick={() => persist("no")}>✗ No</Button>
          </div>
        )}
        {q.type === "number" && (
          <Input type="number" value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => val && persist(val)} placeholder="Enter amount" />
        )}
        {q.type === "select" && (
          <Select value={val} onValueChange={persist}>
            <SelectTrigger><SelectValue placeholder="Select range..." /></SelectTrigger>
            <SelectContent>{q.options!.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs">
        <div className="font-semibold text-primary mb-1">Sophai's Tip:</div>
        <div className="text-muted-foreground">{q.tip}</div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Previous</Button>
        <Button disabled={step === NEEDS_QUESTIONS.length - 1} onClick={() => setStep((s) => s + 1)}>Next</Button>
      </div>
    </div>
  );
}

// ----- Schedule -----
function ScheduleTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(scheduleEvent);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", event_type: "appointment", start_at: "", notes: "" });
  const mut = useMutation({
    mutationFn: () => fn({ data: { client_id: detail.client.id, ...form, start_at: new Date(form.start_at).toISOString() } }),
    onSuccess: () => {
      toast.success("Event scheduled");
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] });
      setOpen(false);
      setForm({ title: "", event_type: "appointment", start_at: "", notes: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setOpen(true)}>📅 Schedule on Calendar</Button>
      <div className="text-sm font-medium pt-2">Upcoming Events</div>
      {detail.events.length === 0 ? (
        <div className="text-sm text-muted-foreground">No upcoming events scheduled for this client.</div>
      ) : (
        <div className="space-y-2">
          {detail.events.map((e: any) => (
            <div key={e.id} className="border rounded-md p-3 text-sm">
              <div className="font-medium">📅 {new Date(e.start_at).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground capitalize">{e.event_type} — {e.title}</div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="presentation">Presentation</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date & Time"><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></Field>
            <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => mut.mutate()} disabled={!form.title || !form.start_at}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- Beneficiaries -----
function BeneficiariesTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveBeneficiary);
  const delFn = useServerFn(deleteBeneficiary);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const total = detail.beneficiaries.reduce((sum: number, b: any) => sum + Number(b.percentage ?? 0), 0);

  const blank = { first_name: "", last_name: "", relationship: "", phone: "", dob: "", percentage: 0 };
  const [form, setForm] = useState<any>(blank);

  const openAdd = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (b: any) => { setEditing(b); setForm({ first_name: b.first_name ?? "", last_name: b.last_name ?? "", relationship: b.relationship ?? "", phone: b.phone ?? "", dob: b.dob ?? "", percentage: Number(b.percentage ?? 0) }); setOpen(true); };

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { ...(editing ? { id: editing.id } : {}), client_id: detail.client.id, ...form, percentage: Number(form.percentage) } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => delFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }) });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Beneficiary</Button>
        <div className={cn("text-sm font-medium", total === 100 ? "text-emerald-600" : "text-amber-600")}>Total: {total}%</div>
      </div>
      {total !== 100 && detail.beneficiaries.length > 0 && (
        <div className="text-xs text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Percentages must sum to 100%.</div>
      )}
      {detail.beneficiaries.length === 0 ? (
        <div className="text-sm text-muted-foreground">No beneficiaries added.</div>
      ) : (
        <div className="border rounded-md overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-muted/40 text-xs">
              <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Relationship</th><th className="text-left p-2">DOB</th><th className="text-left p-2">%</th><th></th></tr>
            </thead>
            <tbody>
              {detail.beneficiaries.map((b: any) => (
                <tr key={b.id} className="border-t">
                  <td className="p-2">{b.first_name} {b.last_name}</td>
                  <td className="p-2">{b.relationship}</td>
                  <td className="p-2">{b.dob}</td>
                  <td className="p-2">{b.percentage}%</td>
                  <td className="p-2 flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => delMut.mutate(b.id)}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Beneficiary</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name *"><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Last Name"><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
            <Field label="Relationship">
              <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {["Spouse","Child","Parent","Sibling","Other"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
            <Field label="Percentage"><Input type="number" min={0} max={100} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.first_name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- Referrals (stored in contact_history with type='referral') -----
function ReferralsTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(logContact);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", relationship: "" });
  const items = (detail.contact_history ?? []).filter((h: any) => h.contact_type === "referral");

  const mut = useMutation({
    mutationFn: () => fn({ data: { client_id: detail.client.id, contact_type: "referral", note: JSON.stringify(form) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] });
      setOpen(false); setForm({ name: "", phone: "", relationship: "" });
      toast.success("Referral added");
    },
  });

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Who referred this client to you, or who has this client referred?</div>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Referral</Button>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No referrals yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((r: any) => {
            let p: any = {};
            try { p = JSON.parse(r.note ?? "{}"); } catch {}
            return (
              <div key={r.id} className="border rounded-md p-3 text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.relationship} · {fmtPhone(p.phone)} · {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Referral</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Relationship"><Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button onClick={() => mut.mutate()} disabled={!form.name}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- Financials -----
function FinancialsTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(upsertFinancials);
  const f = detail.financials ?? {};
  const [form, setForm] = useState({
    earned_income: f.earned_income ?? 0,
    social_security: f.social_security ?? 0,
    pension: f.pension ?? 0,
    other_income: f.other_income ?? 0,
    employment_status: f.employment_status ?? "",
    retirement_age: f.retirement_age ?? "",
  });
  useEffect(() => setForm({
    earned_income: f.earned_income ?? 0, social_security: f.social_security ?? 0,
    pension: f.pension ?? 0, other_income: f.other_income ?? 0,
    employment_status: f.employment_status ?? "", retirement_age: f.retirement_age ?? "",
  }), [detail.financials?.id]);

  const total = Number(form.earned_income || 0) + Number(form.social_security || 0) + Number(form.pension || 0) + Number(form.other_income || 0);

  const mut = useMutation({
    mutationFn: () => fn({ data: {
      client_id: detail.client.id,
      earned_income: Number(form.earned_income) || 0,
      social_security: Number(form.social_security) || 0,
      pension: Number(form.pension) || 0,
      other_income: Number(form.other_income) || 0,
      employment_status: form.employment_status || null,
      retirement_age: form.retirement_age ? Number(form.retirement_age) : null,
    } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });
  const save = () => mut.mutate();

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold">Monthly Income</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Earned Income"><Input type="number" value={form.earned_income} onChange={(e) => setForm({ ...form, earned_income: e.target.value as any })} onBlur={save} /></Field>
        <Field label="Social Security"><Input type="number" value={form.social_security} onChange={(e) => setForm({ ...form, social_security: e.target.value as any })} onBlur={save} /></Field>
        <Field label="Pension"><Input type="number" value={form.pension} onChange={(e) => setForm({ ...form, pension: e.target.value as any })} onBlur={save} /></Field>
        <Field label="Other Income"><Input type="number" value={form.other_income} onChange={(e) => setForm({ ...form, other_income: e.target.value as any })} onBlur={save} /></Field>
      </div>
      <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        Total Monthly Income: {money(total)}
      </div>

      <div className="text-sm font-semibold pt-2">Work & Retirement</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Employment Status">
          <Select value={form.employment_status} onValueChange={(v) => { setForm({ ...form, employment_status: v }); setTimeout(save, 50); }}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {["Employed Full-Time","Part-Time","Self-Employed","Retired","Unemployed"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Retirement Age"><Input type="number" value={form.retirement_age} onChange={(e) => setForm({ ...form, retirement_age: e.target.value as any })} onBlur={save} /></Field>
      </div>

      <div className="text-xs text-muted-foreground">ℹ️ This information will auto-fill when submitting a case for review.</div>
    </div>
  );
}

// ----- Client Care -----
function ClientCareTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const logFn = useServerFn(logContact);
  const addLifeFn = useServerFn(addLifeEvent);
  const delLifeFn = useServerFn(deleteLifeEvent);

  const c = detail.client;
  const [filter, setFilter] = useState<"all" | "call" | "sms" | "note" | "auto">("all");
  const [logOpen, setLogOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [logForm, setLogForm] = useState({ contact_type: "call", note: "" });
  const [lifeForm, setLifeForm] = useState({ event_type: "Marriage", event_date: "", note: "" });

  const updMut = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id: c.id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] }),
  });
  const logMut = useMutation({
    mutationFn: () => logFn({ data: { client_id: c.id, ...logForm } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] });
      setLogOpen(false); setLogForm({ contact_type: "call", note: "" });
      toast.success("Logged");
    },
  });
  const lifeMut = useMutation({
    mutationFn: () => addLifeFn({ data: { client_id: c.id, ...lifeForm } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] });
      setLifeOpen(false);
      toast.success("Event added");
    },
  });
  const delLifeMut = useMutation({ mutationFn: (id: string) => delLifeFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] }) });

  const filtered = (detail.contact_history ?? []).filter((h: any) => {
    if (filter === "all") return true;
    if (filter === "auto") return h.is_auto;
    return h.contact_type === filter;
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold mb-3">Communication Preferences</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preferred Contact">
            <Select value={c.preferred_contact ?? ""} onValueChange={(v) => updMut.mutate({ preferred_contact: v })}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{["Phone","Text","Email","Any"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Best Time to Call">
            <Select value={c.best_time_to_call ?? ""} onValueChange={(v) => updMut.mutate({ best_time_to_call: v })}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{["Morning","Afternoon","Evening","Anytime"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Communication Notes"><Textarea defaultValue={c.communication_notes ?? ""} onBlur={(e) => updMut.mutate({ communication_notes: e.target.value })} /></Field>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm font-semibold">Contact History</div>
          <Button size="sm" onClick={() => setLogOpen(true)}><Plus className="h-3 w-3" /> Log Contact</Button>
        </div>
        <div className="flex gap-1 mb-2 flex-wrap">
          {(["all","call","sms","note","auto"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="h-7 text-xs capitalize">{f}</Button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">No contact history yet.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((h: any) => (
              <div key={h.id} className="border rounded-md p-3 text-sm">
                <div className="text-xs text-muted-foreground uppercase">{h.is_auto ? "AUTO" : "MANUAL"} · {h.contact_type} — {new Date(h.created_at).toLocaleDateString()}</div>
                <div className="mt-1">{h.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm font-semibold">Life Events</div>
          <Button size="sm" onClick={() => setLifeOpen(true)}><Plus className="h-3 w-3" /> Add Event</Button>
        </div>
        {detail.life_events.length === 0 ? (
          <div className="text-sm text-muted-foreground">Add events to identify insurance opportunities!</div>
        ) : (
          <div className="space-y-2">
            {detail.life_events.map((e: any) => (
              <div key={e.id} className="border rounded-md p-3 text-sm flex justify-between items-start">
                <div>
                  <div className="font-medium">{e.event_type}</div>
                  <div className="text-xs text-muted-foreground">{e.event_date}</div>
                  {e.note && <div className="text-xs mt-1">{e.note}</div>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => delLifeMut.mutate(e.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Type">
              <Select value={logForm.contact_type} onValueChange={(v) => setLogForm({ ...logForm, contact_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["call","sms","email","in_person","other"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Notes"><Textarea value={logForm.note} onChange={(e) => setLogForm({ ...logForm, note: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button onClick={() => logMut.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lifeOpen} onOpenChange={setLifeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Life Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Type">
              <Select value={lifeForm.event_type} onValueChange={(v) => setLifeForm({ ...lifeForm, event_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Marriage","New Baby","Home Purchase","Job Change","Divorce","Retirement","Other"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date"><Input type="date" value={lifeForm.event_date} onChange={(e) => setLifeForm({ ...lifeForm, event_date: e.target.value })} /></Field>
            <Field label="Note"><Textarea value={lifeForm.note} onChange={(e) => setLifeForm({ ...lifeForm, note: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button onClick={() => lifeMut.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- Policies -----
const statusCls: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  lapsed: "bg-red-100 text-red-700 border-red-200",
  in_review: "bg-amber-100 text-amber-700 border-amber-200",
  pending: "bg-slate-100 text-slate-600 border-slate-200",
};

function PoliciesTab({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const [addPolOpen, setAddPolOpen] = useState(false);
  const [polForm, setPolForm] = useState({ carrier_id: "", policy_number: "", product: "", status: "active", annual_premium: "", monthly_premium: "", face_amount: "", effective_date: "" });

  const listCarriersFn = useServerFn(listCarriers);
  const { data: carriers = [] } = useQuery({
    queryKey: ["carriers"],
    queryFn: () => listCarriersFn(),
    staleTime: 5 * 60_000,
  });

  const addPolicyFn = useServerFn(addPolicy);
  const addPolMut = useMutation({
    mutationFn: () => addPolicyFn({ data: {
      client_id: detail.client.id,
      carrier_id: polForm.carrier_id || null,
      policy_number: polForm.policy_number,
      product: polForm.product,
      status: polForm.status,
      annual_premium: polForm.annual_premium ? Number(polForm.annual_premium) : null,
      monthly_premium: polForm.monthly_premium ? Number(polForm.monthly_premium) : null,
      face_amount: polForm.face_amount ? Number(polForm.face_amount) : null,
      effective_date: polForm.effective_date || null,
    }}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] });
      setAddPolOpen(false);
      setPolForm({ carrier_id: "", policy_number: "", product: "", status: "active", annual_premium: "", monthly_premium: "", face_amount: "", effective_date: "" });
    },
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setAddPolOpen(true)}><Plus className="h-4 w-4" /> Add Policy</Button>
      {detail.policies.length === 0 ? (
        <div className="text-sm text-muted-foreground">No policies yet for this client.</div>
      ) : (
        <div className="space-y-2">
          {detail.policies.map((pol: any) => (
            <details key={pol.id} className="rounded-lg border bg-card">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
                <div>
                  <div className="font-medium text-sm">{pol.carriers?.name ?? "—"} — {pol.product ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">#{pol.policy_number ?? "—"}</div>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", statusCls[pol.status ?? ""] ?? "bg-muted text-muted-foreground border-border")}>
                  {pol.status ?? "—"}
                </span>
              </summary>
              <div className="px-4 pb-4 pt-2 text-sm space-y-1 border-t">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Face Amount:</span> {money(pol.face_amount)}</div>
                  <div><span className="text-muted-foreground">Monthly:</span> {money(pol.monthly_premium)}</div>
                  <div><span className="text-muted-foreground">Annual:</span> {money(pol.annual_premium)}</div>
                  <div><span className="text-muted-foreground">Effective:</span> {pol.effective_date ?? "—"}</div>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      <Dialog open={addPolOpen} onOpenChange={setAddPolOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Policy</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Carrier">
              <Select value={polForm.carrier_id} onValueChange={v => setPolForm(f => ({...f, carrier_id: v}))}>
                <SelectTrigger><SelectValue placeholder="Select carrier..." /></SelectTrigger>
                <SelectContent>
                  {(carriers as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Policy Number"><Input value={polForm.policy_number} onChange={e => setPolForm(f => ({...f, policy_number: e.target.value}))} /></Field>
            <Field label="Product"><Input value={polForm.product} onChange={e => setPolForm(f => ({...f, product: e.target.value}))} /></Field>
            <Field label="Status">
              <Select value={polForm.status} onValueChange={v => setPolForm(f => ({...f, status: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="lapsed">Lapsed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Face Amount"><Input type="number" value={polForm.face_amount} onChange={e => setPolForm(f => ({...f, face_amount: e.target.value}))} /></Field>
              <Field label="Monthly Premium"><Input type="number" value={polForm.monthly_premium} onChange={e => setPolForm(f => ({...f, monthly_premium: e.target.value}))} /></Field>
              <Field label="Annual Premium"><Input type="number" value={polForm.annual_premium} onChange={e => setPolForm(f => ({...f, annual_premium: e.target.value}))} /></Field>
              <Field label="Effective Date"><Input type="date" value={polForm.effective_date} onChange={e => setPolForm(f => ({...f, effective_date: e.target.value}))} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPolOpen(false)}>Cancel</Button>
            <Button onClick={() => addPolMut.mutate()} disabled={addPolMut.isPending}>Save Policy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- Email -----
const EMAIL_TEMPLATES = [
  { id: "spoke", emoji: "📧", title: "We Just Spoke", tag: "follow up", subject: "Great speaking with you", body: "Hi {{firstName}}, it was great talking with you today. As promised, here's a quick recap of what we discussed and the next steps." },
  { id: "quote", emoji: "📊", title: "Quote", tag: "proposal", subject: "Your coverage options", body: "Hi {{firstName}}, here are the coverage options we discussed. Let me know which one looks best and we can move forward." },
  { id: "checkin", emoji: "💙", title: "Check In", tag: "follow up", subject: "Just checking in", body: "Hi {{firstName}}, I just wanted to check in and see if you had any questions or were ready to take the next step." },
];

function EmailTab({ detail }: { detail: any }) {
  const c = detail.client;
  const [selected, setSelected] = useState<any>(null);
  if (!c.email) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-700 dark:text-amber-300 inline-flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        No email address on file. Add an email in the Contact Information section to use email templates.
      </div>
    );
  }
  if (selected) {
    const body = selected.body.replaceAll("{{firstName}}", c.first_name);
    const href = `mailto:${c.email}?subject=${encodeURIComponent(selected.subject)}&body=${encodeURIComponent(body)}`;
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to templates</Button>
        <Field label="To"><Input readOnly value={c.email} /></Field>
        <Field label="Subject"><Input defaultValue={selected.subject} /></Field>
        <Field label="Body"><Textarea defaultValue={body} className="min-h-40" /></Field>
        <Button asChild><a href={href}><Send className="h-4 w-4" /> Send Email</a></Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Select a pre-made template to send to {c.first_name}:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {EMAIL_TEMPLATES.map((t) => (
          <div key={t.id} className="border rounded-lg p-4 space-y-2">
            <div className="text-base font-medium">{t.emoji} {t.title}</div>
            <div className="text-xs text-muted-foreground">{t.tag}</div>
            <div className="text-xs italic line-clamp-3">"{t.body}"</div>
            <Button size="sm" onClick={() => setSelected(t)}>Use This Template</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
