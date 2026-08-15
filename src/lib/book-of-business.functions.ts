import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scopeSchema } from "@/lib/scope";

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
    return (rows ?? []) as any[];
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
        "active", "issued_not_paid", "in_review", "lapse_pending",
        "lapsed", "cancelled", "withdrawn", "not_taken", "postponed", "carrier_na",
      ]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("policies")
      .update({ status: data.status })
      .eq("id", data.policyId);
    if (error) throw new Error(error.message);
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
