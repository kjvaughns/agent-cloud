import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Retention queue.
 *
 * Reads through the RLS-bound client throughout, so retention_cases' policy
 * decides visibility — the writing agent, the assignee, an org owner, or a
 * manager over their downline.
 */

export type RetentionCase = {
  id: string;
  policy_id: string;
  agent_id: string;
  assigned_to: string | null;
  risk_reason: string;
  risk_score: number;
  status: "open" | "working" | "saved" | "lost" | "no_action";
  outcome_note: string | null;
  premium_at_risk: number | null;
  opened_at: string;
  contacted_at: string | null;
  resolved_at: string | null;
  policy_number?: string | null;
  client_name?: string | null;
  agent_name?: string | null;
  assignee_name?: string | null;
};

const SELECT =
  "id, policy_id, agent_id, assigned_to, risk_reason, risk_score, status, outcome_note, premium_at_risk, opened_at, contacted_at, resolved_at";

export const listRetentionCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "live", "open", "working", "saved", "lost", "no_action"]).default("live"),
      assigned: z.enum(["all", "me", "unassigned"]).default("all"),
    }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    let q = supabase.from("retention_cases").select(SELECT).limit(300);

    if (data.status === "live") q = q.in("status", ["open", "working"]);
    else if (data.status !== "all") q = q.eq("status", data.status);

    if (data.assigned === "me") q = q.eq("assigned_to", userId);
    if (data.assigned === "unassigned") q = q.is("assigned_to", null);

    q = q.order("risk_score", { ascending: false }).order("opened_at", { ascending: true });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const cases = (rows ?? []) as RetentionCase[];
    if (cases.length === 0) return { cases: [] };

    // Decorate with policy, client and people names.
    const policyIds = Array.from(new Set(cases.map((c) => c.policy_id)));
    const personIds = Array.from(new Set(cases.flatMap((c) => [c.agent_id, c.assigned_to]).filter(Boolean) as string[]));

    const [{ data: policies }, { data: people }] = await Promise.all([
      supabase.from("policies")
        .select("id, policy_number, monthly_premium, clients(first_name, last_name)")
        .in("id", policyIds),
      supabase.from("profiles").select("id, first_name, last_name").in("id", personIds),
    ]);

    const polById = new Map((policies ?? []).map((p: any) => [p.id, p]));
    const nameById = new Map<string, string>(
      (people ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]),
    );

    return {
      cases: cases.map((c) => {
        const p: any = polById.get(c.policy_id);
        const cl = p?.clients;
        return {
          ...c,
          policy_number: p?.policy_number ?? null,
          client_name: cl ? `${cl.first_name ?? ""} ${cl.last_name ?? ""}`.trim() : null,
          agent_name: nameById.get(c.agent_id) ?? null,
          assignee_name: c.assigned_to ? (nameById.get(c.assigned_to) ?? null) : null,
        };
      }),
    };
  });

export const getRetentionStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data: rows, error } = await supabase
      .from("retention_cases")
      .select("status, premium_at_risk, resolved_at");
    if (error) return { live: 0, atRisk: 0, saved: 0, lost: 0, saveRate: null as number | null };

    const all = rows ?? [];
    const live = all.filter((c: any) => c.status === "open" || c.status === "working");
    const saved = all.filter((c: any) => c.status === "saved").length;
    const lost = all.filter((c: any) => c.status === "lost").length;
    const decided = saved + lost;

    return {
      live: live.length,
      atRisk: live.reduce((a: number, c: any) => a + Number(c.premium_at_risk ?? 0), 0),
      saved,
      lost,
      saveRate: decided > 0 ? saved / decided : null,
    };
  });

/** Opens a case for every at-risk policy that does not already have a live one. */
export const syncRetentionCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase.rpc("sync_retention_cases", { _org: null });
    if (error) throw new Error(error.message);
    return { opened: Number(data ?? 0) };
  });

export const updateRetentionCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "working", "saved", "lost", "no_action"]).optional(),
      assigned_to: z.string().uuid().nullable().optional(),
      outcome_note: z.string().trim().max(1000).nullable().optional(),
      markContacted: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { id, markContacted, ...rest } = data;

    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (markContacted) patch.contacted_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };

    // resolved_at and updated_at are handled by touch_retention_case.
    const { error } = await supabase.from("retention_cases").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
