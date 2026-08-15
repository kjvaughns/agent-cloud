/**
 * When a failing Discord channel is worth trying again.
 *
 * A webhook deleted in Discord returns 404 forever. Today the product keeps
 * posting to it on every deal — one doomed HTTP request per deal per channel,
 * indefinitely — while the owner sees a stale `last_error` that never explains
 * that nothing has arrived for a fortnight.
 *
 * ── Skipped, not disabled ──
 *
 * A channel in backoff is skipped for a while and tried again. Disabling it
 * would need somebody to notice and turn it back on, which for the common case
 * — a Discord outage, or a webhook rotated and pasted back a minute later — is
 * a manual step to recover from something that fixed itself. Skipping recovers
 * on its own, and the delivery ledger still records the skip so the gap is
 * visible rather than silent.
 *
 * ── Why this is stored and announcement visibility is not ──
 *
 * "We have failed four times in a row" cannot be derived from the current
 * time; it is genuinely state. An announcement's visibility can be, and is.
 * The two are different on purpose, not by inconsistency.
 *
 * Pure, so every rung of the backoff can be checked at a fixed instant.
 */

/**
 * Minutes to wait after each consecutive failure.
 *
 * The first failure waits a minute: most are transient — a 500 from Discord, a
 * timeout — and a channel that works again immediately should not sit out. By
 * the fifth it is four hours, which is the right cadence for something broken
 * enough to need a person. The last rung repeats, so a permanently dead
 * webhook settles at six tries a day rather than growing without bound and
 * effectively never retrying.
 */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 240] as const;

/** Failures before the UI stops calling it a blip and says it is broken. */
export const BROKEN_AFTER = 3;

export type IntegrationHealth = {
  consecutive_failures?: number | null;
  next_retry_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  enabled?: boolean | null;
};

/** How long to wait after the nth consecutive failure. */
export function backoffMinutes(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const i = Math.min(consecutiveFailures, BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[i];
}

/** When to try again, given a failure that has just happened. */
export function nextRetryAt(consecutiveFailures: number, now: Date = new Date()): string {
  return new Date(now.getTime() + backoffMinutes(consecutiveFailures) * 60_000).toISOString();
}

/**
 * Is this channel resting?
 *
 * A row with no `next_retry_at` has never failed, or has succeeded since — it
 * is never in backoff. An unparseable date is treated as not in backoff:
 * trying and failing again is recoverable, and silently never posting is not.
 */
export function inBackoff(row: IntegrationHealth, now: Date = new Date()): boolean {
  if (!row.next_retry_at) return false;
  const t = Date.parse(row.next_retry_at);
  if (Number.isNaN(t)) return false;
  return t > now.getTime();
}

/** Should this channel be sent to at all right now? */
export function shouldAttempt(row: IntegrationHealth, now: Date = new Date()): boolean {
  if (row.enabled === false) return false;
  return !inBackoff(row, now);
}

export type HealthState = "never_used" | "healthy" | "retrying" | "broken" | "off";

/**
 * What to tell the owner, in one word.
 *
 * `retrying` and `broken` are deliberately separate. One failure is usually
 * Discord having a moment; four in a row means somebody deleted the webhook,
 * and those want different reactions from the person reading the screen.
 */
export function healthState(row: IntegrationHealth): HealthState {
  if (row.enabled === false) return "off";
  const failures = row.consecutive_failures ?? 0;
  if (failures >= BROKEN_AFTER) return "broken";
  if (failures > 0) return "retrying";
  if (!row.last_success_at) return "never_used";
  return "healthy";
}

export const HEALTH_LABELS: Record<HealthState, string> = {
  never_used: "Not used yet",
  healthy: "Working",
  retrying: "Retrying",
  broken: "Not delivering",
  off: "Turned off",
};

/**
 * A sentence naming what to do, rather than a status word alone.
 *
 * "Not delivering" tells an owner something is wrong and nothing about what to
 * do next; the commonest cause by far is a webhook deleted on the Discord side,
 * and saying so turns a red badge into a fix.
 */
export function healthDetail(row: IntegrationHealth, now: Date = new Date()): string | null {
  const state = healthState(row);
  if (state === "off") return "This channel is turned off, so nothing is sent to it.";
  if (state === "never_used") return "Nothing has been sent to this channel yet.";
  if (state === "healthy") return null;

  const failures = row.consecutive_failures ?? 0;
  const waiting = inBackoff(row, now);
  const when = waiting && row.next_retry_at
    ? ` Next attempt ${new Date(row.next_retry_at).toLocaleTimeString()}.`
    : "";

  if (state === "broken") {
    return (
      `${failures} attempts in a row have failed, so posts are being held back rather than ` +
      `retried on every deal. The usual cause is the webhook being deleted in Discord — ` +
      `re-create it there and paste the new URL in.${when}`
    );
  }
  return `The last attempt failed and will be retried.${when}`;
}

/** The two counters a success resets, as a patch. */
export function successPatch(now: Date = new Date()) {
  return {
    last_success_at: now.toISOString(),
    last_error: null,
    last_error_at: null,
    consecutive_failures: 0,
    next_retry_at: null,
  };
}

/** The patch a failure writes, given how many have come before it. */
export function failurePatch(previousFailures: number, message: string, now: Date = new Date()) {
  const failures = Math.max(0, previousFailures) + 1;
  return {
    last_error: message.slice(0, 500),
    last_error_at: now.toISOString(),
    consecutive_failures: failures,
    next_retry_at: nextRetryAt(failures, now),
  };
}
