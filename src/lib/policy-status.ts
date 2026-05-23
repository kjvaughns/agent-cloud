export type PolicyStatus =
  | "active"
  | "issued_not_paid"
  | "in_review"
  | "lapse_pending"
  | "lapsed"
  | "cancelled"
  | "withdrawn"
  | "not_taken"
  | "postponed"
  | "carrier_na";

export const POLICY_STATUSES: { value: PolicyStatus; label: string; cls: string; cardCls: string }[] = [
  { value: "active",          label: "Active",           cls: "bg-emerald-600 text-white border-transparent",                cardCls: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200" },
  { value: "issued_not_paid", label: "Issued, Not Paid", cls: "bg-transparent text-emerald-700 border-emerald-500 dark:text-emerald-300", cardCls: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200" },
  { value: "in_review",       label: "In Review",        cls: "bg-amber-500 text-white border-transparent",                  cardCls: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200" },
  { value: "lapse_pending",   label: "Lapse Pending",    cls: "bg-orange-600 text-white border-transparent",                 cardCls: "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-200" },
  { value: "lapsed",          label: "Lapsed",           cls: "bg-red-600 text-white border-transparent",                    cardCls: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200" },
  { value: "cancelled",       label: "Cancelled",        cls: "bg-red-800 text-white border-transparent",                    cardCls: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200" },
  { value: "withdrawn",       label: "Withdrawn",        cls: "bg-slate-500 text-white border-transparent",                  cardCls: "bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-200" },
  { value: "not_taken",       label: "Not Taken",        cls: "bg-orange-500 text-white border-transparent",                 cardCls: "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-200" },
  { value: "postponed",       label: "Postponed",        cls: "bg-yellow-400 text-yellow-950 border-transparent",            cardCls: "bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900 dark:text-yellow-200" },
  { value: "carrier_na",      label: "Carrier N/A",      cls: "bg-purple-600 text-white border-transparent",                 cardCls: "bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-950/40 dark:border-purple-900 dark:text-purple-200" },
];

export const STATUS_MAP: Record<PolicyStatus, (typeof POLICY_STATUSES)[number]> =
  POLICY_STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: s }), {} as any);

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return STATUS_MAP[s as PolicyStatus]?.label ?? s;
}

export function statusBadgeClass(s: string | null | undefined): string {
  if (!s) return "bg-muted text-muted-foreground border-transparent";
  return STATUS_MAP[s as PolicyStatus]?.cls ?? "bg-muted text-muted-foreground border-transparent";
}
