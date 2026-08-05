import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertSameOrg } from "@/lib/org-guard";
import { recordAudit } from "@/lib/contracting-ops/audit";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * The contracting half of a producer profile.
 *
 * Carriers contract a legal name, an address history and an employment history
 * that `profiles` has no columns for. Rather than widening `profiles` with
 * fields only contracting uses, these live in `producer_profiles`, one row per
 * producer, and the packet reads both.
 *
 * History entries are stored as JSON arrays. Carriers ask for five to ten years
 * of each; a table per entry would be three joins to render one form section
 * that is only ever read whole.
 */

const AddressEntry = z.object({
  from: z.string().max(10).nullable().optional(),
  to: z.string().max(10).nullable().optional(),
  line1: z.string().max(160).nullable().optional(),
  line2: z.string().max(160).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  zip: z.string().max(12).nullable().optional(),
});

const EmploymentEntry = z.object({
  from: z.string().max(10).nullable().optional(),
  to: z.string().max(10).nullable().optional(),
  employer: z.string().max(160).nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  supervisor: z.string().max(120).nullable().optional(),
});

/**
 * Profile completeness, over the fields carriers actually ask for.
 *
 * Deliberately not "how many columns are non-null" — an agent seeing 40%
 * because a middle name is blank learns nothing. These are the fields that
 * block a contracting packet.
 */
/**
 * Completeness comes from `agent_completion()`, and only from there.
 *
 * There were two implementations. This file scored eleven equally-weighted
 * checks — including address history and employment history, which the profile
 * page has no field for — while the RPC scored seven weighted ones. The same
 * agent read 45% on the Contracting tab and 20% on the dashboard, and nobody
 * could say which was right because both were.
 *
 * The RPC wins: it is the one the dashboard, the Team Command Center and the
 * onboarding checklist already read, it knows about the agency's
 * `collect_contracting_pii` setting, and its criteria are all reachable from
 * the UI. This asks it rather than having an opinion.
 */
async function completenessFor(agentId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("agent_completion", { _agent: agentId });
  // The RPC arrives with a migration and code ships before migrations apply.
  // Zero is a worse lie than null, so the caller reports "not scored yet".
  if (error) {
    console.error("[contracting-producer] agent_completion unavailable:", error.message);
    return 0;
  }
  return Number((data as any)?.pct ?? 0);
}

export const getContractingProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ agent_id: z.string().uuid().optional() }).default({}).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const targetId = data.agent_id ?? userId;
    // Viewing somebody else's contracting profile requires sharing an org with
    // them; the guard throws otherwise.
    if (targetId !== userId) await assertSameOrg(userId, targetId);

    const [{ data: profile }, { data: producer }] = await Promise.all([
      supabaseAdmin.from("profiles")
        .select("id, first_name, last_name, email, phone, npn_number, date_of_birth, state, street_address, city, zip_code, organization_id")
        .eq("id", targetId).maybeSingle(),
      supabaseAdmin.from("producer_profiles").select("*").eq("profile_id", targetId).maybeSingle(),
    ]);

    return {
      profile: profile ?? null,
      producer: producer ?? null,
      completeness: await completenessFor(targetId),
      isSelf: targetId === userId,
    };
  });

const SaveSchema = z.object({
  agent_id: z.string().uuid().optional(),
  legal_first_name: z.string().trim().max(80).nullable().optional(),
  legal_middle_name: z.string().trim().max(80).nullable().optional(),
  legal_last_name: z.string().trim().max(80).nullable().optional(),
  preferred_name: z.string().trim().max(80).nullable().optional(),
  suffix: z.string().trim().max(20).nullable().optional(),
  resident_state: z.string().trim().max(2).nullable().optional(),
  resident_license_number: z.string().trim().max(60).nullable().optional(),
  address_history: z.array(AddressEntry).max(20).default([]),
  employment_history: z.array(EmploymentEntry).max(20).default([]),
  contracting_notes: z.string().max(4000).nullable().optional(),
});

export const saveContractingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const { agent_id, ...fields } = data;
    const targetId = agent_id ?? userId;

    // An agent edits their own; anyone else needs to be in the same org and
    // hold carrier or licence management.
    if (targetId !== userId) {
      await assertSameOrg(userId, targetId);
      const orgId = await getMyPrimaryOrgId(userId);
      const { data: perms } = await supabaseAdmin.from("role_permissions")
        .select("contracting_manage_carriers, contracting_manage_licenses, staff_is_admin")
        .eq("profile_id", userId).eq("organization_id", orgId).maybeSingle();
      const { data: org } = await supabaseAdmin.from("organizations")
        .select("owner_id").eq("id", orgId).maybeSingle();
      const allowed =
        org?.owner_id === userId ||
        Boolean(perms?.contracting_manage_carriers) ||
        Boolean(perms?.contracting_manage_licenses);
      if (!allowed) throw new Error("You don't have permission to edit this producer's contracting profile.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("organization_id").eq("id", targetId).maybeSingle();

    const { error } = await supabaseAdmin.from("producer_profiles").upsert({
      profile_id: targetId,
      organization_id: profile?.organization_id ?? null,
      ...fields,
    }, { onConflict: "profile_id" });
    if (error) throw new Error(error.message);

    // Scored after the write, not before it. Scoring first grades the row as it
    // was a moment ago and stores a number this very save has already made
    // wrong — which is how a profile can read 80% directly after the edit that
    // completed it.
    const completeness = await completenessFor(targetId);
    await supabaseAdmin.from("producer_profiles").update({
      profile_completeness: completeness,
      completeness_checked_at: new Date().toISOString(),
    }).eq("profile_id", targetId);

    await recordAudit({
      organizationId: profile?.organization_id ?? null,
      actorId: userId,
      action: "license.edited",
      recordType: "producer_profiles",
      recordId: targetId,
      subjectAgentId: targetId,
      next: {
        legal_name_set: Boolean(fields.legal_first_name || fields.legal_last_name),
        addresses: fields.address_history.length,
        employers: fields.employment_history.length,
        completeness,
      },
    });

    return { ok: true, completeness };
  });
