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
    .order("payment_date", { ascending: true })
    .range(0, 9999);
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
  .inputValidator((d: unknown) => z.object({
    scope: scopeSchema.default("mine"),
    /** Whose ledger to show. Only honoured for somebody you may see pay for. */
    agentId: z.string().uuid().optional(),
    /** The income report's own window, independent of the page below it. */
    from: z.string().optional(),
    to: z.string().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Somebody else's pay is a permission, not a consequence of being senior
    // to them. mgr_view_agent_commissions has existed on the Roles page all
    // along without anything reading it; this is what it was for.
    const maySeeOthers = data.scope !== "mine" && await canSeeTeamPay(supabase, userId);
    const scopeIds = maySeeOthers ? await resolveScopeAgentIds(supabase, data.scope) : [];

    // An id nobody authorised falls back to your own ledger rather than
    // erroring: the request is answerable, just not as asked.
    const viewingId = data.agentId && maySeeOthers && scopeIds.includes(data.agentId)
      ? data.agentId
      : userId;

    const rows = await fetchAll(supabase, viewingId);


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

    const report = maySeeOthers
      ? await incomeReport(supabase, scopeIds, userId, data.from ?? null, data.to ?? null)
      : null;

    return {
      rows: enriched,
      /** Ranked income for everyone in scope, including the caller. */
      report,
      /** Whose ledger `rows` belongs to — may differ from the caller. */
      viewing_agent_id: viewingId,
      may_see_others: maySeeOthers,
    };
  });

export type AgentIncome = {
  agent_id: string;
  name: string;
  /** Everything scheduled inside the window, earned or not. */
  total: number;
  /** Advance plus the trail/deferred balance: their own production. */
  direct: number;
  override: number;
  renewal: number;
  /** Of `total`, what is dated after today and so not yet earned. */
  pending: number;
  is_self: boolean;
};

async function canSeeTeamPay(supabase: any, userId: string): Promise<boolean> {
  const { data: caps } = await supabase.rpc("my_scopes");
  if (caps?.can_agency) return true;
  const { data: perms } = await supabase
    .from("role_permissions").select("mgr_view_agent_commissions")
    .eq("profile_id", userId).maybeSingle();
  return Boolean(perms?.mgr_view_agent_commissions);
}

const CHUNK = 200;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * What each person earned in a window, one row each.
 *
 * Never summed into the caller's own figures: an override on a downline policy
 * and their advance on the same policy are both real, and adding them together
 * is not. This is a separate question and is presented as one.
 *
 * A full agency year is well past PostgREST's 1,000-row default, so every page
 * is read explicitly — a truncated read here would silently under-report pay.
 */
async function incomeReport(
  supabase: any, agentIds: string[], userId: string,
  from: string | null, to: string | null,
): Promise<AgentIncome[]> {
  const ids = Array.from(new Set([...agentIds, userId]));
  if (!ids.length) return [];

  const rows: { agent_id: string; amount: any; payment_type: string; payment_date: string }[] = [];
  for (const group of chunk(ids, CHUNK)) {
    for (let page = 0; ; page++) {
      let q = supabase
        .from("commission_schedule")
        .select("agent_id, amount, payment_type, payment_date")
        .in("agent_id", group)
        .is("superseded_at", null)
        .order("payment_date", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (from) q = q.gte("payment_date", from);
      if (to) q = q.lte("payment_date", to);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
  }

  const people: { id: string; first_name: string | null; last_name: string | null }[] = [];
  for (const group of chunk(ids, CHUNK)) {
    const { data } = await supabase
      .from("profiles").select("id, first_name, last_name").in("id", group);
    people.push(...(data ?? []));
  }

  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map<string, AgentIncome>();
  for (const p of people) {
    byId.set(p.id, {
      agent_id: p.id,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed",
      total: 0, direct: 0, override: 0, renewal: 0, pending: 0,
      is_self: p.id === userId,
    });
  }
  for (const r of rows) {
    const e = byId.get(r.agent_id);
    if (!e) continue;
    const amt = Number(r.amount ?? 0);
    e.total += amt;
    if (r.payment_type === "override") e.override += amt;
    else if (r.payment_type === "renewal") e.renewal += amt;
    else e.direct += amt;
    if (r.payment_date > today) e.pending += amt;
  }

  // Somebody with nothing in the window is not a ranking entry; they would
  // read as "earned nothing" when the honest answer is "no business dated here".
  return Array.from(byId.values())
    .filter((e) => e.total !== 0)
    .sort((a, b) => b.total - a.total);
}

}
