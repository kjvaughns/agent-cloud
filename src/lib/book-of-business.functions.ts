import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scopeSchema } from "@/lib/scope";
import { resolveScopeAgentIdsOrNone } from "@/lib/scope.functions";

const ScopeSchema = z.object({
  scope: scopeSchema,
  // A narrowing filter, not a scope. Authorisation is structural: the SQL
  // intersects it with the scope set, so an id outside your reach matches
  // nothing rather than needing its own check.
  agentId: z.string().uuid().optional(),
});

export const listBookOfBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Opportunistic: the book still reads correctly from whatever statuses are
    // already stored, so a failed promotion must not stop the page loading.
    try { await (supabase as any).rpc("promote_policy_status"); } catch { /* best effort */ }
    const { data: rows, error } = await supabase.rpc("get_book_of_business", {
      _scope: data.scope,
      _agent_id: data.agentId ?? undefined,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    if (list.length === 0) return list;

    // An imported policy written by an agent who has not signed up yet is held
    // on the importer's id with the producer's email on the row. The book used
    // to show the importer's name for all of it, so a book of 368 policies read
    // as one person's. The roster name is shown instead, flagged as not yet
    // having an account — the policy still belongs to whoever will claim it.
    const ids = list.map((r) => r.id).filter(Boolean);
    const { data: assigned } = await supabase
      .from("policies")
      .select("id, assigned_to_email")
      .in("id", ids)
      .not("assigned_to_email", "is", null);

    const emails = Array.from(
      new Set(((assigned ?? []) as any[]).map((p) => String(p.assigned_to_email).toLowerCase())),
    );
    if (emails.length === 0) return list;

    const { data: pending } = await supabase
      .from("pending_agents")
      .select("email, first_name, last_name")
      .in("email", emails);

    const nameByEmail = new Map<string, string>();
    for (const p of (pending ?? []) as any[]) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (p.email && full) nameByEmail.set(String(p.email).toLowerCase(), full);
    }
    const emailById = new Map<string, string>(
      ((assigned ?? []) as any[]).map((p) => [p.id, String(p.assigned_to_email).toLowerCase()]),
    );

    return list.map((row) => {
      const email = emailById.get(row.id);
      if (!email) return row;
      const full = nameByEmail.get(email);
      // Even without a roster row the email is a truer label than the
      // importer's name, so it is used as the fallback.
      const label = full ?? email;
      const [first, ...rest] = label.split(" ");
      return {
        ...row,
        agent_first_name: first ?? label,
        agent_last_name: rest.join(" ") || null,
        assigned_to_email: email,
        agent_has_account: false,
      };
    });
  });

export const listDownlineAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_downline_agents");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[];
  });

export const listCarriersForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("carriers")
      .select("id, name")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updatePolicyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      policyId: z.string().uuid(),
      status: z.enum([
        "active", "submitted", "issued_not_paid", "in_review", "lapse_pending",
        "lapsed", "cancelled", "withdrawn", "not_taken", "postponed", "carrier_na",
      ]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    // Count the rows: RLS refuses silently, so a zero-row update would
    // otherwise report success and leave the old status in place.
    const { error, count } = await context.supabase
      .from("policies")
      .update({ status: data.status }, { count: "exact" })
      .eq("id", data.policyId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("You do not have permission to edit this policy.");
    // What was, who changed it and when is recorded by
    // `trg_policy_events_status` on the table itself rather than here. Three
    // paths write this column and nothing stops a fourth; a trigger is the one
    // place that cannot be forgotten.
    return { ok: true };
  });

/**
 * What has happened to one policy, in order.
 *
 * The detail sheet could change a policy's status and show the new one, and
 * that was all it could ever say: the column holds one value and nothing kept
 * the last. So a policy that went active, lapsed, had retention work done and
 * came back looked exactly like one that had never moved — and a chargeback
 * conversation came down to whose memory was better.
 */
export const listPolicyEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ policyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Cast and caught: the table arrives with 20260814230000, and a detail
    // sheet that will not open is worse than one with no history in it yet.
    try {
      const { data: rows } = await (context.supabase as any)
        .from("policy_events")
        .select("*")
        .eq("policy_id", data.policyId)
        .order("occurred_at", { ascending: false });
      return { rows: (rows ?? []) as any[], available: true };
    } catch (e: any) {
      console.error("[book] policy history unavailable:", e?.message);
      return { rows: [] as any[], available: false };
    }
  });

export const getPolicyCommissionTotal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ policyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("commission_schedule")
      .select("amount, status")
      .eq("policy_id", data.policyId);
    if (error) throw new Error(error.message);
    const total = (rows ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    const paid = (rows ?? []).filter((r: any) => r.status === "paid").reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    return { total, paid, count: rows?.length ?? 0 };
  });

/**
 * Producers with policies in the book who have no account yet.
 *
 * An imported policy written by somebody who never signed up sits on the
 * importer's agent id with the producer's email on the row. Those books are
 * real history — they have to be findable, and somebody has to be able to move
 * them onto a live agent's book.
 */
export const listUnclaimedProducers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: scopeSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const agentIds = await resolveScopeAgentIdsOrNone(supabase, data.scope);
    if (agentIds.length === 0) return [] as UnclaimedProducer[];
    const { data: rows } = await supabase
      .from("policies")
      .select("assigned_to_email, annual_premium")
      .in("agent_id", agentIds)
      .not("assigned_to_email", "is", null);
    const list = (rows ?? []) as any[];
    if (list.length === 0) return [] as UnclaimedProducer[];

    const agg = new Map<string, { policies: number; premium: number }>();
    for (const r of list) {
      const email = String(r.assigned_to_email).toLowerCase();
      const cur = agg.get(email) ?? { policies: 0, premium: 0 };
      cur.policies += 1;
      cur.premium += Number(r.annual_premium ?? 0);
      agg.set(email, cur);
    }
    const { data: pending } = await supabase
      .from("pending_agents")
      .select("email, first_name, last_name")
      .in("email", Array.from(agg.keys()));
    const nameByEmail = new Map<string, string>();
    for (const p of (pending ?? []) as any[]) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (p.email && full) nameByEmail.set(String(p.email).toLowerCase(), full);
    }
    return Array.from(agg.entries())
      .map(([email, v]) => ({ email, name: nameByEmail.get(email) ?? email, ...v }))
      .sort((a, b) => b.policies - a.policies) as UnclaimedProducer[];
  });

export type UnclaimedProducer = { email: string; name: string; policies: number; premium: number };

/**
 * Put a previous agent's book back on somebody's books.
 *
 * Either one policy or a whole producer's book. The write is scoped by the
 * caller's own scope set, so a producer outside their reach matches nothing,
 * and RLS still has the final say.
 */
export const reassignPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: scopeSchema,
        targetAgentId: z.string().uuid(),
        policyIds: z.array(z.string().uuid()).optional(),
        producerEmail: z.string().email().optional(),
      })
      .refine((v) => !!v.policyIds?.length || !!v.producerEmail, {
        message: "Pick a policy or a producer to move.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const agentIds = await resolveScopeAgentIdsOrNone(supabase, data.scope);
    if (agentIds.length === 0) throw new Error("You cannot move these policies.");

    let q = supabase
      .from("policies")
      .update(
        { agent_id: data.targetAgentId, assigned_to_email: null },
        { count: "exact" },
      )
      .in("agent_id", agentIds);
    if (data.policyIds?.length) q = q.in("id", data.policyIds);
    if (data.producerEmail) q = q.eq("assigned_to_email", data.producerEmail.toLowerCase());

    const { error, count } = await q;
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Nothing was moved — you may not have permission on these policies.");
    return { moved: count };
  });
