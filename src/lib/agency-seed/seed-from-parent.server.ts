import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { INHERITABLE_FIELDS } from "@/lib/contracting-ops/effective-settings";

const supabaseAdmin = _admin as any;

/**
 * A new sub agency opens with its parent's configuration already in place.
 *
 * ── Copy once, then independent ──
 *
 * The alternative — read the parent live and let the child override field by
 * field — is what `effective-settings` does for contracting policy, and it is
 * the wrong shape for the ladder, the carriers and the comp grids. Those are
 * *lists*: a child that renames a rung, drops a carrier or re-prices a product
 * is not "overriding a field", it is authoring its own list, and a live read
 * would keep resurrecting the parent's version of rows the child deliberately
 * changed. So the parent's setup is duplicated into the child's own rows at
 * creation, and from then on the two agencies never touch each other.
 *
 * ── Idempotent per category ──
 *
 * Every table is skipped when the child already has rows in it. That is what
 * makes this safe to call from more than one place (invite acceptance, the
 * backfill, an owner pressing the button on Agency settings) without ever
 * duplicating a ladder or overwriting work somebody has already done.
 *
 * Runs on the admin client because a child cannot read its parent's rows under
 * RLS. Nothing about the parent leaves this function: the caller gets counts.
 */

export type SeedCounts = Record<string, number>;

/** Copied in this order — foreign keys point leftwards. */
const CATEGORY_ORDER = [
  "agency_levels",
  "org_carriers",
  "carrier_comp_levels",
  "agency_level_carrier_mappings",
  "org_carrier_methods",
  "carrier_requirements",
  "commission_grids",
  "org_contracting_settings",
] as const;

/** Never copied: identity, ownership, audit trail, or a pointer to a person. */
const DROP_COLUMNS = new Set([
  "id",
  "organization_id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "auto_assign_staff_id",
]);

function strip(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!DROP_COLUMNS.has(k)) out[k] = v;
  }
  return out;
}

async function hasRows(table: string, orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from(table).select("id").eq("organization_id", orgId).limit(1);
  return Boolean((data ?? []).length);
}

async function readParent(table: string, parentOrgId: string): Promise<any[]> {
  const { data, error } = await supabaseAdmin.from(table).select("*").eq("organization_id", parentOrgId);
  // A table that does not exist yet, or one the copy has no business failing
  // over, must not take the whole seed (and therefore the signup) down.
  if (error) {
    console.error("[agency-seed] read failed", { table, parentOrgId, code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as any[];
}

/**
 * Insert the child's copies and return old id → new id, so the rows that point
 * at them can be remapped.
 */
async function copyRows(
  table: string,
  rows: Record<string, any>[],
  childOrgId: string,
  transform?: (r: Record<string, any>) => Record<string, any> | null,
): Promise<{ count: number; idMap: Map<string, string> }> {
  const idMap = new Map<string, string>();
  if (!rows.length) return { count: 0, idMap };

  const payload: Record<string, any>[] = [];
  const oldIds: string[] = [];
  for (const row of rows) {
    const base = { ...strip(row), organization_id: childOrgId };
    const shaped = transform ? transform(base) : base;
    if (!shaped) continue;
    payload.push(shaped);
    oldIds.push(String(row.id));
  }
  if (!payload.length) return { count: 0, idMap };

  const { data, error } = await supabaseAdmin.from(table).insert(payload).select("id");
  if (error) {
    console.error("[agency-seed] copy failed", { table, childOrgId, code: error.code, message: error.message });
    return { count: 0, idMap };
  }
  const inserted = (data ?? []) as { id: string }[];
  // Postgres returns inserted rows in the order they were supplied.
  inserted.forEach((r, i) => {
    const oldId = oldIds[i];
    if (oldId) idMap.set(oldId, r.id);
  });
  return { count: inserted.length, idMap };
}

/**
 * Duplicate the parent agency's setup into the child.
 *
 * Returns a per-category count of what was actually written. A category the
 * child had already populated reports 0 — nothing was touched.
 */
export async function seedOrgFromParent(
  childOrgId: string,
  parentOrgId: string,
): Promise<SeedCounts> {
  const counts: SeedCounts = {};
  for (const c of CATEGORY_ORDER) counts[c] = 0;
  if (!childOrgId || !parentOrgId || childOrgId === parentOrgId) return counts;

  // ── The ladder and the carriers, whose new ids everything else needs ──
  let levelMap = new Map<string, string>();
  if (!(await hasRows("agency_levels", childOrgId))) {
    const res = await copyRows("agency_levels", await readParent("agency_levels", parentOrgId), childOrgId);
    counts.agency_levels = res.count;
    levelMap = res.idMap;
  } else {
    levelMap = await existingMap("agency_levels", parentOrgId, childOrgId, "name");
  }

  let carrierMap = new Map<string, string>();
  if (!(await hasRows("org_carriers", childOrgId))) {
    const res = await copyRows("org_carriers", await readParent("org_carriers", parentOrgId), childOrgId);
    counts.org_carriers = res.count;
    carrierMap = res.idMap;
  } else {
    carrierMap = await existingMap("org_carriers", parentOrgId, childOrgId, "carrier_id");
  }

  // ── Per-carrier comp levels, whose ids the role mappings point at ──
  let compLevelMap = new Map<string, string>();
  if (!(await hasRows("carrier_comp_levels", childOrgId))) {
    const rows = await readParent("carrier_comp_levels", parentOrgId);
    const res = await copyRows("carrier_comp_levels", rows, childOrgId, (r) => {
      const oc = carrierMap.get(String(r.org_carrier_id ?? ""));
      if (!oc) return null; // its carrier didn't come across; the level is meaningless
      return {
        ...r,
        org_carrier_id: oc,
        // Points at another rung of the same ladder; remapped below once every
        // new id exists, so it starts null rather than pointing at the parent's.
        max_downline_level_id: null,
      };
    });
    counts.carrier_comp_levels = res.count;
    compLevelMap = res.idMap;

    // Second pass for the self-reference, now that both sides have new ids.
    for (const row of rows) {
      const newId = compLevelMap.get(String(row.id));
      const newTarget = row.max_downline_level_id
        ? compLevelMap.get(String(row.max_downline_level_id))
        : null;
      if (newId && newTarget) {
        await supabaseAdmin
          .from("carrier_comp_levels")
          .update({ max_downline_level_id: newTarget })
          .eq("id", newId);
      }
    }
  }

  // ── Level → carrier-level mappings ──
  if (!(await hasRows("agency_level_carrier_mappings", childOrgId))) {
    const res = await copyRows(
      "agency_level_carrier_mappings",
      await readParent("agency_level_carrier_mappings", parentOrgId),
      childOrgId,
      (r) => {
        const level = levelMap.get(String(r.agency_level_id ?? ""));
        const oc = carrierMap.get(String(r.org_carrier_id ?? ""));
        if (!level || !oc) return null;
        return { ...r, agency_level_id: level, org_carrier_id: oc };
      },
    );
    counts.agency_level_carrier_mappings = res.count;
  }

  // ── How each carrier is submitted to, and what it asks for ──
  for (const table of ["org_carrier_methods", "carrier_requirements"] as const) {
    if (await hasRows(table, childOrgId)) continue;
    const res = await copyRows(table, await readParent(table, parentOrgId), childOrgId, (r) => {
      const oc = carrierMap.get(String(r.org_carrier_id ?? ""));
      if (!oc) return null;
      return { ...r, org_carrier_id: oc };
    });
    counts[table] = res.count;
  }

  // ── Role → comp level mappings, if the parent set any ──
  if (!(await hasRows("org_role_comp_mappings", childOrgId))) {
    const res = await copyRows(
      "org_role_comp_mappings",
      await readParent("org_role_comp_mappings", parentOrgId),
      childOrgId,
      (r) => {
        const oc = carrierMap.get(String(r.org_carrier_id ?? ""));
        const cl = r.comp_level_id ? compLevelMap.get(String(r.comp_level_id)) : null;
        if (!oc) return null;
        return { ...r, org_carrier_id: oc, comp_level_id: cl ?? null };
      },
    );
    counts.org_role_comp_mappings = res.count;
  }

  // ── The rates. Keyed on `carriers.id`, so no remapping is needed ──
  if (!(await hasRows("commission_grids", childOrgId))) {
    const res = await copyRows(
      "commission_grids",
      await readParent("commission_grids", parentOrgId),
      childOrgId,
      (r) => ({ ...r, source: "inherited" }),
    );
    counts.commission_grids = res.count;
  }

  // ── Contracting policy: concrete child values, not live inheritance ──
  const { data: existingSettings } = await supabaseAdmin
    .from("org_contracting_settings")
    .select("organization_id")
    .eq("organization_id", childOrgId)
    .maybeSingle();
  if (!existingSettings) {
    const { data: parentSettings } = await supabaseAdmin
      .from("org_contracting_settings")
      .select("*")
      .eq("organization_id", parentOrgId)
      .maybeSingle();
    if (parentSettings) {
      const patch: Record<string, any> = { organization_id: childOrgId };
      for (const f of INHERITABLE_FIELDS) patch[f] = (parentSettings as any)[f];
      // Claiming every copied field is what turns the live parent lookup off
      // for this org: the values are now the child's own, as copy-once means.
      patch.overridden_fields = [...INHERITABLE_FIELDS];
      const { error } = await supabaseAdmin.from("org_contracting_settings").insert(patch);
      if (error) {
        console.error("[agency-seed] settings copy failed", { childOrgId, message: error.message });
      } else {
        counts.org_contracting_settings = 1;
      }
    }
  }

  return counts;
}

/**
 * The child already has rows here, so nothing is copied — but the tables that
 * point at these rows still need to translate the parent's ids. Matched on a
 * natural key (`name` for the ladder, `carrier_id` for carriers), which is what
 * a human would match on.
 */
async function existingMap(
  table: string,
  parentOrgId: string,
  childOrgId: string,
  keyColumn: string,
): Promise<Map<string, string>> {
  const [parent, child] = await Promise.all([
    readParent(table, parentOrgId),
    readParent(table, childOrgId),
  ]);
  const childByKey = new Map<string, string>();
  for (const r of child) {
    const k = String(r[keyColumn] ?? "").trim().toLowerCase();
    if (k) childByKey.set(k, r.id);
  }
  const out = new Map<string, string>();
  for (const r of parent) {
    const k = String(r[keyColumn] ?? "").trim().toLowerCase();
    const match = k ? childByKey.get(k) : undefined;
    if (match) out.set(String(r.id), match);
  }
  return out;
}

/** The org's parent, from the foreign key — the same source `permissions` uses. */
export async function getParentOrgId(orgId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("organizations").select("parent_org_id").eq("id", orgId).maybeSingle();
  return (data as any)?.parent_org_id ?? null;
}
