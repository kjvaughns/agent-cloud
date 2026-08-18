/**
 * Who may put an agent on a position, and which positions they may choose.
 *
 * ── The bug this is extracted for ──
 *
 * An agency owner opened their roster, saw nine agents, picked one who happened
 * to sit under somebody else, and was told **"That agent is not in your
 * agency."** He was. Three separate things conspired:
 *
 *  1. The guard asked the wrong source. Four different things answer "is this
 *     agent in my agency" — `get_team_downline` (walks `upline_id`, no org
 *     filter), `is_in_downline` (same walk, filtered on org), the membership
 *     table, and `profiles.organization_id` (a denormalised copy of it). The
 *     ROSTER is built from the first. The guard used the last, was corrected to
 *     use the third, and refused the same agent both times — he has no
 *     membership row and a null copy while being perfectly reachable through
 *     `upline_id`. The rule is now the screen: if the roster lists them, they
 *     are placeable.
 *
 *  2. `profiles_org_manage` grants writes on `id = auth.uid() OR
 *     (organization_id IS NOT NULL AND is_org_owner(organization_id))`. When
 *     that column is null the owner is refused too — by their own RLS policy,
 *     on their own agency.
 *
 *  3. That policy names the OWNER and nobody else, so an upline could never
 *     place their own downline no matter what the product said.
 *
 * ── Why a module ──
 *
 * "May this person place that person, on that rung" is a decision, and it was
 * being made inline inside one server function out of the comparison of two
 * strings. The rung ceiling below is the same rule invitations already enforce;
 * it is imported rather than restated, because an agency that cannot invite
 * somebody onto a better contract than their own should not be able to promote
 * them onto one either.
 */

import { assignableRungs, type Rung } from "@/lib/invitations/permissions";

export type AssignActor = {
  /** Runs the agency. May place anybody, on any rung. */
  isOwner: boolean;
  isPlatformAdmin: boolean;
  /** Holds `admin_manage_levels` — they curate the ladder, so they may use it. */
  canManageLevels: boolean;
  /** The actor's own rung, for the ceiling below. Null for staff with no rung. */
  ownRung: Rung | null;
};

export type AssignTarget = {
  /**
   * True when the roster would list them: in the caller's downline per
   * `get_team_downline`, or sharing an agency by membership or by column.
   * Deliberately a union — each source alone has already refused somebody the
   * screen was showing.
   */
  inAgency: boolean;
  /** True when the actor is anywhere above the target in the hierarchy. */
  isMyDownline: boolean;
};

export type AssignRefusal =
  | "not_in_agency"
  | "not_yours_to_place"
  | "rung_not_in_agency"
  | "rung_inactive"
  | "rung_not_below_yours"
  | "actor_has_no_rung"
  | "agency_has_no_rungs";

export const ASSIGN_REFUSAL_MESSAGES: Record<AssignRefusal, string> = {
  not_in_agency:
    "That agent is not in your agency.",
  not_yours_to_place:
    "That agent is not in your downline, and you do not manage positions for the agency. " +
    "An agency owner, or anyone with permission to manage levels and positions, can place them.",
  rung_not_in_agency:
    "That position is not one of your agency's.",
  rung_inactive:
    "That position has been retired. Choose an active one, or reactivate it under " +
    "Settings ▸ Levels & Positions.",
  rung_not_below_yours:
    "You can only place somebody on a position below your own.",
  actor_has_no_rung:
    "You do not have a position yourself yet, so there is nothing below it to " +
    "place anybody on. Ask your agency owner to set your position under " +
    "Settings ▸ Levels & Positions, and you will be able to place your downline.",
  agency_has_no_rungs:
    "Your agency has not set up any positions yet. An agency owner creates them " +
    "under Settings ▸ Levels & Positions.",
};

/**
 * May this actor place this agent, and is the rung one they may hand out?
 *
 * Collects every reason rather than the first, the same way `checkInvite` and
 * `resolveCompensation` do: somebody correcting an assignment wants the whole
 * list, not to discover the second problem after fixing the first.
 *
 * A null rung is "take them off their position", which is a removal and needs
 * no ceiling — only the standing to touch that agent at all.
 */
export function checkAssignment(input: {
  actor: AssignActor;
  target: AssignTarget;
  /** The rung being assigned, or null to clear it. */
  rung: Rung | null;
  /** Every rung the agency has, active and retired. */
  agencyRungs: Rung[];
}): { ok: boolean; refusals: AssignRefusal[]; messages: string[] } {
  const { actor, target, rung, agencyRungs } = input;
  const refusals: AssignRefusal[] = [];

  // Reachability is the one thing nothing overrides. Somebody the caller's own
  // roster would not list is not placeable by them, including a platform admin
  // acting here — that is the tenancy boundary, not a convenience.
  if (!target.inAgency) {
    return finish(["not_in_agency"]);
  }

  const managesTheLadder = actor.isOwner || actor.isPlatformAdmin || actor.canManageLevels;

  // An upline may place their own people. That is the whole point of a
  // hierarchy, and it was impossible before: the write policy named the owner
  // and stopped.
  if (!managesTheLadder && !target.isMyDownline) {
    refusals.push("not_yours_to_place");
  }

  // An empty ladder used to be indistinguishable from a rung that does not
  // belong to the agency, and both drew "That position is not one of your
  // agency's". For most of this week the ladder read as empty for anybody
  // whose `profiles.organization_id` was null, because `agency_levels_read`
  // gated on that column — so the message accused the agency of not owning a
  // position it had created, and pointed nowhere useful.
  if (rung && agencyRungs.length === 0) {
    refusals.push("agency_has_no_rungs");
  } else if (rung) {
    const known = agencyRungs.find((r) => r.id === rung.id);
    if (!known) {
      refusals.push("rung_not_in_agency");
    } else if (!known.active) {
      refusals.push("rung_inactive");
    } else if (!managesTheLadder) {
      // ── Say which of the two things is wrong ──
      //
      // `assignableRungs` answers `[]` both for somebody standing on the
      // bottom rung and for somebody standing on no rung at all, and this
      // reported both as "you can only place somebody below your own". An
      // upline with no position of their own was told about a rule they had
      // not broken, with nothing pointing at the thing that would fix it —
      // which is somebody else giving them a position.
      //
      // `checkInvite` has always distinguished these as `inviter_has_no_rung`;
      // this is the same distinction under the matching name.
      if (!actor.ownRung || actor.ownRung.base_pct == null) {
        refusals.push("actor_has_no_rung");
      } else {
        // The same ceiling invitations enforce. An agency that will not let
        // somebody invite onto a better contract than their own must not let
        // them promote onto one either — it is the same money, one step later.
        const allowed = assignableRungs(actor.ownRung, agencyRungs);
        if (!allowed.some((r) => r.id === known.id)) {
          refusals.push("rung_not_below_yours");
        }
      }
    }
  }

  return finish(refusals);
}

function finish(refusals: AssignRefusal[]) {
  return {
    ok: refusals.length === 0,
    refusals,
    messages: refusals.map((r) => ASSIGN_REFUSAL_MESSAGES[r]),
  };
}

/**
 * The positions this actor may choose for that agent, best first.
 *
 * Empty means they may not place them at all, which the caller should render as
 * an absent control rather than an empty dropdown — an empty list of choices
 * reads as a fault, and this is a boundary.
 */
export function assignableFor(actor: AssignActor, agencyRungs: Rung[]): Rung[] {
  if (actor.isOwner || actor.isPlatformAdmin || actor.canManageLevels) {
    return agencyRungs
      .filter((r) => r.active)
      .sort((a, b) => (b.base_pct ?? 0) - (a.base_pct ?? 0));
  }
  return assignableRungs(actor.ownRung, agencyRungs);
}
