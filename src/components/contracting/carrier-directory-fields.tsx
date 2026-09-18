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

/** Suggestions for the pay frequency box. Any other wording is accepted. */
export const PAY_FREQUENCY_PRESETS = [
  "Daily",
  "Weekly",
  "Every two weeks",
  "Twice a month",
  "Monthly",
  "Monthly, with a lag",
] as const;

export const DIRECTORY_KEYS = [
  "phone",
  "business_hours",
  "contracting_speed_days",
  "pay_frequency",
  "website",
  "agent_portal_url",
  "training_url",
] as const;

const clean = (s?: string) => (s && s.trim() !== "" ? s.trim() : null);

/**
 * "5-10", "about a week", "7 days" — people (and the AI) answer contracting
 * speed in words. Take the first number and ignore the rest; anything with no
 * number in it is simply not a number of days.
 */
function parseDays(s?: string): number | null {
  const t = clean(s);
  if (!t) return null;
  const n = Number(t.match(/\d+/)?.[0] ?? NaN);
  if (!Number.isFinite(n)) return null;
  return Math.min(365, Math.max(0, Math.round(n)));
}

/** A link only counts if it can actually be opened. */
function parseUrl(s?: string): string | null {
  const t = clean(s);
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".") || /\s/.test(u.hostname)) return null;
    return withScheme.slice(0, 300);
  } catch {
    return null;
  }
}

/** Turn the form's strings into what `saveOrgCarrier` accepts. */
export function directoryPayload(v: DirectoryValues) {
  const freq = clean(v.pay_frequency);
  return {
    phone: clean(v.phone),
    business_hours: clean(v.business_hours),
    contracting_speed_days: parseDays(v.contracting_speed_days),
    // Whatever the carrier actually does — the presets are suggestions, not
    // the only permitted answers.
    pay_frequency: freq ? freq.slice(0, 60) : null,
    website: parseUrl(v.website),
    agent_portal_url: parseUrl(v.agent_portal_url),
    training_url: parseUrl(v.training_url),
  };
}

/**
 * What the owner is told before saving. Saving never fails on these fields —
 * an unusable value is left out rather than rejected — so the warning has to
 * appear while they are typing, or a link would vanish without explanation.
 */
export function directoryErrors(v: DirectoryValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const k of ["website", "agent_portal_url", "training_url"]) {
    if (clean(v[k]) && !parseUrl(v[k])) errors[k] = "Doesn't look like a web address";
  }
  if (clean(v.contracting_speed_days) && parseDays(v.contracting_speed_days) === null) {
    errors.contracting_speed_days = "Enter a number of days";
  }
  return errors;
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

  const errors = directoryErrors(values);

  const text = (key: string, label: string, placeholder?: string, hint?: string) => (
    <div>
      <Label htmlFor={`dir-${key}`} className="text-xs text-text-dim">{label}</Label>
      <Input
        id={`dir-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(errors[key])}
        className={cn(
          "mt-1",
          filled.includes(key) && !errors[key] && "border-primary/60",
          errors[key] && "border-destructive",
        )}
      />
      {errors[key]
        ? <p className="mt-1 text-[11px] text-destructive">{errors[key]}</p>
        : hint
          ? <p className="mt-1 text-[11px] text-text-dim">{hint}</p>
          : null}
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Carrier directory details</p>
          <p className="mt-0.5 text-xs text-text-dim">
            What your agents see on the Carriers page for {carrierName || "this carrier"}.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={lookup.isPending || !carrierName.trim()}
          onClick={() => lookup.mutate()}
        >
          {lookup.isPending
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {lookup.isPending ? "Looking…" : "Find links with AI"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {text("phone", "Phone number", "(800) 555-0100")}
        {text("business_hours", "Business hours", "Mon–Fri 8am–6pm ET")}
        {text("contracting_speed_days", "Contracting speed", "7", "Days until contracts come back")}
        {/* Type anything. The presets are the common answers, not the only
            allowed ones — plenty of carriers pay daily, twice a month, every
            two weeks, or on a lag, and a two-option dropdown forced an agency
            to record something that was not true. */}
        <div>
          <Label htmlFor="dir-pay_frequency" className="text-xs text-text-dim">Pay frequency</Label>
          <Input
            id="dir-pay_frequency"
            list="pay-frequency-options"
            value={values.pay_frequency ?? ""}
            onChange={(e) => onChange("pay_frequency", e.target.value)}
            placeholder="Weekly"
            maxLength={60}
            className={cn("mt-1", filled.includes("pay_frequency") && "border-primary/60")}
          />
          <datalist id="pay-frequency-options">
            {PAY_FREQUENCY_PRESETS.map((p) => <option key={p} value={p} />)}
          </datalist>
          <p className="mt-1 text-[11px] text-text-dim">Pick one or type your own</p>
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
