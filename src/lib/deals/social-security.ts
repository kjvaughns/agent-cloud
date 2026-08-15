/**
 * When a Social Security deposit lands, and therefore when a premium drawn
 * from it can safely be drafted.
 *
 * A large share of final-expense clients pay out of their Social Security
 * deposit. Draft a day early and the account is empty, the payment bounces,
 * and a policy that was perfectly good lapses over timing. Agents know this
 * rule by heart; the form should know it too rather than making them do the
 * arithmetic on a sticky note.
 *
 * The SSA pays retirement benefits by birth date:
 *
 *   born 1st–10th   → 2nd Wednesday
 *   born 11th–20th  → 3rd Wednesday
 *   born 21st–31st  → 4th Wednesday
 *
 * One exception this module deliberately does NOT try to compute: anyone who
 * has been on Social Security since before May 1997 is paid on the 3rd of the
 * month regardless of birthday. That depends on when their benefits started,
 * which is not a fact this product holds — a date of birth cannot tell you.
 * Guessing it from age would be wrong for most people it applied to, so the
 * suggestion is offered as a suggestion and the agent keeps the final say.
 */

export type SsWeek = 2 | 3 | 4;

/** Which Wednesday the deposit lands on, from the client's date of birth. */
export function ssPayWeekFromDob(dob: string | null | undefined): SsWeek | null {
  if (!dob) return null;
  // Parsed off the string rather than through Date, so a bare "1954-03-07"
  // is not shifted a day by the viewer's timezone.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
  if (!m) return null;
  const day = Number(m[3]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (day <= 10) return 2;
  if (day <= 20) return 3;
  return 4;
}

const ORDINAL: Record<SsWeek, string> = { 2: "2nd", 3: "3rd", 4: "4th" };

/** "3rd Wednesday" — the phrase an agent would actually say. */
export function ssWeekLabel(week: SsWeek): string {
  return `${ORDINAL[week]} Wednesday`;
}

/**
 * The day of the month the Nth Wednesday falls on.
 *
 * Worth noting the arithmetic works out kindly: the 2nd Wednesday is always
 * the 8th–14th, the 3rd the 15th–21st, the 4th the 22nd–28th. Every possible
 * answer therefore lands inside the 1–28 range the draft day is capped to, so
 * a suggestion never needs clamping and never proposes a day that some months
 * do not have.
 */
export function nthWednesday(year: number, monthIndex: number, week: SsWeek): number {
  // 0 = Sunday … 3 = Wednesday.
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const firstWednesday = 1 + ((3 - firstDow + 7) % 7);
  return firstWednesday + (week - 1) * 7;
}

/**
 * The draft day to suggest for a client, for the month the deal is posted in.
 * Null when there is no usable date of birth — the form then simply asks.
 */
export function suggestedDraftDay(
  dob: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const week = ssPayWeekFromDob(dob);
  if (!week) return null;
  return nthWednesday(now.getUTCFullYear(), now.getUTCMonth(), week);
}

// ── How a stored row reads back ─────────────────────────────────────────────

/**
 * The vocabulary the database actually accepts.
 *
 * `client_banking.payment_method` carries a CHECK constraint, and the pipeline
 * drawer already writes these exact strings — so post-a-deal uses the same
 * words rather than a parallel set. Note "credit_card", not "card": the spec
 * for this feature proposed "card" and "social_security", and both would have
 * been rejected outright by the constraint. `social_security` is added to it
 * by migration 20260814180000; the rest already existed.
 */
export const PAYMENT_METHODS = [
  "bank_draft", "credit_card", "money_order", "direct_express", "social_security",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_draft: "Bank draft",
  credit_card: "Credit card",
  money_order: "Money order",
  direct_express: "Direct Express",
  social_security: "Social Security",
};

/** "3rd" — for "Draft: 3rd of the month". */
export function ordinalDay(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/**
 * The one-line summary every policy view shows.
 *
 * Returns null when there is nothing on file, so callers render an em dash
 * rather than inventing a default — a policy with no billing set up must not
 * read as one that drafts on the 1st.
 */
export function draftSummary(
  paymentMethod: string | null | undefined,
  draftDate: number | null | undefined,
  draftSchedule?: string | null,
  draftWednesday?: number | null,
): string | null {
  const method = paymentMethod
    ? PAYMENT_METHOD_LABELS[paymentMethod as PaymentMethod] ?? paymentMethod
    : null;
  // A Social Security schedule follows the weekday, so it reads as the
  // Wednesday itself rather than whatever day of the month that lands on.
  const ssWeek =
    draftSchedule === "ss_wednesday" && (draftWednesday === 2 || draftWednesday === 3 || draftWednesday === 4)
      ? (draftWednesday as SsWeek)
      : null;
  const day = ssWeek
    ? `${ssWeekLabel(ssWeek)} (SS)`
    : typeof draftDate === "number" && draftDate >= 1 && draftDate <= 31
    ? `${ordinalDay(draftDate)} of the month`
    : null;
  if (day && method) return `${day} · ${method}`;
  return day ?? method ?? null;
}
