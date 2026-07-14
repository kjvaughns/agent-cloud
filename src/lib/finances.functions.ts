import { createServerFn } from "@tanstack/start-client-core";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = {
  id: string;
  policy_id: string;
  agent_id: string;
  source_agent_id: string | null;
  payment_date: string;
  payment_type: "advance" | "deferred" | "trail" | "override" | "renewal";
  amount: number;
  status: "pending" | "paid";
  carrier: string | null;
  product: string | null;
  client_name: string | null;
  commission_pct: number | null;
  writing_agent_id: string | null;
};

async function fetchAll(supabase: any, userId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("commission_schedule")
    .select("id,policy_id,agent_id,source_agent_id,payment_date,payment_type,amount,status,carrier,product,client_name,commission_pct,writing_agent_id")
    .eq("agent_id", userId)
    .order("payment_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

export const getFinancesData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const rows = await fetchAll(supabase, userId);

    // Enrich with client names from policies
    const policyIds = Array.from(new Set(rows.map((r) => r.policy_id)));
    let clientMap = new Map<string, { client_name: string; policy_number: string | null }>();
    if (policyIds.length) {
      const { data: pols } = await supabase
        .from("policies")
        .select("id, policy_number, clients(first_name, last_name)")
        .in("id", policyIds);
      (pols ?? []).forEach((p: any) => {
        const c = p.clients;
        clientMap.set(p.id, {
          client_name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "—",
          policy_number: p.policy_number ?? null,
        });
      });
    }

    const enriched = rows.map((r: any) => ({
      ...r,
      amount: Number(r.amount),
      client_name: r.client_name ?? clientMap.get(r.policy_id)?.client_name ?? "—",
      policy_number: clientMap.get(r.policy_id)?.policy_number ?? null,
    }));

    return { rows: enriched };
  });
