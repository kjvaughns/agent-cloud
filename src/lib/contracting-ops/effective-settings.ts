/**
 * Parent → child settings inheritance, as a pure computation.
 *
 * A child agency starts by inheriting every contracting-policy setting from
 * its parent; changing one writes a child-local override and never touches
 * the parent; resetting drops the override and re-adopts whatever the parent
 * currently says. The whole model reduces to one question per field — *whose
 * row gets to answer?* — and this module answers it from a chain of rows the
 * caller has already loaded, so the rule is testable without a database.
 *
 * The override marker is `overridden_fields text[]` on
 * `org_contracting_settings`:
 *
 *   - `null` (or the column not existing yet — the pre-migration window)
 *     means the row predates inheritance: every field it holds counts, which
 *     is exactly how rows behaved before the column existed. Nothing changes
 *     for anyone until they deliberately reset a field to "inherit".
 *   - a list means only the named fields count; the rest fall through to the
 *     parent's effective value, then the grandparent's, then the system
 *     default.
 *
 * `auto_assign_staff_id` is deliberately NOT inheritable: it names a person
 * in *this* org, and a parent's staffer means nothing in the child's queue.
 */

export const INHERITABLE_FIELDS = [
  "pdb_refresh_days",
  "license_expiry_warning_days",
  "require_manager_review",
  "require_owner_approval",
  "require_owner_approval_for_comp_change",
  "require_owner_approval_for_hierarchy",
  "default_request_priority",
  "request_sla_days",
  "agents_may_request_contracts",
  "agents_may_self_activate_carriers",
  "warn_on_duplicate_requests",
  "notify_on_missing_documents",
  "notify_on_status_change",
] as const;

export type InheritableField = (typeof INHERITABLE_FIELDS)[number];

/** Mirrors the column defaults, so an org with no row anywhere behaves identically. */
export const SYSTEM_DEFAULTS: Record<string, any> = {
  pdb_refresh_days: 90,
  license_expiry_warning_days: 45,
  require_manager_review: false,
  require_owner_approval: true,
  require_owner_approval_for_comp_change: true,
  require_owner_approval_for_hierarchy: true,
  default_request_priority: "normal",
  request_sla_days: 7,
  agents_may_request_contracts: true,
  agents_may_self_activate_carriers: false,
  warn_on_duplicate_requests: true,
  notify_on_missing_documents: true,
  notify_on_status_change: true,
  auto_assign_staff_id: null,
};

/** How far up parent_org_id the chain loader is allowed to walk. */
export const MAX_PARENT_DEPTH = 10;

export type ChainOrg = {
  orgId: string;
  orgName: string;
  /** The org's own org_contracting_settings row, or null if it never saved one. */
  row: Record<string, any> | null;
};

export type FieldSource =
  | { source: "self" }
  | { source: "inherited"; inheritedFrom: string }
  | { source: "default" };

export type EffectiveSettings = {
  /** Every field resolved — what the rest of the product should act on. */
  effective: Record<string, any>;
  /** Where each inheritable field's value came from, for the UI's state-in-words rows. */
  sources: Record<InheritableField, FieldSource>;
  /** What each field WOULD be if this org dropped its override — what Reset restores. */
  inheritedValues: Record<InheritableField, any>;
};

/** Does this row claim the field for itself? Null/absent marker = legacy row = yes. */
function claims(row: Record<string, any> | null, field: InheritableField): boolean {
  if (!row) return false;
  const marker = row.overridden_fields;
  if (marker == null) return true;
  return Array.isArray(marker) && marker.includes(field);
}

/**
 * Resolve the chain, own org first, root last. The chain loader owns the
 * depth cap and cycle guard; this assumes a well-formed list.
 */
export function resolveEffectiveSettings(chain: ChainOrg[]): EffectiveSettings {
  const self = chain[0] ?? null;
  const effective: Record<string, any> = {};
  const sources = {} as Record<InheritableField, FieldSource>;
  const inheritedValues = {} as Record<InheritableField, any>;

  for (const field of INHERITABLE_FIELDS) {
    // What the ancestors say, ignoring our own row — this is both the
    // fallback when we don't claim the field and the value Reset restores.
    let inherited: any = SYSTEM_DEFAULTS[field];
    let inheritedFrom: string | null = null;
    for (const org of chain.slice(1)) {
      if (claims(org.row, field)) {
        inherited = org.row![field] ?? SYSTEM_DEFAULTS[field];
        inheritedFrom = org.orgName;
        break;
      }
    }
    inheritedValues[field] = inherited;

    if (self && claims(self.row, field)) {
      effective[field] = self.row![field] ?? SYSTEM_DEFAULTS[field];
      sources[field] = { source: "self" };
    } else if (inheritedFrom) {
      effective[field] = inherited;
      sources[field] = { source: "inherited", inheritedFrom };
    } else {
      effective[field] = inherited;
      sources[field] = { source: "default" };
    }
  }

  // Org-local, never walks the chain.
  effective.auto_assign_staff_id = self?.row?.auto_assign_staff_id ?? null;

  return { effective, sources, inheritedValues };
}
