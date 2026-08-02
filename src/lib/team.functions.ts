import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TeamAgent = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  upline_id: string | null;
  status: string;
  last_active_at: string | null;
  created_at: string;
  depth_level: number;
  contracts_count: number;
  policies_count: number;
  premium_total: number;
  completion_pct: number;
  missing: string[];
};

export type TeamKpis = {
  total: number;
  direct: number;
  active: number;
  pending: number;
  active_writers: number;
  contracts_total: number;
  contracts_active_pct: number;
  max_depth: number;
  depth_distribution: { level: number; count: number }[];
};

export type TeamAlerts = {
  stale: { id: string; name: string }[];
  lapse: { id: string; name: string }[];
  stuck_contracts: { id: string; agent: string }[];
};

const EMPTY_KPIS: TeamKpis = { total: 0, direct: 0, active: 0, pending: 0, active_writers: 0, contracts_total: 0, contracts_active_pct: 0, max_depth: 0, depth_distribution: [] };
const EMPTY_ALERTS: TeamAlerts = { stale: [], lapse: [], stuck_contracts: [] };

export const getTeamDownline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fullCompany?: boolean } | undefined) =>
    z.object({ fullCompany: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Default scope: caller's own downline (everyone, including admins).
    // Admins can opt into full-company view via { fullCompany: true }.
    if (data.fullCompany) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "manager"])
        .maybeSingle();
      if (roleRow) {
        const { data: root } = await supabase
          .from("profiles")
          .select("id")
          .is("upline_id", null)
          .maybeSingle();
        if (root?.id) {
          const { data: allData } = await supabase.rpc("get_team_downline_for", { p_root_id: root.id });
          // RPC returns jsonb rows; map into TeamAgent shape with safe defaults
          const rows = (allData ?? []) as any[];
          return rows.map((r: any) => ({
            ...r,
            depth_level: r.depth_level ?? 0,
            contracts_count: r.contracts_count ?? 0,
            policies_count: r.policies_count ?? 0,
            premium_total: r.premium_total ?? 0,
            completion_pct: r.completion_pct ?? 0,
            missing: r.missing ?? [],
          })) as TeamAgent[];
        }
      }
    }

    const { data: rpcData, error } = await supabase.rpc("get_team_downline");
    if (error) console.error("[team] get_team_downline:", error.message);
    return (rpcData ?? []) as TeamAgent[];
  });


export const getTeamKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_team_kpis");
    if (error) console.error("[team] get_team_kpis:", error.message);
    return (data ?? EMPTY_KPIS) as TeamKpis;
  });

export const getTeamAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_team_alerts");
    if (error) console.error("[team] get_team_alerts:", error.message);
    return (data ?? EMPTY_ALERTS) as TeamAlerts;
  });

export const sendAgentReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("send_team_reminder", { _target: data.agentId });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; reason?: string };
  });

export const getAgentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [profile, contracts, policies] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, email, phone, created_at, upline_id, status, last_active_at").eq("id", data.agentId).maybeSingle(),
      supabase.from("agent_commission_levels").select("carrier_id, assigned_pct, commission_level, carriers(name)").eq("agent_id", data.agentId),
      supabase.from("policies").select("id, status, annual_premium, monthly_premium, posted_at, product, carriers(name)").eq("agent_id", data.agentId).order("posted_at", { ascending: false }).limit(50),
    ]);
    if (profile.error) throw new Error(profile.error.message);
    const pols = policies.data ?? [];
    const breakdown = {
      total: pols.length,
      active: pols.filter((p) => p.status === "active").length,
      lapsed: pols.filter((p) => String(p.status).startsWith("lapse")).length,
      in_review: pols.filter((p) => p.status === "in_review").length,
      premium: pols.reduce((s, p) => s + Number(p.annual_premium ?? 0), 0),
    };
    return {
      profile: profile.data,
      contracts: contracts.data ?? [],
      breakdown,
      recent: pols.slice(0, 5),
    };
  });

// `deactivateAgent` was here. Its only caller was `AgentDetailDrawer` in
// team.tsx, which is defined and never rendered — team.tsx renders
// `AgentProfileDrawer` instead. It wrote `status: 'terminated'` directly with
// no row-count check and no membership sync, so it was a second, worse path to
// the same thing. Deleted rather than fixed; `setAgentStatus` is the one path.

/**
 * Whether the caller still has access to their agency.
 *
 * The security boundary is the database — `my_org_ids()` reads
 * `organization_memberships`, and `set_agent_status` archives the membership.
 * This exists so a revoked agent is *told* rather than shown a working-looking
 * app full of empty tables.
 *
 * Deliberately not in `auth-middleware.ts`: that file is generated, and a check
 * placed there would be silently lost the next time it is regenerated.
 */
export const getAccessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("profiles").select("status").eq("id", userId).maybeSingle();
    const status = String(data?.status ?? "active");
    return {
      revoked: status === "inactive" || status === "terminated",
      status,
    };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"])
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const getAllAgentsForHierarchy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"])
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, upline_id")
      .order("first_name");
    return (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null; upline_id: string | null }[];
  });

export const setAgentHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; hidden: boolean }) =>
    z.object({ agentId: z.string().uuid(), hidden: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // .select("id") for the same reason as everywhere else: an RLS-filtered
    // update matches nothing, is not an error, and used to report success.
    const { data: touched, error } = await context.supabase
      .from("profiles")
      .update({ is_hidden: data.hidden })
      .eq("id", data.agentId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!touched?.length) {
      throw new Error("You don't have permission to change that agent.");
    }
    return { ok: true };
  });

/**
 * The single write path for an agent's access.
 *
 * Replaces `setAgentTerminated`, which wrote `profiles.status` on the RLS
 * client and stopped there. Three things were wrong with that:
 *
 *   It never touched `organization_memberships`, which is what `my_org_ids()`
 *   reads — so termination revoked nothing at all.
 *
 *   It had no row-count check, and `profiles_org_manage` only admits the org
 *   owner while the drawer's `isAdmin` also admits managers. A manager clicking
 *   "Mark Terminated" got a success toast and zero rows changed.
 *
 *   Reinstating set `status: 'active'` unconditionally, which would promote an
 *   `imported` placeholder into a full agent.
 *
 * `set_agent_status` does both stores in one transaction, refuses to revoke the
 * agency owner (the org policies are conjunctive, so revoking an owner locks
 * them out of their own agency), and returns a row count.
 */
export const setAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; status: "active" | "inactive" | "terminated" }) =>
    z.object({
      agentId: z.string().uuid(),
      status: z.enum(["active", "inactive", "terminated"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Cast: the generated DB types predate this RPC. Same pattern as the other
    // contracting-ops modules, which cast until types are regenerated.
    const { data: count, error } = await (context.supabase as any).rpc("set_agent_status", {
      _agent: data.agentId,
      _status: data.status,
    });

    // 42883 / PGRST202: the migration has not been applied yet. Migrations here
    // are applied by hand, so code always ships first. Fall back to the old
    // direct write — which is exactly today's behaviour, no worse — rather than
    // failing the call outright.
    if (error && (error.code === "42883" || error.code === "PGRST202")) {
      const patch = data.status === "terminated"
        ? { status: "terminated", terminated_at: new Date().toISOString() }
        : { status: data.status, terminated_at: null };
      const { data: touched, error: fallbackErr } = await context.supabase
        .from("profiles").update(patch).eq("id", data.agentId).select("id");
      if (fallbackErr) throw new Error(fallbackErr.message);
      if (!touched?.length) {
        throw new Error("Only the agency owner can change an agent's status.");
      }
      return { ok: true, revoked: false as const };
    }

    if (error) throw new Error(error.message);
    if (!count) throw new Error("That agent is no longer in your agency.");
    return { ok: true, revoked: data.status !== "active" };
  });
