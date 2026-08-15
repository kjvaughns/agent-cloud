/**
 * The server half of the Agency Settings permissions.
 *
 * ── Why this exists separately from `tab-access.ts` ──
 *
 * `tab-access` decides what to render. This decides what to allow, and they
 * must agree — so the decision itself lives in `tab-access` and is imported
 * here rather than restated. What this adds is the part a browser cannot do:
 * fetching who the caller actually is, from the database, on every call.
 *
 * A hidden tab is a hidden button. Anybody can post to a server function with
 * a fetch, and until this existed, the six new permissions were advisory —
 * somebody without `admin_manage_carriers` could still have saved a carrier by
 * calling the endpoint directly.
 *
 * ── Service role, deliberately ──
 *
 * The membership and permission rows are read with the admin client. Reading
 * them under RLS would ask the very policies this is about to enforce whether
 * the caller may see their own permissions, and a caller whose row is hidden
 * from them would read as having none — which fails closed, but fails closed
 * for the wrong reason and would be indistinguishable from a real refusal.
 */

import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import {
  canOpenTab, canEditGrids, refusalReason,
  type SettingsTab, type AccessContext,
} from "./tab-access";

const supabaseAdmin = _admin as any;

/**
 * Who this person is, as the shared decision function wants it.
 *
 * Assembled once per call rather than threaded through, because a guard that
 * is awkward to call is a guard somebody skips.
 */
export async function accessContextFor(userId: string, orgId: string): Promise<AccessContext> {
  const [{ data: org }, { data: roles }, { data: perms }, { data: membership }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin
      .from("role_permissions")
      .select("*")
      .eq("profile_id", userId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_memberships")
      .select("status")
      .eq("profile_id", userId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);

  const roleNames = ((roles ?? []) as any[]).map((r) => String(r.role));

  return {
    // The literal owner, or an agency-level admin of THIS org. `agency_owner`
    // alone is not enough — it is held per person and names no organization,
    // which is the whole reason 20260815050000 existed.
    isOwner:
      org?.owner_id === userId ||
      (membership?.status === "active" &&
        roleNames.some((r) => r === "agency_owner" || r === "admin")),
    isPlatformAdmin: roleNames.includes("super_admin"),
    isStaff: membership?.status === "active",
    perms: (perms ?? {}) as AccessContext["perms"],
  };
}

/**
 * Refuse unless this person may act in this tab.
 *
 * Throws with the same sentence the interface would have shown, so somebody
 * who reaches the endpoint directly gets an explanation rather than a bare
 * failure — and an owner reading a support ticket sees the same words their
 * staff member did.
 */
export async function assertTabPermission(
  userId: string,
  tab: SettingsTab,
  orgId?: string | null,
): Promise<string> {
  const org = orgId ?? (await getMyPrimaryOrgId(userId));
  if (!org) throw new Error("You are not part of an agency.");

  const ctx = await accessContextFor(userId, org);
  if (!canOpenTab(tab, ctx)) throw new Error(refusalReason(tab));
  return org;
}

/**
 * Refuse unless this person may edit compensation grids.
 *
 * Separate from the Carriers tab on purpose: adding a carrier changes what
 * agents can select, editing its grid changes what every one of them is paid
 * on every deal already written against it.
 */
export async function assertCanEditGrids(
  userId: string,
  orgId?: string | null,
): Promise<string> {
  const org = orgId ?? (await getMyPrimaryOrgId(userId));
  if (!org) throw new Error("You are not part of an agency.");

  const ctx = await accessContextFor(userId, org);
  if (!canEditGrids(ctx)) {
    throw new Error(
      "You do not have permission to edit compensation grids. An agency owner " +
      "can grant this under Settings ▸ Agency Settings ▸ Roles and Permissions.",
    );
  }
  return org;
}
