import { formatDistanceToNow } from "date-fns";

/**
 * Relative time that cannot crash a page.
 *
 * `formatDistanceToNow(new Date(null))` throws `RangeError: Invalid time
 * value`, and a single missing timestamp anywhere in a list took the whole
 * route down. Anything unparseable renders as a dash instead.
 */
export function timeAgo(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : formatDistanceToNow(d, { addSuffix: true });
}
