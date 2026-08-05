import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertOrgOwner, getMyPrimaryOrgId } from "@/lib/org-guard";

// Generated DB types predate the phase-2 migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

export type OrgSettings = {
  organization_id: string;
  support_email: string | null;
  primary_admin_email: string | null;
  welcome_message: string | null;
  notify_new_agent: boolean;
  notify_new_ticket: boolean;
  notify_contract_request: boolean;
  /** Does this agency submit contracting paperwork itself? Off by default. */
  collect_contracting_pii: boolean;
};

const DEFAULTS = {
  support_email: null,
  primary_admin_email: null,
  welcome_message: null,
  // Off by default. An organization opts in to automated mail; it is never
  // opted in for them.
  notify_new_agent: false,
  notify_new_ticket: false,
  notify_contract_request: false,
  // Off by default, and the default is the point. Agent Cloud does not submit
  // contracting paperwork, so it has no use for an SSN, a driver's licence or
  // a bank account — and a product that asks for them anyway teaches agents
  // that handing them over is routine. An agency that genuinely does its own
  // contracting turns this on and the fields come back, scored.
  collect_contracting_pii: false,
};

export const getOrgSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { settings: null, orgName: null, isOwner: false };

    const [{ data: row }, { data: org }] = await Promise.all([
      supabaseAdmin.from("organization_settings").select("*").eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin.from("organizations").select("name, owner_id").eq("id", orgId).maybeSingle(),
    ]);

    return {
      settings: { organization_id: orgId, ...DEFAULTS, ...(row ?? {}) } as OrgSettings,
      orgName: org?.name ?? null,
      isOwner: org?.owner_id === userId,
    };
  });

const UpdateSchema = z.object({
  support_email: z.string().email().max(200).nullable().optional(),
  primary_admin_email: z.string().email().max(200).nullable().optional(),
  welcome_message: z.string().max(2000).nullable().optional(),
  notify_new_agent: z.boolean().optional(),
  notify_new_ticket: z.boolean().optional(),
  notify_contract_request: z.boolean().optional(),
  collect_contracting_pii: z.boolean().optional(),
});

export const updateOrgSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization to configure");
    await assertOrgOwner(userId, orgId);

    const patch: Record<string, unknown> = { organization_id: orgId, updated_by: userId, updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) patch[k] = v === "" ? null : v;
    }

    // `collect_contracting_pii` arrives with 20260805120000, and code reaches
    // production before migrations apply. PostgREST rejects the WHOLE upsert
    // with 42703 when it names a column that does not exist yet — so without
    // this, saving any agency setting would fail outright in that window, not
    // just the new one. Drop the key and retry; the toggle starts working when
    // the column does.
    let { error } = await supabaseAdmin
      .from("organization_settings")
      .upsert(patch, { onConflict: "organization_id" });

    const missingColumn = error &&
      (error.code === "42703" || /column .* does not exist/i.test(error.message ?? ""));
    if (missingColumn && "collect_contracting_pii" in patch) {
      const { collect_contracting_pii: _dropped, ...rest } = patch;
      ({ error } = await supabaseAdmin
        .from("organization_settings")
        .upsert(rest, { onConflict: "organization_id" }));
    }
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      organization_id: orgId,
      performed_by: userId,
      action: "org_settings_updated",
      target_user_id: null,
      previous_value: null,
      new_value: data,
    });

    return { ok: true };
  });

/**
 * Gate for every automated outbound message.
 *
 * Returns false unless the organization has explicitly enabled that channel.
 * Callers must treat a false result as "do not send" — not "send anyway and
 * log a warning".
 */
export async function isNotificationEnabled(
  orgId: string | null | undefined,
  key: "notify_new_agent" | "notify_new_ticket" | "notify_contract_request",
): Promise<boolean> {
  if (!orgId) return false;
  const { data } = await supabaseAdmin
    .from("organization_settings")
    .select(key)
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(data?.[key]);
}
