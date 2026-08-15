import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { scopeSchema } from "@/lib/scope";
import { resolveScopeAgentIds } from "@/lib/scope.functions";

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
    // Superseded legs are kept for history; they must never be counted twice.
    .is("superseded_at", null)
    .order("payment_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/**
 * Money is not a scope you can widen in place.
 *
 * commission_schedule.agent_id is *who gets paid*, so a manager's own rows
 * already contain the override income their downline generated. Widening the
 * same query to the team would count each policy twice — once as the
 * manager's override and again as the producer's advance — and every headline
 * figure on the page would quietly inflate.
 *
 * So the caller's own numbers never change meaning at any scope. Team and
 * agency add a separate breakdown of what each person earned, which is a
 * different question and is presented as one.
 */
export const getFinancesData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: scopeSchema.default("mine") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const rows = await fetchAll(supabase, userId);

    // Enrich with client names from policies
    const policyIds = Array.from(new Set(rows.map((r) => r.policy_id)));
    const clientMap = new Map<string, { client_name: string; policy_number: string | null }>();
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

    // Somebody else's pay is a permission, not a consequence of being senior
    // to them. mgr_view_agent_commissions has existed on the Roles page all
    // along without anything reading it; this is what it was for.
    let team: TeamEarnings[] | null = null;
    if (data.scope !== "mine" && await canSeeTeamPay(supabase, userId)) {
      team = await earningsByAgent(supabase, await resolveScopeAgentIds(supabase, data.scope), userId);
    }

    return { rows: enriched, team };
  });

export type TeamEarnings = {
  agent_id: string;
  name: string;
  paid: number;
  pending: number;
};

async function canSeeTeamPay(supabase: any, userId: string): Promise<boolean> {
  const { data: caps } = await supabase.rpc("my_scopes");
  if (caps?.can_agency) return true;
  const { data: perms } = await supabase
    .from("role_permissions").select("mgr_view_agent_commissions")
    .eq("profile_id", userId).maybeSingle();
  return Boolean(perms?.mgr_view_agent_commissions);
}

/** What each person was paid, one row each — never summed with the caller's own. */
async function earningsByAgent(
  supabase: any, agentIds: string[], userId: string,
): Promise<TeamEarnings[]> {
  const others = agentIds.filter((id) => id !== userId);
  if (!others.length) return [];

  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from("commission_schedule").select("agent_id, amount, status").in("agent_id", others),
    supabase.from("profiles").select("id, first_name, last_name").in("id", others),
  ]);

  const byId = new Map<string, TeamEarnings>();
  for (const p of people ?? []) {
    byId.set(p.id, {
      agent_id: p.id,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed",
      paid: 0,
      pending: 0,
    });
  }
  for (const r of rows ?? []) {
    const entry = byId.get(r.agent_id);
    if (!entry) continue;
    if (r.status === "paid") entry.paid += Number(r.amount ?? 0);
    else entry.pending += Number(r.amount ?? 0);
  }
  return Array.from(byId.values()).sort((a, b) => (b.paid + b.pending) - (a.paid + a.pending));
}
