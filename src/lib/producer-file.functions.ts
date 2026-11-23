import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The agent's full producer file — everything a carrier asks for.
 * Readable by the agent, their agency owner, and staff with contracting access.
 */
export const getProducerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agentId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const agentId = data.agentId ?? userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles").select("organization_id").eq("id", agentId).maybeSingle();
    if (!target) throw new Error("Agent not found");
    if (agentId !== userId) {
      const org = target.organization_id as string | null;
      if (!org) throw new Error("Not allowed");
      const [owner, staff, admin] = await Promise.all([
        supabase.rpc("is_org_owner", { _org: org }),
        supabase.rpc("can_view_contracting", { _org: org }),
        supabase.rpc("is_admin_of_agent", { _agent: agentId }),
      ]);
      if (!owner.data && !staff.data && !admin.data) throw new Error("Not allowed");
    }
    const [p, docs, bg, ag, cp] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,first_name,last_name,email,phone,npn_number,date_of_birth,gender,street_address,city,state,zip_code,drivers_license_expiry").eq("id", agentId).maybeSingle(),
      supabaseAdmin.from("producer_documents").select("id,doc_type,file_name,file_url,start_date,expiration_date,carrier_name,policy_number,coverage_amount,certificate_number").eq("agent_id", agentId),
      supabaseAdmin.from("background_questions").select("question_number,answer,explanation").eq("agent_id", agentId),
      supabaseAdmin.from("producer_agreements").select("signature_name,signed_date,agreement_version").eq("agent_id", agentId).maybeSingle(),
      supabaseAdmin.from("producer_profiles").select("legal_first_name,legal_middle_name,legal_last_name,resident_state,resident_license_number").eq("profile_id", agentId).maybeSingle(),
    ]);
    const documents = await Promise.all((docs.data ?? []).map(async (d) => {
      let url: string | null = null;
      if (d.file_url) {
        const s = await supabaseAdmin.storage.from("agent-documents").createSignedUrl(d.file_url, 3600);
        url = s.data?.signedUrl ?? null;
      }
      return { ...d, url };
    }));
    return { profile: p.data, legal: cp.data, documents, background: bg.data ?? [], agreement: ag.data };
  });

/** Saves the agent's own guided-profile answers, including the carrier-only fields. */
export const saveGuidedProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    first_name: z.string().trim().max(60).optional(),
    last_name: z.string().trim().max(60).optional(),
    phone: z.string().trim().max(30).optional(),
    npn_number: z.string().trim().max(20).optional(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(["Male", "Female", "Other"]).optional(),
    street_address: z.string().trim().max(160).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().length(2).optional(),
    zip_code: z.string().trim().max(10).optional(),
  }).parse(i))
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== "") patch[k] = v;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await context.supabase.from("profiles").update(patch as never).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
