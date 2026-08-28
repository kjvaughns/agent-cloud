import { toneSoft, toneSolid, type Tone } from "./tone";

export type PolicyStatus =
  | "active"
  | "submitted"
  | "issued_not_paid"
  | "in_review"
  | "lapse_pending"
  | "lapsed"
  | "cancelled"
  | "withdrawn"
  | "not_taken"
  | "postponed"
  | "carrier_na";

/**
 * Ten statuses previously carried ten hand-written colour pairs off the
 * Tailwind palette — including three shades of red that no one could tell
 * apart on a card. Each status now declares a tone (what it means) and whether
 * it is loud enough to warrant a filled badge. Colour comes from the theme.
 */
type StatusDef = {
  value: PolicyStatus;
  label: string;
  tone: Tone;
  /** Filled badge. Only the two ends of the lifecycle earn it. */
  loud?: boolean;
};

const DEFS: StatusDef[] = [
  { value: "active",          label: "Active",           tone: "success", loud: true },
  { value: "issued_not_paid", label: "Issued, Not Paid", tone: "success" },
  { value: "in_review",       label: "In Review",        tone: "info" },
  { value: "lapse_pending",   label: "Lapse Pending",    tone: "warning" },
  { value: "lapsed",          label: "Lapsed",           tone: "danger", loud: true },
  { value: "cancelled",       label: "Cancelled",        tone: "danger" },
  { value: "withdrawn",       label: "Withdrawn",        tone: "neutral" },
  { value: "not_taken",       label: "Not Taken",        tone: "warning" },
  { value: "postponed",       label: "Postponed",        tone: "warning" },
  { value: "carrier_na",      label: "Carrier N/A",      tone: "neutral" },
];

export const POLICY_STATUSES: {
  value: PolicyStatus;
  label: string;
  tone: Tone;
  /** Badge classes. */
  cls: string;
  /** Card/panel surface classes — always the soft rendering. */
  cardCls: string;
}[] = DEFS.map((d) => ({
  value: d.value,
  label: d.label,
  tone: d.tone,
  cls: d.loud ? toneSolid(d.tone) : toneSoft(d.tone),
  cardCls: toneSoft(d.tone),
}));

export const STATUS_MAP: Record<PolicyStatus, (typeof POLICY_STATUSES)[number]> =
  POLICY_STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: s }), {} as any);

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return STATUS_MAP[s as PolicyStatus]?.label ?? s;
}

export function statusBadgeClass(s: string | null | undefined): string {
  if (!s) return toneSoft("neutral");
  return STATUS_MAP[s as PolicyStatus]?.cls ?? toneSoft("neutral");
}

export function statusTone(s: string | null | undefined): Tone {
  if (!s) return "neutral";
  return STATUS_MAP[s as PolicyStatus]?.tone ?? "neutral";
}
