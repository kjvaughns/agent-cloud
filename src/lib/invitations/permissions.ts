/**
 * What one person may hand to another when they invite them.
 *
 * Two rules, and both exist because an invitation is the one place in the
 * product where somebody grants standing they do not have to check against
 * their own. Left unguarded, an agent could invite somebody onto a better
 * contract than their own and then earn a negative override off them — or,
 * more simply, promote themselves by inviting a second account.
 *
 *   1. Nobody assigns a rung at or above their own.
 *   2. Nobody grants application access they do not hold.
 *
 * Pure, because both are ordering questions with edges that are easy to get
 * backwards and impossible to see afterwards.
 *
 * ── Why rank is `base_pct` and not `sort_order` ──
 *
 * `agency_levels.sort_order` is `not null default 0`. An agency that never
 * touches it has every level at zero, so a guard built on it would find every
 * rung equal and permit everything — the failure mode being silent and total.
 * `base_pct` is the ladder itself: it is what the resolver pays from, what the
 * roster sorts by, and what an owner is actually thinking about when they say
 * "Owner 100, MGA 90, GA 80". Ties are treated as equal rank, which is the
 * conservative reading — an agent may not invite a peer onto their own rung.
 */

/** Only the fields the two rules read. */
export type Rung = {
  id: string;
  name: string;
  base_pct: number | null;
  active: boolean;
};

/**
 * Application roles, most access first. Distinct from the ladder on purpose:
 * role decides what the app lets you open, the rung decides rank, pay and
 * whether you may recruit. Conflating them is how "promote to manager" ended
 * up meaning "pay them more".
 */
export const ROLE_RANK: Record<string, number> = {
  super_admin: 5,
  agency_owner: 4,
  admin: 3,
  manager: 2,
  // Level with agent, not above it. Staff is an assistant acting for one
  // person, and what they may do is a per-permission grant from that person
  // rather than a place on this ladder. Ranking it higher would stop an agent
  // inviting their own assistant, which the product has always allowed.
  staff: 0,
  agent: 0,
};

export type InviteRefusal =
  | "inviter_has_no_rung"
  | "rung_not_in_agency"
  | "rung_inactive"
  | "rung_not_below_inviter"
  | "role_above_inviter"
  | "level_cannot_recruit"
  | "duplicate_active_invite";

export const REFUSAL_MESSAGES: Record<InviteRefusal, string> = {
  inviter_has_no_rung:
    "You have not been placed on an agency level yet, so there is no level below yours to invite somebody onto.",
  rung_not_in_agency: "That level belongs to a different agency.",
  rung_inactive: "That level is no longer in use.",
  rung_not_below_inviter: "You can only invite somebody onto a level below your own.",
  role_above_inviter: "You cannot give somebody more access than you have.",
  level_cannot_recruit:
    "Your agency level does not include team building yet. Ask your agency about moving up.",
  duplicate_active_invite: "There is already an open invitation for that email address.",
};

/**
 * May this person invite anybody at all?
 *
 * The old answer was a blanket "contact your agency" for every agent, which
 * is wrong twice over: it is not true for an agency whose ladder opens
 * recruiting early, and it tells somebody nothing about how to change it.
 * Administrators are always allowed — an owner without a rung still runs the
 * agency.
 *
 * Somebody with no rung at all may, because no rung is saying they cannot —
 * an agency mid-setup has a ladder nobody is on yet, and refusing there would
 * take invitations away from every one of them. What they cannot do is place
 * anybody on a rung: see `assignableRungs`, which gives them nothing.
 */
export function canRecruit(rung: Rung | null, role: string | null): boolean {
  if (role && (ROLE_RANK[role] ?? 0) >= ROLE_RANK.manager) return true;
  if (!rung) return true;
  return rung.active && rungAllowsRecruiting(rung);
}

/** Kept separate so the caller can pass a rung that carries the flag. */
function rungAllowsRecruiting(rung: Rung & { can_invite?: boolean }): boolean {
  return rung.can_invite !== false;
}

/**
 * Which rungs this person may put somebody on.
 *
 * Strictly below their own, never equal. An agent inviting a peer onto their
 * own rung gives away nothing they own, but it also creates a chain where
 * neither earns an override off the other, which is not a hierarchy — and it
 * is the shape somebody would use to quietly clone their own standing.
 */
export function assignableRungs(inviterRung: Rung | null, all: Rung[]): Rung[] {
  if (!inviterRung || inviterRung.base_pct == null) return [];
  const mine = inviterRung.base_pct;
  return all
    .filter((r) => r.active && r.base_pct != null && r.base_pct < mine)
    .sort((a, b) => (b.base_pct ?? 0) - (a.base_pct ?? 0));
}

/**
 * The whole decision for one invitation, as a list of refusals.
 *
 * Every reason at once rather than the first, for the same reason the
 * compensation resolver does it: somebody fixing an invitation wants to know
 * everything wrong with it, not to discover the second problem after fixing
 * the first.
 */
export function checkInvite(input: {
  inviterRung: Rung | null;
  inviterRole: string | null;
  requestedRung: Rung | null;
  requestedRole: string | null;
  /** Rungs belonging to the inviter's own agency. */
  agencyRungs: Rung[];
  /** True when an open invitation already exists for this email in this agency. */
  duplicate?: boolean;
}): { ok: boolean; refusals: InviteRefusal[]; messages: string[] } {
  const { inviterRung, inviterRole, requestedRung, requestedRole, agencyRungs, duplicate } = input;
  const refusals: InviteRefusal[] = [];

  if (!canRecruit(inviterRung, inviterRole)) refusals.push("level_cannot_recruit");

  if (requestedRung) {
    const known = agencyRungs.some((r) => r.id === requestedRung.id);
    if (!known) refusals.push("rung_not_in_agency");
    else if (!requestedRung.active) refusals.push("rung_inactive");
    else if (!isAdmin(inviterRole)) {
      // An administrator may place anybody anywhere; that is what running the
      // agency means. Everyone else is bounded by their own rung.
      if (!inviterRung || inviterRung.base_pct == null) refusals.push("inviter_has_no_rung");
      else if ((requestedRung.base_pct ?? Infinity) >= inviterRung.base_pct) {
        refusals.push("rung_not_below_inviter");
      }
    }
  }

  if (requestedRole && (ROLE_RANK[requestedRole] ?? 0) > (ROLE_RANK[inviterRole ?? "agent"] ?? 0)) {
    refusals.push("role_above_inviter");
  }

  if (duplicate) refusals.push("duplicate_active_invite");

  return {
    ok: refusals.length === 0,
    refusals,
    messages: refusals.map((r) => REFUSAL_MESSAGES[r]),
  };
}

function isAdmin(role: string | null): boolean {
  return Boolean(role && (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin);
}
