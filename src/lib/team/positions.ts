/**
 * An agent's position, as the roster shows it.
 *
 * The catalog lives in Settings ▸ Levels & Positions (`agency_levels`) and is
 * configuration: set once, changed rarely. *Assigning* an agent to a catalog
 * position is daily work and belongs on the roster. This module is the small
 * pure part both sides share — how a position reads, and what colour it gets.
 *
 * On the number: there is no separate integer-rank column, and none is needed.
 * `agency_levels.base_pct` IS the ladder — Owner 100, MGA 90, GA 80, SA 70 are
 * commission percentages, which is exactly what an agency means by "level".
 * Inventing a second integer beside it would give two answers to one question,
 * and the comp grids already key off the percentage.
 *
 * Colour is derived, not stored. A `color` column would let a catalog drift
 * into two greens and no reds; deriving from the number means the pills sort
 * themselves by seniority and a new position is coloured correctly the moment
 * it is created.
 */

export type PositionTone = "principal" | "senior" | "mid" | "junior" | "entry";

export type Position = {
  id: string;
  name: string;
  /** The ladder number. Percent of commission at this position. */
  pct: number;
};

/**
 * Bands chosen to match how agencies actually talk about the ladder: the
 * owner/principal tier, the general-agent tier that builds downlines, the
 * writing tiers, and the training floor.
 */
export function positionTone(pct: number): PositionTone {
  if (pct >= 95) return "principal";
  if (pct >= 85) return "senior";
  if (pct >= 75) return "mid";
  if (pct >= 65) return "junior";
  return "entry";
}

/** "GA 80" — the name people say, with the number they argue about. */
export function positionLabel(name: string, pct: number): string {
  const trimmed = name.trim();
  if (!trimmed) return String(round(pct));
  return `${trimmed} ${round(pct)}`;
}

/**
 * Percentages are stored as numeric and can carry a decimal (77.5 is a real
 * comp level). Whole numbers lose their ".0"; fractional ones keep one place,
 * because rounding 77.5 to 78 in a pill misstates a contract.
 */
function round(pct: number): number {
  return Number.isInteger(pct) ? pct : Math.round(pct * 10) / 10;
}

/** Tailwind classes per tone. Kept here so the pill and any legend agree. */
export const POSITION_TONE_CLASS: Record<PositionTone, string> = {
  principal: "border-primary/50 bg-gold-glow text-gold-bright",
  senior: "border-success/40 bg-success/10 text-success",
  mid: "border-primary/30 bg-primary/[0.08] text-primary",
  junior: "border-border bg-surface-2 text-foreground",
  entry: "border-border bg-surface-2 text-muted-foreground",
};

/**
 * Sort positions the way a ladder reads: highest first, then by name so two
 * positions on the same percentage keep a stable order.
 */
export function sortPositions<T extends { pct: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
}

/**
 * Whether the position column can say anything at all.
 *
 * An agency that has never opened Levels & Positions has no catalog, so every
 * agent is "unassigned" — which is true but useless, and a queue listing the
 * whole roster reads as a bug. With no catalog the column shows an em dash and
 * the pending view explains where positions come from instead of nagging.
 */
export function catalogExists(positions: Position[]): boolean {
  return positions.length > 0;
}

/** Agents a human still has to place. Only meaningful once a catalog exists. */
export function needsPosition<T extends { agency_level_id?: string | null; status?: string }>(
  rows: T[],
  positions: Position[],
): T[] {
  if (!catalogExists(positions)) return [];
  return rows.filter(
    (r) => !r.agency_level_id && r.status !== "terminated" && r.status !== "imported",
  );
}
