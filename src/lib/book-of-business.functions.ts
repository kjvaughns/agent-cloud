import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScopeSchema = z.object({
  scope: z.enum(["hierarchy", "mine", "agent"]),
  agentId: z.string().uuid().optional(),
});

export const listBookOfBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await (supabase as any).rpc("promote_policy_status").catch(() => {});
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
    return { ok: true };
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
