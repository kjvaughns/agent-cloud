/**
 * One story per client, in order.
 *
 * Everything that has ever happened with a client is already recorded, and it
 * is recorded in five places that are shown in four different tabs:
 *
 *   contact_history   calls, texts, notes, referrals, and automatic entries
 *   life_events       marriage, a new child, a house
 *   policy_events     posted, took effect, status changed (and by whom)
 *   calendar_events   meetings booked
 *   retention_cases   a policy at risk, worked, and resolved
 *
 * The drawer split `contact_history` across three tabs by `contact_type` and
 * put life events in a list beside contact history, so "what happened with
 * this client, in order" was a question nobody could answer without reading
 * four screens and merging them by eye. Worse, the two lists that sat side by
 * side sorted independently, so a life event and the call about it appeared in
 * unrelated places.
 *
 * This merges them. It is pure, because ordering and de-duplication are
 * exactly the kind of thing that looks right and is not, and because a
 * timeline assembled in a component can only be checked by looking at it.
 *
 * ── What it deliberately does not do ──
 *
 * It does not invent events. Every entry traces to a row somebody wrote; there
 * is no "policy is 90 days old" or "no contact in 30 days" here. Those are
 * useful, and they belong to whatever computes them — a timeline that mixes
 * things that happened with things that are merely true is a timeline nobody
 * can trust as a record.
 */

export type TimelineKind =
  | "contact"
  | "note"
  | "referral"
  | "life_event"
  | "policy_posted"
  | "policy_effective"
  | "policy_status"
  | "meeting"
  | "retention";

export type TimelineEntry = {
  id: string;
  /** ISO. Entries with no usable date are dropped, never defaulted to now. */
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  /** Set when the entry belongs to one policy, so a policy can show its slice. */
  policyId: string | null;
  /** Who did it, when the row records that. */
  actorId: string | null;
  /** True for entries the product wrote rather than a person. */
  isAuto: boolean;
};

/** Contact types the drawer files as notes rather than as contact. */
const NOTE_TYPES = new Set(["note", "medical_note", "imported_note"]);

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v);
  // A date-only column ("2026-04-01") sorts correctly against timestamps only
  // once it carries a time. Midnight UTC, matching how the database widens it.
  const withTime = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s;
  const t = Date.parse(withTime);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export type TimelineSources = {
  contactHistory?: any[];
  lifeEvents?: any[];
  policyEvents?: any[];
  calendarEvents?: any[];
  retentionCases?: any[];
  /** Carrier and product names, so a policy event can say which policy. */
  policies?: any[];
};

/**
 * Merge every source into one list, newest first.
 *
 * Newest first because the question being asked of a client record is almost
 * always "what happened recently" — the same order the contact history already
 * used, so nobody has to relearn the screen.
 */
export function buildTimeline(sources: TimelineSources): TimelineEntry[] {
  const policyLabel = new Map<string, string>();
  for (const p of sources.policies ?? []) {
    const name = p?.carriers?.name ?? p?.carrier_name ?? "Policy";
    policyLabel.set(p.id, p.product ? `${name} · ${p.product}` : name);
  }
  const labelFor = (id: string | null | undefined) => (id && policyLabel.get(id)) || "a policy";

  const out: TimelineEntry[] = [];

  for (const h of sources.contactHistory ?? []) {
    const at = iso(h.created_at);
    if (!at) continue;
    const type = String(h.contact_type ?? "other");
    const kind: TimelineKind = NOTE_TYPES.has(type)
      ? "note"
      : type === "referral"
        ? "referral"
        : "contact";
    out.push({
      id: `contact:${h.id}`,
      at,
      kind,
      title: kind === "note" ? "Note" : kind === "referral" ? "Referral" : titleCase(type),
      detail: h.note ?? null,
      policyId: null,
      actorId: h.agent_id ?? null,
      isAuto: h.is_auto === true,
    });
  }

  for (const e of sources.lifeEvents ?? []) {
    const at = iso(e.event_date);
    if (!at) continue;
    out.push({
      id: `life:${e.id}`,
      at,
      kind: "life_event",
      title: e.event_type ? titleCase(String(e.event_type)) : "Life event",
      detail: e.note ?? null,
      policyId: null,
      actorId: null,
      isAuto: false,
    });
  }

  for (const e of sources.policyEvents ?? []) {
    const at = iso(e.occurred_at);
    if (!at) continue;
    const label = labelFor(e.policy_id);
    if (e.kind === "posted") {
      out.push({
        id: `pe:${e.id}`,
        at,
        kind: "policy_posted",
        title: `${label} written`,
        detail: null,
        policyId: e.policy_id ?? null,
        actorId: e.actor_id ?? null,
        isAuto: false,
      });
    } else if (e.kind === "effective") {
      out.push({
        id: `pe:${e.id}`,
        at,
        kind: "policy_effective",
        title: `${label} took effect`,
        detail: null,
        policyId: e.policy_id ?? null,
        actorId: e.actor_id ?? null,
        isAuto: false,
      });
    } else if (e.kind === "status_change") {
      out.push({
        id: `pe:${e.id}`,
        at,
        kind: "policy_status",
        title: `${label} — ${statusPhrase(e.from_status, e.to_status)}`,
        // A status that came from a carrier file says so, because "who changed
        // this" has a different answer then and it is not a person.
        detail: sourcePhrase(e.source),
        policyId: e.policy_id ?? null,
        actorId: e.actor_id ?? null,
        isAuto: isCarrierSource(e.source),
      });
    } else {
      out.push({
        id: `pe:${e.id}`,
        at,
        kind: "policy_status",
        title: label,
        detail: e.note ?? null,
        policyId: e.policy_id ?? null,
        actorId: e.actor_id ?? null,
        isAuto: false,
      });
    }
  }

  for (const e of sources.calendarEvents ?? []) {
    const at = iso(e.start_at);
    if (!at) continue;
    out.push({
      id: `cal:${e.id}`,
      at,
      kind: "meeting",
      title: e.title || titleCase(String(e.event_type ?? "meeting")),
      detail: e.notes ?? null,
      policyId: null,
      actorId: null,
      isAuto: false,
    });
  }

  // A retention case is three moments, not one: it opened, somebody worked it,
  // it closed. Collapsing them to a single row loses the gap between "we knew"
  // and "we acted", which is the only part anybody reviews afterwards.
  for (const c of sources.retentionCases ?? []) {
    const label = labelFor(c.policy_id);
    const opened = iso(c.opened_at);
    if (opened) {
      out.push({
        id: `ret:${c.id}:opened`,
        at: opened,
        kind: "retention",
        title: `${label} flagged at risk`,
        detail: c.risk_reason ?? null,
        policyId: c.policy_id ?? null,
        actorId: null,
        isAuto: true,
      });
    }
    const contacted = iso(c.contacted_at);
    if (contacted) {
      out.push({
        id: `ret:${c.id}:contacted`,
        at: contacted,
        kind: "retention",
        title: `${label} — client contacted about the risk`,
        detail: null,
        policyId: c.policy_id ?? null,
        actorId: c.assigned_to ?? null,
        isAuto: false,
      });
    }
    const resolved = iso(c.resolved_at);
    if (resolved) {
      out.push({
        id: `ret:${c.id}:resolved`,
        at: resolved,
        kind: "retention",
        title: `${label} — retention case closed`,
        detail: c.outcome_note ?? null,
        policyId: c.policy_id ?? null,
        actorId: c.assigned_to ?? null,
        isAuto: false,
      });
    }
  }

  // Newest first. Ties broken by id so the order is stable between renders —
  // two events recorded in the same second swapping places on every refresh
  // reads as data changing.
  return out.sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
}

function isCarrierSource(source: unknown): boolean {
  return typeof source === "string" && source.startsWith("carrier_csv:");
}

function sourcePhrase(source: unknown): string | null {
  if (isCarrierSource(source)) {
    const file = String(source).slice("carrier_csv:".length);
    return file ? `From the carrier file ${file}` : "From a carrier file";
  }
  if (source === "backfill") return null;
  return null;
}

function statusPhrase(from: unknown, to: unknown): string {
  const t = to ? titleCase(String(to)) : "changed";
  if (!from) return t;
  return `${titleCase(String(from))} → ${t}`;
}

/** One policy's slice of the same story. */
export function forPolicy(entries: TimelineEntry[], policyId: string): TimelineEntry[] {
  return entries.filter((e) => e.policyId === policyId);
}

export const TIMELINE_FILTERS = [
  { key: "all", label: "All" },
  { key: "contact", label: "Contact" },
  { key: "note", label: "Notes" },
  { key: "policy", label: "Policies" },
  { key: "life_event", label: "Life events" },
] as const;

export type TimelineFilter = (typeof TIMELINE_FILTERS)[number]["key"];

/**
 * The filters the drawer offers.
 *
 * "Policies" groups the four policy-shaped kinds, because somebody asking
 * about a policy wants everything about it — written, effective, status,
 * retention — and not four checkboxes to reassemble it themselves.
 */
export function applyFilter(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  if (filter === "all") return entries;
  if (filter === "policy") {
    return entries.filter(
      (e) =>
        e.kind === "policy_posted" ||
        e.kind === "policy_effective" ||
        e.kind === "policy_status" ||
        e.kind === "retention",
    );
  }
  if (filter === "contact") {
    return entries.filter((e) => e.kind === "contact" || e.kind === "meeting");
  }
  return entries.filter((e) => e.kind === filter);
}
