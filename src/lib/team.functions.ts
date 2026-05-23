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

export const getTeamDownline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("get_team_downline");
    if (error) throw new Error(error.message);
    return (data ?? []) as TeamAgent[];
  });

export const getTeamKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_team_kpis");
    if (error) throw new Error(error.message);
    return (data ?? {}) as TeamKpis;
  });

export const getTeamAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_team_alerts");
    if (error) throw new Error(error.message);
    return (data ?? { stale: [], lapse: [], stuck_contracts: [] }) as TeamAlerts;
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

export const deactivateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update({ status: "terminated" }).eq("id", data.agentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
