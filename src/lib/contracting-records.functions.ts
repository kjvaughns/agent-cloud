import { createServerFn } from "@tanstack/react-start";
import { loadEffectiveContractingSettings } from "@/lib/contracting-ops/effective-settings.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertSameOrg, OrgAccessError } from "@/lib/org-guard";
import { recordAudit, diff, recordDocumentAccess } from "@/lib/contracting-ops/audit";
import {
  evaluateReadiness,
  type Requirement, type ProducerFacts, type HierarchyFacts,
} from "@/lib/contracting-ops/readiness";
import { visibleLicensingAgents } from "@/lib/licensing-visibility";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * Records: writing numbers, compensation levels, carrier hierarchies, licensing
 * and documents.
 *
 * Split from contracting-ops.functions.ts to keep each file readable rather
 * than because the boundary is architectural — they share the same access
 * resolution and audit helpers.
 */

/** Local copy of the capability resolution, kept in step with the SQL helpers. */
async function resolveAccess(userId: string) {
  const orgId = await getMyPrimaryOrgId(userId);
  if (!orgId) return { orgId: null as string | null, isOrgAdmin: false, perms: {} as any };

  const [{ data: org }, { data: roleRows }, { data: perms }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("role_permissions").select("*")
      .eq("profile_id", userId).eq("organization_id", orgId).maybeSingle(),
  ]);
  const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
  const isOrgAdmin =
    org?.owner_id === userId ||
    roles.some((r) => ["agency_owner", "admin", "super_admin"].includes(r)) ||
    Boolean(perms?.staff_is_admin && perms?.admin_manage_staff_configs);
  return { orgId, isOrgAdmin, perms: perms ?? {} };
}

async function requireCapability(userId: string, flags: string[], message: string) {
  const a = await resolveAccess(userId);
  if (!a.orgId) throw new OrgAccessError("No organization on your account");
  if (a.isOrgAdmin) return a.orgId;
  if (flags.some((f) => Boolean((a.perms as any)[f]))) return a.orgId;
  throw new Error(message);
}

// ── Agent roster, used by every picker in the module ────────────────────────

export const listOrgAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { agents: [] };

    const { data: members } = await supabaseAdmin
      .from("organization_memberships")
      .select("profile_id, role")
      .eq("organization_id", orgId).eq("status", "active");

    const ids = (members ?? []).map((m: any) => m.profile_id);
    if (!ids.length) return { agents: [] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, npn_number, upline_id, status")
      .in("id", ids)
      .order("last_name");

    const roleBy = new Map((members ?? []).map((m: any) => [m.profile_id, m.role]));
    return {
      agents: (profiles ?? []).map((p: any) => ({
        id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Unnamed",
        email: p.email,
        npn: p.npn_number,
        upline_id: p.upline_id,
        role: roleBy.get(p.id) ?? "agent",
        status: p.status,
      })),
    };
  });

// ── Writing numbers ─────────────────────────────────────────────────────────

export const listWritingNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { rows: [] };

    // RLS scopes this: agents see their own, managers their downline.
    const { data, error } = await supabase
      .from("writing_numbers")
      .select(`
        *,
        profiles:agent_id ( id, first_name, last_name, npn_number ),
        org_carriers ( id, carriers ( name ) ),
        carrier_comp_levels ( level_name )
      `)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    return {
      rows: (data ?? []).map((r: any) => ({
        ...r,
        agent_name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
        agent_npn: r.profiles?.npn_number ?? null,
        carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
        comp_level_name: r.carrier_comp_levels?.level_name ?? null,
      })),
    };
  });

const WritingNumberSchema = z.object({
  id: z.string().uuid().optional(),
  agent_id: z.string().uuid(),
  org_carrier_id: z.string().uuid(),
  writing_number: z.string().trim().min(1).max(64),
  number_type: z.enum(["individual", "agency", "hierarchy", "state_specific", "product_specific"]).default("individual"),
  scope: z.enum(["national", "state", "product"]).default("national"),
  state_code: z.string().length(2).nullable().optional(),
  product_line: z.string().max(60).nullable().optional(),
  effective_date: z.string().max(10).nullable().optional(),
  termination_date: z.string().max(10).nullable().optional(),
  status: z.enum(["active", "pending", "terminated", "suspended", "unknown"]).default("active"),
  comp_level_id: z.string().uuid().nullable().optional(),
  advance_level: z.string().max(60).nullable().optional(),
  upline_writing_number: z.string().max(64).nullable().optional(),
  upline_npn: z.string().max(32).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const saveWritingNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WritingNumberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(
      userId,
      ["contracting_manage_carriers", "contracting_submit", "staff_submit_carrier_requests"],
      "You don't have permission to manage writing numbers.",
    );
    await assertSameOrg(userId, data.agent_id);

    const { data: carrier } = await supabaseAdmin
      .from("org_carriers").select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
    if (!carrier) throw new OrgAccessError("That carrier is not in your directory");

    // A state-scoped number without a state is a data error that only shows up
    // months later when Ready to Sell says the wrong thing.
    if (data.scope === "state" && !data.state_code) throw new Error("Pick a state for a state-specific writing number.");
    if (data.scope === "product" && !data.product_line) throw new Error("Pick a product line for a product-specific writing number.");

    const { id, ...fields } = data;
    const { data: saved, error } = id
      ? await supabaseAdmin.from("writing_numbers")
          .update({ ...fields, updated_by: userId }).eq("id", id).eq("organization_id", orgId).select("id").single()
      : await supabaseAdmin.from("writing_numbers")
          .insert({ ...fields, organization_id: orgId, created_by: userId, updated_by: userId, source: "manual_entry" })
          .select("id").single();

    if (error) {
      if (String(error.message).includes("idx_writing_numbers_unique")) {
        throw new Error("That writing number is already recorded for this agent, carrier, state and product.");
      }
      throw new Error(error.message);
    }

    await recordAudit({
      organizationId: orgId, actorId: userId,
      action: id ? "writing_number.updated" : "writing_number.created",
      recordType: "writing_numbers", recordId: saved.id, subjectAgentId: data.agent_id, next: fields,
    });
    return { ok: true, id: saved.id as string };
  });

export const deleteWritingNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_carriers"],
      "You don't have permission to remove writing numbers.");

    const { data: before } = await supabaseAdmin
      .from("writing_numbers").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!before) throw new OrgAccessError("That writing number is not available to you");

    // As above in contracting-ops: guarded by the `before` read, asserted anyway
    // so the audit entry that follows rests on the delete rather than on a check
    // a later edit could move.
    const { data: gone, error } = await supabaseAdmin
      .from("writing_numbers").delete().eq("id", data.id).eq("organization_id", orgId).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new OrgAccessError("That writing number is not available to you");

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "writing_number.deleted",
      recordType: "writing_numbers", recordId: data.id, subjectAgentId: before.agent_id, previous: before,
    });
    return { ok: true };
  });

// ── Compensation levels ─────────────────────────────────────────────────────

export const listAgencyLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { rows: [] };
    const { data, error } = await supabaseAdmin.from("agency_levels")
      .select("*, agency_level_carrier_mappings(*, org_carriers(id, carriers(name)))")
      .eq("organization_id", orgId).order("sort_order").order("base_pct");
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const saveAgencyLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80),
    base_pct: z.number().min(0).max(500),
    sort_order: z.number().int().min(0).max(999).default(0),
    can_invite: z.boolean().default(false),
    active: z.boolean().default(true),
    mappings: z.array(z.object({
      org_carrier_id: z.string().uuid(),
      carrier_level_name: z.string().trim().max(80).nullable().optional(),
      carrier_pct: z.number().min(0).max(500).nullable().optional(),
    })).max(100).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_comp_levels"],
      "You don't have permission to manage agency levels.");
    const { id, mappings, ...fields } = data;
    const q = id
      ? supabaseAdmin.from("agency_levels").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", orgId)
      : supabaseAdmin.from("agency_levels").insert({ ...fields, organization_id: orgId });
    const { data: saved, error } = await q.select("id").single();
    if (error) throw new Error(error.message.includes("agency_levels_organization_id_name_key") ? "That agency level already exists." : error.message);
    if (mappings.length) {
      const { error: mappingError } = await supabaseAdmin.from("agency_level_carrier_mappings").upsert(
        mappings.map((m) => ({ ...m, organization_id: orgId, agency_level_id: saved.id, updated_at: new Date().toISOString() })),
        { onConflict: "agency_level_id,org_carrier_id" },
      );
      if (mappingError) throw new Error(mappingError.message);
    }
    return { ok: true, id: saved.id as string };
  });

export const listCompLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { rows: [], mappings: [] };

    // Comp levels are compensation data — the policy restricts this to people
    // granted it, so an empty result here is a permission answer, not an error.
    const [{ data: levels }, { data: mappings }] = await Promise.all([
      supabase.from("carrier_comp_levels")
        .select("*, org_carriers ( id, carriers ( name ) )")
        .order("sort_order"),
      supabase.from("org_role_comp_mappings")
        .select("*, carrier_comp_levels ( level_name ), org_carriers ( id, carriers ( name ) )"),
    ]);

    return {
      rows: (levels ?? []).map((l: any) => ({
        ...l, carrier_name: l.org_carriers?.carriers?.name ?? "Carrier",
      })),
      mappings: (mappings ?? []).map((m: any) => ({
        ...m,
        carrier_name: m.org_carriers?.carriers?.name ?? "Carrier",
        level_name: m.carrier_comp_levels?.level_name ?? null,
      })),
    };
  });

const CompLevelSchema = z.object({
  id: z.string().uuid().optional(),
  org_carrier_id: z.string().uuid(),
  level_name: z.string().trim().min(1).max(80),
  commission_pct: z.number().min(0).max(500).nullable().optional(),
  advance_months: z.number().int().min(0).max(24).nullable().optional(),
  advance_pct: z.number().min(0).max(100).nullable().optional(),
  renewal_pct: z.number().min(0).max(100).nullable().optional(),
  chargeback_rules: z.string().max(2000).nullable().optional(),
  role_eligibility: z.array(z.string().max(40)).max(12).default([]),
  min_production_requirements: z.string().max(1000).nullable().optional(),
  effective_date: z.string().max(10).nullable().optional(),
  status: z.enum(["active", "inactive", "retired"]).default("active"),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).default(0),
});

export const saveCompLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompLevelSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_comp_levels"],
      "You don't have permission to manage compensation levels.");

    const { data: carrier } = await supabaseAdmin
      .from("org_carriers").select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
    if (!carrier) throw new OrgAccessError("That carrier is not in your directory");

    const { id, ...fields } = data;
    const { data: before } = id
      ? await supabaseAdmin.from("carrier_comp_levels").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle()
      : { data: null };

    const { data: saved, error } = id
      ? await supabaseAdmin.from("carrier_comp_levels")
          .update({ ...fields, updated_by: userId }).eq("id", id).eq("organization_id", orgId).select("id").single()
      : await supabaseAdmin.from("carrier_comp_levels")
          .insert({ ...fields, organization_id: orgId, created_by: userId, updated_by: userId }).select("id").single();

    if (error) {
      if (String(error.message).includes("carrier_comp_levels_org_carrier_id_level_name_key")) {
        throw new Error("That level name already exists for this carrier.");
      }
      throw new Error(error.message);
    }

    const d = diff(before ?? undefined, { ...(before ?? {}), ...fields });
    await recordAudit({
      organizationId: orgId, actorId: userId,
      action: id ? "comp_level.updated" : "comp_level.created",
      recordType: "carrier_comp_levels", recordId: saved.id,
      previous: d.previous, next: d.next,
    });
    return { ok: true, id: saved.id as string };
  });

export const saveRoleCompMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    org_carrier_id: z.string().uuid(),
    internal_role: z.string().trim().min(1).max(40),
    comp_level_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_comp_levels"],
      "You don't have permission to map roles to compensation levels.");

    const { error } = await supabaseAdmin.from("org_role_comp_mappings").upsert(
      { organization_id: orgId, ...data },
      { onConflict: "org_carrier_id,internal_role" },
    );
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "comp_level.updated",
      recordType: "org_role_comp_mappings", next: data,
    });
    return { ok: true };
  });

// ── Carrier hierarchies ─────────────────────────────────────────────────────

export const listCarrierHierarchies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { rows: [] };

    const { data, error } = await supabase
      .from("carrier_hierarchy_records")
      .select(`
        *,
        profiles:agent_id ( id, first_name, last_name, npn_number ),
        upline:direct_upline_id ( id, first_name, last_name, npn_number ),
        org_carriers ( id, carriers ( name ) ),
        carrier_comp_levels:current_comp_level_id ( level_name )
      `)
      .limit(1000);
    if (error) throw new Error(error.message);

    return {
      rows: (data ?? []).map((r: any) => ({
        ...r,
        agent_name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
        agent_npn: r.profiles?.npn_number ?? null,
        upline_name: r.direct_upline_name
          ?? (r.upline ? `${r.upline.first_name ?? ""} ${r.upline.last_name ?? ""}`.trim() : null),
        upline_npn: r.direct_upline_npn ?? r.upline?.npn_number ?? null,
        carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
        comp_level_name: r.carrier_comp_levels?.level_name ?? null,
      })),
    };
  });

const HierarchySchema = z.object({
  id: z.string().uuid().optional(),
  org_carrier_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  direct_upline_id: z.string().uuid().nullable().optional(),
  direct_upline_name: z.string().max(160).nullable().optional(),
  direct_upline_npn: z.string().max(32).nullable().optional(),
  direct_upline_writing_number: z.string().max(64).nullable().optional(),
  agency_writing_number: z.string().max(64).nullable().optional(),
  agency_owner_npn: z.string().max(32).nullable().optional(),
  hierarchy_path: z.string().max(500).nullable().optional(),
  current_role: z.string().max(60).nullable().optional(),
  current_comp_level_id: z.string().uuid().nullable().optional(),
  effective_date: z.string().max(10).nullable().optional(),
  status: z.enum(["active", "pending", "superseded", "terminated"]).default("active"),
  notes: z.string().max(2000).nullable().optional(),
});

export const saveCarrierHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HierarchySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_hierarchy"],
      "You don't have permission to manage carrier hierarchies.");
    await assertSameOrg(userId, data.agent_id);
    if (data.direct_upline_id) await assertSameOrg(userId, data.direct_upline_id);

    // An agent cannot be their own upline; the resulting cycle breaks every
    // hierarchy walk downstream.
    if (data.direct_upline_id === data.agent_id) {
      throw new Error("An agent cannot be their own upline.");
    }

    const { data: carrier } = await supabaseAdmin
      .from("org_carriers").select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
    if (!carrier) throw new OrgAccessError("That carrier is not in your directory");

    const { id, ...fields } = data;
    const { data: before } = await supabaseAdmin
      .from("carrier_hierarchy_records").select("*")
      .eq("org_carrier_id", data.org_carrier_id).eq("agent_id", data.agent_id).maybeSingle();

    const { data: saved, error } = await supabaseAdmin
      .from("carrier_hierarchy_records")
      .upsert(
        { ...fields, organization_id: orgId, created_by: before ? before.created_by : userId, updated_by: userId },
        { onConflict: "org_carrier_id,agent_id" },
      )
      .select("id").single();
    if (error) throw new Error(error.message);

    const d = diff(before ?? undefined, { ...(before ?? {}), ...fields });
    await recordAudit({
      organizationId: orgId, actorId: userId, action: "hierarchy.changed",
      recordType: "carrier_hierarchy_records", recordId: saved.id,
      subjectAgentId: data.agent_id, previous: d.previous, next: d.next,
    });
    return { ok: true, id: saved.id as string };
  });

// ── Licensing and PDB review ────────────────────────────────────────────────

export const listLicensingRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { agents: [], reviews: [], settings: null };

    // Who may see the agency roster at all.
    //
    // This function had no capability check — the only gate was "are you in an
    // org", so every agent in the agency could call it. It reads `profiles`
    // through the service-role client, so row-level security never sees the
    // query and cannot save it.
    //
    // Not `requireCapability`, which throws: an ordinary agent opening
    // /licensing is a legitimate thing to do, they just get their own record
    // rather than everybody's. Staff get the roster.
    const access = await resolveAccess(userId);
    const canSeeRoster =
      access.isOrgAdmin ||
      Boolean((access.perms as any).contracting_manage_licenses) ||
      Boolean((access.perms as any).contracting_view_sensitive_docs);

    const { effective } = await loadEffectiveContractingSettings(orgId);
    const refreshDays = Number(effective.pdb_refresh_days ?? 90);
    const warnDays = Number(effective.license_expiry_warning_days ?? 45);

    const { data: members } = canSeeRoster
      ? await supabaseAdmin
          .from("organization_memberships").select("profile_id")
          .eq("organization_id", orgId).eq("status", "active")
      : { data: [{ profile_id: userId }] };
    const ids = (members ?? []).map((m: any) => m.profile_id);
    if (!ids.length) return { agents: [], reviews: [], settings: { refreshDays, warnDays } };

    // Licence rows come through RLS so a manager sees only their downline.
    const [{ data: profiles }, { data: licenses }, { data: reviews }, { data: uploads }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, npn_number").in("id", ids),
      supabase.from("state_licenses")
        .select("id, agent_id, state_code, license_number, status, expires_date, is_resident, last_verified_at, next_review_date, verification_source"),
      supabase.from("pdb_reviews")
        .select("id, agent_id, status, report_date, next_review_date, reviewed_at, licenses_recorded")
        .order("created_at", { ascending: false }),
      supabase.from("pdb_uploads").select("id, agent_id, filename, uploaded_at").order("uploaded_at", { ascending: false }),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const warnBy = new Date(Date.now() + warnDays * 86_400_000).toISOString().slice(0, 10);

    const licByAgent = new Map<string, any[]>();
    for (const l of licenses ?? []) {
      if (!licByAgent.has(l.agent_id)) licByAgent.set(l.agent_id, []);
      licByAgent.get(l.agent_id)!.push(l);
    }
    // Most recent review per agent.
    const reviewByAgent = new Map<string, any>();
    for (const r of reviews ?? []) if (!reviewByAgent.has(r.agent_id)) reviewByAgent.set(r.agent_id, r);
    const uploadByAgent = new Map<string, any>();
    for (const u of uploads ?? []) if (!uploadByAgent.has(u.agent_id)) uploadByAgent.set(u.agent_id, u);

    const visible = new Set([...licByAgent.keys(), ...reviewByAgent.keys(), ...uploadByAgent.keys()]);

    return {
      settings: { refreshDays, warnDays },
      reviews: reviews ?? [],
      // Only agents the caller can actually see licensing for. This previously
      // read `visible.size === 0 || visible.has(p.id) || true` inline — two
      // defects in one expression, neither testable where it sat. See
      // `@/lib/licensing-visibility`.
      agents: visibleLicensingAgents((profiles ?? []) as any[], visible, userId)
        .map((p: any) => {
          const lic = licByAgent.get(p.id) ?? [];
          const review = reviewByAgent.get(p.id) ?? null;
          const upload = uploadByAgent.get(p.id) ?? null;
          const expiring = lic.filter((l: any) => l.expires_date && l.expires_date <= warnBy && l.expires_date >= today);
          const expired = lic.filter((l: any) => l.expires_date && l.expires_date < today);
          const pdbStale = Boolean(
            refreshDays > 0 && review?.next_review_date && review.next_review_date < today,
          );
          return {
            id: p.id,
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed agent",
            npn: p.npn_number,
            license_count: lic.length,
            resident_state: lic.find((l: any) => l.is_resident)?.state_code ?? null,
            licenses: lic,
            expiring_count: expiring.length,
            expired_count: expired.length,
            pdb_status: review?.status ?? (upload ? "pending" : "none"),
            pdb_report_date: review?.report_date ?? null,
            pdb_next_review: review?.next_review_date ?? null,
            pdb_stale: pdbStale,
            latest_upload_id: upload?.id ?? null,
            latest_upload_at: upload?.uploaded_at ?? null,
          };
        }),
    };
  });

const LicenseSchema = z.object({
  id: z.string().uuid().optional(),
  agent_id: z.string().uuid(),
  state_code: z.string().length(2),
  license_number: z.string().max(60).nullable().optional(),
  license_type: z.string().max(60).nullable().optional(),
  loa: z.string().max(120).nullable().optional(),
  is_resident: z.boolean().default(false),
  issued_date: z.string().max(10).nullable().optional(),
  expires_date: z.string().max(10).nullable().optional(),
  status: z.enum(["active", "inactive", "expired", "pending", "lapsed", "unknown"]).default("active"),
  notes: z.string().max(1000).nullable().optional(),
});

export const saveLicenseRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LicenseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_licenses"],
      "You don't have permission to edit licensing records.");
    await assertSameOrg(userId, data.agent_id);

    const { id, ...fields } = data;
    const { data: saved, error } = id
      ? await supabaseAdmin.from("state_licenses").update({
          ...fields,
          last_verified_at: new Date().toISOString(),
          verified_by: userId,
          verification_source: "manual_entry",
        }).eq("id", id).eq("organization_id", orgId).select("id").single()
      : await supabaseAdmin.from("state_licenses").insert({
          ...fields, organization_id: orgId,
          last_verified_at: new Date().toISOString(),
          verified_by: userId, verification_source: "manual_entry",
        }).select("id").single();
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "license.edited",
      recordType: "state_licenses", recordId: saved.id, subjectAgentId: data.agent_id, next: fields,
    });
    return { ok: true, id: saved.id as string };
  });

/**
 * Records a staff review of an uploaded PDB.
 *
 * `next_review_date` is stamped from the agency's refresh interval at review
 * time rather than derived on read, so changing the policy later does not
 * silently re-date historical reviews.
 */
export const reviewPdbReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    pdb_upload_id: z.string().uuid(),
    agent_id: z.string().uuid(),
    status: z.enum(["in_review", "verified", "rejected"]),
    report_date: z.string().max(10).nullable().optional(),
    licenses_recorded: z.number().int().min(0).max(200).default(0),
    appointments_recorded: z.number().int().min(0).max(500).default(0),
    regulatory_actions_found: z.number().int().min(0).max(100).default(0),
    reviewer_notes: z.string().max(2000).nullable().optional(),
    rejection_reason: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_licenses"],
      "You don't have permission to review PDB reports.");
    await assertSameOrg(userId, data.agent_id);

    const { effective } = await loadEffectiveContractingSettings(orgId);
    const refreshDays = Number(effective.pdb_refresh_days ?? 90);

    const nextReview = data.status === "verified" && refreshDays > 0
      ? new Date(Date.now() + refreshDays * 86_400_000).toISOString().slice(0, 10)
      : null;

    const { data: saved, error } = await supabaseAdmin.from("pdb_reviews").insert({
      organization_id: orgId,
      agent_id: data.agent_id,
      pdb_upload_id: data.pdb_upload_id,
      status: data.status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      report_date: data.report_date ?? null,
      next_review_date: nextReview,
      licenses_recorded: data.licenses_recorded,
      appointments_recorded: data.appointments_recorded,
      regulatory_actions_found: data.regulatory_actions_found,
      reviewer_notes: data.reviewer_notes ?? null,
      rejection_reason: data.rejection_reason ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "pdb.reviewed",
      recordType: "pdb_reviews", recordId: saved.id, subjectAgentId: data.agent_id,
      next: { status: data.status, next_review_date: nextReview },
    });
    await recordDocumentAccess({
      organizationId: orgId, pdbUploadId: data.pdb_upload_id,
      subjectAgentId: data.agent_id, accessedBy: userId, accessType: "view", wasSensitive: true,
    });

    if (data.status === "rejected") {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.agent_id,
        title: "Your PDB report needs replacing",
        description: data.rejection_reason ?? "Please upload a current PDB report.",
        type: "contracting",
      });
    }
    return { ok: true, id: saved.id as string };
  });

// ── Documents ───────────────────────────────────────────────────────────────

export const listProducerDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const a = await resolveAccess(userId);
    if (!a.orgId) return { rows: [], canViewSensitive: false };

    const canViewSensitive = a.isOrgAdmin || Boolean((a.perms as any).contracting_view_sensitive_docs);

    const { data, error } = await supabase
      .from("producer_documents")
      .select(`
        id, agent_id, doc_type, file_name, review_status, is_sensitive,
        expiration_date, created_at, updated_at, reviewed_at,
        profiles:agent_id ( id, first_name, last_name )
      `)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const today = new Date().toISOString().slice(0, 10);
    return {
      canViewSensitive,
      rows: (data ?? []).map((d: any) => ({
        id: d.id,
        agent_id: d.agent_id,
        agent_name: `${d.profiles?.first_name ?? ""} ${d.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
        doc_type: d.doc_type,
        // A sensitive document's filename can itself be disclosive, so it is
        // withheld rather than shown greyed out.
        file_name: d.is_sensitive && !canViewSensitive ? null : d.file_name,
        is_sensitive: d.is_sensitive,
        review_status: d.expiration_date && d.expiration_date < today ? "expired" : d.review_status,
        expiration_date: d.expiration_date,
        created_at: d.created_at,
        reviewed_at: d.reviewed_at,
      })),
    };
  });

/**
 * Record a document on an agent's behalf.
 *
 * An agency legitimately holds an agent's E&O certificate, AML certificate or
 * ID — they arrive by email long before the agent thinks to upload them, and
 * making the owner chase a PDF already sitting in their inbox is the busywork
 * the Getting Ready screen exists to remove.
 *
 * Deliberately restricted to those three. Banking details and the background
 * disclosure are the agent's own attestation and are not in this list at any
 * permission level — an owner filing a background disclosure under somebody
 * else's name is not a convenience, it is a forged record. Those steps say
 * "Remind agent" instead.
 */
export const uploadDocumentForAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    agent_id: z.string().uuid(),
    doc_type: z.enum(["eo_certificate", "aml_certificate", "government_id", "pdb_report"]),
    storage_path: z.string().trim().min(1).max(500),
    file_name: z.string().trim().min(1).max(200),
    expiration_date: z.string().max(10).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(
      userId, ["contracting_manage_licenses", "contracting_manage_carriers"],
      "You don't have permission to file documents for another agent.",
    );
    // The target has to be in the caller's agency, not merely a valid uuid.
    await assertSameOrg(userId, data.agent_id);

    const { data: saved, error } = await supabaseAdmin
      .from("producer_documents")
      .insert({
        agent_id: data.agent_id,
        organization_id: orgId,
        doc_type: data.doc_type,
        file_url: data.storage_path,
        storage_path: data.storage_path,
        file_name: data.file_name,
        expiration_date: data.expiration_date ?? null,
        // Filed by staff who have it in hand, which is a stronger claim than an
        // agent self-uploading — but not a review. It still goes through the
        // queue.
        review_status: "uploaded",
        uploaded_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved?.id) throw new Error("The document could not be filed.");

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "document.uploaded_for_agent",
      recordType: "producer_documents", recordId: saved.id,
      subjectAgentId: data.agent_id,
      next: { doc_type: data.doc_type, file_name: data.file_name },
    });

    return { ok: true, id: saved.id as string };
  });

export const reviewDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    review_status: z.enum(["approved", "rejected"]),
    rejection_reason: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(
      userId,
      ["contracting_manage_carriers", "contracting_submit", "staff_submit_carrier_requests"],
      "You don't have permission to review documents.",
    );

    const { data: before } = await supabaseAdmin
      .from("producer_documents").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!before) throw new OrgAccessError("That document is not available to you");

    const { error } = await supabaseAdmin.from("producer_documents").update({
      review_status: data.review_status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: data.rejection_reason ?? null,
    }).eq("id", data.id).eq("organization_id", orgId);
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "document.reviewed",
      recordType: "producer_documents", recordId: data.id, subjectAgentId: before.agent_id,
      previous: { review_status: before.review_status }, next: { review_status: data.review_status },
    });

    if (data.review_status === "rejected") {
      await supabaseAdmin.from("notifications").insert({
        user_id: before.agent_id,
        title: "A document needs replacing",
        description: data.rejection_reason ?? "Please upload a replacement.",
        type: "contracting",
      });
    }
    return { ok: true };
  });

// ── One agent, everything contracting knows about them ──────────────────────

/**
 * The page a contracting coordinator asks for by clicking somebody's name.
 *
 * Until now there was no such answer. Licences lived in the licensing sheet,
 * writing numbers in a tab of Requests, appointments nowhere, and carrier
 * document requirements only inside a request that had to exist first — so
 * "what is outstanding for Daniel?" meant opening four screens and holding the
 * result in your head.
 *
 * Reads go through the caller's own client wherever a table has an agent-scoped
 * policy, so RLS decides what comes back: an agent sees themselves, a manager
 * their downline, contracting staff the agency. `assertSameOrg` is the outer
 * fence — it stops the id in the URL from being a way to probe another agency.
 *
 * Requirement status per carrier reuses `evaluateReadiness`, deliberately: the
 * packet, the queue and this page must agree about what is missing, and the
 * only way to guarantee that is for one function to decide it.
 */
export const getAgentContracting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new OrgAccessError("No organization on your account");
    await assertSameOrg(userId, data.agent_id);

    const agentId = data.agent_id;
    const today = new Date().toISOString().slice(0, 10);

    const [
      { data: profile },
      { data: producerProfile },
      { data: licenses },
      { data: appointments },
      { data: numbers },
      { data: requests },
      { data: documents },
      settings,
    ] = await Promise.all([
      supabaseAdmin.from("profiles")
        .select("id, first_name, last_name, email, phone, npn_number, state, status")
        .eq("id", agentId).maybeSingle(),
      supabaseAdmin.from("producer_profiles")
        .select("resident_state, resident_license_number, legal_first_name, legal_last_name")
        .eq("profile_id", agentId).maybeSingle(),
      supabase.from("state_licenses")
        .select("id, state_code, license_number, status, expires_date, is_resident, last_verified_at, verification_source, next_review_date")
        .eq("agent_id", agentId),
      supabase.from("producer_appointments")
        .select("id, carrier_name, state_code, line_of_authority, status, effective_date, termination_date, last_verified_at")
        .eq("agent_id", agentId),
      supabase.from("writing_numbers")
        .select("id, writing_number, number_type, scope, state_code, product_line, status, effective_date, source, org_carriers ( id, carriers ( name ) )")
        .eq("agent_id", agentId),
      supabase.from("contracting_requests")
        .select("id, reference, status, contract_type, readiness_state, readiness_pct, is_overdue, due_date, created_at, org_carrier_id, org_carriers ( id, carriers ( name ) )")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false }),
      supabase.from("producer_documents")
        .select("id, doc_type, file_name, review_status, expiration_date, created_at, updated_at, is_sensitive")
        .eq("agent_id", agentId),
      loadEffectiveContractingSettings(orgId),
    ]);

    if (!profile) throw new Error("That agent is not in your agency, or no longer has a profile.");

    const warnDays = Number(settings?.effective?.license_expiry_warning_days ?? 45);
    const warnBy = new Date(Date.now() + warnDays * 86_400_000).toISOString().slice(0, 10);

    // Same rule the readiness engine uses: a row left at 'active' with a date
    // in the past is stale data, not a licence.
    const activeLicenseStates = (licenses ?? [])
      .filter((l: any) => ["active", "pending"].includes(l.status) && (!l.expires_date || l.expires_date >= today))
      .map((l: any) => l.state_code);

    // Latest document per type wins; an older approved copy must not mask a
    // newer rejected one.
    const byType = new Map<string, any>();
    for (const d of documents ?? []) {
      const prev = byType.get(d.doc_type);
      const stamp = d.updated_at ?? d.created_at;
      if (!prev || String(stamp) > String(prev.updated_at ?? prev.created_at)) byType.set(d.doc_type, d);
    }
    const documentStatus: ProducerFacts["documents"] = {};
    for (const [type, d] of byType) {
      const expired = d.expiration_date && d.expiration_date < today;
      documentStatus[type] = expired ? "expired" : (d.review_status ?? "uploaded");
    }

    const producer: ProducerFacts = {
      npn: profile.npn_number ?? null,
      legal_name: [producerProfile?.legal_first_name ?? profile.first_name,
                   producerProfile?.legal_last_name ?? profile.last_name].filter(Boolean).join(" ").trim() || null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      // Not fetched here. Requirements that turn on it read as outstanding
      // rather than silently satisfied, which is the safer of the two lies.
      date_of_birth: null,
      resident_state: producerProfile?.resident_state ?? profile.state ?? null,
      resident_license_number: producerProfile?.resident_license_number ?? null,
      address: null,
      active_license_states: activeLicenseStates,
      documents: documentStatus,
    };

    // Every carrier this agent has a relationship with, open or settled.
    const carrierIds = Array.from(new Set([
      ...(requests ?? []).map((r: any) => r.org_carrier_id),
      ...(numbers ?? []).map((n: any) => n.org_carriers?.id).filter(Boolean),
    ]));

    const { data: requirements } = carrierIds.length
      ? await supabaseAdmin.from("carrier_requirements")
          .select("*").in("org_carrier_id", carrierIds).eq("active", true).order("sort_order")
      : { data: [] as any[] };

    const reqsByCarrier = new Map<string, Requirement[]>();
    for (const r of (requirements ?? []) as Requirement[]) {
      const key = (r as any).org_carrier_id as string;
      if (!reqsByCarrier.has(key)) reqsByCarrier.set(key, []);
      reqsByCarrier.get(key)!.push(r);
    }

    // Requirement status per carrier. Where there is a live request the answer
    // is that request's context; where there is only a writing number the
    // agent is already appointed, so the carrier's baseline is evaluated as a
    // new contract to show what would be missing if it were re-papered.
    const hierarchy: HierarchyFacts = {
      upline_name: null, upline_npn: null, upline_writing_number: null,
      upline_comp_level: null, agency_writing_number: null,
      agency_owner_npn: null, existing_writing_number: null,
    };

    const carriers = carrierIds.map((cid) => {
      const openRequest = (requests ?? []).find(
        (r: any) => r.org_carrier_id === cid && !["approved", "writing_number_issued", "declined", "withdrawn", "cancelled"].includes(r.status));
      const anyRequest = (requests ?? []).find((r: any) => r.org_carrier_id === cid);
      const number = (numbers ?? []).find((n: any) => n.org_carriers?.id === cid);
      const name = anyRequest?.org_carriers?.carriers?.name ?? number?.org_carriers?.carriers?.name ?? "Carrier";

      const result = evaluateReadiness({
        requirements: reqsByCarrier.get(cid) ?? [],
        request: {
          contract_type: openRequest?.contract_type ?? "new_contract",
          is_transfer: openRequest?.contract_type === "transfer",
          requested_states: activeLicenseStates,
          product_lines: [],
          requested_comp_level_name: null,
          requested_advance_level: null,
          // Without an open request there is no status to honour, and the
          // engine's terminal short-circuits would report "approved" for a
          // carrier whose paperwork is in fact incomplete.
          status: openRequest?.status ?? "draft",
        },
        producer,
        hierarchy,
      });

      return {
        org_carrier_id: cid,
        carrier_name: name,
        request_id: openRequest?.id ?? null,
        request_reference: openRequest?.reference ?? null,
        request_status: openRequest?.status ?? null,
        writing_number: number?.writing_number ?? null,
        readiness_pct: result.pct,
        blockers: result.blockers,
        satisfied: result.satisfied,
      };
    });

    return {
      agent: {
        id: profile.id,
        name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unnamed agent",
        email: profile.email ?? null,
        npn: profile.npn_number ?? null,
        status: profile.status ?? null,
        resident_state: producer.resident_state,
      },
      licenses: (licenses ?? []).map((l: any) => ({
        ...l,
        expired: Boolean(l.expires_date && l.expires_date < today),
        expiring_soon: Boolean(l.expires_date && l.expires_date >= today && l.expires_date <= warnBy),
      })),
      appointments: appointments ?? [],
      writing_numbers: (numbers ?? []).map((n: any) => ({
        ...n, carrier_name: n.org_carriers?.carriers?.name ?? "Carrier",
      })),
      requests: (requests ?? []).map((r: any) => ({
        ...r, carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
      })),
      documents: Array.from(byType.values()).map((d: any) => ({
        ...d, expired: Boolean(d.expiration_date && d.expiration_date < today),
      })),
      carriers,
      warnDays,
    };
  });
