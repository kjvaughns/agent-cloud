import { z } from "zod";

/**
 * Whose records am I looking at?
 *
 * Three answers, and they mean the same thing on every page:
 *
 *   mine    just you
 *   team    you plus everyone under you in the upline chain
 *   agency  everyone in your organisation
 *   imo     your organisation plus every sub-agency opted into the rollup
 *
 * Kept deliberately free of imports so both a server function and the browser
 * bundle can use it.
 *
 * The values are about *data*, not job titles. Somebody called a manager who
 * has nobody under them should not be offered a Team view that is guaranteed
 * to be empty, and somebody called an agent who has recruited three people
 * should not be denied one. What you may look at follows from who reports to
 * you, which is why the options come from the database rather than the role.
 */

export const SCOPES = ["mine", "team", "agency", "imo"] as const;
export type Scope = (typeof SCOPES)[number];

export const scopeSchema = z.enum(SCOPES);

/** What the database says this person may look at. */
export type ScopeCapabilities = {
  /** How many people are under them, at any depth. */
  downlineCount: number;
  /** Whether the whole-organisation view is theirs to open. */
  canAgency: boolean;
  /**
   * Whether team rows are editable, not merely visible. Today's write policies
   * grant this on the org-owner branch only, so a manager reads their team's
   * records and cannot change them.
   */
  canEditTeamRecords: boolean;
  /**
   * Whether the Total IMO view exists for them: they administer an agency
   * with at least one active sub-agency opted into the production rollup.
   * Like everything else here it comes from the data, not the plan — an
   * "IMO" with no participating children has nothing to total.
   */
  canImo: boolean;
};

export const NO_SCOPE_CAPABILITIES: ScopeCapabilities = {
  downlineCount: 0,
  canAgency: false,
  canEditTeamRecords: false,
  canImo: false,
};

/**
 * Which options to offer.
 *
 * Returns a single entry for somebody who only ever sees their own work — and
 * that is the case the whole design turns on. The toggle renders nothing when
 * there is only one answer, so every page can drop it in unconditionally and
 * it stays invisible for the people it would only confuse.
 */
export function availableScopes(caps: ScopeCapabilities): Scope[] {
  const scopes: Scope[] = ["mine"];
  if (caps.downlineCount > 0) scopes.push("team");
  if (caps.canAgency) scopes.push("agency");
  if (caps.canImo) scopes.push("imo");
  return scopes;
}

/**
 * Your own work, always.
 *
 * This used to return the widest scope available, on the theory that somebody
 * arriving wants to see everything. For an agency owner that meant every page
 * opened on the whole agency: Finances showed the agency's money before their
 * own, Tasks showed everybody's, and the Kanban board opened in a state where
 * `canDrag` is false — so an owner's first sight of the pipeline was a board
 * that would not respond to being dragged.
 *
 * Narrow is the safer default in both directions. Somebody who wants the wide
 * view takes one click to get it, and the page remembers (see `useScope`).
 * Somebody who did not want it is never shown other people's numbers under a
 * heading that does not say whose they are.
 */
export function defaultScope(_caps: ScopeCapabilities): Scope {
  return "mine";
}

/**
 * Clamp whatever arrived — a URL, a stale bookmark, a link pasted by somebody
 * more senior — to something this person may actually open. Never throws: a
 * link that is too wide should quietly narrow, not break the page.
 */
export function normalizeScope(raw: unknown, caps: ScopeCapabilities): Scope {
  const parsed = scopeSchema.safeParse(raw);
  if (!parsed.success) return defaultScope(caps);
  return availableScopes(caps).includes(parsed.data) ? parsed.data : defaultScope(caps);
}

export const SCOPE_LABELS: Record<Scope, string> = {
  mine: "Mine",
  team: "Team",
  agency: "Agency",
  imo: "Total IMO",
};

/** Said out loud, for empty states and captions. */
export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  mine: "Only your own",
  team: "You and everyone under you",
  agency: "Everyone in the agency",
  imo: "Your agency plus every sub-agency that's opted in",
};

/**
 * What to say when a scope legitimately has nothing in it.
 *
 * "No clients" is wrong for a manager whose team is empty — it reads as a bug
 * in the page rather than a fact about their team, and it is the first thing a
 * newly promoted manager will report.
 */
export function emptyScopeMessage(scope: Scope, caps: ScopeCapabilities, noun = "records"): string {
  if (scope === "team" && caps.downlineCount === 0) return "Nobody reports to you yet.";
  if (scope === "mine") return `No ${noun} of your own yet.`;
  if (scope === "team") return `Nobody on your team has any ${noun} yet.`;
  if (scope === "imo") return `Nobody across your agencies has any ${noun} yet.`;
  return `Nobody in the agency has any ${noun} yet.`;
}
