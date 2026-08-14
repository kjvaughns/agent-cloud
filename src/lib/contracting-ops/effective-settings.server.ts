import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import {
  MAX_PARENT_DEPTH, resolveEffectiveSettings,
  type ChainOrg, type EffectiveSettings,
} from "@/lib/contracting-ops/effective-settings";

const supabaseAdmin = _admin as any;

/**
 * Load the org's ancestry and resolve its effective contracting settings.
 *
 * This is THE way to read org_contracting_settings server-side. Reading the
 * table directly answers "what did this org save?" — the wrong question for
 * a child agency, whose unsaved fields are governed by its parent. Every
 * consumer (work inbox, licensing, PDB reviews, hierarchy approvals, the
 * settings page itself) goes through here so they cannot disagree.
 *
 * Runs on the admin client on purpose: a child may not read its parent's
 * row, and widening RLS would hand it the parent's whole settings record.
 * The resolver returns only effective values plus, per field, the name of
 * the org a value was inherited from — which the child's owner already
 * knows, because they joined that agency.
 */
export async function loadEffectiveContractingSettings(orgId: string): Promise<
  EffectiveSettings & { hasParent: boolean; parentName: string | null }
> {
  const chain: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let cursor: string | null = orgId;

  while (cursor && !seen.has(cursor) && chain.length < MAX_PARENT_DEPTH) {
    seen.add(cursor);
    const { data: org }: { data: any } = await supabaseAdmin
      .from("organizations").select("id, name, parent_org_id").eq("id", cursor).maybeSingle();
    if (!org) break;
    chain.push({ id: org.id, name: org.name ?? "your parent agency" });
    cursor = org.parent_org_id ?? null;
  }

  // One query for every row on the chain — the walk above is org metadata only.
  const ids = chain.map((c) => c.id);
  const { data: rows } = ids.length
    ? await supabaseAdmin.from("org_contracting_settings").select("*").in("organization_id", ids)
    : { data: [] };
  const byOrg = new Map<string, Record<string, unknown>>(
    ((rows ?? []) as any[]).map((r) => [r.organization_id, r]),
  );

  const chainOrgs: ChainOrg[] = chain.map((c) => ({
    orgId: c.id, orgName: c.name, row: byOrg.get(c.id) ?? null,
  }));

  return {
    ...resolveEffectiveSettings(chainOrgs),
    hasParent: chain.length > 1,
    parentName: chain[1]?.name ?? null,
  };
}
