import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = {
  id: string;
  policy_id: string;
  agent_id: string;
  source_agent_id: string | null;
  payment_date: string;
  payment_type: "advance" | "deferred" | "override" | "renewal";
  amount: number;
  status: "pending" | "paid";
  carrier: string | null;
  product: string | null;
  commission_pct: number | null;
  advance_pct: number | null;
};

async function fetchAll(supabase: any, userId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("commission_schedule")
    .select("id,policy_id,agent_id,source_agent_id,payment_date,payment_type,amount,status,carrier,product,commission_pct,advance_pct")
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

    // Carrier names via policies → carriers join
    const { data: polCarriers } = await supabase
      .from("policies")
      .select("id, carriers(name)")
      .in("id", policyIds.length ? policyIds : ["00000000-0000-0000-0000-000000000000"]);
    const carrierMap = new Map<string, string>();
    (polCarriers ?? []).forEach((p: any) => carrierMap.set(p.id, p.carriers?.name ?? "—"));

    // Source agent names for override rows
    const srcIds = [...new Set(rows.filter((r) => r.source_agent_id).map((r) => r.source_agent_id as string))];
    const srcNameMap = new Map<string, string>();
    if (srcIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", srcIds);
      (profiles ?? []).forEach((p: any) =>
        srcNameMap.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim())
      );
    }

    const enriched = rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      client_name: clientMap.get(r.policy_id)?.client_name ?? "—",
      policy_number: clientMap.get(r.policy_id)?.policy_number ?? null,
      carrier: carrierMap.get(r.policy_id) ?? r.carrier ?? "—",
      writing_agent_name: r.source_agent_id ? (srcNameMap.get(r.source_agent_id) ?? null) : null,
    }));

    return { rows: enriched };
  });
