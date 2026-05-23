import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- types ----------
export type AnalyticsOverview = {
  kpis: {
    deals: number; premium: number; producers: number; avg_deal: number;
    deals_delta: number; premium_delta: number; producers_delta: number; avg_deal_delta: number;
  };
  conversion_rate: number;
  monthly_growth: number;
  top_carriers: { carrier: string; deals: number; premium: number }[];
  total_premium: number;
};

export type Challenge = {
  id: string; agent_id: string; period: "daily"|"weekly"|"monthly"|"quarterly"|null;
  type: string|null; target_value: number|null; current_value: number|null;
  description: string|null; completed: boolean; start_date: string|null; end_date: string|null;
};

export type Trophy = {
  id: string; agent_id: string; challenge_id: string|null;
  type: string; earned_at: string;
};

export type AIInsight = {
  type: "needs_attention"|"learn_from"|"risk_alert"|"coaching";
  title: string; body: string;
  agent_name?: string|null;
  action_text?: string|null; action_url?: string|null;
  dollar_impact?: number|null;
};

// ---------- helpers ----------
function range(spec: { range: "7d"|"30d"|"90d"|"ytd"|"all"|"custom"; start?: string; end?: string }) {
  const end = new Date();
  let start = new Date();
  if (spec.range === "7d") start.setDate(end.getDate() - 7);
  else if (spec.range === "30d") start.setDate(end.getDate() - 30);
  else if (spec.range === "90d") start.setDate(end.getDate() - 90);
  else if (spec.range === "ytd") start = new Date(end.getFullYear(), 0, 1);
  else if (spec.range === "all") start = new Date(2000, 0, 1);
  else if (spec.range === "custom") {
    if (spec.start) start = new Date(spec.start);
    if (spec.end) end.setTime(new Date(spec.end).getTime());
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

const rangeSchema = z.object({
  range: z.enum(["7d","30d","90d","ytd","all","custom"]).default("30d"),
  start: z.string().optional(),
  end: z.string().optional(),
});

// ---------- analytics RPCs ----------
export const getAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof rangeSchema>) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { start, end } = range(data);
    const { data: r, error } = await context.supabase.rpc("get_analytics_overview", { _start: start, _end: end });
    if (error) throw new Error(error.message);
    return r as AnalyticsOverview;
  });

export const getDailyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_daily_report");
    if (error) throw new Error(error.message);
    return data as {
      policies_today: number; calls_today: number; sms_today: number; new_clients_today: number;
      active_agents: { id: string; name: string }[];
      lapse_pending: { id: string; client_name: string; carrier: string }[];
      upcoming_effective: { id: string; client_name: string; effective_date: string }[];
    };
  });

export const getAgentAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string } & z.input<typeof rangeSchema>) =>
    z.object({ agentId: z.string().uuid() }).merge(rangeSchema).parse(input))
  .handler(async ({ data, context }) => {
    const { start, end } = range(data);
    const { data: r, error } = await context.supabase.rpc("get_agent_analytics", { _agent: data.agentId, _start: start, _end: end });
    if (error) throw new Error(error.message);
    return r as any;
  });

export const getTeamLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof rangeSchema>) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { start, end } = range(data);
    const { data: r, error } = await context.supabase.rpc("get_team_leaderboard", { _start: start, _end: end });
    if (error) throw new Error(error.message);
    return r as {
      self_id: string;
      rows: { id: string; name: string; policies: number; premium: number; avg_deal: number; trend: "up"|"down"|"flat" }[];
      team_monthly: { month: string; agent_id: string; agent_name: string; premium: number }[];
    };
  });

export const getCarrierBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId?: string|null } & z.input<typeof rangeSchema>) =>
    z.object({ agentId: z.string().uuid().nullable().optional() }).merge(rangeSchema).parse(input))
  .handler(async ({ data, context }) => {
    const { start, end } = range(data);
    const { data: r, error } = await context.supabase.rpc("get_carrier_breakdown", {
      _start: start, _end: end, _agent: data.agentId ?? null,
    });
    if (error) throw new Error(error.message);
    return r as { rows: { carrier: string; deals: number; premium: number; avg_deal: number; top_agent: string|null }[] };
  });

export const getTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_trends_12mo");
    if (error) throw new Error(error.message);
    return data as { series: { month: string; my_premium: number; team_premium: number; my_policies: number; team_policies: number }[] };
  });

export const getPolicyAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_policy_analytics");
    if (error) throw new Error(error.message);
    return data as {
      status_dist: { status: string; count: number; avg_premium: number }[];
      monthly_status: { month: string; status: string; count: number }[];
      at_risk: { id: string; client_id: string; client_name: string; carrier: string; monthly_premium: number; posted_at: string }[];
    };
  });

export const getQualityMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_quality_metrics");
    if (error) throw new Error(error.message);
    return data as any;
  });

export const getRecruitingFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_recruiting_funnel");
    if (error) throw new Error(error.message);
    return data as {
      funnel: { stage: string; count: number }[];
      monthly_onboarded: { month: string; count: number }[];
    };
  });

// ---------- challenges & trophies ----------
export const getChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.rpc("seed_agent_challenges", { _agent: userId });
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("agent_id", userId)
      .order("period", { ascending: true });
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    const active = (data as Challenge[]).filter((c) =>
      c.start_date && c.end_date && c.start_date <= today && c.end_date >= today
    );
    return active;
  });

export const getTrophies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("trophies")
      .select("*")
      .eq("agent_id", userId)
      .order("earned_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as Trophy[];
  });

// ---------- AI insights via Lovable AI Gateway ----------
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

const aiInputSchema = z.object({
  tab: z.enum(["overview", "coach"]).default("overview"),
  force: z.boolean().default(false),
});

export const getAIInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof aiInputSchema>) => aiInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cacheKey = data.tab;

    if (!data.force) {
      const { data: cached } = await supabase
        .from("analytics_insight_cache")
        .select("payload, generated_at")
        .eq("agent_id", userId)
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.generated_at).getTime() < FOUR_HOURS_MS) {
        return cached.payload as { cards: AIInsight[]; generated_at: string };
      }
    }

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const [overview, leaderboard, policyA, recruiting] = await Promise.all([
      supabase.rpc("get_analytics_overview", { _start: start.toISOString(), _end: end.toISOString() }),
      supabase.rpc("get_team_leaderboard", { _start: start.toISOString(), _end: end.toISOString() }),
      supabase.rpc("get_policy_analytics"),
      supabase.rpc("get_recruiting_funnel"),
    ]);

    const summary = {
      overview: overview.data,
      leaderboard: leaderboard.data,
      policies: policyA.data,
      recruiting: recruiting.data,
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt =
      data.tab === "coach"
        ? "You are an AI sales coach for a life insurance agency. Generate 4-6 specific, data-driven coaching cards with concrete recommendations and ROI estimates. Be direct and actionable."
        : "You are an analytics insight engine for a life insurance agency. Generate 3-5 insight cards covering needs_attention, learn_from, and risk_alert categories. Reference specific agent names from the data.";

    const tool = {
      type: "function",
      function: {
        name: "emit_insights",
        description: "Return an array of insight cards",
        parameters: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["needs_attention", "learn_from", "risk_alert", "coaching"] },
                  title: { type: "string" },
                  body: { type: "string" },
                  agent_name: { type: "string" },
                  action_text: { type: "string" },
                  action_url: { type: "string" },
                  dollar_impact: { type: "number" },
                },
                required: ["type", "title", "body"],
                additionalProperties: false,
              },
            },
          },
          required: ["cards"],
          additionalProperties: false,
        },
      },
    };

    let cards: AIInsight[] = [];
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Last 30 days of agency data:\n${JSON.stringify(summary).slice(0, 8000)}` },
          ],
          tools: [tool],
          tool_choice: { type: "function", function: { name: "emit_insights" } },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("AI gateway error", res.status, text);
        if (res.status === 429 || res.status === 402) throw new Error(res.status === 429 ? "Rate limit reached — try again in a minute." : "AI credits exhausted. Add funds in workspace settings.");
        throw new Error("AI insight generation failed");
      }
      const j = await res.json();
      const call = j?.choices?.[0]?.message?.tool_calls?.[0];
      if (call?.function?.arguments) {
        const parsed = JSON.parse(call.function.arguments);
        cards = parsed.cards ?? [];
      }
    } catch (e) {
      console.error("AI insights failed", e);
      throw e instanceof Error ? e : new Error("AI insights failed");
    }

    const payload = { cards, generated_at: new Date().toISOString() };
    await supabase.from("analytics_insight_cache").upsert(
      { agent_id: userId, cache_key: cacheKey, payload, generated_at: payload.generated_at },
      { onConflict: "agent_id,cache_key" }
    );
    if (cards.length) {
      await supabase.from("ai_insights").insert(
        cards.map((c) => ({
          agent_id: userId,
          tab: cacheKey,
          insight_type: c.type,
          title: c.title,
          body: c.body,
          action_text: c.action_text ?? null,
          action_url: c.action_url ?? null,
          dollar_impact: c.dollar_impact ?? null,
          agent_name: c.agent_name ?? null,
        }))
      );
    }
    return payload;
  });
