import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

// Generated DB types predate the org-isolation migration; cast until regenerated.
const supabaseAdmin = _admin as any;

/**
 * Organization scoping for service-role code paths.
 *
 * The service-role client bypasses RLS entirely, so any server function that
 * reaches for `supabaseAdmin` loses the database's tenant boundary and has to
 * re-establish it in code. These helpers are that boundary.
 *
 * Use the RLS-bound `context.supabase` client wherever possible and reserve
 * `supabaseAdmin` for writes that genuinely need to cross a policy — every such
 * call site should sit behind one of the asserts below.
 */

export class OrgAccessError extends Error {
  constructor(message = "You don't have access to that organization's data") {
    super(message);
    this.name = "OrgAccessError";
  }
}

/** Statuses that mean "this person no longer has access to the organization". */
const REVOKED = new Set(["inactive", "terminated"]);

/**
 * Orgs the user actively belongs to.
 *
 * The `profiles.organization_id` fallback exists for installs where the
 * membership backfill has not run. It is also, unguarded, an active bypass of
 * the revocation this module is supposed to enforce: revoking somebody sets
 * their membership to `suspended`/`archived`, which makes the membership query
 * return **zero rows** — which is precisely the condition that fires the
 * fallback. Every `supabaseAdmin` path would hand the org straight back.
 *
 * So the fallback is kept, and conditioned on the profile not being revoked.
 * Removing it outright would break installs mid-backfill; conditioning it is
 * correct in both windows.
 */
export async function getMyOrgIds(userId: string): Promise<string[]> {
  const { data: memberships } = await supabaseAdmin
    .from("organization_memberships")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("status", "active");

  const ids = (memberships ?? []).map((m: any) => m.organization_id).filter(Boolean);
  if (ids.length > 0) return ids;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("organization_id, status")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.organization_id) return [];
  if (REVOKED.has(String(profile.status))) return [];
  return [profile.organization_id];
}

/** The user's primary org, or null. */
export async function getMyPrimaryOrgId(userId: string): Promise<string | null> {
  const ids = await getMyOrgIds(userId);
  return ids[0] ?? null;
}

/** Throws unless the user actively belongs to `orgId`. */
export async function assertOrgAccess(userId: string, orgId: string | null | undefined): Promise<string> {
  if (!orgId) throw new OrgAccessError("No organization on this record");
  const ids = await getMyOrgIds(userId);
  if (!ids.includes(orgId)) throw new OrgAccessError();
  return orgId;
}

/** Throws unless the user owns `orgId`. */
export async function assertOrgOwner(userId: string, orgId: string | null | undefined): Promise<string> {
  if (!orgId) throw new OrgAccessError("No organization on this record");
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!org) throw new OrgAccessError("Only the agency owner can do that");
  return orgId;
}

/**
 * Throws unless `targetProfileId` shares an active org with the caller.
 * This is the guard for every service-role path that takes a caller-supplied
 * profile id — the shape most prone to cross-tenant access.
 */
export async function assertSameOrg(userId: string, targetProfileId: string): Promise<string> {
  if (userId === targetProfileId) return targetProfileId;

  const mine = await getMyOrgIds(userId);
  if (mine.length === 0) throw new OrgAccessError();

  const { data: theirs } = await supabaseAdmin
    .from("organization_memberships")
    .select("organization_id")
    .eq("profile_id", targetProfileId)
    .eq("status", "active");

  const theirIds = (theirs ?? []).map((m: any) => m.organization_id);
  if (theirIds.length === 0) {
    // Same conditional fallback as getMyOrgIds — a revoked target must not be
    // reachable just because their membership row is no longer active.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id, status")
      .eq("id", targetProfileId)
      .maybeSingle();
    if (profile?.organization_id && !REVOKED.has(String(profile.status))) {
      theirIds.push(profile.organization_id);
    }
  }

  if (!theirIds.some((id: string) => mine.includes(id))) throw new OrgAccessError();
  return targetProfileId;
}

/**
 * Throws unless `memberId` is actually a member of `orgId`.
 *
 * Pair this with any "can the caller manage this org" check. Verifying only the
 * caller's rights leaves the *target* unbounded: an owner of org A could pass a
 * member_id from org B and mutate that profile's roles or permissions.
 */
export async function assertMemberOfOrg(memberId: string, orgId: string): Promise<void> {
  const { data: membership } = await supabaseAdmin
    .from("organization_memberships")
    .select("profile_id")
    .eq("profile_id", memberId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (membership) return;

  // Fallback for installs where the membership backfill has not run yet, with
  // the same revocation condition as above.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, status")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!profile || REVOKED.has(String(profile.status))) {
    throw new OrgAccessError("That member is not in this organization");
  }
}

/**
 * Narrows a list of profile ids to those inside the caller's org(s).
 *
 * This one never consulted memberships at all — it narrowed purely on
 * `profiles.organization_id`, which a revoked agent keeps. Revoked profiles are
 * excluded explicitly rather than by relying on the membership table.
 */
export async function filterToMyOrg(userId: string, profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return [];
  const mine = await getMyOrgIds(userId);
  if (mine.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, status")
    .in("id", profileIds)
    .in("organization_id", mine);
  return (data ?? [])
    .filter((p: any) => !REVOKED.has(String(p.status)))
    .map((p: any) => p.id);
}
