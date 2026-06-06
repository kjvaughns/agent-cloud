import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Phone, MessageSquare, Mail, CheckCircle2, Send, FileText, Plus, Trash2, Pencil,
  AlertTriangle, Flame, Thermometer, Snowflake, Heart, Eye, EyeOff,
  ClipboardList, Share2, DollarSign, Building, Activity, Users, User, Calendar, MapPin,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { phone as fmtPhone, money, formatPhone, formatRouting } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  getClientDetail, touchLastOpened, updateClient, markClientSold, upsertFinancials,
  saveBeneficiary, deleteBeneficiary, addLifeEvent, deleteLifeEvent,
  logContact, saveNeedsAnswer, scheduleEvent, upsertClientHealth, upsertClientBanking,
  listCarriers, addPolicy, updatePolicy,
} from "@/lib/pipeline.functions";
import { NotesTab } from "@/components/pipeline/notes-tab";

type Stage = "new" | "callback" | "almost_there" | "sold";
type Temp = "hot" | "warm" | "cold";

const tempPill: Record<Temp, { cls: string; Icon: any; label: string }> = {
  hot:  { cls: "bg-red-100 text-red-700 border-red-200",    Icon: Flame,       label: "Hot"  },
  warm: { cls: "bg-orange-100 text-orange-700 border-orange-200", Icon: Thermometer, label: "Warm" },
  cold: { cls: "bg-blue-100 text-blue-700 border-blue-200", Icon: Snowflake,   label: "Cold" },
};

const STAGE_PILLS: Record<Stage, { active: string; inactive: string; label: string }> = {
  new:          { active: "bg-primary text-primary-foreground border-primary",           inactive: "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400",   label: "New / Initial" },
  callback:     { active: "bg-amber-500 text-white border-amber-500",                    inactive: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",   label: "Callback"      },
  almost_there: { active: "bg-orange-500 text-white border-orange-500",                  inactive: "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400", label: "Almost There" },
  sold:         { active: "bg-emerald-500 text-white border-emerald-500",                inactive: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400", label: "Sold"     },
};

const PRODUCTS = ["Final Expense", "Mortgage Protection", "Term Life", "Whole Life", "IUL", "GTL", "Annuity"];

const detailQO = (id: string) => queryOptions({
  queryKey: ["pipeline", "detail", id],
  queryFn: () => getClientDetail({ data: { id } }),
  enabled: !!id,
});

// Notes tab visible on mobile only (right panel handles it on desktop)
const DRAWER_TABS = [
  { key: "contact",       label: "Contact",        icon: User,         desktopHide: false },
  { key: "needs",         label: "Needs Analysis", icon: ClipboardList,desktopHide: false },
  { key: "notes",         label: "Notes",          icon: MessageSquare,desktopHide: true  },
  { key: "schedule",      label: "Schedule",       icon: Calendar,     desktopHide: false },
  { key: "beneficiaries", label: "Beneficiaries",  icon: Users,        desktopHide: false },
  { key: "referrals",     label: "Referrals",      icon: Share2,       desktopHide: false },
  { key: "financials",    label: "Financials",     icon: DollarSign,   desktopHide: false },
  { key: "care",          label: "Client Care",    icon: Heart,        desktopHide: false },
  { key: "email",         label: "Email",          icon: Mail,         desktopHide: false },
];

// ============ Main export ============
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[96vw] lg:max-w-5xl xl:max-w-6xl p-0 gap-0 flex flex-col max-h-[92vh] overflow-hidden [&>button:last-child]:z-50">
        <DialogTitle className="sr-only">Client Detail</DialogTitle>
        {clientId && <DrawerBody clientId={clientId} />}
      </DialogContent>
    </Dialog>
  );
}

// ============ Body ============
function DrawerBody({ clientId }: { clientId: string }) {
  const [activeTab, setActiveTab] = useState("contact");
  const { data, isLoading } = useQuery(detailQO(clientId));

  if (isLoading || !data?.client) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const c = data.client;
  const t = tempPill[(c.temperature ?? "cold") as Temp];
  const notes = (data.contact_history ?? []).filter((h: any) => h.contact_type === "note" || h.contact_type === "medical_note");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact header */}
      <DrawerHeader client={c} t={t} />

      {/* Stage bar */}
      <StageBar client={c} />

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: tabs + scrollable content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <DrawerTabBar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <DrawerTabContent tab={activeTab} detail={data} />
            </div>
          </div>
        </div>

        {/* Right: persistent notes — desktop only */}
        <div className="hidden md:flex w-72 lg:w-80 shrink-0 border-l flex-col overflow-hidden bg-muted/5">
          <div className="px-4 py-3 border-b shrink-0 flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Notes</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <NotesTab clientId={clientId} entries={notes} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Header ============
function DrawerHeader({ client, t }: { client: any; t: any }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const markSoldFn = useServerFn(markClientSold);
  const soldMut = useMutation({
    mutationFn: () => markSoldFn({ data: { id: client.id } }),
    onSuccess: () => {
      toast.success("Marked as sold");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  return (
    <div className="px-5 py-3.5 border-b shrink-0">
      <div className="flex items-center gap-4 pr-8">
        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-lg leading-tight">{client.first_name} {client.last_name}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0", t.cls)}>
              <t.Icon className="h-3 w-3" /> {t.label}
            </span>
          </div>
          {client.phone && (
            <a href={`tel:${client.phone}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-0.5">
              <Phone className="h-3 w-3" /> {fmtPhone(client.phone)}
            </a>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button size="sm" variant="outline" asChild>
            <a href={`tel:${client.phone}`}><Phone className="h-3.5 w-3.5 mr-1.5" /> Call</a>
          </Button>
          <Button size="sm" variant="outline">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> SMS
          </Button>
          <Button size="sm" variant="outline" className="hidden sm:inline-flex">
            Submit Case for Design
          </Button>
          {client.stage !== "sold" ? (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => soldMut.mutate()}
              disabled={soldMut.isPending}
            >
              {soldMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mark Sold
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => nav({ to: "/post-deal", search: { client_id: client.id } })}
            >
              <Send className="h-3.5 w-3.5" /> Post Deal
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Stage bar ============
function StageBar({ client }: { client: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const mut = useMutation({
    mutationFn: (stage: Stage) => updateFn({ data: { id: client.id, patch: { stage } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });

  return (
    <div className="px-5 py-2 border-b bg-muted/20 shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium mr-1 shrink-0">Stage:</span>
        {(Object.entries(STAGE_PILLS) as [Stage, typeof STAGE_PILLS[Stage]][]).map(([stage, p]) => (
          <button
            key={stage}
            onClick={() => mut.mutate(stage)}
            className={cn(
              "flex-1 px-2 py-1 text-xs font-medium rounded-full border transition",
              client.stage === stage ? p.active : cn(p.inactive, "hover:bg-muted"),
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ Tab bar ============
function DrawerTabBar({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  return (
    <div className="overflow-x-auto border-b sticky top-0 z-10 bg-background shrink-0">
      <div className="flex min-w-max px-1">
        {DRAWER_TABS.map(({ key, label, icon: Icon, desktopHide }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              desktopHide && "md:hidden",
              activeTab === key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ Tab content router ============
function DrawerTabContent({ tab, detail }: { tab: string; detail: any }) {
  switch (tab) {
    case "contact":       return <ContactTab detail={detail} />;
    case "needs":         return <NeedsAnalysisTab detail={detail} />;
    case "notes":         return <NotesTab clientId={detail.client.id} entries={detail.contact_history.filter((h: any) => h.contact_type === "note" || h.contact_type === "medical_note")} />;
    case "schedule":      return <ScheduleTab detail={detail} />;
    case "beneficiaries": return <BeneficiariesTab detail={detail} />;
    case "referrals":     return <ReferralsTab detail={detail} />;
    case "financials":    return <FinancialsTab detail={detail} />;
    case "care":          return <ClientCareTab detail={detail} />;
    case "email":         return <EmailTab detail={detail} />;
    default:              return <ContactTab detail={detail} />;
  }
}

// ============ Shared: SectionCard ============
function SectionCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
        <div className="h-6 w-6 rounded-full bg-background border flex items-center justify-center shrink-0">
          <Icon className="h-3 w-3 text-muted-foreground" />
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

// ============ Shared: EditableField ============
function EditableField({ label, client, field, type, select }: { label: string; client: any; field: string; type?: string; select?: string[] }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(client[field] ?? "");
  useEffect(() => setVal(client[field] ?? ""), [client, field]);

  const mut = useMutation({
    mutationFn: (v: string) => updateFn({ data: { id: client.id, patch: { [field]: v } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const save = () => {
    setEditing(false);
    if (val !== (client[field] ?? "")) mut.mutate(val);
  };

  if (editing) {
    if (select) {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
          <Select value={val} onValueChange={(v) => { setVal(v); setTimeout(save, 50); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{select.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <Input autoFocus type={type} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="text-left space-y-1.5 group w-full">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center justify-between gap-2 min-h-[2.25rem] px-3 py-2 rounded-md bg-muted/40 border border-transparent group-hover:border-border group-hover:bg-muted/60 transition-colors">
        <span className={cn("text-sm truncate", !client[field] && "text-muted-foreground/50 italic")}>
          {client[field] || "—"}
        </span>
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors" />
      </div>
    </button>
  );
}

// ============ Contact Tab (+ Banking, Health, Policy stacked) ============
function ContactTab({ detail }: { detail: any }) {
  const client = detail.client;
  return (
    <div className="space-y-4">
      <SectionCard icon={User} title="Contact Information">
        <div className="grid grid-cols-2 gap-3">
          <EditableField label="First Name" client={client} field="first_name" />
          <EditableField label="Last Name" client={client} field="last_name" />
          <EditableField label="Phone" client={client} field="phone" />
          <EditableField label="Phone Type" client={client} field="phone_type" select={["Mobile","Home","Work"]} />
          <EditableField label="Email" client={client} field="email" />
          <EditableField label="Date of Birth" client={client} field="date_of_birth" type="date" />
        </div>
      </SectionCard>

      <SectionCard icon={MapPin} title="Address">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <EditableField label="Street Address" client={client} field="street_address" />
          </div>
          <EditableField label="City" client={client} field="city" />
          <EditableField label="State" client={client} field="state" />
          <EditableField label="ZIP Code" client={client} field="zip_code" />
          <EditableField label="Born: (Country/State)" client={client} field="born_country_state" />
        </div>
      </SectionCard>

      <TemperatureSelector client={client} />

      <SectionCard icon={Building} title="Banking Information">
        <BankingFields detail={detail} />
      </SectionCard>

      <SectionCard icon={Activity} title="Health Information">
        <HealthFields detail={detail} />
      </SectionCard>

      <SectionCard icon={FileText} title="Policy Information">
        <PolicyFields detail={detail} />
      </SectionCard>
    </div>
  );
}

// ============ Temperature ============
function TemperatureSelector({ client }: { client: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const mut = useMutation({
    mutationFn: (temperature: Temp) => updateFn({ data: { id: client.id, patch: { temperature } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Temperature</div>
      <div className="flex gap-2">
        {(["hot", "warm", "cold"] as const).map((temp) => {
          const p = tempPill[temp];
          return (
            <button
              key={temp}
              onClick={() => mut.mutate(temp)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition",
                client.temperature === temp ? p.cls : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <p.Icon className="h-3 w-3" /> {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============ Banking Fields (used inline in ContactTab) ============
function BankingFields({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const [bankingForm, setBankingForm] = useState<Record<string, any>>(detail?.banking ?? {});
  const [showAcct, setShowAcct] = useState(false);
  useEffect(() => { if (detail?.banking) setBankingForm(detail.banking); }, [detail?.banking]);

  const upsertBankingFn = useServerFn(upsertClientBanking);
  const bankingMut = useMutation({
    mutationFn: (patch: any) => upsertBankingFn({ data: { client_id: detail.client.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });
  const save = (key: string, value: any) => bankingMut.mutate({ [key]: value });

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Bank Name">
        <Input value={bankingForm.bank_name ?? ""} onChange={e => setBankingForm(f => ({...f, bank_name: e.target.value}))} onBlur={e => save("bank_name", e.target.value || null)} placeholder="e.g. Bank of America" />
      </Field>
      <Field label="Account Type">
        <Select value={bankingForm.account_type ?? ""} onValueChange={v => { setBankingForm(f => ({...f, account_type: v})); save("account_type", v); }}>
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="checking">Checking</SelectItem>
            <SelectItem value="savings">Savings</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Routing Number">
        <Input value={bankingForm.routing_number ?? ""} onChange={e => setBankingForm(f => ({...f, routing_number: formatRouting(e.target.value)}))} onBlur={e => save("routing_number", e.target.value || null)} placeholder="9 digits" />
      </Field>
      <Field label="Account Number">
        <div className="relative">
          <Input type={showAcct ? "text" : "password"} value={bankingForm.account_number_masked ?? ""} onChange={e => setBankingForm(f => ({...f, account_number_masked: e.target.value}))} onBlur={e => save("account_number_masked", e.target.value || null)} className="pr-10" />
          <button type="button" onClick={() => setShowAcct(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showAcct ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <Field label="Draft Date">
        <Select value={String(bankingForm.draft_date ?? "")} onValueChange={v => { setBankingForm(f => ({...f, draft_date: Number(v)})); save("draft_date", Number(v)); }}>
          <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
          <SelectContent>
            {Array.from({length: 28}, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Payment Method">
        <Select value={bankingForm.payment_method ?? ""} onValueChange={v => { setBankingForm(f => ({...f, payment_method: v})); save("payment_method", v); }}>
          <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bank_draft">Bank Draft</SelectItem>
            <SelectItem value="credit_card">Credit Card</SelectItem>
            <SelectItem value="money_order">Money Order</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

// ============ Health Fields (used inline in ContactTab) ============
function HealthFields({ detail }: { detail: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>(detail?.health ?? {});
  useEffect(() => { if (detail?.health) setForm(detail.health); }, [detail?.health]);

  const upsertHealthFn = useServerFn(upsertClientHealth);
  const mut = useMutation({
    mutationFn: (patch: any) => upsertHealthFn({ data: { client_id: detail.client.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });
  const save = (key: string, value: any) => mut.mutate({ [key]: value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Height (ft)">
          <Input type="number" min={0} max={9} value={form.height_ft ?? ""} onChange={e => setForm(f => ({...f, height_ft: e.target.value}))} onBlur={e => save("height_ft", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Height (in)">
          <Input type="number" min={0} max={11} value={form.height_in ?? ""} onChange={e => setForm(f => ({...f, height_in: e.target.value}))} onBlur={e => save("height_in", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Weight (lbs)">
          <Input type="number" min={0} value={form.weight_lbs ?? ""} onChange={e => setForm(f => ({...f, weight_lbs: e.target.value}))} onBlur={e => save("weight_lbs", e.target.value ? Number(e.target.value) : null)} />
        </Field>
      </div>
      <Field label="Tobacco Use">
        <div className="flex gap-2">
          <Button size="sm" variant={form.tobacco_use ? "default" : "outline"} onClick={() => { setForm(f => ({...f, tobacco_use: true})); save("tobacco_use", true); }}>Yes</Button>
          <Button size="sm" variant={!form.tobacco_use ? "default" : "outline"} onClick={() => { setForm(f => ({...f, tobacco_use: false})); save("tobacco_use", false); }}>No</Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary Physician">
          <Input value={form.primary_physician ?? ""} onChange={e => setForm(f => ({...f, primary_physician: e.target.value}))} onBlur={e => save("primary_physician", e.target.value || null)} />
        </Field>
        <Field label="Physician Phone">
          <Input value={form.primary_physician_phone ?? ""} onChange={e => setForm(f => ({...f, primary_physician_phone: formatPhone(e.target.value)}))} onBlur={e => save("primary_physician_phone", e.target.value || null)} />
        </Field>
      </div>
      <Field label="Medical Conditions">
        <Textarea className="min-h-[72px] resize-none" value={form.conditions ?? ""} onChange={e => setForm(f => ({...f, conditions: e.target.value}))} onBlur={e => save("conditions", e.target.value || null)} placeholder="List conditions..." />
      </Field>
      <Field label="Current Medications">
        <Textarea className="min-h-[72px] resize-none" value={form.medications ?? ""} onChange={e => setForm(f => ({...f, medications: e.target.value}))} onBlur={e => save("medications", e.target.value || null)} placeholder="List medications..." />
      </Field>
      <Field label="Medical Notes">
        <Textarea className="min-h-[72px] resize-none" value={form.medical_notes ?? ""} onChange={e => setForm(f => ({...f, medical_notes: e.target.value}))} onBlur={e => save("medical_notes", e.target.value || null)} placeholder="Clinical notes..." />
      </Field>
    </div>
  );
}

// ============ Policy Fields (used inline in ContactTab) ============
const statusCls: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  lapsed:    "bg-red-100 text-red-700 border-red-200",
  in_review: "bg-amber-100 text-amber-700 border-amber-200",
  pending:   "bg-slate-100 text-slate-600 border-slate-200",
};

function PolicyFields({ detail }: { detail: any }) {
  const [showForm, setShowForm] = useState(false);
  const client = detail.client;
  const policies = detail.policies;

  return (
    <div className="space-y-3">
      {policies.length > 0 && !showForm && (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" /> Add Policy</Button>
      )}
      {(policies.length === 0 || showForm) && (
        <AddPolicyInlineForm clientId={client.id} onSaved={() => setShowForm(false)} onCancel={() => setShowForm(false)} showCancel={policies.length > 0} />
      )}
      {policies.length > 0 && (
        <div className="space-y-2">
          {policies.map((pol: any) => (
            <PolicyRow key={pol.id} pol={pol} clientId={client.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddPolicyInlineForm({ clientId, onSaved, onCancel, showCancel }: { clientId: string; onSaved: () => void; onCancel: () => void; showCancel: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ carrier_id: "", policy_number: "", product: "", status: "active", monthly_premium: "", face_amount: "", effective_date: "" });

  const listCarriersFn = useServerFn(listCarriers);
  const { data: carriers = [] } = useQuery({ queryKey: ["carriers"], queryFn: () => listCarriersFn(), staleTime: 5 * 60_000 });

  const addPolicyFn = useServerFn(addPolicy);
  const mut = useMutation({
    mutationFn: () => addPolicyFn({ data: {
      client_id: clientId,
      carrier_id: form.carrier_id || null,
      policy_number: form.policy_number,
      product: form.product,
      status: form.status,
      monthly_premium: form.monthly_premium ? Number(form.monthly_premium) : null,
      annual_premium: form.monthly_premium ? Number(form.monthly_premium) * 12 : null,
      face_amount: form.face_amount ? Number(form.face_amount) : null,
      effective_date: form.effective_date || null,
    }}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["bob", "list"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", clientId] });
      toast.success("Policy saved");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save policy"),
  });

  const monthly = Number(form.monthly_premium || 0);

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Carrier">
          <Select value={form.carrier_id} onValueChange={v => setForm(f => ({...f, carrier_id: v}))}>
            <SelectTrigger><SelectValue placeholder="Select carrier..." /></SelectTrigger>
            <SelectContent>{(carriers as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Product Sold">
          <Select value={form.product} onValueChange={v => setForm(f => ({...f, product: v}))}>
            <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
            <SelectContent>{PRODUCTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Policy Number">
          <Input value={form.policy_number} onChange={e => setForm(f => ({...f, policy_number: e.target.value}))} placeholder="POL-123456" />
        </Field>
        <Field label="Effective Date">
          <Input type="date" value={form.effective_date} onChange={e => setForm(f => ({...f, effective_date: e.target.value}))} />
        </Field>
        <Field label="Face Amount">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input type="number" value={form.face_amount} onChange={e => setForm(f => ({...f, face_amount: e.target.value}))} placeholder="50,000" className="pl-6" />
          </div>
        </Field>
        <Field label="Monthly Premium">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input type="number" step="0.01" value={form.monthly_premium} onChange={e => setForm(f => ({...f, monthly_premium: e.target.value}))} placeholder="99.99" className="pl-6" />
          </div>
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="Annual Premium (Auto-calculated)">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 text-sm">
            <span className="text-muted-foreground">$</span>
            <span className="font-medium">{monthly > 0 ? (monthly * 12).toFixed(2) : "0.00"}</span>
            <span className="text-xs text-muted-foreground ml-auto">Automatically calculated: Monthly × 12</span>
          </div>
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        {showCancel && <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-1">
          {mut.isPending ? "Saving..." : "Save Policy"}
        </Button>
      </div>
    </div>
  );
}

// ============ PolicyRow (display + inline edit) ============
function PolicyRow({ pol, clientId }: { pol: any; clientId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    carrier_id: pol.carrier_id ?? "",
    policy_number: pol.policy_number ?? "",
    product: pol.product ?? "",
    status: pol.status ?? "active",
    monthly_premium: pol.monthly_premium != null ? String(pol.monthly_premium) : "",
    face_amount: pol.face_amount != null ? String(pol.face_amount) : "",
    effective_date: pol.effective_date ?? "",
  });

  const listCarriersFn = useServerFn(listCarriers);
  const { data: carriers = [] } = useQuery({ queryKey: ["carriers"], queryFn: () => listCarriersFn(), staleTime: 5 * 60_000 });

  const updateFn = useServerFn(updatePolicy);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: {
      id: pol.id,
      carrier_id: form.carrier_id || null,
      policy_number: form.policy_number || null,
      product: form.product || undefined,
      status: form.status,
      monthly_premium: form.monthly_premium ? Number(form.monthly_premium) : null,
      annual_premium: form.monthly_premium ? Number(form.monthly_premium) * 12 : null,
      face_amount: form.face_amount ? Number(form.face_amount) : null,
      effective_date: form.effective_date || null,
    }}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", clientId] });
      qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
      qc.invalidateQueries({ queryKey: ["bob", "list"] });
      toast.success("Policy updated");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update policy"),
  });

  if (!editing) {
    return (
      <div className="rounded-lg border bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="font-medium text-sm">{pol.carriers?.name ?? "—"} — {pol.product ?? "—"}</div>
            <div className="text-xs text-muted-foreground">#{pol.policy_number ?? "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", statusCls[pol.status ?? ""] ?? "bg-muted text-muted-foreground border-border")}>
              {pol.status ?? "—"}
            </span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="px-4 pb-3 pt-0 text-xs grid grid-cols-2 gap-1 text-muted-foreground border-t">
          <div><span className="font-medium text-foreground">Face:</span> {money(pol.face_amount)}</div>
          <div><span className="font-medium text-foreground">Monthly:</span> {money(pol.monthly_premium)}</div>
          <div><span className="font-medium text-foreground">Annual:</span> {money(pol.annual_premium)}</div>
          <div><span className="font-medium text-foreground">Effective:</span> {pol.effective_date ?? "—"}</div>
        </div>
      </div>
    );
  }

  const monthly = Number(form.monthly_premium || 0);
  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs mb-1 block">Carrier</Label>
          <Select value={form.carrier_id} onValueChange={(v) => setForm(f => ({ ...f, carrier_id: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select carrier" /></SelectTrigger>
            <SelectContent>{(carriers as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Product</Label>
          <Select value={form.product} onValueChange={(v) => setForm(f => ({ ...f, product: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>{PRODUCTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["active","issued_not_paid","in_review","lapsed","pending"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Policy Number</Label>
          <Input className="h-8 text-xs" value={form.policy_number} onChange={e => setForm(f => ({ ...f, policy_number: e.target.value }))} placeholder="POL-123456" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Effective Date</Label>
          <Input type="date" className="h-8 text-xs" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Monthly Premium</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
            <Input type="number" step="0.01" className="h-8 text-xs pl-5" value={form.monthly_premium} onChange={e => setForm(f => ({ ...f, monthly_premium: e.target.value }))} placeholder="99.99" />
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Face Amount</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
            <Input type="number" className="h-8 text-xs pl-5" value={form.face_amount} onChange={e => setForm(f => ({ ...f, face_amount: e.target.value }))} placeholder="50,000" />
          </div>
        </div>
        {monthly > 0 && (
          <div className="col-span-2 text-xs text-muted-foreground">Annual: <span className="font-medium text-foreground">${(monthly * 12).toFixed(2)}</span></div>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-1">
          {mut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ============ Needs Analysis ============
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
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / NEEDS_QUESTIONS.length) * 100}%` }} />
      </div>
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

// ============ Schedule ============
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

// ============ Beneficiaries ============
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
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", detail.client.id] }),
  });

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
                <SelectContent>{["Spouse","Child","Parent","Sibling","Other"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
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

// ============ Referrals ============
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

// ============ Financials ============
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

// ============ Client Care ============
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] }); setLogOpen(false); setLogForm({ contact_type: "call", note: "" }); toast.success("Logged"); },
  });
  const lifeMut = useMutation({
    mutationFn: () => addLifeFn({ data: { client_id: c.id, ...lifeForm } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] }); setLifeOpen(false); toast.success("Event added"); },
  });
  const delLifeMut = useMutation({
    mutationFn: (id: string) => delLifeFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", "detail", c.id] }),
  });

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

// ============ Email Tab ============
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
        No email address on file. Add an email in the Contact tab to use email templates.
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
      <div className="grid grid-cols-1 gap-3">
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
  return <div className="space-y-1.5"><Label className="text-xs font-medium text-muted-foreground">{label}</Label>{children}</div>;
}
