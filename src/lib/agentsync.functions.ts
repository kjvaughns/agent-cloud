import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { agentSyncIsConfigured, syncProducerByNpn } from "@/lib/agentsync.service";

type Ctx = { supabase: any; userId: string; claims: any };

export const checkAgentSyncStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    return { available: agentSyncIsConfigured() };
  });

export const syncAgentByNpn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ npn: z.string().min(1).max(20) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const result = await syncProducerByNpn(data.npn);
    if (!result) throw new Error("AgentSync is not configured on this server.");

    // Save licenses
    let licensesImported = 0;
    const licenseErrors: string[] = [];

    for (const lic of result.licenses) {
      const loas: any[] = Array.isArray(lic.loas) && lic.loas.length > 0 ? lic.loas : [null];
      for (const loaEntry of loas) {
        const loaName = typeof loaEntry === "string" ? loaEntry : (loaEntry?.name ?? loaEntry?.loa ?? null);
        const row = {
          agent_id: userId,
          state_code: lic.state_code,
          license_number: lic.license_number ?? null,
          license_type: lic.license_type ?? null,
          loa: loaName,
          issued_date: lic.issued_date ?? null,
          expires_date: lic.expires_date ?? null,
          is_resident: lic.is_resident ?? false,
        };
        const { error } = await supabase
          .from("state_licenses")
          .upsert(row, { onConflict: "agent_id,state_code,loa" });
        if (error) {
          licenseErrors.push(`${lic.state_code}: ${error.message}`);
        } else {
          licensesImported++;
        }
      }
    }

    // Save NPN to profile
    await supabase.from("profiles").update({ npn_number: data.npn }).eq("id", userId);

    // Auto-link appointments to carriers
    const { data: carriers } = await supabase
      .from("carriers")
      .select("id, name")
      .eq("active", true);

    let appointmentsLinked = 0;

    if (carriers && result.appointments.length > 0) {
      const carrierMap = new Map<string, string>();
      for (const c of carriers) {
        const lower = c.name.toLowerCase();
        carrierMap.set(lower, c.id);
        // also map first word for fuzzy matching
        const firstWord = lower.split(/\s+/)[0];
        if (!carrierMap.has(firstWord)) carrierMap.set(firstWord, c.id);
      }

      const { data: existingContracts } = await supabase
        .from("contract_requests")
        .select("carrier_id, status")
        .eq("agent_id", userId);

      const existingByCarrier = new Map<string, string>();
      for (const ec of existingContracts ?? []) {
        existingByCarrier.set(ec.carrier_id, ec.status);
      }

      for (const appt of result.appointments) {
        if (!appt.carrier_name || appt.status !== "active") continue;
        const lower = appt.carrier_name.toLowerCase();
        let carrierId = carrierMap.get(lower);
        if (!carrierId) {
          const firstWord = lower.split(/\s+/)[0];
          carrierId = carrierMap.get(firstWord);
        }
        if (!carrierId) continue;

        const existingStatus = existingByCarrier.get(carrierId);
        if (!existingStatus) {
          await supabase.from("contract_requests").insert({
            agent_id: userId,
            carrier_id: carrierId,
            status: "active",
          });
          appointmentsLinked++;
        } else if (existingStatus === "assigned" || existingStatus === "requested") {
          await supabase
            .from("contract_requests")
            .update({ status: "active" })
            .eq("agent_id", userId)
            .eq("carrier_id", carrierId);
          appointmentsLinked++;
        }
      }
    }

    // Flag regulatory (column may not exist — ignore errors)
    const hasRegulatoryFlag = result.regulatoryActions.length > 0;
    if (hasRegulatoryFlag) {
      await supabase
        .from("profiles")
        .update({ has_regulatory_flag: true })
        .eq("id", userId)
        .then(() => {})
        .catch(() => {});
    }

    const statesCovered = [...new Set(result.licenses.map((l: any) => l.state_code))].filter(Boolean);
    const carriersFound = [...new Set(result.appointments.map((a: any) => a.carrier_name))].filter(Boolean);

    return {
      licenses_imported: licensesImported,
      appointments_linked: appointmentsLinked,
      has_regulatory_flag: hasRegulatoryFlag,
      license_errors: licenseErrors,
      states_covered: statesCovered,
      carriers_found: carriersFound,
    };
  });
