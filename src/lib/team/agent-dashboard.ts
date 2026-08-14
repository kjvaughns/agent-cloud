/**
 * What one agent's numbers mean, as pure functions.
 *
 * The dashboard assembles several already-queried facts into production
 * totals, a daily series and a carrier split. None of that needs a database to
 * be right or wrong, so none of it lives in the server function.
 */

/** A policy, reduced to the fields any of these decisions read. */
export type DealRow = {
  id: string;
  annual_premium: number | string | null;
  posted_at: string | null;
  effective_date: string | null;
  carrier_name: string | null;
};

/**
 * When a deal counts.
 *
 * The roster's production columns key off `posted_at` alone, and that is right
 * for them: posting is the act being measured. But an agency that imported its
 * back book has policies with a real `effective_date` and no `posted_at` — they
 * were never "posted", they arrived — and a trend chart keyed on posting alone
 * draws those months as empty. An owner reading that concludes their agent sold
 * nothing, which is a wrong answer rather than a missing one.
 *
 * So the charts fall back. The consequence is deliberate and worth knowing: a
 * dashboard's charted total can exceed the roster's total for the same agent
 * over the same window, because the charts can see imported policies the roster
 * cannot. They are answering slightly different questions.
 */
export function dealDate(d: DealRow): string | null {
  return d.posted_at ?? d.effective_date ?? null;
}

/** Inclusive of both ends; either bound may be null for "no limit". */
export function inRange(d: DealRow, start: string | null, end: string | null): boolean {
  const iso = dealDate(d);
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (start && day < start.slice(0, 10)) return false;
  if (end && day > end.slice(0, 10)) return false;
  return true;
}

const premium = (d: DealRow) => Number(d.annual_premium ?? 0) || 0;

export type Summary = { premium: number; deals: number; average: number };

/**
 * The three tiles. Average is per deal, not per day, and is zero rather than
 * NaN when there are no deals — a dash is a fine thing to render, `NaN` is not.
 */
export function summarize(deals: DealRow[]): Summary {
  const count = deals.length;
  const total = deals.reduce((s, d) => s + premium(d), 0);
  return { premium: total, deals: count, average: count === 0 ? 0 : total / count };
}

export type DayPoint = { day: string; premium: number; deals: number };

/**
 * Daily series across the whole window, including days with nothing.
 *
 * Gaps matter: a line drawn only through days that had a sale makes a fortnight
 * of silence look like a straight climb. Days are walked in UTC and compared as
 * `YYYY-MM-DD` strings so a timezone never shifts a deal into its neighbour.
 */
export function dailySeries(deals: DealRow[], start: string, end: string): DayPoint[] {
  const bucket = new Map<string, { premium: number; deals: number }>();
  for (const d of deals) {
    const iso = dealDate(d);
    if (!iso) continue;
    const day = iso.slice(0, 10);
    const b = bucket.get(day) ?? { premium: 0, deals: 0 };
    b.premium += premium(d);
    b.deals += 1;
    bucket.set(day, b);
  }

  const out: DayPoint[] = [];
  const from = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  // A guard, not a formality: a reversed range would otherwise spin forever.
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return out;

  for (let t = from; t <= to; t = new Date(t.getTime() + 86_400_000)) {
    const day = t.toISOString().slice(0, 10);
    const b = bucket.get(day);
    out.push({ day, premium: b?.premium ?? 0, deals: b?.deals ?? 0 });
  }
  return out;
}

export type CarrierSlice = { carrier: string; premium: number; deals: number };

/**
 * Production by carrier, biggest first. A deal whose carrier did not resolve is
 * grouped rather than dropped, because dropping it makes the slices quietly
 * fail to add up to the total on the tile above them.
 */
export function byCarrier(deals: DealRow[]): CarrierSlice[] {
  const bucket = new Map<string, CarrierSlice>();
  for (const d of deals) {
    const carrier = d.carrier_name?.trim() || "Unknown carrier";
    const b = bucket.get(carrier) ?? { carrier, premium: 0, deals: 0 };
    b.premium += premium(d);
    b.deals += 1;
    bucket.set(carrier, b);
  }
  return [...bucket.values()].sort((a, b) => b.premium - a.premium || a.carrier.localeCompare(b.carrier));
}

/** Preset windows. `all` has no start, which every consumer treats as no limit. */
export const RANGES = ["7d", "30d", "90d", "all", "custom"] as const;
export type RangeKey = (typeof RANGES)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
  custom: "Custom",
};

export function rangeBounds(
  key: RangeKey,
  now: number,
  custom?: { from?: string; to?: string },
): { start: string | null; end: string | null } {
  const end = new Date(now).toISOString().slice(0, 10);
  if (key === "custom") {
    return { start: custom?.from || null, end: custom?.to || end };
  }
  if (key === "all") return { start: null, end: null };
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  // Inclusive of today, so "7 days" is a week of data rather than eight days.
  const start = new Date(now - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}
