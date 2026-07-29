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

/** Orgs the user actively belongs to. Falls back to profiles.organization_id
 *  for installs where the membership backfill has not run yet. */
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
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  return profile?.organization_id ? [profile.organization_id] : [];
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
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", targetProfileId)
      .maybeSingle();
    if (profile?.organization_id) theirIds.push(profile.organization_id);
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

  // Fallback for installs where the membership backfill has not run yet.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!profile) throw new OrgAccessError("That member is not in this organization");
}

/** Narrows a list of profile ids to those inside the caller's org(s). */
export async function filterToMyOrg(userId: string, profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return [];
  const mine = await getMyOrgIds(userId);
  if (mine.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("id", profileIds)
    .in("organization_id", mine);
  return (data ?? []).map((p: any) => p.id);
}
