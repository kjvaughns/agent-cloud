/**
 * Who an announcement reaches, and on what.
 *
 * Pure, because the two rules that matter here are easy to get subtly wrong
 * and impossible to see afterwards: an announcement must never travel *upward*
 * to a parent agency, and a paused or terminated relationship must not receive
 * one. Both are one predicate away from being inverted, and the symptom of
 * either mistake is somebody reading a notice that was not for them.
 */

export const AUDIENCES = ["agency", "agency_and_subs"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  agency: "My agency only",
  agency_and_subs: "My agency and its sub-agencies",
};

export const CHANNELS = ["in_app", "email", "discord"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  in_app: "In the app",
  email: "Email",
  discord: "Discord",
};

/** A relationship row, reduced to what this decision reads. */
export type Relationship = {
  parent_org_id: string;
  child_org_id: string;
  status: string;
};

/**
 * Every agency a post should be written to, the sender's own first.
 *
 * Walks *down* from the sender and only through active relationships. A
 * paused or terminated child is skipped along with everything beneath it —
 * pausing a relationship that then keeps forwarding your notices through a
 * grandchild would make the pause meaningless.
 *
 * Depth-capped and cycle-guarded like every other walk over this table: the
 * data permits a loop even though the UI does not, and a loop here would hang
 * a request rather than merely return something odd.
 */
export function resolveAudience(
  senderOrgId: string,
  audience: Audience,
  relationships: Relationship[],
  maxDepth = 10,
): string[] {
  if (audience === "agency") return [senderOrgId];

  const active = relationships.filter((r) => r.status === "active");
  const out = [senderOrgId];
  const seen = new Set([senderOrgId]);

  let frontier = [senderOrgId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const r of active) {
        if (r.parent_org_id !== parent) continue;
        if (seen.has(r.child_org_id)) continue;
        seen.add(r.child_org_id);
        out.push(r.child_org_id);
        next.push(r.child_org_id);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * In-app is not optional: an announcement IS the feed entry, and a post that
 * skipped it would exist only as a notification somebody has already dismissed.
 * The dialog renders that switch on and disabled; this is the server's version
 * of the same rule, so turning it off in a request body achieves nothing.
 */
export function normalizeChannels(requested: string[] | undefined): Channel[] {
  const set = new Set<Channel>(["in_app"]);
  for (const c of requested ?? []) {
    if ((CHANNELS as readonly string[]).includes(c)) set.add(c as Channel);
  }
  return CHANNELS.filter((c) => set.has(c));
}

/**
 * One send to several agencies is one thing that happened. The sender's feed
 * shows it once; every other agency sees only its own copy, which is all its
 * members can read anyway.
 */
export function collapseGroups<T extends { id: string; announcement_group_id?: string | null; organization_id?: string | null }>(
  rows: T[],
  viewerOrgId: string | null,
): T[] {
  const out: T[] = [];
  const seenGroups = new Set<string>();
  for (const row of rows) {
    const group = row.announcement_group_id;
    if (!group) { out.push(row); continue; }
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);
    // Prefer the viewer's own copy when several are visible, so the row they
    // see is the one addressed to them.
    const mine = rows.find((r) => r.announcement_group_id === group && r.organization_id === viewerOrgId);
    out.push(mine ?? row);
  }
  return out;
}
