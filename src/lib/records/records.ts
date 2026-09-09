/**
 * The record book, as arithmetic.
 *
 * Nine records per agency: the best day, week and month for a single producer,
 * for a leader counting their whole downline, and for the agency as a whole.
 *
 * Three decisions worth stating:
 *
 * **The measure is production, not a second definition of it.** Rows are
 * bucketed by `production_date` and summed with `premiumOf`, both from
 * `lib/production/source.ts`, so a record can never disagree with the
 * leaderboard printed above it. A status that is not production is not a
 * record either.
 *
 * **Buckets are UTC days.** `saleDateToTimestamp` stamps a sale at midday UTC
 * precisely so a local-midnight cast cannot move it a day; bucketing on the UTC
 * date is the only reading that agrees with that stamp for every agency.
 *
 * **A week starts Monday**, matching every other week in the app.
 *
 * Pure: no dates read from the clock, no database. Everything here is
 * exercised by `scripts/records-check.ts`.
 */

import { premiumOf, productionDate, countsAsProduction, type ProductionRow } from "@/lib/production/source";

export const RECORD_KINDS = ["producer", "leader", "agency"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const RECORD_PERIODS = ["day", "week", "month"] as const;
export type RecordPeriod = (typeof RECORD_PERIODS)[number];

export const KIND_LABELS: Record<RecordKind, string> = {
  producer: "Top Producer",
  leader: "Top Leader",
  agency: "Agency",
};

export const PERIOD_LABELS: Record<RecordPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

/** What a broken record is called in a notification. */
export function recordTitle(kind: RecordKind, period: RecordPeriod): string {
  if (kind === "agency") return `best agency ${period}`;
  if (kind === "leader") return `best team ${period}`;
  return `best personal ${period}`;
}

/** `kind:period`, the key both the table and this module identify a record by. */
export type RecordSlot = `${RecordKind}:${RecordPeriod}`;

export function slot(kind: RecordKind, period: RecordPeriod): RecordSlot {
  return `${kind}:${period}`;
}

export const ALL_SLOTS: { kind: RecordKind; period: RecordPeriod; slot: RecordSlot }[] =
  RECORD_KINDS.flatMap((kind) =>
    RECORD_PERIODS.map((period) => ({ kind, period, slot: slot(kind, period) })),
  );

// ── Buckets ─────────────────────────────────────────────────────────────────

/** The UTC calendar day, as `yyyy-mm-dd`. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** The Monday of the UTC week the date falls in, as `yyyy-mm-dd`. */
export function weekKey(iso: string): string {
  const d = new Date(`${dayKey(iso)}T00:00:00.000Z`);
  // getUTCDay: 0 = Sunday. Monday-first means Sunday is six days into the week.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The first of the UTC month, as `yyyy-mm-dd`. */
export function monthKey(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function bucketKey(period: RecordPeriod, iso: string): string {
  if (period === "day") return dayKey(iso);
  if (period === "week") return weekKey(iso);
  return monthKey(iso);
}

// ── Computing the records ───────────────────────────────────────────────────

export type ComputedRecord = {
  kind: RecordKind;
  period: RecordPeriod;
  /** Null for the agency record, which nobody holds alone. */
  holderId: string | null;
  premium: number;
  /** The bucket the record was set in, as `yyyy-mm-dd`. */
  periodStart: string;
};

/**
 * Per-agent premium, per bucket, for one period.
 *
 * Rows with no agent are skipped for the two per-person records — an
 * unattributed policy belongs to nobody — but still count towards the agency,
 * which is why the agency total is summed from the same map plus those rows.
 */
function ownByBucket(rows: ProductionRow[], period: RecordPeriod) {
  const own = new Map<string, Map<string, number>>();
  const agency = new Map<string, number>();
  for (const row of rows) {
    if (!countsAsProduction(row)) continue;
    const date = productionDate(row);
    if (!date) continue;
    const key = bucketKey(period, date);
    const premium = premiumOf(row);
    if (premium === 0) continue;
    agency.set(key, (agency.get(key) ?? 0) + premium);
    const agent = row.agent_id;
    if (!agent) continue;
    const bucket = own.get(key) ?? new Map<string, number>();
    bucket.set(agent, (bucket.get(agent) ?? 0) + premium);
    own.set(key, bucket);
  }
  return { own, agency };
}

/**
 * Subtree totals — an agent plus everyone under them — for one bucket.
 *
 * Depth-capped and cycle-guarded for the same reason `rollUpDownline` is:
 * `upline_id` is not constrained acyclic, and a loop here would hang a render
 * rather than fail a query.
 */
function subtreeTotals(
  own: Map<string, number>,
  children: Map<string, string[]>,
  people: string[],
  maxDepth = 50,
): Map<string, number> {
  const totals = new Map<string, number>();
  const visiting = new Set<string>();

  function walk(id: string, depth: number): number {
    if (depth > maxDepth || visiting.has(id)) return 0;
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    visiting.add(id);
    let sum = own.get(id) ?? 0;
    for (const child of children.get(id) ?? []) sum += walk(child, depth + 1);
    visiting.delete(id);
    totals.set(id, sum);
    return sum;
  }

  for (const id of people) walk(id, 0);
  return totals;
}

export function childrenOf(
  roster: { id: string; upline_id: string | null }[],
): Map<string, string[]> {
  const present = new Set(roster.map((r) => r.id));
  const children = new Map<string, string[]>();
  for (const r of roster) {
    // An upline outside the loaded roster is a root here — otherwise agents
    // would hang off a parent this agency cannot see.
    if (!r.upline_id || !present.has(r.upline_id) || r.upline_id === r.id) continue;
    const list = children.get(r.upline_id);
    if (list) list.push(r.id);
    else children.set(r.upline_id, [r.id]);
  }
  return children;
}

/**
 * The best of every bucket, for all nine records.
 *
 * `hidden` drops an owner who has switched their own numbers off leaderboards
 * from the two per-person records. Their production still counts towards the
 * agency's, which is a total and names nobody.
 *
 * Ties go to the earlier bucket: the record stands until it is beaten, not
 * merely matched.
 */
export function computeRecords(
  rows: ProductionRow[],
  roster: { id: string; upline_id: string | null }[],
  hidden: Set<string> = new Set(),
): Map<RecordSlot, ComputedRecord> {
  const children = childrenOf(roster);
  const hasDownline = new Set(children.keys());
  const people = roster.map((r) => r.id);
  const out = new Map<RecordSlot, ComputedRecord>();

  for (const period of RECORD_PERIODS) {
    const { own, agency } = ownByBucket(rows, period);

    let bestProducer: ComputedRecord | null = null;
    let bestLeader: ComputedRecord | null = null;
    let bestAgency: ComputedRecord | null = null;

    const keys = [...agency.keys()].sort();
    for (const key of keys) {
      const total = agency.get(key) ?? 0;
      if (total > 0 && (!bestAgency || total > bestAgency.premium)) {
        bestAgency = { kind: "agency", period, holderId: null, premium: total, periodStart: key };
      }

      const bucket = own.get(key);
      if (!bucket) continue;

      for (const [agent, premium] of bucket) {
        if (hidden.has(agent)) continue;
        if (premium > 0 && (!bestProducer || premium > bestProducer.premium)) {
          bestProducer = { kind: "producer", period, holderId: agent, premium, periodStart: key };
        }
      }

      // Leaders only: an agent with nobody under them is already the producer
      // record, and listing them twice tells an owner nothing.
      const totals = subtreeTotals(bucket, children, people);
      for (const [agent, premium] of totals) {
        if (!hasDownline.has(agent) || hidden.has(agent)) continue;
        if (premium > 0 && (!bestLeader || premium > bestLeader.premium)) {
          bestLeader = { kind: "leader", period, holderId: agent, premium, periodStart: key };
        }
      }
    }

    if (bestProducer) out.set(slot("producer", period), bestProducer);
    if (bestLeader) out.set(slot("leader", period), bestLeader);
    if (bestAgency) out.set(slot("agency", period), bestAgency);
  }

  return out;
}

// ── What changed ────────────────────────────────────────────────────────────

export type StoredRecord = {
  kind: RecordKind;
  period: RecordPeriod;
  holder_id: string | null;
  premium: number | string | null;
  period_start: string;
};

export type BrokenRecord = ComputedRecord & {
  previousPremium: number | null;
  previousHolderId: string | null;
};

/**
 * Which computed records beat what is on file.
 *
 * A record with nothing on file counts as broken — that is how the book fills
 * itself from the history already imported. `announceable` is what decides
 * whether anybody hears about it; see the server function.
 *
 * A cent of floating-point drift is not a new record.
 */
export function diffRecords(
  stored: StoredRecord[],
  computed: Map<RecordSlot, ComputedRecord>,
): BrokenRecord[] {
  const byslot = new Map<RecordSlot, StoredRecord>(
    stored.map((s) => [slot(s.kind, s.period), s]),
  );
  const broken: BrokenRecord[] = [];
  for (const rec of computed.values()) {
    const prev = byslot.get(slot(rec.kind, rec.period));
    const prevPremium = prev ? Number(prev.premium ?? 0) : null;
    const beaten =
      prevPremium === null ||
      rec.premium > prevPremium + 0.005 ||
      // Same figure, different bucket or different holder: the row on file is
      // stale and must be replaced, but nothing was beaten, so it is not
      // announced (see `announceable`).
      (Math.abs(rec.premium - prevPremium) <= 0.005 &&
        (prev!.period_start !== rec.periodStart || (prev!.holder_id ?? null) !== rec.holderId));
    if (!beaten) continue;
    broken.push({
      ...rec,
      previousPremium: prevPremium,
      previousHolderId: prev?.holder_id ?? null,
    });
  }
  return broken;
}

/**
 * Is this worth telling the agency about?
 *
 * Only a record that beat a figure already on file, by a real amount. The very
 * first sync writes nine records from years of history and announces none of
 * them — nobody wants nine alerts for business written last March.
 */
export function announceable(rec: BrokenRecord): boolean {
  return rec.previousPremium !== null && rec.premium > rec.previousPremium + 0.005;
}
