import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

// Generated DB types predate the role_permissions migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

// ── Permission keys ──────────────────────────────────────────────────────────

export const MANAGER_PERMS = [
  "mgr_view_all_agents", "mgr_edit_agent_profiles", "mgr_post_deals_for_agents",
  "mgr_view_agent_commissions", "mgr_view_team_analytics", "mgr_access_recruiting",
  "mgr_submit_carrier_requests", "mgr_manage_onboarding", "mgr_view_client_records",
  "mgr_edit_client_records",
] as const;

export const STAFF_PERMS = [
  "staff_view_clients", "staff_edit_clients", "staff_delete_clients",
  "staff_view_policies", "staff_post_policies", "staff_edit_policies",
  "staff_view_commissions",
  "staff_view_recruiting", "staff_edit_recruiting", "staff_move_recruiting_stages",
  "staff_view_contracts", "staff_submit_carrier_requests", "staff_edit_contracts",
  "staff_view_analytics",
  "staff_view_all_tickets", "staff_respond_tickets",
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
    staff_view_clients: true, staff_view_policies: true, staff_view_all_tickets: true,
    staff_preset: "contracting_specialist",
  },
  client_services: {
    staff_view_clients: true, staff_edit_clients: true, staff_delete_clients: true,
    staff_view_policies: true, staff_view_all_tickets: true, staff_respond_tickets: true,
    staff_preset: "client_services",
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
async function assertCanManagePermissions(userId: string, orgId: string) {
  const { data: org } = await supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
  if (org?.owner_id === userId) return "owner";
  const { data: rp } = await supabaseAdmin
    .from("role_permissions")
    .select("staff_is_admin, admin_manage_staff_configs")
    .eq("profile_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (rp?.staff_is_admin && rp?.admin_manage_staff_configs) return "admin_staff";
  throw new Error("Only the agency owner (or admin staff) can manage permissions");
}

// ── My access: role + permissions + solo detection (drives nav + billing UI) ─

export type MyAccess = {
  role: string | null;
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

    return {
      role: pick,
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
    const { data: org } = await supabaseAdmin
      .from("organizations").select("id, owner_id").eq("owner_id", userId).maybeSingle();
    let orgId = org?.id as string | undefined;
    if (!orgId) {
      // Admin staff path
      const { data: profile } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
      if (profile?.organization_id) {
        await assertCanManagePermissions(userId, profile.organization_id);
        orgId = profile.organization_id;
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
      members: (members ?? []).map((m: any) => ({
        ...m,
        roles: roleByUser.get(m.id) ?? ["agent"],
        permissions: permByUser.get(m.id) ?? null,
        isOwner: m.id === (org?.owner_id ?? null),
      })),
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
    await assertCanManagePermissions(userId, data.organization_id);

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

export const applyStaffPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      member_id: z.string().uuid(),
      organization_id: z.string().uuid(),
      preset: z.enum(["admin", "recruiter", "contracting_specialist", "client_services"]),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    await assertCanManagePermissions(userId, data.organization_id);

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
    await assertCanManagePermissions(userId, data.organization_id);
    const { data: prevRoles } = await supabaseAdmin
      .from("user_roles").select("id, role").eq("user_id", data.member_id)
      .in("role", ["manager", "staff", "agent"]);
    // Replace member-tier roles with the chosen one (owner/admin/super rows untouched).
    for (const r of prevRoles ?? []) {
      await supabaseAdmin.from("user_roles").delete().eq("id", r.id);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: data.member_id, role: data.role });

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
