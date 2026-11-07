/**
 * One carrier card + details editor, shared by the Carrier Directory and
 * Settings ▸ Carriers & Comp so both pages show the same facts the same way.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, DollarSign, ExternalLink, GraduationCap, Loader2, Pencil, Phone, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useServerFn } from "@/hooks/use-server-fn";
import { saveOrgCarrier } from "@/lib/contracting-ops.functions";

export type CarrierFacts = {
  name: string;
  is_annuity_carrier?: boolean | null;
  phone?: string | null;
  hours?: string | null;
  pay_frequency?: string | null;
  contracting_speed_days?: number | null;
  website?: string | null;
  agent_portal_url?: string | null;
  training_url?: string | null;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function hasDetails(c: CarrierFacts) {
  return Boolean(c.phone || c.hours || c.pay_frequency || c.contracting_speed_days != null || c.agent_portal_url || c.training_url);
}

/** Facts from either data source: directory rows are flat, settings rows nest the library row. */
export function factsFromOrgCarrier(c: any): CarrierFacts {
  const lib = c.carriers ?? {};
  const pick = (a: any, b: any) => (a === null || a === undefined || a === "" ? b : a);
  return {
    name: c.name ?? lib.name,
    is_annuity_carrier: lib.is_annuity_carrier,
    phone: pick(c.phone, lib.phone),
    hours: pick(c.business_hours, lib.hours),
    pay_frequency: pick(c.pay_frequency, lib.pay_frequency),
    contracting_speed_days: pick(c.contracting_speed_days ?? c.turnaround_days, lib.contracting_speed_days),
    website: pick(c.website, lib.website),
    agent_portal_url: pick(c.agent_portal_url, lib.agent_portal_url),
    training_url: pick(c.training_url, lib.training_url),
  };
}

export function CarrierFactsRow({ c, compact }: { c: CarrierFacts; compact?: boolean }) {
  const items: { Icon: any; text: ReactNode }[] = [];
  if (c.pay_frequency) items.push({ Icon: DollarSign, text: `${cap(c.pay_frequency)} pay` });
  if (c.contracting_speed_days != null) items.push({ Icon: Zap, text: `${c.contracting_speed_days} day${c.contracting_speed_days === 1 ? "" : "s"}` });
  if (!compact && c.phone) items.push({ Icon: Phone, text: <span className="tnum">{c.phone}</span> });
  if (!compact && c.hours) items.push({ Icon: Clock, text: c.hours });
  if (!items.length) return <p className="text-xs text-muted-foreground">No details yet</p>;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-1.5"><it.Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{it.text}</span></span>
      ))}
    </div>
  );
}

export function CarrierCard({ c, onOpen, onEdit, footer }: {
  c: CarrierFacts; onOpen?: () => void; onEdit?: () => void; footer?: ReactNode;
}) {
  const empty = !hasDetails(c);
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => { if (onOpen && e.key === "Enter") onOpen(); }}
      className={cn("flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors", onOpen && "cursor-pointer hover:border-primary/40")}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{String(c.name ?? "?").slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{c.name}</p>
          {c.is_annuity_carrier && <Badge variant="secondary" className="mt-1">Annuity</Badge>}
        </div>
        {onEdit && (
          <Button size="sm" variant="ghost" className="h-8 shrink-0 rounded-full text-xs" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="mr-1 h-3.5 w-3.5" />{empty ? "Add details" : "Edit details"}
          </Button>
        )}
      </div>
      <CarrierFactsRow c={c} />
      {(c.agent_portal_url || c.training_url) && (
        <div className="mt-auto flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {c.agent_portal_url && (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <a href={c.agent_portal_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Agent portal</a>
            </Button>
          )}
          {c.training_url && (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <a href={c.training_url} target="_blank" rel="noreferrer"><GraduationCap className="mr-1 h-3.5 w-3.5" />Training</a>
            </Button>
          )}
        </div>
      )}
      {footer}
    </div>
  );
}

const FIELDS = [
  { key: "agent_portal_url", label: "Agent portal link", placeholder: "https://", url: true },
  { key: "training_url", label: "Training link", placeholder: "https://", url: true },
  { key: "website", label: "Website", placeholder: "https://", url: true },
  { key: "phone", label: "Phone", placeholder: "(800) 555-0100" },
  { key: "hours", label: "Hours", placeholder: "Mon–Fri 8–6 CT" },
  { key: "pay_frequency", label: "Pay schedule", placeholder: "Weekly" },
  { key: "contracting_speed_days", label: "Days to contract", placeholder: "3", number: true },
] as const;

export function CarrierDetailsDialog({ orgCarrierId, carrier, open, onOpenChange }: {
  orgCarrierId: string | null; carrier: CarrierFacts | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrgCarrier);
  const [vals, setVals] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !carrier) return;
    const v: Record<string, string> = {};
    for (const f of FIELDS) { const x = (carrier as any)[f.key]; v[f.key] = x == null ? "" : String(x); }
    setVals(v);
  }, [open, carrier]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgCarrierId) throw new Error("This carrier isn't in your agency yet.");
      const out: Record<string, any> = { id: orgCarrierId };
      for (const f of FIELDS) {
        const raw = (vals[f.key] ?? "").trim();
        const key = f.key === "hours" ? "business_hours" : f.key;
        if ("number" in f) {
          if (raw && !/^\d+$/.test(raw)) throw new Error("Days to contract must be a whole number.");
          out[key] = raw ? Number(raw) : null;
        } else if ("url" in f && raw && !/^https?:\/\//i.test(raw)) {
          out[key] = `https://${raw}`;
        } else out[key] = raw || null;
      }
      return saveFn({ data: out as any });
    },
    onSuccess: () => {
      toast.success("Carrier details saved.");
      qc.invalidateQueries({ queryKey: ["contracting", "carriers"] });
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save the details"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{carrier?.name}</DialogTitle>
          <DialogDescription>What your agents see in the carrier directory. Leave blank to use the standard info.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={cn("space-y-1.5", "url" in f && "sm:col-span-2")}>
              <Label htmlFor={`cd-${f.key}`}>{f.label}</Label>
              <Input id={`cd-${f.key}`} value={vals[f.key] ?? ""} placeholder={f.placeholder}
                inputMode={"number" in f ? "numeric" : undefined}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="ink" className="rounded-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
