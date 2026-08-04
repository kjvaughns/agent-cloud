import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertSameOrg, OrgAccessError } from "@/lib/org-guard";
import { recordAudit, diff } from "@/lib/contracting-ops/audit";
import {
  evaluateReadiness, isSubmittable,
  type Requirement, type RequestContext, type ProducerFacts, type HierarchyFacts,
} from "@/lib/contracting-ops/readiness";
import type { Packet } from "@/lib/contracting-ops/packet";
import { CONTRACTING_METHODS, REQUEST_STATUS_META, SENSITIVE_DOC_TYPES } from "@/lib/contracting-ops/types";

// Generated DB types predate this module's tables; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * Contracting Operations server layer.
 *
 * Reads go through the RLS-bound `context.supabase` wherever the policy already
 * expresses the rule — that keeps the database as the boundary rather than
 * re-implementing tenancy in TypeScript. `supabaseAdmin` appears only where a
 * write genuinely has to cross a policy (readiness caching, audit, ready-to-sell
 * recomputation), and every such call sits behind an explicit capability check.
 */

// ── Capability resolution ───────────────────────────────────────────────────

export type ContractingAccess = {
  orgId: string | null;
  isOwner: boolean;
  canView: boolean;
  canManageCarriers: boolean;
  canManageCompLevels: boolean;
  canManageHierarchy: boolean;
  canManageLicenses: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canAssign: boolean;
  canViewAgencyComp: boolean;
  canViewSensitiveDocs: boolean;
  canExport: boolean;
  canViewAudit: boolean;
};

const NO_ACCESS: ContractingAccess = {
  orgId: null, isOwner: false, canView: false, canManageCarriers: false,
  canManageCompLevels: false, canManageHierarchy: false, canManageLicenses: false,
  canSubmit: false, canApprove: false, canAssign: false, canViewAgencyComp: false,
  canViewSensitiveDocs: false, canExport: false, canViewAudit: false,
};

/**
 * Resolves what the caller may do, mirroring the SQL helpers exactly.
 *
 * The database enforces these rules; this function exists so the UI can hide
 * what it must not offer. It is never the only gate — every mutation below
 * re-checks before writing.
 */
async function resolveAccess(userId: string): Promise<ContractingAccess> {
  const orgId = await getMyPrimaryOrgId(userId);
  if (!orgId) return NO_ACCESS;

  const [{ data: org }, { data: roleRows }, { data: perms }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("role_permissions").select("*")
      .eq("profile_id", userId).eq("organization_id", orgId).maybeSingle(),
  ]);

  const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
  const isOwner = org?.owner_id === userId;
  const isOrgAdmin =
    isOwner ||
    roles.some((r) => ["agency_owner", "admin", "super_admin"].includes(r)) ||
    Boolean(perms?.staff_is_admin && perms?.admin_manage_staff_configs);

  const flag = (k: string) => Boolean(perms?.[k]);
  const or = (...vals: boolean[]) => isOrgAdmin || vals.some(Boolean);

  return {
    orgId,
    isOwner,
    canManageCarriers: or(flag("contracting_manage_carriers")),
    canManageCompLevels: or(flag("contracting_manage_comp_levels")),
    canManageHierarchy: or(flag("contracting_manage_hierarchy")),
    canManageLicenses: or(flag("contracting_manage_licenses")),
    canSubmit: or(flag("contracting_submit"), flag("staff_submit_carrier_requests"), flag("mgr_submit_carrier_requests")),
    canApprove: or(flag("contracting_approve")),
    canAssign: or(flag("contracting_assign_staff")),
    canViewAgencyComp: or(flag("contracting_view_agency_comp"), flag("contracting_manage_comp_levels")),
    canViewSensitiveDocs: or(flag("contracting_view_sensitive_docs")),
    canExport: or(flag("contracting_export")),
    canViewAudit: or(flag("contracting_view_audit")),
    canView: or(
      flag("staff_view_contracts"), flag("contracting_manage_carriers"),
      flag("contracting_submit"), flag("contracting_approve"),
      flag("contracting_assign_staff"), flag("contracting_manage_licenses"),
    ),
  };
}

export const getContractingAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveAccess((context as Ctx).userId));

function requireOrg(access: ContractingAccess): string {
  if (!access.orgId) throw new OrgAccessError("No organization on your account");
  return access.orgId;
}

function deny(message: string): never {
  throw new Error(message);
}

// ── Settings ────────────────────────────────────────────────────────────────

async function getSettings(orgId: string) {
  const { data } = await supabaseAdmin
    .from("org_contracting_settings").select("*").eq("organization_id", orgId).maybeSingle();
  // Defaults mirror the column defaults so a workspace that has never opened
  // Settings behaves identically to one that saved the defaults.
  return data ?? {
    organization_id: orgId,
    pdb_refresh_days: 90,
    license_expiry_warning_days: 45,
    require_manager_review: false,
    require_owner_approval: true,
    require_owner_approval_for_comp_change: true,
    require_owner_approval_for_hierarchy: true,
    default_request_priority: "normal",
    request_sla_days: 7,
    auto_assign_staff_id: null,
    agents_may_request_contracts: true,
    warn_on_duplicate_requests: true,
    notify_on_missing_documents: true,
    notify_on_status_change: true,
  };
}

export const getContractingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await resolveAccess((context as Ctx).userId);
    const orgId = requireOrg(access);
    return { settings: await getSettings(orgId), access };
  });

const SettingsSchema = z.object({
  pdb_refresh_days: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90), z.literal(180), z.literal(365)]),
  license_expiry_warning_days: z.number().int().min(0).max(365),
  require_manager_review: z.boolean(),
  require_owner_approval: z.boolean(),
  require_owner_approval_for_comp_change: z.boolean(),
  require_owner_approval_for_hierarchy: z.boolean(),
  default_request_priority: z.enum(["low", "normal", "high", "urgent"]),
  request_sla_days: z.number().int().min(0).max(365),
  auto_assign_staff_id: z.string().uuid().nullable(),
  agents_may_request_contracts: z.boolean(),
  warn_on_duplicate_requests: z.boolean(),
  notify_on_missing_documents: z.boolean(),
  notify_on_status_change: z.boolean(),
});

export const saveContractingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.isOwner && !access.canManageCarriers) deny("Only the agency owner can change contracting settings.");

    const before = await getSettings(orgId);
    const { error } = await supabaseAdmin
      .from("org_contracting_settings")
      .upsert({ organization_id: orgId, ...data, updated_by: userId }, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);

    const d = diff(before as any, { ...before, ...data } as any);
    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.updated",
      recordType: "org_contracting_settings", recordId: orgId,
      previous: d.previous, next: d.next,
    });
    return { ok: true };
  });

// ── Carrier directory ───────────────────────────────────────────────────────

export const listOrgCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const access = await resolveAccess(userId);
    if (!access.orgId) return { carriers: [], access };

    const { data, error } = await supabase
      .from("org_carriers")
      .select(`
        *,
        carriers ( id, name, logo_url, is_private, website, phone ),
        org_carrier_methods ( id, method, applies_to, target_url, target_email, is_default, sort_order ),
        carrier_requirements ( id, kind, requirement_key, label, necessity, active ),
        carrier_comp_levels ( id, level_name, commission_pct, status )
      `)
      .eq("organization_id", access.orgId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Open-request counts drive the "in progress" badge on each carrier card.
    const { data: counts } = await supabase
      .from("contracting_requests")
      .select("org_carrier_id, status")
      .eq("organization_id", access.orgId);

    const open = new Map<string, number>();
    for (const r of counts ?? []) {
      if (!REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.open) continue;
      open.set(r.org_carrier_id, (open.get(r.org_carrier_id) ?? 0) + 1);
    }

    return {
      access,
      carriers: (data ?? []).map((c: any) => ({
        ...c,
        name: c.carriers?.name ?? "Unnamed carrier",
        logo_url: c.carriers?.logo_url ?? null,
        is_private: c.carriers?.is_private ?? false,
        open_requests: open.get(c.id) ?? 0,
        requirement_count: (c.carrier_requirements ?? []).filter((r: any) => r.active).length,
        comp_level_count: (c.carrier_comp_levels ?? []).filter((l: any) => l.status === "active").length,
      })),
    };
  });

/** Catalog carriers this agency has not added yet, for the add dialog. */
export const listAvailableCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const access = await resolveAccess(userId);
    if (!access.orgId) return { carriers: [] };

    const [{ data: all }, { data: mine }] = await Promise.all([
      supabase.from("carriers").select("id, name, logo_url, is_private").order("name"),
      supabase.from("org_carriers").select("carrier_id").eq("organization_id", access.orgId),
    ]);
    const taken = new Set((mine ?? []).map((r: any) => r.carrier_id));
    return { carriers: (all ?? []).filter((c: any) => !taken.has(c.id)) };
  });

const OrgCarrierSchema = z.object({
  id: z.string().uuid().optional(),
  carrier_id: z.string().uuid().optional(),
  /** Supplied instead of carrier_id to create a carrier the catalog lacks. */
  new_carrier_name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["active", "paused", "not_contracted", "terminated"]).default("active"),
  contracting_portal_url: z.string().url().max(500).nullable().optional(),
  surelc_url: z.string().url().max(500).nullable().optional(),
  invitation_link: z.string().url().max(500).nullable().optional(),
  contracting_email: z.string().email().max(200).nullable().optional(),
  contracting_phone: z.string().max(40).nullable().optional(),
  support_email: z.string().email().max(200).nullable().optional(),
  support_phone: z.string().max(40).nullable().optional(),
  turnaround_days: z.number().int().min(0).max(365).nullable().optional(),
  product_types: z.array(z.string().max(60)).max(30).default([]),
  writing_number_scope: z.enum(["national", "state", "product", "mixed"]).default("national"),
  just_in_time_appointments: z.boolean().default(false),
  transfers_allowed: z.boolean().default(true),
  release_required: z.boolean().default(false),
  release_requirements: z.string().max(2000).nullable().optional(),
  min_production_requirements: z.string().max(2000).nullable().optional(),
  internal_instructions: z.string().max(5000).nullable().optional(),
  staff_notes: z.string().max(5000).nullable().optional(),
});

export const saveOrgCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgCarrierSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.canManageCarriers) deny("You don't have permission to manage carriers.");

    const { id, carrier_id, new_carrier_name, ...fields } = data;

    let resolvedCarrierId = carrier_id ?? null;

    // A carrier the shared catalog does not have becomes a private carrier
    // owned by this agency rather than a new global row.
    if (!resolvedCarrierId && new_carrier_name) {
      const { data: created, error } = await supabaseAdmin
        .from("carriers")
        .insert({
          name: new_carrier_name, active: true, is_private: true,
          owner_organization_id: orgId, created_by: userId,
        })
        .select("id").single();
      if (error) throw new Error(error.message);
      resolvedCarrierId = created.id;
    }

    if (id) {
      const { data: before } = await supabaseAdmin
        .from("org_carriers").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle();
      if (!before) throw new OrgAccessError("That carrier is not in your directory");

      const { error } = await supabaseAdmin
        .from("org_carriers").update({ ...fields, updated_by: userId })
        .eq("id", id).eq("organization_id", orgId);
      if (error) throw new Error(error.message);

      const d = diff(before, { ...before, ...fields });
      await recordAudit({
        organizationId: orgId, actorId: userId, action: "carrier.updated",
        recordType: "org_carriers", recordId: id, previous: d.previous, next: d.next,
      });
      return { ok: true, id };
    }

    if (!resolvedCarrierId) throw new Error("Pick a carrier or enter a new carrier name.");

    const { data: created, error } = await supabaseAdmin
      .from("org_carriers")
      .insert({ organization_id: orgId, carrier_id: resolvedCarrierId, ...fields, created_by: userId, updated_by: userId })
      .select("id").single();
    if (error) {
      if (String(error.message).includes("org_carriers_organization_id_carrier_id_key")) {
        throw new Error("That carrier is already in your directory.");
      }
      throw new Error(error.message);
    }

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.created",
      recordType: "org_carriers", recordId: created.id, next: fields,
    });
    return { ok: true, id: created.id as string };
  });

// ── Submission methods ──────────────────────────────────────────────────────

/**
 * How a carrier takes submissions — the thing the carrier card has been
 * flagging as missing since the table was created.
 *
 * `org_carrier_methods` shipped with a vocabulary, a write policy and a
 * partial unique index guaranteeing one default per carrier. Nothing in the
 * application ever wrote to it, so the card said "No submission method set"
 * to somebody with no way to set one, and every packet fell back to the
 * carrier's portal URL whether or not that was how the carrier wanted it.
 *
 * Many per carrier by design: SureLC for a new contract, email for a hierarchy
 * change. `applies_to` says which kinds of work each one covers, and empty
 * means all of them.
 */
const MethodSchema = z.object({
  id: z.string().uuid().optional(),
  org_carrier_id: z.string().uuid(),
  method: z.enum(CONTRACTING_METHODS),
  applies_to: z.array(z.string().max(50)).max(20).default([]),
  target_url: z.string().url().max(500).nullable().optional(),
  target_email: z.string().email().max(200).nullable().optional(),
  instructions: z.string().max(2000).nullable().optional(),
  is_default: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(999).default(0),
});

export const saveOrgCarrierMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MethodSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.canManageCarriers) deny("You don't have permission to manage carriers.");

    // The carrier has to be this agency's. The RLS policy says so too; this
    // makes the failure a sentence rather than an empty result set.
    const { data: carrier } = await supabaseAdmin
      .from("org_carriers").select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
    if (!carrier) throw new OrgAccessError("That carrier is not in your directory");

    const { id, ...fields } = data;

    // `idx_org_carrier_methods_one_default` is a partial unique index, so a
    // second default is a constraint violation rather than a silent demotion
    // of the first. Clear the incumbent before writing.
    if (fields.is_default) {
      await supabaseAdmin
        .from("org_carrier_methods").update({ is_default: false })
        .eq("org_carrier_id", data.org_carrier_id).eq("organization_id", orgId)
        .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
    }

    if (id) {
      const { data: before } = await supabaseAdmin
        .from("org_carrier_methods").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle();
      if (!before) throw new OrgAccessError("That submission method is not in your directory");

      const { error } = await supabaseAdmin
        .from("org_carrier_methods").update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id).eq("organization_id", orgId);
      if (error) throw new Error(error.message);

      const d = diff(before, { ...before, ...fields });
      await recordAudit({
        organizationId: orgId, actorId: userId, action: "carrier_method.updated",
        recordType: "org_carrier_methods", recordId: id, previous: d.previous, next: d.next,
      });
      return { ok: true, id };
    }

    const { data: created, error } = await supabaseAdmin
      .from("org_carrier_methods")
      .insert({ organization_id: orgId, ...fields })
      .select("id").single();
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier_method.created",
      recordType: "org_carrier_methods", recordId: created.id, next: fields,
    });
    return { ok: true, id: created.id as string };
  });

export const deleteOrgCarrierMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.canManageCarriers) deny("You don't have permission to manage carriers.");

    const { data: before } = await supabaseAdmin
      .from("org_carrier_methods").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!before) throw new OrgAccessError("That submission method is not in your directory");

    // `.select("id")` even though the read above already proved the row is
    // there and ours. The gap between the two statements is small and real, and
    // an audit entry recording a deletion that did not happen is worse than the
    // deletion failing — the log is the thing people trust afterwards.
    const { data: gone, error } = await supabaseAdmin
      .from("org_carrier_methods").delete().eq("id", data.id).eq("organization_id", orgId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("That submission method was already removed.");

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier_method.deleted",
      recordType: "org_carrier_methods", recordId: data.id, previous: before,
    });
    return { ok: true };
  });

// ── Requirements ────────────────────────────────────────────────────────────

const RequirementSchema = z.object({
  id: z.string().uuid().optional(),
  org_carrier_id: z.string().uuid(),
  kind: z.enum(["field", "document"]),
  requirement_key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  help_text: z.string().max(1000).nullable().optional(),
  necessity: z.enum(["required", "optional", "conditional"]).default("required"),
  applies_to_states: z.array(z.string().length(2)).max(60).default([]),
  applies_to_contract_types: z.array(z.string().max(50)).max(20).default([]),
  applies_to_product_lines: z.array(z.string().max(60)).max(30).default([]),
  applies_to_comp_levels: z.array(z.string().max(80)).max(30).default([]),
  transfers_only: z.boolean().default(false),
  hierarchy_changes_only: z.boolean().default(false),
  active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(999).default(0),
});

export const saveCarrierRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequirementSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.canManageCarriers) deny("You don't have permission to manage carrier requirements.");

    // The carrier must be ours — otherwise a valid uuid from another agency
    // would attach a requirement across the tenant boundary.
    const { data: carrier } = await supabaseAdmin
      .from("org_carriers").select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
    if (!carrier) throw new OrgAccessError("That carrier is not in your directory");

    const { id, ...fields } = data;
    const payload = { ...fields, organization_id: orgId, created_by: userId };

    const { data: saved, error } = id
      ? await supabaseAdmin.from("carrier_requirements").update(fields).eq("id", id).eq("organization_id", orgId).select("id").single()
      : await supabaseAdmin.from("carrier_requirements").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier_requirement.changed",
      recordType: "carrier_requirements", recordId: saved.id, next: fields,
    });

    // Requirements change what "ready" means, so every open request for this
    // carrier is stale the moment one is saved.
    await recomputeReadinessForCarrier(orgId, data.org_carrier_id);
    return { ok: true, id: saved.id as string };
  });

export const deleteCarrierRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.canManageCarriers) deny("You don't have permission to manage carrier requirements.");

    const { data: before } = await supabaseAdmin
      .from("carrier_requirements").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!before) throw new OrgAccessError("That requirement is not in your directory");

    // The `before` read above already refuses a requirement outside this org,
    // so this cannot silently match nothing today. Asserted anyway: the audit
    // write below attests to a deletion, and that attestation should rest on
    // the delete itself rather than on a check several lines away that a later
    // edit could move.
    const { data: gone, error } = await supabaseAdmin
      .from("carrier_requirements").delete().eq("id", data.id).eq("organization_id", orgId).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new OrgAccessError("That requirement is not in your directory");

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier_requirement.changed",
      recordType: "carrier_requirements", recordId: data.id, previous: before, next: null,
    });
    await recomputeReadinessForCarrier(orgId, before.org_carrier_id);
    return { ok: true };
  });

// ── Fact gathering for the engine ───────────────────────────────────────────

/**
 * Assembles everything the readiness engine and the packet need for one
 * request. One function so the two can never disagree.
 */
async function gatherFacts(requestId: string, orgId: string): Promise<{
  request: any;
  carrier: any;
  requirements: Requirement[];
  producer: ProducerFacts;
  hierarchy: HierarchyFacts;
  ctx: RequestContext;
  documents: { requirement_key: string; label: string; status: any; is_sensitive: boolean; updated_at: string | null }[];
  agentProfile: any;
  uplineProfile: any;
  ownerProfile: any;
  compLevelName: string | null;
} | null> {
  const { data: request } = await supabaseAdmin
    .from("contracting_requests").select("*").eq("id", requestId).eq("organization_id", orgId).maybeSingle();
  if (!request) return null;

  const [{ data: carrier }, { data: requirements }, { data: states }, { data: agentProfile }, { data: producerProfile }] =
    await Promise.all([
      supabaseAdmin.from("org_carriers")
        .select("*, carriers ( name, logo_url )").eq("id", request.org_carrier_id).maybeSingle(),
      supabaseAdmin.from("carrier_requirements")
        .select("*").eq("org_carrier_id", request.org_carrier_id).eq("active", true).order("sort_order"),
      supabaseAdmin.from("contracting_request_states").select("state_code").eq("request_id", requestId),
      supabaseAdmin.from("profiles")
        .select("id, first_name, last_name, email, phone, npn_number, date_of_birth, state, street_address, city, zip_code, upline_id, organization_id")
        .eq("id", request.agent_id).maybeSingle(),
      supabaseAdmin.from("producer_profiles").select("*").eq("profile_id", request.agent_id).maybeSingle(),
    ]);

  const requestedStates = (states ?? []).map((s: any) => s.state_code);

  const [{ data: licenses }, { data: docs }, { data: hierarchyRow }, { data: compLevel }] = await Promise.all([
    supabaseAdmin.from("state_licenses").select("state_code, status, expires_date").eq("agent_id", request.agent_id),
    supabaseAdmin.from("producer_documents")
      .select("id, doc_type, review_status, is_sensitive, expiration_date, updated_at, created_at")
      .eq("agent_id", request.agent_id),
    supabaseAdmin.from("carrier_hierarchy_records")
      .select("*").eq("org_carrier_id", request.org_carrier_id).eq("agent_id", request.agent_id).maybeSingle(),
    request.requested_comp_level_id
      ? supabaseAdmin.from("carrier_comp_levels").select("level_name").eq("id", request.requested_comp_level_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // A licence counts as active when its status says so and it has not passed
  // its expiry date — a row left at 'active' with a date in the past is stale
  // data, not a licence.
  const today = new Date().toISOString().slice(0, 10);
  const activeLicenseStates = (licenses ?? [])
    .filter((l: any) => ["active", "pending"].includes(l.status) && (!l.expires_date || l.expires_date >= today))
    .map((l: any) => l.state_code);

  // Latest document per type wins; an older approved copy does not mask a
  // newer rejected one.
  const byType = new Map<string, any>();
  for (const d of docs ?? []) {
    const prev = byType.get(d.doc_type);
    const stamp = d.updated_at ?? d.created_at;
    if (!prev || String(stamp) > String(prev.updated_at ?? prev.created_at)) byType.set(d.doc_type, d);
  }

  const documentStatus: ProducerFacts["documents"] = {};
  for (const [type, d] of byType) {
    const expired = d.expiration_date && d.expiration_date < today;
    documentStatus[type] = expired ? "expired" : (d.review_status ?? "uploaded");
  }

  const uplineId = hierarchyRow?.direct_upline_id ?? request.direct_upline_id ?? agentProfile?.upline_id ?? null;
  const [{ data: uplineProfile }, { data: org }] = await Promise.all([
    uplineId
      ? supabaseAdmin.from("profiles").select("id, first_name, last_name, email, phone, npn_number").eq("id", uplineId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from("organizations").select("id, name, owner_id").eq("id", orgId).maybeSingle(),
  ]);
  const { data: ownerProfile } = org?.owner_id
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, npn_number").eq("id", org.owner_id).maybeSingle()
    : { data: null };

  const legalName = [
    producerProfile?.legal_first_name ?? agentProfile?.first_name,
    producerProfile?.legal_middle_name,
    producerProfile?.legal_last_name ?? agentProfile?.last_name,
  ].filter(Boolean).join(" ").trim();

  const address = [agentProfile?.street_address, agentProfile?.city, agentProfile?.state, agentProfile?.zip_code]
    .filter(Boolean).join(", ");

  const producer: ProducerFacts = {
    npn: agentProfile?.npn_number ?? null,
    legal_name: legalName || null,
    email: agentProfile?.email ?? null,
    phone: agentProfile?.phone ?? null,
    date_of_birth: agentProfile?.date_of_birth ?? null,
    resident_state: producerProfile?.resident_state ?? agentProfile?.state ?? null,
    resident_license_number: producerProfile?.resident_license_number ?? null,
    address: address || null,
    active_license_states: activeLicenseStates,
    documents: documentStatus,
  };

  const hierarchy: HierarchyFacts = {
    upline_name: hierarchyRow?.direct_upline_name
      ?? (uplineProfile ? `${uplineProfile.first_name ?? ""} ${uplineProfile.last_name ?? ""}`.trim() : null),
    upline_npn: hierarchyRow?.direct_upline_npn ?? uplineProfile?.npn_number ?? null,
    upline_writing_number: hierarchyRow?.direct_upline_writing_number ?? null,
    upline_comp_level: null,
    agency_writing_number: hierarchyRow?.agency_writing_number ?? null,
    agency_owner_npn: hierarchyRow?.agency_owner_npn ?? ownerProfile?.npn_number ?? null,
    existing_writing_number: null,
  };

  const ctx: RequestContext = {
    contract_type: request.contract_type,
    is_transfer: Boolean(request.is_transfer),
    requested_states: requestedStates,
    product_lines: request.product_lines ?? [],
    requested_comp_level_name: compLevel?.level_name ?? null,
    requested_advance_level: request.requested_advance_level ?? null,
    status: request.status,
  };

  const documents = (requirements ?? [])
    .filter((r: any) => r.kind === "document")
    .map((r: any) => {
      const d = byType.get(r.requirement_key);
      return {
        requirement_key: r.requirement_key,
        label: r.label,
        status: documentStatus[r.requirement_key] ?? "missing",
        is_sensitive: Boolean(d?.is_sensitive) || SENSITIVE_DOC_TYPES.has(r.requirement_key),
        updated_at: d?.updated_at ?? null,
      };
    });

  return {
    request, carrier,
    requirements: (requirements ?? []) as Requirement[],
    producer, hierarchy, ctx, documents,
    agentProfile, uplineProfile, ownerProfile,
    compLevelName: compLevel?.level_name ?? null,
  };
}

/**
 * Does this request still owe an approval the agency requires?
 *
 * Approval is owed while the request sits before the approval gate. Once
 * somebody with the permission moves it to ready_to_submit or beyond, the
 * approval has happened — that transition is the approval.
 */
const PRE_APPROVAL_STATUSES = [
  "draft", "missing_information", "missing_documents", "awaiting_agent", "awaiting_manager",
];

function approvalIsPending(request: any, settings: any): boolean {
  if (request.status === "awaiting_owner_approval") return true;
  if (request.status === "awaiting_manager" && settings.require_manager_review) return true;
  if (!settings.require_owner_approval) return false;
  return PRE_APPROVAL_STATUSES.includes(request.status);
}

/** Recomputes and caches readiness for one request. Returns the result. */
export async function recomputeReadiness(requestId: string, orgId: string) {
  const facts = await gatherFacts(requestId, orgId);
  if (!facts) return null;
  const settings = await getSettings(orgId);

  const result = evaluateReadiness({
    requirements: facts.requirements,
    request: facts.ctx,
    producer: facts.producer,
    hierarchy: facts.hierarchy,
    approvalPending: approvalIsPending(facts.request, settings),
  });

  await supabaseAdmin.from("contracting_requests").update({
    readiness_state: result.state,
    readiness_pct: result.pct,
    readiness_blockers: result.blockers,
    readiness_checked_at: new Date().toISOString(),
  }).eq("id", requestId).eq("organization_id", orgId);

  return result;
}

async function recomputeReadinessForCarrier(orgId: string, orgCarrierId: string) {
  const { data: open } = await supabaseAdmin
    .from("contracting_requests").select("id")
    .eq("organization_id", orgId).eq("org_carrier_id", orgCarrierId)
    .not("status", "in", '("approved","writing_number_issued","declined","cancelled","closed")');
  for (const r of open ?? []) await recomputeReadiness(r.id, orgId);
}

// ── Requests ────────────────────────────────────────────────────────────────

export const listContractingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.string().max(40).optional(),
      assigned_to: z.string().uuid().optional(),
      org_carrier_id: z.string().uuid().optional(),
      agent_id: z.string().uuid().optional(),
      search: z.string().max(120).optional(),
      only_open: z.boolean().optional(),
    }).default({}).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const access = await resolveAccess(userId);
    if (!access.orgId) return { rows: [], access };

    // RLS decides which rows are visible — agents get their own, managers get
    // their downline, contracting staff get the org. No filter is added here
    // for that, deliberately: duplicating the rule invites the two to drift.
    let q = supabase
      .from("contracting_requests")
      .select(`
        id, reference, status, contract_type, priority, readiness_state, readiness_pct,
        due_date, created_at, updated_at, submitted_at, assigned_to, agent_id, org_carrier_id,
        profiles:agent_id ( id, first_name, last_name, email, npn_number ),
        assignee:assigned_to ( id, first_name, last_name ),
        org_carriers ( id, carriers ( name, logo_url ) )
      `)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (data.status) q = q.eq("status", data.status);
    if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);
    if (data.org_carrier_id) q = q.eq("org_carrier_id", data.org_carrier_id);
    if (data.agent_id) q = q.eq("agent_id", data.agent_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let out = (rows ?? []).map((r: any) => ({
      ...r,
      agent_name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
      agent_npn: r.profiles?.npn_number ?? null,
      carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
      assignee_name: r.assignee ? `${r.assignee.first_name ?? ""} ${r.assignee.last_name ?? ""}`.trim() : null,
      days_open: Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)),
      is_overdue: Boolean(r.due_date && r.due_date < new Date().toISOString().slice(0, 10)
        && REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.open),
    }));

    if (data.only_open) {
      out = out.filter((r: any) => REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.open);
    }
    if (data.search) {
      const s = data.search.toLowerCase();
      out = out.filter((r: any) =>
        r.agent_name.toLowerCase().includes(s) ||
        String(r.agent_npn ?? "").includes(s) ||
        r.carrier_name.toLowerCase().includes(s) ||
        String(r.reference ?? "").toLowerCase().includes(s));
    }
    return { rows: out, access };
  });

const CreateRequestSchema = z.object({
  agent_id: z.string().uuid(),
  org_carrier_id: z.string().uuid(),
  contract_type: z.enum([
    "new_contract", "state_appointment", "product_line_addition", "transfer", "release",
    "recontract", "comp_level_change", "hierarchy_change", "writing_number_correction",
    "appointment_reinstatement", "other",
  ]).default("new_contract"),
  product_lines: z.array(z.string().max(60)).max(20).default([]),
  requested_states: z.array(z.string().length(2)).max(60).default([]),
  requested_comp_level_id: z.string().uuid().nullable().optional(),
  requested_advance_level: z.string().max(60).nullable().optional(),
  direct_upline_id: z.string().uuid().nullable().optional(),
  desired_effective_date: z.string().max(10).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  is_transfer: z.boolean().default(false),
  notes: z.string().max(4000).nullable().optional(),
});

export const createContractingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateRequestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    const settings = await getSettings(orgId);

    // Opening a request for somebody else requires either that they are in
    // your downline or that you process contracting for the agency.
    if (data.agent_id !== userId) {
      await assertSameOrg(userId, data.agent_id);
      if (!access.canSubmit) {
        const { data: isDownline } = await supabaseAdmin
          .rpc("is_in_downline", { _upline: userId, _target: data.agent_id });
        if (!isDownline) deny("You can only open requests for agents you manage.");
      }
    } else if (!settings.agents_may_request_contracts && !access.canSubmit) {
      deny("Your agency asks that carrier requests be opened by a manager.");
    }

    const { data: carrier } = await supabaseAdmin
      .from("org_carriers").select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
    if (!carrier) throw new OrgAccessError("That carrier is not in your directory");

    const { requested_states, ...fields } = data;

    const dueDate = settings.request_sla_days > 0
      ? new Date(Date.now() + settings.request_sla_days * 86_400_000).toISOString().slice(0, 10)
      : null;

    const { data: created, error } = await supabaseAdmin
      .from("contracting_requests")
      .insert({
        ...fields,
        organization_id: orgId,
        priority: data.priority ?? settings.default_request_priority,
        due_date: dueDate,
        assigned_to: settings.auto_assign_staff_id ?? null,
        assigned_at: settings.auto_assign_staff_id ? new Date().toISOString() : null,
        created_by: userId,
        status: "draft",
      })
      .select("id, reference").single();

    if (error) {
      // The partial unique index is the real duplicate guard; this turns it
      // into a sentence an agency owner understands.
      if (String(error.message).includes("idx_contracting_requests_no_duplicate_open")) {
        throw new Error("There is already an open request for this agent, carrier and request type.");
      }
      throw new Error(error.message);
    }

    if (requested_states.length) {
      await supabaseAdmin.from("contracting_request_states").insert(
        requested_states.map((s) => ({ organization_id: orgId, request_id: created.id, state_code: s })),
      );
    }

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "request.created",
      recordType: "contracting_requests", recordId: created.id,
      subjectAgentId: data.agent_id, next: { ...fields, requested_states },
    });

    const readiness = await recomputeReadiness(created.id, orgId);
    return { ok: true, id: created.id as string, reference: created.reference as string, readiness };
  });

export const getContractingRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);

    // Read through RLS first: if the caller may not see this request, the
    // select returns nothing and the service-role work below never runs.
    const { data: visible } = await supabase
      .from("contracting_requests").select("id").eq("id", data.id).maybeSingle();
    if (!visible) throw new OrgAccessError("That request is not available to you");

    const facts = await gatherFacts(data.id, orgId);
    if (!facts) throw new Error("Request not found");

    const settings = await getSettings(orgId);
    const readiness = evaluateReadiness({
      requirements: facts.requirements,
      request: facts.ctx,
      producer: facts.producer,
      hierarchy: facts.hierarchy,
      approvalPending: approvalIsPending(facts.request, settings),
    });

    const isStaff = access.canSubmit || access.canApprove || access.canManageCarriers;

    const [{ data: history }, { data: methods }, { data: submissions }] = await Promise.all([
      supabase.from("contracting_status_history")
        .select("*").eq("request_id", data.id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("org_carrier_methods")
        .select("*").eq("org_carrier_id", facts.request.org_carrier_id).order("sort_order"),
      supabase.from("contracting_submissions")
        .select("id, artifact_type, method, generated_at, generated_by, marked_submitted_at, confirmation_reference")
        .eq("request_id", data.id).order("generated_at", { ascending: false }).limit(20),
    ]);

    const agent = facts.agentProfile;
    const upline = facts.uplineProfile;
    const owner = facts.ownerProfile;
    const method = (methods ?? []).find((m: any) => m.is_default) ?? (methods ?? [])[0] ?? null;

    const packet: Packet = {
      agency_name: null,
      agent: {
        full_legal_name: facts.producer.legal_name,
        preferred_name: agent?.first_name ?? null,
        npn: facts.producer.npn,
        email: facts.producer.email,
        phone: facts.producer.phone,
        // Date of birth only where a requirement actually asks for it.
        date_of_birth: facts.requirements.some((r) => r.requirement_key === "date_of_birth")
          ? facts.producer.date_of_birth : null,
        resident_state: facts.producer.resident_state,
        resident_license_number: facts.producer.resident_license_number,
        address: facts.producer.address,
      },
      hierarchy: {
        upline_name: facts.hierarchy.upline_name,
        upline_npn: facts.hierarchy.upline_npn,
        upline_email: upline?.email ?? null,
        upline_phone: upline?.phone ?? null,
        upline_writing_number: facts.hierarchy.upline_writing_number,
        upline_comp_level: facts.hierarchy.upline_comp_level,
        agency_owner_name: owner ? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() : null,
        agency_owner_npn: facts.hierarchy.agency_owner_npn,
        agency_writing_number: facts.hierarchy.agency_writing_number,
        hierarchy_path: null,
      },
      request: {
        reference: facts.request.reference,
        contract_type: facts.request.contract_type,
        requested_states: facts.ctx.requested_states,
        product_lines: facts.ctx.product_lines,
        requested_comp_level: facts.compLevelName,
        requested_advance_level: facts.request.requested_advance_level,
        desired_effective_date: facts.request.desired_effective_date,
        existing_writing_number: facts.hierarchy.existing_writing_number,
        notes: facts.request.notes,
      },
      carrier: {
        name: facts.carrier?.carriers?.name ?? "Carrier",
        method: method?.method ?? null,
        portal_url: method?.target_url ?? facts.carrier?.contracting_portal_url ?? null,
        surelc_url: facts.carrier?.surelc_url ?? null,
        invitation_link: facts.carrier?.invitation_link ?? null,
        contracting_email: method?.target_email ?? facts.carrier?.contracting_email ?? null,
        support_email: facts.carrier?.support_email ?? null,
        support_phone: facts.carrier?.support_phone ?? null,
        turnaround_days: facts.carrier?.turnaround_days ?? null,
        instructions: method?.instructions ?? facts.carrier?.internal_instructions ?? null,
      },
      documents: facts.documents,
      readiness,
    };

    return {
      access,
      request: {
        ...facts.request,
        // Internal notes are staff-only. Stripping the field server-side means
        // it never reaches a browser that should not have it, which is the only
        // version of this rule that actually holds.
        internal_notes: isStaff ? facts.request.internal_notes : null,
      },
      packet,
      readiness,
      methods: methods ?? [],
      submissions: submissions ?? [],
      history: (history ?? []).map((h: any) => ({
        ...h,
        internal_message: isStaff ? h.internal_message : null,
      })),
    };
  });

const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "draft", "missing_information", "missing_documents", "awaiting_agent", "awaiting_manager",
    "awaiting_owner_approval", "ready_to_submit", "assigned", "submitted", "carrier_reviewing",
    "nigo", "additional_info_requested", "approved", "writing_number_issued", "declined",
    "cancelled", "closed",
  ]),
  agent_visible_message: z.string().max(2000).nullable().optional(),
  internal_message: z.string().max(2000).nullable().optional(),
  next_action: z.string().max(300).nullable().optional(),
  due_date: z.string().max(10).nullable().optional(),
  confirmation_reference: z.string().max(120).nullable().optional(),
  decline_reason: z.string().max(1000).nullable().optional(),
  // `writing_number_issued` is the one status that names a fact the request
  // cannot otherwise carry. Without this field the workflow could reach its
  // final state and the number the carrier issued was recorded nowhere — the
  // step the whole queue exists to produce had no way to produce it.
  writing_number: z.string().trim().max(64).nullable().optional(),
});

/**
 * Write the contract this request produced into the contract record.
 *
 * The two tables are one system in two layers: contracting_requests is the
 * work, contract_requests is the resulting contract — the row the agent's
 * Contracts page, the commission levels and every import already read.
 * contract_record_id was built to join them and nothing ever set it.
 *
 * Never throws. An approval that succeeded must not be reported as failed
 * because its bookkeeping did; the request status is the source of truth and a
 * missing record can be reconciled, whereas a rolled-back approval cannot.
 */
async function syncContractRecord(
  request: any, status: string, now: string, writingNumber?: string | null,
) {
  try {
    const { data: orgCarrier } = await supabaseAdmin
      .from("org_carriers").select("carrier_id").eq("id", request.org_carrier_id).maybeSingle();
    if (!orgCarrier?.carrier_id) return;

    const patch: Record<string, unknown> = {
      agent_id: request.agent_id,
      carrier_id: orgCarrier.carrier_id,
      organization_id: request.organization_id,
      // A writing number means the carrier has appointed them; approval alone
      // means the paperwork cleared internally.
      status: status === "writing_number_issued" ? "active" : "processing",
    };
    if (status === "writing_number_issued") {
      patch.activated_at = now;
      patch.effective_date = request.desired_effective_date ?? null;

      const number = writingNumber?.trim();
      if (number) {
        // The authoritative store. `source: 'request_outcome'` is the strongest
        // provenance the workflow can produce — this number came out of the
        // carrier's own decision, not somebody typing it in.
        const { error: wnErr } = await supabaseAdmin.from("writing_numbers").insert({
          organization_id: request.organization_id,
          agent_id: request.agent_id,
          org_carrier_id: request.org_carrier_id,
          writing_number: number,
          number_type: "individual",
          scope: "national",
          status: "active",
          source: "request_outcome",
          request_id: request.id,
        });
        // 23505: already recorded, which is the end state we wanted.
        if (wnErr && wnErr.code !== "23505") {
          console.error("[contracting] writing number not recorded", wnErr);
        }
        // Still written: see the note on the dual write in
        // @/lib/writing-numbers. Removed once 20260802220000 is applied.
        patch.writing_number = number;
      }
    }

    const { data: record } = await supabaseAdmin
      .from("contract_requests")
      .upsert(patch, { onConflict: "agent_id,carrier_id" })
      .select("id")
      .maybeSingle();

    if (record?.id && !request.contract_record_id) {
      await supabaseAdmin
        .from("contracting_requests")
        .update({ contract_record_id: record.id })
        .eq("id", request.id);
    }
  } catch (e) {
    console.error("[contracting] contract record sync failed", e);
  }
}

export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);

    const { data: before } = await supabaseAdmin
      .from("contracting_requests").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!before) throw new OrgAccessError("That request is not available to you");

    const isOwnAgentAction = before.agent_id === userId;
    if (!access.canSubmit && !access.canApprove && !isOwnAgentAction) {
      deny("You don't have permission to change this request's status.");
    }
    if (["approved", "declined", "writing_number_issued"].includes(data.status) && !access.canApprove && !access.canSubmit) {
      deny("Only contracting staff or the agency owner can record a carrier decision.");
    }

    // The gate. Readiness is recomputed here rather than trusting the cached
    // column, because the cache is only as fresh as the last write.
    if (["ready_to_submit", "submitted"].includes(data.status)) {
      const readiness = await recomputeReadiness(data.id, orgId);
      if (readiness && !isSubmittable(readiness)) {
        const first = readiness.blockers.slice(0, 3).map((b) => b.label).join(", ");
        throw new Error(
          `This request still has ${readiness.blockers.length} outstanding item${readiness.blockers.length === 1 ? "" : "s"}: ${first}.`,
        );
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    if (data.status === "submitted") { patch.submitted_at = now; patch.submitted_by = userId; }
    if (data.status === "approved") patch.approved_at = now;
    if (data.status === "declined") { patch.declined_at = now; patch.decline_reason = data.decline_reason ?? null; }
    if (data.status === "closed") patch.closed_at = now;
    if (data.confirmation_reference) patch.carrier_confirmation_number = data.confirmation_reference;

    const { error } = await supabaseAdmin
      .from("contracting_requests").update(patch).eq("id", data.id).eq("organization_id", orgId);
    if (error) throw new Error(error.message);

    // Finishing the work produces a contract. contract_requests is where a
    // contract record lives — it is what the agent's own Contracts page, the
    // commission engine and every import read — and contract_record_id exists
    // to point at it. Nothing used to write either, so a request could be
    // approved here and the agent would still show as uncontracted everywhere
    // else.
    if (["approved", "writing_number_issued"].includes(data.status)) {
      await syncContractRecord(before, data.status, now, data.writing_number);
    }

    // The trigger records the bare transition; this adds the human context.
    if (data.agent_visible_message || data.internal_message || data.next_action) {
      await supabaseAdmin.from("contracting_status_history").insert({
        organization_id: orgId, request_id: data.id,
        from_status: before.status, to_status: data.status, changed_by: userId,
        agent_visible_message: data.agent_visible_message ?? null,
        internal_message: data.internal_message ?? null,
        next_action: data.next_action ?? null,
        due_date: data.due_date ?? null,
      });
    }

    await recordAudit({
      organizationId: orgId, actorId: userId,
      action: data.status === "submitted" ? "request.submitted"
        : data.status === "approved" ? "request.approved"
        : data.status === "declined" ? "request.declined"
        : "request.status_changed",
      recordType: "contracting_requests", recordId: data.id,
      subjectAgentId: before.agent_id,
      previous: { status: before.status }, next: { status: data.status },
    });

    await notifyAgent(before.agent_id, orgId, data.status, data.agent_visible_message ?? null, before.reference);
    await recomputeReadiness(data.id, orgId);
    return { ok: true };
  });

/** Agent-facing notification. Internal transitions stay internal. */
async function notifyAgent(
  agentId: string, orgId: string, status: string, message: string | null, reference: string | null,
) {
  const settings = await getSettings(orgId);
  if (!settings.notify_on_status_change) return;

  const AGENT_VISIBLE: Record<string, string> = {
    missing_information: "Your carrier request needs more information",
    missing_documents: "Your carrier request needs a document",
    awaiting_agent: "Your carrier request is waiting on you",
    submitted: "Your carrier request was submitted",
    approved: "Your carrier contract was approved",
    writing_number_issued: "Your writing number was issued",
    declined: "Your carrier request was declined",
    nigo: "Your carrier request needs attention",
  };
  const title = AGENT_VISIBLE[status];
  if (!title) return;

  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: agentId,
      title,
      description: message ?? (reference ? `Request ${reference}` : null),
      type: "contracting",
    });
  } catch (err) {
    console.error("[contracting] notification failed", err);
  }
}

// ── Overview ────────────────────────────────────────────────────────────────

export const getContractingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const access = await resolveAccess(userId);
    if (!access.orgId) return { access, metrics: null };
    const orgId = access.orgId;
    const settings = await getSettings(orgId);
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: requests }, { data: ready }, { data: hierarchyChanges }, { data: members }] =
      await Promise.all([
        supabase.from("contracting_requests")
          .select("id, status, readiness_state, due_date, assigned_to, org_carrier_id, created_at, submitted_at, approved_at"),
        supabase.from("ready_to_sell_records").select("agent_id, status"),
        supabase.from("hierarchy_change_requests").select("id, status"),
        supabaseAdmin.from("organization_memberships")
          .select("profile_id").eq("organization_id", orgId).eq("status", "active"),
      ]);

    const rows = requests ?? [];
    const open = rows.filter((r: any) => REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.open);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    const workload: Record<string, number> = {};
    for (const r of open) if (r.assigned_to) workload[r.assigned_to] = (workload[r.assigned_to] ?? 0) + 1;

    // Average carrier turnaround, measured only on requests that completed
    // both ends of the journey.
    const turnarounds = rows
      .filter((r: any) => r.submitted_at && r.approved_at)
      .map((r: any) => (new Date(r.approved_at).getTime() - new Date(r.submitted_at).getTime()) / 86_400_000);
    const avgTurnaround = turnarounds.length
      ? Math.round((turnarounds.reduce((a: number, b: number) => a + b, 0) / turnarounds.length) * 10) / 10
      : null;

    // Licensing health across the agency.
    const memberIds = (members ?? []).map((m: any) => m.profile_id);
    const warnBy = new Date(Date.now() + settings.license_expiry_warning_days * 86_400_000)
      .toISOString().slice(0, 10);

    const [{ data: expiring }, { data: reviews }] = await Promise.all([
      memberIds.length
        ? supabaseAdmin.from("state_licenses")
            .select("agent_id, state_code, expires_date")
            .in("agent_id", memberIds)
            .not("expires_date", "is", null)
            .lte("expires_date", warnBy)
        : Promise.resolve({ data: [] }),
      supabaseAdmin.from("pdb_reviews")
        .select("agent_id, status, next_review_date").eq("organization_id", orgId),
    ]);

    const withPdb = new Set((reviews ?? []).filter((r: any) => r.status === "verified").map((r: any) => r.agent_id));
    const stalePdb = (reviews ?? []).filter(
      (r: any) => r.status === "verified" && r.next_review_date && r.next_review_date < today,
    ).length;

    return {
      access,
      metrics: {
        active_agents: memberIds.length,
        agents_ready_to_sell: new Set((ready ?? []).filter((r: any) => r.status === "ready").map((r: any) => r.agent_id)).size,
        in_progress: open.length,
        ready_to_submit: rows.filter((r: any) => r.status === "ready_to_submit").length,
        nigo: rows.filter((r: any) => ["nigo", "additional_info_requested"].includes(r.status)).length,
        overdue: open.filter((r: any) => r.due_date && r.due_date < today).length,
        missing_pdb: Math.max(0, memberIds.length - withPdb.size),
        stale_pdb: stalePdb,
        expiring_licenses: (expiring ?? []).length,
        pending_hierarchy_changes: (hierarchyChanges ?? []).filter(
          (h: any) => !["applied", "declined", "cancelled"].includes(h.status)).length,
        avg_turnaround_days: avgTurnaround,
        by_status: byStatus,
        workload,
      },
    };
  });
