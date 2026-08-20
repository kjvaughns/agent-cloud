import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { advanceRefusal, advanceWithinCarrierMax } from "@/lib/carriers/wizard";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertSameOrg, OrgAccessError } from "@/lib/org-guard";
import { recordAudit, diff } from "@/lib/contracting-ops/audit";
import {
  evaluateReadiness,
  type Requirement, type RequestContext, type ProducerFacts, type HierarchyFacts,
} from "@/lib/contracting-ops/readiness";
import type { Packet } from "@/lib/contracting-ops/packet";
import {
  CONTRACTING_METHODS, REQUEST_STATUS_META, REQUEST_STATUSES, SENSITIVE_DOC_TYPES,
  isAgentActionStatus, isLiveStatus, requestStatusLabel,
} from "@/lib/contracting-ops/types";
import { ADVANCE_OPTIONS } from "@/lib/compensation/resolve";
import { resolveHandoffMethod, legacyFallbackUrl } from "@/lib/contracting-ops/handoff";
import { INHERITABLE_FIELDS } from "@/lib/contracting-ops/effective-settings";
import { loadEffectiveContractingSettings } from "@/lib/contracting-ops/effective-settings.server";
// `writing_numbers` is authoritative; the column on `contract_requests` is
// deprecated. Same loader the Contracts page and the team matrix already use.
import { loadWritingNumbers, writingNumberKey } from "@/lib/writing-numbers";
import { agencyCarrierConfiguration } from "@/lib/compensation/lookup.server";
import { carrierState, removalMode } from "@/lib/carriers/status";
import { carrierLevelOptions } from "@/lib/compensation/carrier-levels";
import { assertTabPermission } from "@/lib/settings/tab-guard.server";

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

export type { ContractingAccess } from "@/lib/contracting-ops/access.server";

/**
 * Resolves what the caller may do, mirroring the SQL helpers exactly.
 *
 * The rule itself lives in `contracting-ops/access.server.ts` so the
 * agent-grouped workspace and the Google Sheets sync resolve the same
 * capabilities from the same place. Loaded inside the call rather than at module
 * scope: this file is imported by routes, and a server-only module at module
 * scope leaks into the client bundle.
 */
async function resolveAccess(userId: string) {
  const { resolveContractingAccess } = await import("@/lib/contracting-ops/access.server");
  return resolveContractingAccess(userId);
}

type ContractingAccessValue = Awaited<ReturnType<typeof resolveAccess>>;


export const getContractingAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveAccess((context as Ctx).userId));

function requireOrg(access: ContractingAccessValue): string {
  if (!access.orgId) throw new OrgAccessError("No organization on your account");
  return access.orgId;
}

function deny(message: string): never {
  throw new Error(message);
}

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * Effective settings — own overrides, else the parent chain, else defaults.
 * The resolution rule lives in contracting-ops/effective-settings; this is
 * just the plumbing every caller in this file shares.
 */
async function getSettings(orgId: string): Promise<Record<string, any>> {
  const { effective } = await loadEffectiveContractingSettings(orgId);
  return { organization_id: orgId, ...effective };
}

export const getContractingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await resolveAccess((context as Ctx).userId);
    const orgId = requireOrg(access);
    const resolved = await loadEffectiveContractingSettings(orgId);
    // What the org's own row currently claims, so the UI can tell an
    // override from an inheritance without re-deriving the rule.
    const { data: own } = await supabaseAdmin
      .from("org_contracting_settings").select("*").eq("organization_id", orgId).maybeSingle();
    const overridden = own
      ? (own.overridden_fields ?? INHERITABLE_FIELDS.slice())
      : [];
    return {
      settings: { organization_id: orgId, ...resolved.effective },
      sources: resolved.sources,
      inheritedValues: resolved.inheritedValues,
      hasParent: resolved.hasParent,
      parentName: resolved.parentName,
      overridden,
      access,
    };
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
  /**
   * Which fields this org sets for itself; everything else inherits from the
   * parent chain. Omitted (a stale client, or an org with no parent) means
   * every field is local — the pre-inheritance behaviour.
   */
  overridden_fields: z.array(z.enum(INHERITABLE_FIELDS)).optional(),
});

export const saveContractingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.isOwner && !access.canManageCarriers) deny("Only the agency owner can change contracting settings.");

    const { overridden_fields, ...fields } = data;

    // A root agency has nothing to inherit from, so every field is its own —
    // regardless of what the client sent. Only a child's list is honoured.
    const { data: org } = await supabaseAdmin
      .from("organizations").select("parent_org_id").eq("id", orgId).maybeSingle();
    const marker = org?.parent_org_id
      ? (overridden_fields ?? INHERITABLE_FIELDS.slice())
      : INHERITABLE_FIELDS.slice();

    const before = await getSettings(orgId);
    const row = { organization_id: orgId, ...fields, overridden_fields: marker, updated_by: userId };
    let { error } = await supabaseAdmin
      .from("org_contracting_settings")
      .upsert(row, { onConflict: "organization_id" });
    // Pre-migration window: the marker column does not exist yet. Save the
    // values without it — a null marker reads as "every field local", which
    // is exactly what the pre-migration database can express.
    if (error && (error.code === "PGRST204" || error.code === "42703")) {
      const { overridden_fields: _dropped, ...withoutMarker } = row;
      ({ error } = await supabaseAdmin
        .from("org_contracting_settings")
        .upsert(withoutMarker, { onConflict: "organization_id" }));
    }
    if (error) throw new Error(error.message);

    const after = await getSettings(orgId);
    const d = diff(before as any, after as any);
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

    // The lifecycle status comes from one module so the Carriers tab, the Add
    // Carrier wizard and the activation toggle cannot disagree about whether a
    // carrier is ready. The reasons inside it are the resolver's own — the
    // same sentences Post a Deal shows an agent — rather than a second opinion
    // formed here.
    const configuration = await agencyCarrierConfiguration(supabase, access.orgId);

    // Grid rows are keyed on `carrier_id`, not on the org_carrier row.
    //
    // `level_name` comes back too, and not only for counting: it is the
    // carrier's own vocabulary for its comp ladder, which is what "Match
    // carrier levels" on an agency position has to offer. That screen used to
    // read `carrier_comp_levels` alone — a table filled in by hand and
    // therefore usually empty — so the dropdown listed no levels at all even
    // for carriers whose grid names every one of them.
    const { data: gridRows } = await supabase
      .from("commission_grids")
      .select("carrier_id, product_name, level_name, level_sort, year_1_pct")
      .eq("organization_id", access.orgId);
    const gridCount = new Map<string, number>();
    // Distinct products, not rows. One product with three age bands is three
    // rows and one product, and "3 products" on a carrier that sells one is
    // the kind of number an owner stops trusting the rest of the screen over.
    const gridProducts = new Map<string, Map<string, string>>();
    // Kept as rows rather than collapsed here: one level pays different rates
    // on different products, and `carrierLevelOptions` is the one place that
    // knows a level's percentage may be a range instead of a number.
    const gridLevels = new Map<string, any[]>();
    for (const g of (gridRows ?? []) as any[]) {
      const k = String(g.carrier_id);
      gridCount.set(k, (gridCount.get(k) ?? 0) + 1);
      if (String(g.level_name ?? "").trim()) {
        if (!gridLevels.has(k)) gridLevels.set(k, []);
        gridLevels.get(k)!.push({
          level_name: g.level_name,
          level_sort: g.level_sort ?? null,
          product_name: g.product_name ?? null,
          year_1_pct: g.year_1_pct ?? null,
        });
      }
      const name = String(g.product_name ?? "").trim();
      if (!name) continue;
      // Keyed on the lowercased name so case variants are one product, valued
      // with the carrier's own casing so the screen shows "FE Express" rather
      // than "fe express".
      if (!gridProducts.has(k)) gridProducts.set(k, new Map());
      const bucket = gridProducts.get(k)!;
      if (!bucket.has(name.toLowerCase())) bucket.set(name.toLowerCase(), name);
    }

    // Which active positions resolve on this carrier only through their own
    // percentage. Named rather than counted, because "Training Agent falls
    // back" is actionable and "1 position falls back" is not.
    const [{ data: levels }, { data: mappings }] = await Promise.all([
      supabase
        .from("agency_levels")
        .select("id, name")
        .eq("organization_id", access.orgId)
        .eq("active", true),
      supabase
        .from("agency_level_carrier_mappings")
        .select("agency_level_id, org_carrier_id")
        .eq("organization_id", access.orgId),
    ]);
    const mapped = new Set(
      ((mappings ?? []) as any[]).map((m) => `${m.org_carrier_id}:${m.agency_level_id}`),
    );

    return {
      access,
      carriers: (data ?? []).map((c: any) => {
        const activeLevels = (c.carrier_comp_levels ?? []).filter((l: any) => l.status === "active");
        const carrier_grid_levels = gridLevels.get(String(c.carrier_id)) ?? [];
        // Every name this carrier goes by, from either source, deduped. This is
        // what "Match carrier levels" offers and what `needs_levels` counts: an
        // agency that has uploaded a grid naming Level 40 and Level 55 has told
        // us this carrier's levels, and asking them to retype the two names
        // into a second table before the carrier may be activated is asking for
        // the same fact twice.
        const levelOptions = carrierLevelOptions({
          carrier_comp_levels: c.carrier_comp_levels ?? [],
          carrier_grid_levels,
        });
        const name = c.carriers?.name ?? "Unnamed carrier";
        const state = carrierState({
          orgCarrierId: c.id,
          carrierName: name,
          enabled: c.enabled !== false && c.status === "active",
          archived: c.status === "archived",
          levelCount: levelOptions.length,
          gridRowCount: gridCount.get(String(c.carrier_id)) ?? 0,
          // No review queue exists yet; extraction review lands with the Add
          // Carrier wizard. Reporting zero here is today's behaviour rather
          // than a guess, and the status module already handles a non-zero.
          unreviewedGridRowCount: 0,
          // The carrier's own ceiling is what "an advance is configured" means.
          // Falling back to the agency default keeps carriers configured before
          // the ceiling column existed reading as configured.
          maxAdvance: c.max_advance_option ?? c.default_advance_option ?? null,
          hasContractingMethod: (c.org_carrier_methods ?? []).length > 0,
          configuration: configuration.get(c.id) ?? { configured: false, reasons: [] },
          positionsOnFallback: ((levels ?? []) as any[])
            .filter((l) => !mapped.has(`${c.id}:${l.id}`))
            .map((l) => l.name),
        });
        return {
          ...c,
          name,
          carrier_grid_levels,
          level_options: levelOptions,
          logo_url: c.carriers?.logo_url ?? null,
          is_private: c.carriers?.is_private ?? false,
          open_requests: open.get(c.id) ?? 0,
          requirement_count: (c.carrier_requirements ?? []).filter((r: any) => r.active).length,
          // The Levels fact on the carrier row counts every name the carrier
          // goes by, matching what the mapping dropdown offers. Showing the
          // hand-entered count there while the dropdown listed grid levels too
          // would be two numbers for one thing.
          comp_level_count: levelOptions.length,
          hand_entered_level_count: activeLevels.length,
          grid_row_count: gridCount.get(String(c.carrier_id)) ?? 0,
          product_count: gridProducts.get(String(c.carrier_id))?.size ?? 0,
          // The grid's own product names. The carrier dialog shows these
          // instead of asking an owner to retype the same list into
          // `product_types`, which for a gridded carrier is a field that
          // changes nothing — Post a Deal reads the grid and only falls back
          // to `product_types` when there is no grid at all.
          grid_products: [...(gridProducts.get(String(c.carrier_id))?.values() ?? [])]
            .sort((a, b) => a.localeCompare(b)),
          state,
        };
      }),
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
      // The library row as the wizard shows it: a logo and a website are what
      // let somebody confirm they picked the right "American Life".
      supabase.from("carriers").select("id, name, logo_url, is_private, website, phone").order("name"),
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
  // No `.default()` on anything that already has a stored value.
  //
  // These used to default, and `z.object` fills a default in for every key the
  // caller left out — so the activation switch, which sends only `{id, status}`,
  // was writing `product_types: []`, `writing_number_scope: "national"`,
  // `transfers_allowed: true` and `release_required: false` over whatever the
  // carrier had. Flipping a carrier off and on again wiped its products, which
  // is why the switch appeared to do nothing useful and the carrier fell back to
  // "needs setup". A partial update must stay partial; the create path supplies
  // its own defaults below.
  status: z.enum(["active", "paused", "not_contracted", "terminated"]).optional(),
  // The three gateway URL fields are gone from this schema on purpose. They
  // live in org_carrier_methods now, written through saveOrgCarrierMethod;
  // z.object strips unknown keys, so a stale client still sending them has
  // them dropped rather than written to the deprecated columns.
  contracting_email: z.string().email().max(200).nullable().optional(),
  contracting_phone: z.string().max(40).nullable().optional(),
  support_email: z.string().email().max(200).nullable().optional(),
  support_phone: z.string().max(40).nullable().optional(),
  turnaround_days: z.number().int().min(0).max(365).nullable().optional(),
  product_types: z.array(z.string().max(60)).max(30).optional(),
  writing_number_scope: z.enum(["national", "state", "product", "mixed"]).optional(),
  just_in_time_appointments: z.boolean().optional(),
  transfers_allowed: z.boolean().optional(),
  release_required: z.boolean().optional(),
  release_requirements: z.string().max(2000).nullable().optional(),
  min_production_requirements: z.string().max(2000).nullable().optional(),
  internal_instructions: z.string().max(5000).nullable().optional(),
  staff_notes: z.string().max(5000).nullable().optional(),

  // ── The five the resolver reads and nothing could write ──
  //
  // 20260814210000 added these columns and the compensation resolver has read
  // them since; `z.object` strips unknown keys, so every one of them was
  // silently dropped on the way in. The consequences were not subtle:
  //
  //   * `default_advance_option` could never be set, and the resolver refuses
  //     to guess an advance term — so every carrier reported
  //     `no_advance_option` forever and My Contracts marked every row "Comp
  //     not set up", with no control anywhere that could clear it
  //   * `visible_to_agents` and `available_for_post_deal` had no way to be
  //     turned off, so "publish to agents" was not a thing an owner could do
  //
  // Nullable on advance because "not chosen yet" is a real and different state
  // from any of the options — that distinction is what makes the setup
  // checklist able to say the thing is outstanding.
  enabled: z.boolean().optional(),
  visible_to_agents: z.boolean().optional(),
  requestable_by_agents: z.boolean().optional(),
  available_for_post_deal: z.boolean().optional(),
  // The enum's own five values, imported rather than retyped — a literal list
  // here would be a second place for them to drift from the database.
  default_advance_option: z.enum(ADVANCE_OPTIONS).nullable().optional(),
  /**
   * The most this carrier itself permits. Distinct from the agency default on
   * purpose: the ceiling is a fact about the carrier and the default is the
   * agency's choice inside it, and collapsing them meant an owner could not
   * offer 6 months on a carrier that allows 9 without claiming the carrier
   * only allows 6.
   */
  max_advance_option: z.enum(ADVANCE_OPTIONS).nullable().optional(),
});

export const saveOrgCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgCarrierSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    // The interface hides the Carriers tab; this refuses the endpoint. Anybody
    // can post to a server function with a fetch, and until this existed the
    // permission was advisory.
    await assertTabPermission(userId, "carriers", orgId);
    if (!access.canManageCarriers) deny("You don't have permission to manage carriers.");

    const { id, carrier_id, new_carrier_name, ...fields } = data;

    // The advance ceiling, enforced here and not only in the form. An agent
    // advanced beyond what the carrier permits is a chargeback nobody
    // budgeted for, and a stale tab posting the old default is exactly how
    // that happens. The database has the same rule as a constraint; this is
    // what turns it into a sentence somebody can act on.
    if (fields.default_advance_option !== undefined && fields.default_advance_option !== null) {
      let ceiling: string | null = fields.max_advance_option ?? null;
      // Not sent, or sent empty on an existing row: the ceiling to check
      // against is the one already stored, not "none".
      if (fields.max_advance_option == null && id) {
        const { data: existing } = await supabaseAdmin
          .from("org_carriers").select("max_advance_option").eq("id", id).maybeSingle();
        ceiling = (existing?.max_advance_option as string | null) ?? null;
      }
      if (!advanceWithinCarrierMax(fields.default_advance_option, ceiling)) {
        throw new Error(advanceRefusal(fields.default_advance_option, ceiling));
      }
    }


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

      // `.select()` on the update, not a bare update.
      //
      // PostgREST reports no error when an update matches zero rows — the
      // statement ran, it just changed nothing — so a bare update returns
      // success whether or not anything was written, and the interface says
      // "Carrier saved" over a database that never heard the request. Reading
      // the row back is what makes the success claim true.
      const { data: after, error } = await supabaseAdmin
        .from("org_carriers").update({ ...fields, updated_by: userId })
        .eq("id", id).eq("organization_id", orgId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!after?.length) {
        throw new Error(
          "The carrier was not saved — nothing was written. Reload the page and try again.",
        );
      }

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
      // The defaults the schema used to carry live here, where a new row is the
      // only thing they can apply to.
      .insert({
        organization_id: orgId, carrier_id: resolvedCarrierId,
        status: "active", product_types: [], writing_number_scope: "national",
        just_in_time_appointments: false, transfers_allowed: true, release_required: false,
        ...fields, created_by: userId, updated_by: userId,
      })
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

      // Read back, for the same reason as the carrier update above: a
      // zero-row update is not an error, so without this the dialog is told
      // the method saved whether or not one did.
      const { data: after, error } = await supabaseAdmin
        .from("org_carrier_methods").update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id).eq("organization_id", orgId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!after?.length) {
        throw new Error(
          "The submission method was not saved — nothing was written. Reload the page and try again.",
        );
      }

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

/**
 * What is attached to this carrier, so the screen can say delete or archive.
 *
 * Read before the action rather than inside it: an owner about to lose a
 * carrier's commission history is entitled to know that before they click,
 * not after.
 */
export const getCarrierUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);

    const { data: oc } = await supabaseAdmin
      .from("org_carriers").select("id, carrier_id")
      .eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!oc) throw new OrgAccessError("That carrier is not in your directory");

    const count = async (table: string, column: string, value: string) => {
      const { count: n } = await supabaseAdmin
        .from(table).select("id", { count: "exact", head: true }).eq(column, value);
      return n ?? 0;
    };

    // Counted against `carrier_id` where the table keys on the catalogue
    // carrier, and `org_carrier_id` where it keys on this agency's row. Mixing
    // the two reads zero and offers a delete that destroys history.
    const [contracts, policies, requests, commissionRecords] = await Promise.all([
      count("agent_commission_levels", "carrier_id", oc.carrier_id),
      count("policies", "carrier_id", oc.carrier_id),
      count("contracting_requests", "org_carrier_id", oc.id),
      count("commission_schedule", "carrier_id", oc.carrier_id),
    ]);

    // Configuration, counted separately from history. It does not decide
    // delete-versus-archive — a grid is something you rebuild, not something
    // you lose money over — but a delete takes it with the carrier, so the
    // confirmation has to be able to say so before the click rather than after.
    const { count: gridRows } = await supabaseAdmin
      .from("commission_grids").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("carrier_id", oc.carrier_id);
    const { count: compLevels } = await supabaseAdmin
      .from("carrier_comp_levels").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("org_carrier_id", oc.id);
    const { count: mappings } = await supabaseAdmin
      .from("agency_level_carrier_mappings").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("org_carrier_id", oc.id);
    const { count: methods } = await supabaseAdmin
      .from("org_carrier_methods").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("org_carrier_id", oc.id);

    return {
      contracts, policies, requests, commissionRecords,
      gridRows: gridRows ?? 0,
      compLevels: compLevels ?? 0,
      mappings: mappings ?? 0,
      methods: methods ?? 0,
    };
  });

/**
 * Remove a carrier: delete it when nothing points at it, archive it otherwise.
 *
 * The caller does not choose. `removalMode` decides from the counts, read here
 * rather than trusted from the client — a stale screen must not be able to
 * turn an archive into a delete.
 */
export const removeOrgCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    await assertTabPermission(userId, "carriers", orgId);

    const { data: before } = await supabaseAdmin
      .from("org_carriers").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!before) throw new OrgAccessError("That carrier is not in your directory");

    const usage = await getCarrierUsage({ data: { id: data.id } });
    const mode = removalMode(usage);

    if (mode === "delete") {
      // One statement, in the database, because the carrier is not the only
      // thing being removed. Its grid rows key on (organization, carrier_id)
      // rather than on this row, so deleting only `org_carriers` left a grid
      // behind with no carrier to belong to — and re-adding the carrier
      // resurrected rates nobody knew were still stored. Comp levels, position
      // mappings, submission methods, requirements and aliases went the same
      // way. Nothing here touches policies or commission history: a carrier
      // with any of those is archived above, never deleted.
      const { data: removed, error } = await supabaseAdmin.rpc("delete_org_carrier_cascade", {
        _org: orgId,
        _org_carrier: data.id,
      });
      if (error) throw new Error(error.message);

      await recordAudit({
        organizationId: orgId, actorId: userId, action: "carrier.archived",
        recordType: "org_carriers", recordId: data.id, previous: before,
        metadata: { removal: "deleted", usage, removed },
      });
      return { ok: true, mode, removed: (removed ?? null) as Record<string, number> | null };
    }

    const { data: row, error } = await supabaseAdmin
      .from("org_carriers")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("organization_id", orgId).select("id");
    if (error) throw new Error(error.message);
    if (!row?.length) throw new Error("That carrier was already removed.");

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.archived",
      recordType: "org_carriers", recordId: data.id,
      previous: before, next: { status: "archived" }, metadata: { removal: "archived", usage },
    });
    return { ok: true, mode };
  });

/** Put an archived carrier back. Agents see it again once it is active. */
export const restoreOrgCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    await assertTabPermission(userId, "carriers", orgId);

    // Restored to `paused`, not `active`. A carrier coming back out of the
    // archive should not start appearing to agents the instant somebody
    // un-files it — the owner reviews its setup and switches it on.
    const { data: row, error } = await supabaseAdmin
      .from("org_carriers")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("organization_id", orgId).eq("status", "archived").select("id");
    if (error) throw new Error(error.message);
    if (!row?.length) throw new Error("That carrier is not archived.");

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.updated",
      recordType: "org_carriers", recordId: data.id,
      previous: { status: "archived" }, next: { status: "paused" },
      metadata: { removal: "restored" },
    });
    return { ok: true };
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

  // Read before the facts are assembled, and tolerant of a table that is not
  // there: this runs on every request open, and a missing row is "the agent did
  // not claim one", which is the common case rather than an error.
  let selfReportedNumber: string | null = null;
  try {
    const { data: wn } = await supabaseAdmin
      .from("writing_numbers")
      .select("writing_number")
      .eq("agent_id", request.agent_id)
      .eq("org_carrier_id", request.org_carrier_id)
      .eq("source", "self_reported")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    selfReportedNumber = (wn as any)?.writing_number ?? null;
  } catch {
    selfReportedNumber = null;
  }

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
    // What the agent said they already hold, when they said so.
    //
    // This was hard-coded null, which made the readiness rule keyed to it
    // permanently unsatisfiable and left the staff screen with nothing to show
    // — the number only ever existed inside the request's note text. It comes
    // from `writing_numbers` now, the authoritative store, restricted to the
    // self-reported and still-pending row: a number the carrier has confirmed
    // is not an "existing" claim to check, it is the answer.
    existing_writing_number: selfReportedNumber,
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
      // The inbox is meant to be workable without opening every row. It was
      // missing the requested level, the upline, what is actually outstanding
      // and the writing number — so deciding what to do next meant clicking
      // into each request in turn. All of it was already on the row or one
      // join away.
      .select(`
        id, reference, status, contract_type, priority, readiness_state, readiness_pct,
        readiness_blockers, due_date, created_at, updated_at, submitted_at,
        assigned_to, agent_id, org_carrier_id, direct_upline_id, requested_comp_level_id,
        profiles:agent_id ( id, first_name, last_name, email, npn_number ),
        assignee:assigned_to ( id, first_name, last_name ),
        upline:direct_upline_id ( id, first_name, last_name ),
        requested_level:requested_comp_level_id ( id, level_name ),
        org_carriers ( id, carrier_id, carriers ( name, logo_url ) )
      `)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (data.status) q = q.eq("status", data.status);
    if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);
    if (data.org_carrier_id) q = q.eq("org_carrier_id", data.org_carrier_id);
    if (data.agent_id) q = q.eq("agent_id", data.agent_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // One batched lookup rather than a join: writing numbers live in their own
    // table keyed by agent and carrier, and `writing_numbers` is authoritative
    // — the column on `contract_requests` is deprecated.
    const numbers = await loadWritingNumbers(
      supabase,
      Array.from(new Set((rows ?? []).map((r: any) => r.agent_id).filter(Boolean))),
    );

    let out = (rows ?? []).map((r: any) => ({
      ...r,
      agent_name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
      agent_npn: r.profiles?.npn_number ?? null,
      carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
      assignee_name: r.assignee ? `${r.assignee.first_name ?? ""} ${r.assignee.last_name ?? ""}`.trim() : null,
      upline_name: r.upline ? `${r.upline.first_name ?? ""} ${r.upline.last_name ?? ""}`.trim() : null,
      requested_level_name: r.requested_level?.level_name ?? null,
      writing_number: r.org_carriers?.carrier_id
        ? (numbers.get(writingNumberKey(r.agent_id, r.org_carriers.carrier_id)) ?? null)
        : null,
      // What is outstanding, in words. The readiness percentage says how far
      // along a request is; it does not say what to chase, which is the only
      // thing a staff member reading this list wants to know.
      blockers: Array.isArray(r.readiness_blockers)
        ? r.readiness_blockers.map((b: any) => b?.label).filter(Boolean)
        : [],
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

    // The carrier's own ladder, plus whatever level is on the agent today.
    // Recording a decision needs both: the rungs to choose from, and the rung
    // the last decision landed on so the panel opens on the current answer.
    const [{ data: compLevelRows }, { data: gridLevelRows }, { data: grantedRow }] = await Promise.all([
      supabaseAdmin.from("carrier_comp_levels")
        .select("id, level_name, commission_pct, status, sort_order")
        .eq("org_carrier_id", facts.request.org_carrier_id).order("sort_order"),
      facts.carrier?.carrier_id
        ? supabaseAdmin.from("commission_grids")
            .select("level_name, level_sort, product_name, year_1_pct")
            .eq("carrier_id", facts.carrier.carrier_id).limit(2000)
        : Promise.resolve({ data: [] as any[] }),
      facts.carrier?.carrier_id
        ? supabaseAdmin.from("agent_commission_levels")
            .select("commission_level, assigned_pct, writing_number, status, pending, assigned_at")
            .eq("agent_id", facts.request.agent_id).eq("carrier_id", facts.carrier.carrier_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const carrierLevels = carrierLevelOptions({
      carrier_comp_levels: (compLevelRows ?? []) as any[],
      carrier_grid_levels: (gridLevelRows ?? []) as any[],
    });

    const [{ data: history }, { data: methods }, { data: submissions }] = await Promise.all([
      supabase.from("contracting_status_history")
        .select("*").eq("request_id", data.id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("org_carrier_methods")
        .select("*").eq("org_carrier_id", facts.request.org_carrier_id).order("sort_order"),
      supabase.from("contracting_submissions")
        .select("id, artifact_type, method, generated_at, generated_by, marked_submitted_at, confirmation_reference")
        .eq("request_id", data.id).order("generated_at", { ascending: false }).limit(20),
    ]);

    // One read for every author in the trail.
    const actorIds = Array.from(new Set(
      (history ?? []).map((h: any) => h.changed_by).filter(Boolean),
    )) as string[];
    const actorNames = new Map<string, string>();
    if (actorIds.length) {
      const { data: actorRows } = await supabaseAdmin
        .from("profiles").select("id, first_name, last_name, email").in("id", actorIds);
      for (const r of (actorRows ?? []) as any[]) {
        actorNames.set(r.id, `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.email || "Staff");
      }
    }

    const agent = facts.agentProfile;
    const upline = facts.uplineProfile;
    const owner = facts.ownerProfile;
    // Through the shared resolver, which is what the handoff itself uses — so
    // the method the packet names and the door the Open button opens cannot
    // disagree. The old inline pick (`is_default ?? first`) ignored
    // `applies_to`, so a carrier with "email for transfers, SureLC for
    // everything else" showed SureLC on its transfer packets.
    const method = resolveHandoffMethod((methods ?? []) as any[], facts.request.contract_type);

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
        // Method row first, legacy column second — for every kind. The old
        // chain fell back only for portal_url, so a SureLC link living on the
        // legacy column rendered a packet with no SureLC at all.
        portal_url: (method?.method === "carrier_portal" ? method.target_url : null)
          ?? legacyFallbackUrl(facts.carrier, "carrier_portal"),
        surelc_url: (method?.method === "surelc" ? method.target_url : null)
          ?? facts.carrier?.surelc_url ?? null,
        invitation_link: (method?.method === "invitation_link" ? method.target_url : null)
          ?? facts.carrier?.invitation_link ?? null,
        contracting_email: method?.target_email ?? facts.carrier?.contracting_email ?? null,
        support_email: facts.carrier?.support_email ?? null,
        support_phone: facts.carrier?.support_phone ?? null,
        turnaround_days: facts.carrier?.turnaround_days ?? null,
        instructions: method?.instructions ?? facts.carrier?.internal_instructions ?? null,
        // What Agency Settings ▸ Carriers says this carrier advances at most.
        // The decision screen filters its advance choices to this rather than
        // offering all five and letting somebody grant more than the carrier
        // funds.
        max_advance_option: facts.carrier?.default_advance_option ?? null,
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
      comp_levels: (compLevelRows ?? []).map((l: any) => ({
        id: l.id,
        level_name: l.level_name,
        commission_pct: l.commission_pct == null ? null : Number(l.commission_pct),
      })),
      carrier_levels: carrierLevels,
      granted: grantedRow ?? null,
      // Who did it, by name. "Changed at 14:02" with no author is exactly the
      // half of an audit trail that cannot settle an argument.
      history: (history ?? []).map((h: any) => ({
        ...h,
        internal_message: isStaff ? h.internal_message : null,
        changed_by_name: h.changed_by ? actorNames.get(h.changed_by) ?? null : null,
      })),
    };
  });

const StatusSchema = z.object({
  id: z.string().uuid(),
  // The one list, from the one place. A status the vocabulary knows is a
  // status this endpoint accepts; there is no second copy to drift.
  status: z.enum(REQUEST_STATUSES),
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
  // ── The level the carrier actually granted ─────────────────────────────
  //
  // A request is raised AT the agent's position; what comes back is whatever
  // the carrier agreed to, and those are routinely not the same rung. Until
  // now there was nowhere to put the difference: the queue could reach
  // `writing_number_issued` and the agent's commission level stayed empty, so
  // every deal on that carrier priced from nothing.
  granted_comp_level_id: z.string().uuid().nullable().optional(),
  granted_level_name: z.string().trim().max(120).nullable().optional(),
  granted_pct: z.coerce.number().min(0).max(500).nullable().optional(),
  // The other two facts an activation carries: how the carrier pays it out,
  // and from when. Both are agency-set; an agent never sends these.
  granted_advance_option: z.enum(ADVANCE_OPTIONS as unknown as [string, ...string[]]).nullable().optional(),
  granted_effective_date: z.string().max(10).nullable().optional(),
});

/**
 * Make the granted level real: `agent_commission_levels`.
 *
 * This is the table the commission engine reads, and it is the one thing an
 * approval has to produce for the approval to mean anything. Keyed on
 * (agent_id, carrier_id) — a unique constraint already exists — so recording a
 * decision twice corrects the row rather than duplicating it.
 *
 * Never throws, for the same reason `syncContractRecord` does not: the request
 * status is the source of truth, and a bookkeeping failure that rolled back a
 * carrier decision would lose the decision.
 */
async function recordGrantedLevel(
  request: any,
  args: {
    actorId: string;
    orgId: string;
    status: string;
    compLevelId?: string | null;
    levelName?: string | null;
    pct?: number | null;
    writingNumber?: string | null;
    advanceOption?: string | null;
  },
) {
  try {
    const { data: orgCarrier } = await supabaseAdmin
      .from("org_carriers").select("carrier_id").eq("id", request.org_carrier_id).maybeSingle();
    if (!orgCarrier?.carrier_id) return;

    // A level id is the strongest statement, so it wins the name and the
    // percentage; a hand-typed name or number is used exactly as given.
    let levelName = args.levelName?.trim() || null;
    let pct = args.pct ?? null;
    if (args.compLevelId) {
      const { data: level } = await supabaseAdmin
        .from("carrier_comp_levels")
        .select("level_name, commission_pct")
        .eq("id", args.compLevelId)
        .maybeSingle();
      if (level) {
        levelName = level.level_name ?? levelName;
        if (pct == null && level.commission_pct != null) pct = Number(level.commission_pct);
      }
    }

    // Nothing to say and nothing already recorded: leave the row alone rather
    // than writing an empty assignment that reads as "granted, at nothing".
    if (!levelName && pct == null && !args.writingNumber && !args.advanceOption) return;

    const patch: Record<string, unknown> = {
      agent_id: request.agent_id,
      carrier_id: orgCarrier.carrier_id,
      organization_id: request.organization_id ?? args.orgId,
      assigned_by: args.actorId,
      assigned_at: new Date().toISOString(),
      // Approval alone is an internal clearance; a writing number is the
      // carrier having appointed them. Only the latter is live.
      status: isLiveStatus(args.status) ? "active" : "pending",
      pending: !isLiveStatus(args.status),
    };
    if (args.advanceOption) patch.advance_option = args.advanceOption;
    if (levelName) patch.commission_level = levelName;
    if (pct != null) patch.assigned_pct = pct;
    if (args.writingNumber?.trim()) patch.writing_number = args.writingNumber.trim();

    const { error } = await supabaseAdmin
      .from("agent_commission_levels")
      .upsert(patch, { onConflict: "agent_id,carrier_id" });
    if (error) console.error("[contracting] commission level not recorded", error);
  } catch (e) {
    console.error("[contracting] commission level sync failed", e);
  }
}


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
      status: isLiveStatus(status) ? "active" : "processing",
    };
    if (isLiveStatus(status)) {
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

/**
 * One history entry per fact that moved.
 *
 * `contracting_status_history` was a status trail: the trigger wrote the
 * transition and the app added a message. Everything else a decision carries —
 * the writing number, the granted rung, the advance, the effective date — was
 * written to the request and to `agent_commission_levels` and recorded nowhere,
 * so "who put this agent at 90%, and when" had no answer at all.
 *
 * Never throws. A bookkeeping failure must not roll back a decision that
 * already happened.
 */
async function recordFieldChanges(args: {
  orgId: string;
  requestId: string;
  actorId: string;
  status: string;
  before: any;
  data: any;
}) {
  const { orgId, requestId, actorId, status, before, data } = args;

  const changes: { kind: string; field: string; from: string | null; to: string | null }[] = [];
  const track = (kind: string, field: string, prev: unknown, next: unknown) => {
    if (next === undefined) return;
    const a = prev == null || prev === "" ? null : String(prev);
    const b = next == null || next === "" ? null : String(next);
    if (a === b) return;
    changes.push({ kind, field, from: a, to: b });
  };

  track("writing_number", "Writing number", before.writing_number, data.writing_number);
  track("carrier_level", "Carrier level", before.granted_level_name, data.granted_level_name);
  track("carrier_level", "Carrier level percentage", before.granted_pct, data.granted_pct);
  track("advance", "Advance option", before.granted_advance_option, data.granted_advance_option);
  track("effective_date", "Effective date", before.desired_effective_date, data.granted_effective_date);

  if (!changes.length) return;

  try {
    await supabaseAdmin.from("contracting_status_history").insert(
      changes.map((c) => ({
        organization_id: orgId,
        request_id: requestId,
        from_status: before.status,
        to_status: status,
        changed_by: actorId,
        change_kind: c.kind,
        field: c.field,
        old_value: c.from,
        new_value: c.to,
      })),
    );
  } catch (e) {
    console.error("[contracting] field history not recorded", e);
  }
}

/**
 * A note, without moving the request.
 *
 * Staff need both halves: something the agent reads, and something only the
 * contracting team reads. Both belong on the same timeline as the status
 * changes, which is why they are history rows rather than a second table.
 */
export const addRequestNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    agent_visible_message: z.string().trim().max(2000).nullable().optional(),
    internal_message: z.string().trim().max(2000).nullable().optional(),
    next_action: z.string().trim().max(300).nullable().optional(),
  }).refine((v) => Boolean(v.agent_visible_message || v.internal_message), {
    message: "Write a note before saving it.",
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);

    const { data: request } = await supabaseAdmin
      .from("contracting_requests").select("id, status, agent_id, reference")
      .eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!request) throw new OrgAccessError("That request is not available to you");

    const isOwnAgent = request.agent_id === userId;
    if (!access.canSubmit && !access.canApprove && !isOwnAgent) {
      deny("You don't have permission to add a note to this request.");
    }
    // An agent may say something on their own request; they may not write into
    // the staff-only channel.
    const internal = access.canSubmit || access.canApprove ? data.internal_message ?? null : null;

    await supabaseAdmin.from("contracting_status_history").insert({
      organization_id: orgId, request_id: data.id,
      from_status: request.status, to_status: request.status, changed_by: userId,
      change_kind: internal && !data.agent_visible_message ? "internal_note" : "note",
      agent_visible_message: data.agent_visible_message ?? null,
      internal_message: internal,
      next_action: data.next_action ?? null,
    });

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "request.note_added",
      recordType: "contracting_requests", recordId: data.id, subjectAgentId: request.agent_id,
    });

    // Only a note the agent can read is worth telling them about.
    if (data.agent_visible_message && !isOwnAgent) {
      const { notifyPeople } = await import("@/lib/notify.server");
      await notifyPeople(supabaseAdmin, {
        userIds: [request.agent_id],
        category: "contract_updates",
        title: "New note on your carrier request",
        description: data.agent_visible_message,
        type: "contracting",
      });
    }
    return { ok: true };
  });

/**
 * Record that an invitation went out — SureLC, or straight from the carrier.
 *
 * The workflow's "Invite sent" step is a fact about the outside world: somebody
 * sent the agent a link and is now waiting on them. Recording it here moves the
 * status, stamps when, and tells the agent to go and finish it.
 */
export const recordRequestInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    method: z.enum(["surelc", "carrier_direct"]),
    reference: z.string().trim().max(200).nullable().optional(),
    agent_visible_message: z.string().trim().max(2000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const access = await resolveAccess(userId);
    const orgId = requireOrg(access);
    if (!access.canSubmit && !access.canApprove) {
      deny("Only contracting staff or the agency owner can record an invitation.");
    }

    const { data: request } = await supabaseAdmin
      .from("contracting_requests").select("*")
      .eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!request) throw new OrgAccessError("That request is not available to you");

    const now = new Date().toISOString();
    const label = data.method === "surelc" ? "SureLC invitation" : "Carrier invitation";
    const message = data.agent_visible_message?.trim()
      || `${label} sent. Check your email and complete it — contracting continues once you do.`;

    const { error } = await supabaseAdmin.from("contracting_requests").update({
      status: "invite_sent",
      invite_method: data.method,
      invite_sent_at: now,
      submission_reference: data.reference ?? request.submission_reference ?? null,
    }).eq("id", data.id).eq("organization_id", orgId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("contracting_status_history").insert({
      organization_id: orgId, request_id: data.id,
      from_status: request.status, to_status: "invite_sent", changed_by: userId,
      change_kind: "invitation",
      field: label,
      new_value: data.reference ?? null,
      agent_visible_message: message,
      next_action: "Complete the invitation the carrier emailed you",
    });

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "request.invitation_recorded",
      recordType: "contracting_requests", recordId: data.id, subjectAgentId: request.agent_id,
      previous: { status: request.status }, next: { status: "invite_sent", method: data.method },
    });

    await notifyAgent(request.agent_id, orgId, "invite_sent", message, request.reference);
    return { ok: true };
  });

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
    if (["approved", "declined", "writing_number_issued", "active", "invite_sent"].includes(data.status)
      && !access.canApprove && !access.canSubmit) {
      deny("Only contracting staff or the agency owner can record a carrier decision.");
    }

    // ── "Agent action needed" has to say what the action is ────────────────
    //
    // The status exists to move the request onto the agent's desk. Without a
    // sentence saying what they must do, it reads as the request having stalled
    // and the agent has nothing to act on — so the note is part of the status,
    // not an optional extra beside it.
    if (isAgentActionStatus(data.status) && !data.agent_visible_message?.trim()) {
      throw new Error(
        "Tell the agent what they need to do. \"Agent action needed\" requires a note the agent can see.",
      );
    }

    // ── Activating a contract needs the whole fact, not part of it ─────────
    //
    // A live appointment is a carrier, an agent, a level (or the position
    // percentage standing in for one), an advance and a writing number. An
    // activation missing any of those produces a contract that prices from
    // nothing, which surfaces later as a posted deal that never paid.
    if (isLiveStatus(data.status)) {
      const writingNumber = (data.writing_number ?? before.writing_number ?? "").toString().trim();
      const levelName = (data.granted_level_name ?? before.granted_level_name
        ?? before.requested_advance_level ?? "").toString().trim();
      const hasLevel = Boolean(data.granted_comp_level_id ?? before.granted_comp_level_id)
        || Boolean(levelName) || data.granted_pct != null || before.granted_pct != null;
      const advance = data.granted_advance_option ?? before.granted_advance_option ?? null;

      const missing: string[] = [];
      if (!writingNumber) missing.push("a writing number");
      if (!hasLevel) missing.push("a carrier level or agency position percentage");
      if (!advance) missing.push("an advance option");
      if (missing.length) {
        throw new Error(
          `This contract can't go active yet — it still needs ${missing.join(", ")}.`,
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
    if (data.status === "invite_sent") patch.invite_sent_at = now;
    if (isLiveStatus(data.status)) patch.activated_at = now;
    if (data.confirmation_reference) patch.carrier_confirmation_number = data.confirmation_reference;

    // The decision itself lives on the request too, so the queue can show what
    // was granted without going and reading the commission table.
    if (data.granted_comp_level_id !== undefined) patch.granted_comp_level_id = data.granted_comp_level_id;
    if (data.granted_level_name !== undefined) patch.granted_level_name = data.granted_level_name;
    if (data.granted_pct !== undefined) patch.granted_pct = data.granted_pct;
    if (data.granted_advance_option !== undefined) patch.granted_advance_option = data.granted_advance_option;
    if (data.granted_effective_date !== undefined) patch.desired_effective_date = data.granted_effective_date;
    if (data.writing_number !== undefined) patch.writing_number = data.writing_number;

    const { data: updated, error } = await supabaseAdmin
      .from("contracting_requests")
      .update(patch)
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated || updated.status !== data.status) {
      throw new Error("The status was not saved. Reload the request and try again.");
    }

    // "Mark submitted" closes the handoff loop. If somebody opened a portal
    // for this request and this is the first confirmation since, stamp that
    // handoff's marked_submitted_at — the column whose own header says "set
    // when a human confirms the external step" and which nothing ever wrote.
    // The gap between generated_at and this stamp is time-to-complete per
    // carrier, the number the whole telemetry exists to produce.
    if (data.status === "submitted") {
      const { data: handoff } = await supabaseAdmin
        .from("contracting_submissions")
        .select("id")
        .eq("request_id", data.id)
        .eq("artifact_type", "portal_handoff")
        .is("marked_submitted_at", null)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (handoff) {
        await supabaseAdmin
          .from("contracting_submissions")
          .update({
            marked_submitted_at: now,
            marked_submitted_by: userId,
            confirmation_reference: data.confirmation_reference ?? null,
          })
          .eq("id", handoff.id);
      }
    }

    // Finishing the work produces a contract. contract_requests is where a
    // contract record lives — it is what the agent's own Contracts page, the
    // commission engine and every import read — and contract_record_id exists
    // to point at it. Nothing used to write either, so a request could be
    // approved here and the agent would still show as uncontracted everywhere
    // else.
    if (["approved", "writing_number_issued", "active"].includes(data.status)) {
      await syncContractRecord(before, data.status, now, data.writing_number);
      // And the level, which is the half the commission engine reads. Falls
      // back to what the request was raised at when staff recorded no change,
      // so an approval never leaves the agent with no level at all.
      await recordGrantedLevel(before, {
        actorId: userId,
        orgId: orgId,
        status: data.status,
        compLevelId: data.granted_comp_level_id ?? before.requested_comp_level_id ?? null,
        levelName: data.granted_level_name ?? before.requested_advance_level ?? null,
        pct: data.granted_pct ?? before.granted_pct ?? null,
        writingNumber: data.writing_number ?? before.writing_number ?? null,
        advanceOption: data.granted_advance_option ?? before.granted_advance_option ?? null,
      });
    }

    // The trigger records the bare transition; this adds the human context.
    if (data.agent_visible_message || data.internal_message || data.next_action) {
      await supabaseAdmin.from("contracting_status_history").insert({
        organization_id: orgId, request_id: data.id,
        from_status: before.status, to_status: data.status, changed_by: userId,
        change_kind: "status",
        agent_visible_message: data.agent_visible_message ?? null,
        internal_message: data.internal_message ?? null,
        next_action: data.next_action ?? null,
        due_date: data.due_date ?? null,
      });
    }

    // Everything else the decision changed, each as its own timestamped entry.
    // A status trail that cannot answer "who moved them to 90%, and when" is
    // not a trail anybody can settle a commission dispute with.
    await recordFieldChanges({
      orgId, requestId: data.id, actorId: userId, status: data.status, before, data,
    });

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
    invite_sent: "Your carrier contracting invitation was sent",
    active: "Your carrier contract is active",
    carrier_reviewing: "The carrier is reviewing your contract",
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

  // Through `notifyPeople`, which asks may_notify first. The agency's
  // `notify_on_status_change` above is the org's switch; this is the person's,
  // and "Contracting updates — carrier appointments, level changes,
  // transfers" is exactly what these are. It was never consulted here.
  const { notifyPeople } = await import("@/lib/notify.server");
  await notifyPeople(supabaseAdmin, {
    userIds: [agentId],
    category: "contract_updates",
    title,
    description: message ?? (reference ? `Request ${reference}` : null),
    type: "contracting",
  });
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
