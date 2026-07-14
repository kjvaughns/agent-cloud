import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  sureLcIsConfigured,
  findProducerByEmail,
  createProducer,
  generateSsoUrl,
  createContractingRequest,
  getContractingRequestStatus,
} from "@/lib/surelc.service";

type Ctx = { supabase: any; userId: string };

// ── Check if SureLC is configured ─────────────────────────────────────────
export const checkSureLcStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ available: sureLcIsConfigured() }));

// ── Get or create SureLC producer ID for current agent ─────────────────────
async function getOrCreateSurelcId(supabase: any, userId: string): Promise<string | null> {
  if (!sureLcIsConfigured()) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, npn_number, surelc_agent_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;
  if ((profile as any).surelc_agent_id) return (profile as any).surelc_agent_id;

  let surelcId = await findProducerByEmail(profile.email);

  if (!surelcId) {
    surelcId = await createProducer({
      firstName: profile.first_name ?? "",
      lastName:  profile.last_name ?? "",
      email:     profile.email,
      npn:       profile.npn_number ?? undefined,
    });
  }

  if (surelcId) {
    await (supabase as any)
      .from("profiles")
      .update({ surelc_agent_id: surelcId })
      .eq("id", userId);
  }

  return surelcId;
}

// ── Generate SSO link for agent ────────────────────────────────────────────
export const getSureLcSsoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    if (!sureLcIsConfigured()) {
      return {
        available: false,
        sso_url:   null as string | null,
        message:   "SureLC integration is being set up. Your admin will notify you when it's ready.",
      };
    }

    const surelcId = await getOrCreateSurelcId(supabase, userId);
    if (!surelcId) {
      return { available: false, sso_url: null as string | null, message: "Could not link your SureLC account." };
    }

    const ssoUrl = await generateSsoUrl(surelcId);
    return {
      available: true,
      sso_url:   ssoUrl,
      message:   ssoUrl ? null : "SSO link generation failed. Try logging into SureLC directly.",
    };
  });

// ── Submit a contracting request to SureLC ─────────────────────────────────
export const submitToSureLc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contract_request_id: z.string().uuid(),
      carrier_id:          z.string().uuid(),
      notes:               z.string().max(500).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    if (!sureLcIsConfigured()) {
      return { submitted: false, pending: true, message: "SureLC integration coming soon." };
    }

    const { data: carrier } = await supabase
      .from("carriers")
      .select("id, name, surelc_carrier_code")
      .eq("id", data.carrier_id)
      .maybeSingle();

    if (!(carrier as any)?.surelc_carrier_code) {
      return {
        submitted: false,
        pending:   true,
        message:   `${(carrier as any)?.name ?? "This carrier"} is not yet configured for SureLC. Your admin will process this manually.`,
      };
    }

    const surelcId = await getOrCreateSurelcId(supabase, userId);
    if (!surelcId) {
      return { submitted: false, pending: true, message: "Could not link your SureLC account." };
    }

    const result = await createContractingRequest(
      surelcId,
      (carrier as any).surelc_carrier_code,
      data.notes
    );

    if (!result.success) {
      return { submitted: false, pending: true, message: "SureLC submission failed. Your admin has been notified." };
    }

    await (supabase as any)
      .from("contract_requests")
      .update({
        status:            "submitted",
        submitted_at:      new Date().toISOString(),
        surelc_request_id: result.requestId,
        notes:             `Submitted to SureLC. Request ID: ${result.requestId}`,
      })
      .eq("id", data.contract_request_id);

    return {
      submitted:  true,
      request_id: result.requestId,
      message:    "Submitted to SureLC successfully. You can track progress in your SureLC profile.",
    };
  });

// ── Sync status of open contracts from SureLC ──────────────────────────────
export const syncSureLcStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    if (!sureLcIsConfigured()) return { synced: 0, activated: 0 };

    const { data: openContracts } = await (supabase as any)
      .from("contract_requests")
      .select("id, carrier_id, status, surelc_request_id, writing_number")
      .eq("agent_id", userId)
      .not("surelc_request_id", "is", null)
      .not("status", "in", '("active","rejected","issue")');

    if (!(openContracts as any[])?.length) return { synced: 0, activated: 0 };

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("surelc_agent_id")
      .eq("id", userId)
      .maybeSingle();

    const surelcId = (profile as any)?.surelc_agent_id;
    if (!surelcId) return { synced: 0, activated: 0 };

    let synced    = 0;
    let activated = 0;

    for (const contract of (openContracts as any[])) {
      const status = await getContractingRequestStatus(surelcId, contract.surelc_request_id);
      if (!status) continue;

      if (status.agentCloudStatus === contract.status) continue;

      const updatePayload: any = { status: status.agentCloudStatus };
      if (status.agentCloudStatus === "active" && status.writingNumber) {
        updatePayload.writing_number = status.writingNumber;
        updatePayload.activated_at   = new Date().toISOString();
        activated++;
      }

      await (supabase as any)
        .from("contract_requests")
        .update(updatePayload)
        .eq("id", contract.id);
      synced++;

      if (status.agentCloudStatus === "active") {
        const { data: carrier } = await supabase
          .from("carriers")
          .select("name")
          .eq("id", contract.carrier_id)
          .maybeSingle();

        await supabase.from("notifications").insert({
          user_id: userId,
          title:   `Contract Approved — ${(carrier as any)?.name ?? "Carrier"}`,
          body:    status.writingNumber
            ? `Your contract has been approved. Writing number: ${status.writingNumber}`
            : "Your contract has been approved by the carrier.",
          type:    "contracting",
          read:    false,
        }).catch(() => {});
      }
    }

    return { synced, activated };
  });
