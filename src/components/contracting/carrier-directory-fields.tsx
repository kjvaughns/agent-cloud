import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@/hooks/use-server-fn";
import { lookupCarrierDetails } from "@/lib/carriers/carrier-lookup.functions";
import { cn } from "@/lib/utils";

/**
 * The facts the Carriers directory shows, edited where the carrier is set up.
 *
 * These lived only on the shared carrier library row, which an agency cannot
 * write to — so the directory could show a wrong phone number forever, and a
 * carrier an agency added itself showed a name and nothing else. Every value
 * here belongs to this agency; the library row is a fallback, never overwritten.
 *
 * The AI button fills the same fields as suggestions. It saves nothing: the
 * owner keeps, edits or clears each one before pressing save, because a
 * confidently wrong agent portal link sends an agent somewhere they cannot log
 * in and nobody finds out until they try.
 */
export type DirectoryValues = Record<string, string>;

export const DIRECTORY_KEYS = [
  "phone",
  "business_hours",
  "contracting_speed_days",
  "pay_frequency",
  "website",
  "agent_portal_url",
  "training_url",
] as const;

/** Turn the form's strings into what `saveOrgCarrier` accepts. */
export function directoryPayload(v: DirectoryValues) {
  const clean = (s?: string) => (s && s.trim() !== "" ? s.trim() : null);
  const url = (s?: string) => {
    const t = clean(s);
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };
  const days = clean(v.contracting_speed_days);
  const freq = clean(v.pay_frequency);
  return {
    phone: clean(v.phone),
    business_hours: clean(v.business_hours),
    contracting_speed_days: days ? Number(days) : null,
    // Whatever the carrier actually does — the presets are suggestions, not
    // the only permitted answers.
    pay_frequency: freq ? freq.slice(0, 60) : null,
    website: url(v.website),
    agent_portal_url: url(v.agent_portal_url),
    training_url: url(v.training_url),
  };
}

/** Seed the form from a saved org_carrier row, falling back to the library. */
export function directorySeed(carrier: any | null): DirectoryValues {
  const lib = carrier?.carriers ?? {};
  const pick = (k: string) => carrier?.[k] ?? lib?.[k] ?? "";
  return {
    phone: String(pick("phone") ?? ""),
    business_hours: String(carrier?.business_hours ?? lib?.hours ?? ""),
    contracting_speed_days: String(pick("contracting_speed_days") ?? ""),
    pay_frequency: String(pick("pay_frequency") ?? ""),
    website: String(pick("website") ?? ""),
    agent_portal_url: String(pick("agent_portal_url") ?? ""),
    training_url: String(pick("training_url") ?? ""),
  };
}

export function CarrierDirectoryFields({
  carrierName, values, onChange, onSuggested,
}: {
  carrierName: string;
  values: DirectoryValues;
  onChange: (key: string, value: string) => void;
  /** Extra suggestions this form does not own (emails, products). */
  onSuggested?: (s: Record<string, any>) => void;
}) {
  const lookupFn = useServerFn(lookupCarrierDetails);
  const [filled, setFilled] = useState<string[]>([]);

  const lookup = useMutation({
    mutationFn: () => lookupFn({ data: { name: carrierName, website: values.website || undefined } }),
    onSuccess: (r: any) => {
      const s = r?.suggestion ?? {};
      const got: string[] = [];
      for (const k of DIRECTORY_KEYS) {
        const v = s[k];
        if (v === null || v === undefined || v === "") continue;
        onChange(k, String(v));
        got.push(k);
      }
      onSuggested?.(s);
      setFilled(got);
      toast.success(
        got.length > 0
          ? `Filled in ${got.length} field${got.length === 1 ? "" : "s"} — check them before saving.`
          : "Nothing reliable found. Fill these in from the carrier's email.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not look that carrier up"),
  });

  const text = (key: string, label: string, placeholder?: string) => (
    <div>
      <Label htmlFor={`dir-${key}`}>{label}</Label>
      <Input
        id={`dir-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder}
        className={cn("mt-1", filled.includes(key) && "border-primary/60")}
      />
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-sm">Carrier directory details</Label>
          <p className="mt-0.5 text-[11px] text-text-dim">
            What your agents see on the Carriers page for {carrierName || "this carrier"}.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={lookup.isPending || !carrierName.trim()}
          onClick={() => lookup.mutate()}
        >
          {lookup.isPending
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          Find links with AI
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {text("phone", "Phone number", "(800) 555-0100")}
        {text("business_hours", "Business hours", "Mon–Fri 8am–6pm ET")}
        {text("contracting_speed_days", "Contracting speed (days)", "7")}
        <div>
          <Label htmlFor="dir-pay_frequency">Pay frequency</Label>
          <select
            id="dir-pay_frequency"
            value={values.pay_frequency ?? ""}
            onChange={(e) => onChange("pay_frequency", e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
          >
            <option value="">Not set</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {text("website", "Website", "carrier.com")}
        {text("agent_portal_url", "Agent portal link", "agents.carrier.com")}
        <div className="sm:col-span-2">
          {text("training_url", "Carrier training link", "carrier.com/training")}
        </div>
      </div>

      {filled.length > 0 && (
        <p className="text-[11px] text-text-dim">
          Highlighted fields came from AI. Check them — nothing is saved until you press save.
        </p>
      )}
    </div>
  );
}
