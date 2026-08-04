import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertMemberOfOrg } from "@/lib/org-guard";

// Generated DB types predate the role_permissions migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

// ── Permission keys ──────────────────────────────────────────────────────────

export const MANAGER_PERMS = [
  "mgr_view_all_agents", "mgr_edit_agent_profiles", "mgr_post_deals_for_agents",
  "mgr_view_agent_commissions", "mgr_view_team_analytics", "mgr_access_recruiting",
  "mgr_submit_carrier_requests", "mgr_manage_onboarding", "mgr_view_client_records",
  "mgr_edit_client_records",
  // Lets a promoted manager maintain the agency's handbook, scripts and
  // academy content instead of routing every edit through the owner.
  "mgr_manage_resources",
  "mgr_respond_tickets",
] as const;

export const STAFF_PERMS = [
  "staff_view_clients", "staff_edit_clients", "staff_delete_clients",
  "staff_view_policies", "staff_post_policies", "staff_edit_policies",
  "staff_view_commissions",
  "staff_view_recruiting", "staff_edit_recruiting", "staff_move_recruiting_stages",
  "staff_view_contracts", "staff_submit_carrier_requests", "staff_edit_contracts",
  "staff_view_analytics",
  "staff_view_all_tickets", "staff_respond_tickets",
  "staff_manage_resources",
  "staff_nova_pro_enabled", "staff_is_admin",
] as const;

export const ADMIN_PERMS = [
  "admin_manage_staff_configs", "admin_view_billing_readonly",
  "admin_invite_users", "admin_view_agency_tickets",
] as const;

export type PermissionKey = (typeof MANAGER_PERMS)[number] | (typeof STAFF_PERMS)[number] | (typeof ADMIN_PERMS)[number];
export type Permissions = Partial<Record<PermissionKey, boolean>> & { staff_preset?: string | null };

const ALL_KEYS = [...MANAGER_PERMS, ...STAFF_PERMS, ...ADMIN_PERMS] as string[];

/** Manager defaults applied on invite: assigned-agents view, analytics, onboarding. */
export const MANAGER_DEFAULTS: Permissions = {
  mgr_view_team_analytics: true,
  mgr_manage_onboarding: true,
};

export const STAFF_PRESETS: Record<string, Permissions> = {
  admin: {
    ...Object.fromEntries([...STAFF_PERMS, ...ADMIN_PERMS].map((k) => [k, true])),
    staff_preset: "admin",
  },
  recruiter: {
    staff_view_recruiting: true, staff_edit_recruiting: true, staff_move_recruiting_stages: true,
    staff_view_clients: true, staff_view_all_tickets: true,
    staff_preset: "recruiter",
  },
  contracting_specialist: {
    staff_view_contracts: true, staff_submit_carrier_requests: true, staff_edit_contracts: true,
    staff_view_clients: true, staff_view_policies: true,
    staff_view_all_tickets: true, staff_respond_tickets: true,
    staff_preset: "contracting_specialist",
  },
  client_services: {
    staff_view_clients: true, staff_edit_clients: true, staff_delete_clients: true,
    staff_view_policies: true, staff_view_all_tickets: true, staff_respond_tickets: true,
    staff_preset: "client_services",
  },
  reports_support: {
    staff_view_analytics: true,
    staff_view_all_tickets: true, staff_respond_tickets: true,
    staff_preset: "reports_support",
  },
  support_desk: {
    staff_view_all_tickets: true, staff_respond_tickets: true,
    staff_view_clients: true, staff_view_policies: true,
    staff_preset: "support_desk",
  },
};

function zeroPerms(): Permissions {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, false])) as Permissions;
}

async function audit(orgId: string | null, performedBy: string, action: string, targetUserId: string | null, prev: any, next: any) {
  await supabaseAdmin.from("audit_log").insert({
    organization_id: orgId,
    performed_by: performedBy,
    action,
    target_user_id: targetUserId,
    previous_value: prev,
    new_value: next,
  });
}

/** Caller must be the org owner, or admin-staff with manage-configs, of orgId. */
/**
 * Who may manage roles and permissions for an organization.
 *
 * Gating on organizations.owner_id alone locked out accounts that hold the
 * agency_owner or admin role but were never written into owner_id — which is
 * every workspace where the org row predates the account, so an owner could
 * not administer their own agency.
 *
 * The role paths below are still org-scoped: they only apply to the caller's
 * OWN organization, checked against profiles.organization_id. This is
 * deliberately not the global has_role('admin') bypass that Phase 1 removed —
 * holding admin does not grant anything in someone else's agency.
 */
async function resolveCanManagePermissions(
  userId: string,
  orgId: string,
): Promise<"owner" | "agency_owner" | "org_admin" | "admin_staff" | null> {
  const [{ data: org }, { data: profile }, { data: roleRows }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (org?.owner_id === userId) return "owner";

  const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
  const inThisOrg = profile?.organization_id === orgId;

  if (inThisOrg && roles.includes("agency_owner")) return "agency_owner";
  if (inThisOrg && (roles.includes("admin") || roles.includes("super_admin"))) return "org_admin";

  const { data: rp } = await supabaseAdmin
    .from("role_permissions")
    .select("staff_is_admin, admin_manage_staff_configs")
    .eq("profile_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (rp?.staff_is_admin && rp?.admin_manage_staff_configs) return "admin_staff";

  return null;
}

async function assertCanManagePermissions(userId: string, orgId: string) {
  const who = await resolveCanManagePermissions(userId, orgId);
  if (who) return who;
  throw new Error(
    "You don't have permission to manage roles here. This is available to the agency owner and to staff granted admin access.",
  );
}

/**
 * …and may they manage *this* person.
 *
 * `assertCanManagePermissions` answers "may this account administer the org".
 * It was the only check on the three mutating functions below, which meant an
 * admin staffer — the assistant the owner ticked one box for — could demote a
 * manager, reconfigure another admin, or edit their own permission row. Rank
 * has to come into it.
 *
 * The org's own administrators (owner, `agency_owner`, `admin`) may target
 * anyone; that is what running the agency means. Admin staff hold delegated
 * authority and may not reach above or sideways into it, nor edit themselves —
 * self-edit is the one that turns a single granted box into every box.
 *
 * This is the boundary. Hiding the button in `agency-team-page.tsx` is a
 * courtesy to the person clicking, not a control.
 */
async function assertMayTargetMember(callerId: string, targetId: string, orgId: string) {
  const rank = await assertCanManagePermissions(callerId, orgId);
  if (rank !== "admin_staff") return rank;

  if (callerId === targetId) {
    throw new Error("You can't change your own role or permissions. Ask the agency owner.");
  }

  const [{ data: org }, { data: targetRoles }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", targetId),
  ]);

  const isAdministrator =
    org?.owner_id === targetId ||
    (targetRoles ?? []).some((r: any) =>
      ["agency_owner", "admin", "super_admin"].includes(String(r.role)));

  if (isAdministrator) {
    throw new Error("Only the agency owner can change an administrator's role or permissions.");
  }
  return rank;
}

// ── My access: role + permissions + solo detection (drives nav + billing UI) ─

export type MyAccess = {
  role: string | null;
  /** May manage roles and permissions for their own organization. */
  canManageRoles: boolean;
  /** Their workspace is an agency rather than a solo book. */
  inAgency: boolean;
  /**
   * …and they administer it, so the Agency section appears for them.
   *
   * Derived here rather than re-assembled in the UI, so the sidebar that
   * offers the section and the server that backs it cannot disagree.
   *
   * Deliberately not gated on subscription_status: nothing else in the app
   * locks a lapsed workspace out, and making navigation the first thing to do
   * so would be a pricing decision arriving as a layout change.
   */
  canSeeAgency: boolean;
  /**
   * Has an account but is not yet a selling agent — invited, not activated,
   * no first sale. They get everything that leads to selling and none of the
   * selling itself.
   */
  isPending: boolean;
  isSolo: boolean;
  isOwner: boolean;
  orgId: string | null;
  orgName: string | null;
  orgStatus: string;
  planType: string;
  permissions: Permissions;
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
    ]);
    const roles: string[] = (roleRows ?? []).map((r: any) => r.role);
    const pick = ["super_admin", "agency_owner", "admin", "manager", "staff", "agent"].find((r) => roles.includes(r)) ?? (roles[0] ?? null);

    let org: any = null;
    if (profile?.organization_id) {
      const { data } = await supabaseAdmin
        .from("organizations")
        .select("id, name, owner_id, plan_type, subscription_status")
        .eq("id", profile.organization_id)
        .maybeSingle();
      org = data;
    }

    let permissions: Permissions = {};
    if (org && (pick === "manager" || pick === "staff")) {
      const { data: rp } = await supabaseAdmin
        .from("role_permissions")
        .select("*")
        .eq("profile_id", userId)
        .eq("organization_id", org.id)
        .maybeSingle();
      if (rp) {
        permissions = Object.fromEntries(Object.entries(rp).filter(([k]) => ALL_KEYS.includes(k) || k === "staff_preset")) as Permissions;
      } else if (pick === "manager") {
        permissions = { ...zeroPerms(), ...MANAGER_DEFAULTS };
      } else {
        permissions = zeroPerms();
      }
    }

    // Computed here rather than re-derived in the UI, so the tab that offers
    // the feature and the server that enforces it cannot disagree.
    const canManageRoles = org
      ? (await resolveCanManagePermissions(userId, org.id)) !== null
      : false;

    const inAgency = Boolean(org) && org?.plan_type !== "solo";

    const { data: me } = await supabaseAdmin
      .from("profiles").select("status").eq("id", userId).maybeSingle();

    return {
      role: pick,
      canManageRoles,
      inAgency,
      canSeeAgency: inAgency && (org?.owner_id === userId || canManageRoles),
      // An org owner is never pending — they are the one who does the
      // activating, and locking them out of their own workspace on the day
      // they sign up would be absurd.
      isPending: me?.status === "pending" && org?.owner_id !== userId,
      isSolo: org?.plan_type === "solo" && org?.owner_id === userId,
      isOwner: org?.owner_id === userId,
      orgId: org?.id ?? null,
      orgName: org?.name ?? null,
      orgStatus: org?.subscription_status ?? "inactive",
      planType: org?.plan_type ?? "agency",
      permissions,
    } as MyAccess;
  });

// ── Org member management (owner / admin staff) ─────────────────────────────

export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const { data: ownedOrg } = await supabaseAdmin
      .from("organizations").select("id, owner_id").eq("owner_id", userId).maybeSingle();
    let orgId = ownedOrg?.id as string | undefined;
    let ownerId = ownedOrg?.owner_id as string | null | undefined;
    let callerRank: string = ownedOrg ? "owner" : "";
    if (!orgId) {
      // Admin staff path
      const { data: profile } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
      if (profile?.organization_id) {
        callerRank = await assertCanManagePermissions(userId, profile.organization_id);
        orgId = profile.organization_id;
        // Read the organization by id, not by owner. The lookup above filters
        // on `owner_id = me`, so on this path it returns nothing and `owner_id`
        // stayed null — which made `isOwner` false for *every* member below,
        // including the actual owner. The agency owner then appeared in the
        // roster as an ordinary agent with a Configure button beside them.
        const { data: org } = await supabaseAdmin
          .from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
        ownerId = org?.owner_id ?? null;
      }
    }
    if (!orgId) throw new Error("No organization to manage");

    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, status, created_at, nova_pro_status, nova_pro_source")
      .eq("organization_id", orgId);
    const ids = (members ?? []).map((m: any) => m.id);
    const [{ data: roles }, { data: perms }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("role_permissions").select("*").eq("organization_id", orgId),
    ]);
    const roleByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      roleByUser.set(r.user_id, [...(roleByUser.get(r.user_id) ?? []), r.role]);
    }
    const permByUser = new Map<string, any>((perms ?? []).map((p: any) => [p.profile_id, p]));

    return {
      orgId,
      // Who is asking, and with what authority. The roster offers Configure
      // only where `assertMayTargetMember` would accept it — the server refuses
      // either way, and an inert button is a worse way to learn that than not
      // being offered one.
      callerId: userId,
      callerRank,
      members: (members ?? []).map((m: any) => {
        const roles = roleByUser.get(m.id) ?? ["agent"];
        return {
          ...m,
          roles,
          permissions: permByUser.get(m.id) ?? null,
          isOwner: Boolean(ownerId) && m.id === ownerId,
          // An administrator by role rather than by `owner_id`. Both exist:
          // resolveCanManagePermissions honours either, so the roster has to
          // as well or it offers a Configure button the server will refuse.
          isAdmin: roles.some((r: string) => ["agency_owner", "admin", "super_admin"].includes(r)),
        };
      }),
    };
  });

const PermPatchSchema = z.object({
  member_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patch: z.record(z.string(), z.union([z.boolean(), z.string(), z.null()])),
});

export const updateMemberPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PermPatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    await assertMayTargetMember(userId, data.member_id, data.organization_id);
    await assertMemberOfOrg(data.member_id, data.organization_id);

    // Whitelist keys
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (ALL_KEYS.includes(k) && typeof v === "boolean") patch[k] = v;
      if (k === "staff_preset" && (v === null || typeof v === "string")) patch[k] = v;
    }
    if (!Object.keys(patch).length) throw new Error("No valid permission keys");

    const { data: prev } = await supabaseAdmin
      .from("role_permissions")
      .select("*")
      .eq("profile_id", data.member_id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("role_permissions").upsert(
      {
        profile_id: data.member_id,
        organization_id: data.organization_id,
        ...(prev ?? {}),
        ...patch,
        id: prev?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,organization_id" },
    );
    if (error) throw new Error(error.message);

    await audit(data.organization_id, userId, "permissions_updated", data.member_id,
      prev ? Object.fromEntries(Object.keys(patch).map((k) => [k, prev[k]])) : null, patch);
    return { ok: true };
  });

/**
 * The presets, from the one place that defines them.
 *
 * This was a hand-copied list — `["admin","recruiter","contracting_specialist",
 * "client_services"]` — while `STAFF_PRESETS` above and the chips in
 * agency-team-page.tsx both carried six. Reports & Support and Support Desk
 * were therefore offered in the UI and rejected by the validator, with the
 * enum error shown to the operator verbatim. Derived, so a seventh preset
 * cannot be added without this accepting it.
 */
const PRESET_IDS = Object.keys(STAFF_PRESETS) as [string, ...string[]];

export const applyStaffPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      member_id: z.string().uuid(),
      organization_id: z.string().uuid(),
      preset: z.enum(PRESET_IDS),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    await assertMayTargetMember(userId, data.member_id, data.organization_id);
    await assertMemberOfOrg(data.member_id, data.organization_id);

    // A staff preset describes a staff member. Applying one to somebody who is
    // not yet staff used to write the permissions and leave the role alone —
    // so they held a full contracting-specialist permission set while
    // `audienceFor` still resolved them to the agent product, and none of it
    // showed up. A manager is not silently demoted: that is a decision for
    // whoever is configuring them, not a side effect of clicking a chip.
    const { data: memberRoles } = await supabaseAdmin
      .from("user_roles").select("id, role").eq("user_id", data.member_id)
      .in("role", ["manager", "staff", "agent"]);
    const held = (memberRoles ?? []).map((r: any) => String(r.role));

    if (held.includes("manager")) {
      throw new Error("This member is a manager. Change their role to Staff before applying a staff preset.");
    }
    if (!held.includes("staff")) {
      for (const r of memberRoles ?? []) {
        await supabaseAdmin.from("user_roles").delete().eq("id", r.id);
      }
      await supabaseAdmin.from("user_roles").insert({ user_id: data.member_id, role: "staff" });
      await audit(data.organization_id, userId, "role_changed", data.member_id,
        { roles: held }, { role: "staff", via: "staff_preset" });
    }

    const full = { ...zeroPerms(), ...STAFF_PRESETS[data.preset] };
    const { data: prev } = await supabaseAdmin
      .from("role_permissions").select("id, staff_preset")
      .eq("profile_id", data.member_id).eq("organization_id", data.organization_id).maybeSingle();

    const { error } = await supabaseAdmin.from("role_permissions").upsert(
      {
        profile_id: data.member_id,
        organization_id: data.organization_id,
        ...full,
        id: prev?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,organization_id" },
    );
    if (error) throw new Error(error.message);
    await audit(data.organization_id, userId, "staff_preset_applied", data.member_id,
      { staff_preset: prev?.staff_preset ?? null }, { staff_preset: data.preset });
    return { ok: true };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      member_id: z.string().uuid(),
      organization_id: z.string().uuid(),
      role: z.enum(["manager", "staff", "agent"]),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    await assertMayTargetMember(userId, data.member_id, data.organization_id);
    await assertMemberOfOrg(data.member_id, data.organization_id);
    const { data: prevRoles } = await supabaseAdmin
      .from("user_roles").select("id, role").eq("user_id", data.member_id)
      .in("role", ["manager", "staff", "agent"]);
    // Replace member-tier roles with the chosen one (owner/admin/super rows untouched).
    for (const r of prevRoles ?? []) {
      await supabaseAdmin.from("user_roles").delete().eq("id", r.id);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: data.member_id, role: data.role });

    // Coming back down to agent clears what the higher role granted.
    //
    // It used to leave `role_permissions` exactly as it was, so demoting
    // somebody unassigned the role and none of its access: the row still said
    // staff_view_contracts, staff_is_admin and the rest, the switches were
    // merely hidden because the dialog stops rendering them for an agent, and
    // re-promoting them months later silently restored every grant they used
    // to have. The row survives — it is what the audit trail points at — but
    // every flag in it goes false.
    if (data.role === "agent") {
      const { data: existing } = await supabaseAdmin
        .from("role_permissions").select("id")
        .eq("profile_id", data.member_id).eq("organization_id", data.organization_id).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("role_permissions")
          .update({ ...zeroPerms(), staff_preset: null, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }
    }

    // Manager defaults on first promotion.
    if (data.role === "manager") {
      const { data: existing } = await supabaseAdmin
        .from("role_permissions").select("id")
        .eq("profile_id", data.member_id).eq("organization_id", data.organization_id).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("role_permissions").insert({
          profile_id: data.member_id,
          organization_id: data.organization_id,
          ...zeroPerms(),
          ...MANAGER_DEFAULTS,
        });
      }
    }
    await audit(data.organization_id, userId, "role_changed", data.member_id,
      { roles: (prevRoles ?? []).map((r: any) => r.role) }, { role: data.role });
    return { ok: true };
  });
