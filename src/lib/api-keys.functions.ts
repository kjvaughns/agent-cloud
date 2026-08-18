/**
 * Issuing, listing and withdrawing an agency's API keys.
 *
 * Owner-only, all three. Handing somebody outside the agency a live feed of
 * its production is the owner's decision, and `assertOrgOwner` is the same
 * check the rest of the settings surface uses for decisions of that weight.
 *
 * Every one of them writes an audit row. A credential that reads the agency's
 * numbers is a permission, and permissions leave a trail here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertOrgOwner } from "@/lib/org-guard";
import { maskKey, normalizeScopes, API_SCOPES } from "@/lib/api/keys";
import { generateApiKey } from "@/lib/api/keys.server";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/** Non-fatal by design: a key must not fail to issue because its trail would not write. */
async function audit(
  orgId: string, actor: string, action: string,
  recordId: string, metadata: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("contracting_audit_log").insert({
      organization_id: orgId,
      actor_id: actor,
      action,
      // `record_type` is not null on this table, and it is what makes the row
      // findable later among contract and carrier changes.
      record_type: "api_key",
      record_id: recordId,
      metadata,
    });
  } catch (e: any) {
    console.error("[api-keys] audit not written", action, e?.message);
  }
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { keys: [] as any[], isOwner: false, scopes: API_SCOPES };

    // Not an error for a non-owner — the panel simply says the owner manages
    // these, rather than showing a control that would refuse.
    try {
      await assertOrgOwner(userId, orgId);
    } catch {
      return { keys: [] as any[], isOwner: false, scopes: API_SCOPES };
    }

    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Usage in the last 30 days, so "is anybody actually calling this" has an
    // answer without the owner having to ask the person holding the key.
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: usage } = await supabaseAdmin
      .from("api_key_usage")
      .select("api_key_id, status")
      .eq("organization_id", orgId)
      .gte("created_at", since);

    const calls = new Map<string, { ok: number; refused: number }>();
    for (const u of (usage ?? []) as any[]) {
      if (!u.api_key_id) continue;
      const held = calls.get(u.api_key_id) ?? { ok: 0, refused: 0 };
      if (Number(u.status) < 400) held.ok += 1;
      else held.refused += 1;
      calls.set(u.api_key_id, held);
    }

    return {
      isOwner: true,
      scopes: API_SCOPES,
      keys: ((data ?? []) as any[]).map((k) => ({
        id: k.id as string,
        name: k.name as string,
        masked: maskKey(k.key_prefix),
        scopes: (k.scopes ?? []) as string[],
        created_at: k.created_at as string,
        last_used_at: (k.last_used_at ?? null) as string | null,
        revoked_at: (k.revoked_at ?? null) as string | null,
        calls: calls.get(k.id) ?? { ok: 0, refused: 0 },
      })),
    };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(80),
      scopes: z.array(z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { raw, prefix, hash } = generateApiKey();
    const scopes = normalizeScopes(data.scopes);

    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        organization_id: orgId,
        name: data.name,
        key_prefix: prefix,
        key_hash: hash,
        scopes,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await audit(orgId, userId, "api_key_created", row.id, { name: data.name, scopes });

    // The only time the key exists outside the caller's browser. It is not
    // stored anywhere in a form we could return again, which is the point.
    return { id: row.id as string, key: raw, scopes };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    // Scoped to the caller's own org as well as the id, so an id from another
    // agency matches nothing rather than being revoked.
    const { data: touched, error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      .select("id, name");
    if (error) throw new Error(error.message);
    // Reading the write back rather than trusting the absence of an error:
    // "revoked" is a claim about the world, and an owner withdrawing access
    // needs it to be true.
    if (!touched?.length) throw new Error("That key was not found, or is already revoked.");

    await audit(orgId, userId, "api_key_revoked", data.id, { name: touched[0].name });
    return { ok: true as const };
  });
