/**
 * When an announcement is visible, and to whom.
 *
 * An announcement had exactly one life: written, and immediately visible to
 * every member of the agency, forever. An owner preparing Monday's message on
 * Friday had to remember to come back and paste it. A message that only
 * concerned managers went to every agent as well. And last quarter's bonus
 * deadline sat at the top of the feed until somebody deleted it — which
 * destroys the record of it ever having gone out.
 *
 * ── Derived, never stored ──
 *
 * Whether a post is visible *right now* is computed from `status`,
 * `publish_at` and `expires_at` every time it is asked. Nothing flips a stored
 * flag when a schedule matures or an expiry passes.
 *
 * That is the whole reason this needs no background job. A stored status is
 * wrong for as long as whatever updates it is down, and this repository has no
 * scheduler it can create — the one pg_cron job the product uses is applied
 * through the Supabase Management API by an external tool and calls an Edge
 * Function that does not live here. A scheduled announcement appears on time
 * because time passed, not because a job ran.
 *
 * The same rule is written twice on purpose: here, and in the RLS policy in
 * 20260815010000. The database is the one that actually enforces it; this copy
 * exists so the composer can tell an owner what will happen before they commit
 * to it, and `visibilityMatchesPolicy` in the check script asserts the two
 * agree.
 *
 * Pure, so every case can be exercised at a fixed instant without waiting for
 * one.
 */

export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "published"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};

export type AnnouncementRow = {
  status?: string | null;
  publish_at?: string | null;
  expires_at?: string | null;
  target_roles?: string[] | null;
  target_upline_id?: string | null;
};

/**
 * What an owner sees on their own list, which is a different question from
 * whether anybody else can see it.
 *
 * `expired` is a state a post reaches, not one anybody sets: a published post
 * whose expiry has passed. Kept distinct from `draft` because the two look
 * identical from the outside — nobody can see either — and mean opposite
 * things about whether the message ever went out.
 */
export type DisplayState = "draft" | "scheduled" | "live" | "expired";

export function displayState(row: AnnouncementRow, now: Date = new Date()): DisplayState {
  const status = row.status ?? "published";
  if (status === "draft") return "draft";

  const t = now.getTime();
  const expires = row.expires_at ? Date.parse(row.expires_at) : null;
  // Expiry outranks everything except being a draft. A scheduled post whose
  // expiry has already passed never appears at all, and saying "scheduled"
  // about it would be a promise the product will not keep.
  if (expires !== null && !Number.isNaN(expires) && expires <= t) return "expired";

  if (status === "scheduled") {
    const at = row.publish_at ? Date.parse(row.publish_at) : null;
    if (at === null || Number.isNaN(at) || at > t) return "scheduled";
  }
  return "live";
}

export const DISPLAY_LABELS: Record<DisplayState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
  expired: "Expired",
};

/**
 * Is this post visible to the agency at this moment?
 *
 * The author and the owner see more than this — that part lives in the RLS
 * policy, because it is an authorization question and belongs where it is
 * enforced. This answers only "has it gone out and not yet come down".
 */
export function isLive(row: AnnouncementRow, now: Date = new Date()): boolean {
  return displayState(row, now) === "live";
}

/**
 * Does this post reach a particular person?
 *
 * Targeting is additive: an empty role list and a null upline mean everybody,
 * which is what every announcement written before targeting existed carries.
 * A post can be aimed by role, by team, or by both — both means the
 * intersection, since somebody who is neither a manager nor on that team was
 * not who the sender had in mind either way.
 */
export function reaches(
  row: AnnouncementRow,
  person: { roles?: string[] | null; uplineChain?: string[] | null; id?: string | null },
): boolean {
  const roles = row.target_roles ?? [];
  if (roles.length > 0) {
    const mine = person.roles ?? [];
    if (!roles.some((r) => mine.includes(r))) return false;
  }

  const upline = row.target_upline_id ?? null;
  if (upline) {
    // The targeted person is included in their own team: an announcement to a
    // manager's team that the manager cannot see is not what anybody means.
    if (person.id === upline) return true;
    const chain = person.uplineChain ?? [];
    if (!chain.includes(upline)) return false;
  }
  return true;
}

/** Everything that has to be true for somebody to actually read it. */
export function isVisibleTo(
  row: AnnouncementRow,
  person: { roles?: string[] | null; uplineChain?: string[] | null; id?: string | null },
  now: Date = new Date(),
): boolean {
  return isLive(row, now) && reaches(row, person);
}

/**
 * Why a composition cannot be saved, in words an owner can act on.
 *
 * Returns null when it is fine. These mirror the CHECK constraints in
 * 20260815010000 so the refusal arrives before the round trip, not as a
 * relayed `violates check constraint`.
 */
export function validate(
  input: { status: AnnouncementStatus; publishAt?: string | null; expiresAt?: string | null },
  now: Date = new Date(),
): string | null {
  if (input.status === "scheduled") {
    if (!input.publishAt) return "Choose when this should go out, or save it as a draft.";
    const at = Date.parse(input.publishAt);
    if (Number.isNaN(at)) return "That publish date isn't a real date.";
    // A schedule in the past is almost always a mistyped year. Publishing
    // immediately would be the surprising reading of it.
    if (at <= now.getTime()) {
      return "That time has already passed. Pick a future time, or publish it now.";
    }
  }

  if (input.expiresAt) {
    const ends = Date.parse(input.expiresAt);
    if (Number.isNaN(ends)) return "That expiry date isn't a real date.";
    if (ends <= now.getTime()) return "That expiry has already passed, so nobody would ever see this.";
    if (input.publishAt) {
      const at = Date.parse(input.publishAt);
      if (!Number.isNaN(at) && ends <= at) {
        return "This would expire before it goes out.";
      }
    }
  }
  return null;
}

/**
 * Posts whose channels are owed a send.
 *
 * A scheduled announcement becomes readable in the app the instant its time
 * passes, with nothing running. Email and Discord are different: something has
 * to reach out. This picks the ones that have come due and not yet been
 * delivered, and the caller sends them.
 *
 * Safe to call as often as anybody likes — `announcement_deliveries` records
 * every attempt and the email sender keeps an event-level idempotency key, so
 * a second pass over the same post sends nothing twice.
 */
export function dueForDispatch<T extends AnnouncementRow & { id: string }>(
  rows: T[],
  delivered: Set<string>,
  now: Date = new Date(),
): T[] {
  return rows.filter((r) => isLive(r, now) && !delivered.has(r.id));
}
