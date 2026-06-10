import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function fetchAll(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("commission_schedule")
    .select(
      "id,policy_id,agent_id,source_agent_id,writing_agent_id,writing_agent_name,payment_date,payment_type,amount,status,carrier,product,commission_pct,advance_pct,annual_premium,client_name,is_gtl,policy_year,month_number",
    )
    .eq("agent_id", userId)
    .order("payment_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

export const getFinancesData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const rows = await fetchAll(supabase, userId);

    // Enrich with policy_number (not stored on commission_schedule) and fallback for old rows
    const policyIds = Array.from(new Set(rows.map((r) => r.policy_id as string)));
    const policyMap = new Map<
      string,
      { policy_number: string | null; client_name: string; carrier_name: string }
    >();
    if (policyIds.length) {
      const { data: pols } = await supabase
        .from("policies")
        .select("id, policy_number, clients(first_name, last_name), carriers(name)")
        .in("id", policyIds);
      (pols ?? []).forEach((p: any) => {
        const c = p.clients;
        policyMap.set(p.id, {
          policy_number: p.policy_number ?? null,
          client_name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "—",
          carrier_name: p.carriers?.name ?? "—",
        });
      });
    }

    const enriched = rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      annual_premium: r.annual_premium != null ? Number(r.annual_premium) : null,
      commission_pct: r.commission_pct != null ? Number(r.commission_pct) : null,
      // Use stored client_name if available (new rows), fall back to join for old rows
      client_name: (r.client_name as string) || policyMap.get(r.policy_id)?.client_name || "—",
      policy_number: policyMap.get(r.policy_id)?.policy_number ?? null,
      // Use stored carrier if available, fall back to join
      carrier: (r.carrier as string) || policyMap.get(r.policy_id)?.carrier_name || "—",
    }));

    return { rows: enriched };
  });
