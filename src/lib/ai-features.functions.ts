// Phase 1 AI server functions for Agent Cloud.
// All functions are guarded with requireSupabaseAuth and use the AI Gateway helper.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAi, callAiJson } from "./ai-gateway";

// ------------------------------------------------------------------
// 1) Dashboard daily briefing + next actions
// ------------------------------------------------------------------

export type DailyBriefing = {
  headline: string;
  bullets: string[];
  next_actions: { title: string; reason: string; priority: "high" | "medium" | "low" }[];
};

export const getDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [metricsRes, lapseRes, birthdaysRes, eventsRes] = await Promise.all([
      supabase.rpc("get_dashboard_metrics", {
        _range_start: monthStart,
        _range_end: now.toISOString(),
      }),
      supabase
        .from("policies")
        .select("id, monthly_premium, status, effective_date, client:clients(first_name,last_name)")
        .eq("agent_id", userId)
        .in("status", ["lapse_pending", "lapsed"])
        .limit(25),
      supabase
        .from("clients")
        .select("first_name,last_name,date_of_birth")
        .eq("agent_id", userId)
        .not("date_of_birth", "is", null)
        .limit(200),
      supabase
        .from("calendar_events")
        .select("title,start_at")
        .eq("agent_id", userId)
        .gte("start_at", now.toISOString())
        .lte("start_at", new Date(Date.now() + 7 * 86400000).toISOString())
        .limit(20),
    ]);

    const m: any = metricsRes.data ?? {};
    const lapsePolicies = lapseRes.data ?? [];
    const lapseAlp =
      lapsePolicies.reduce((a: number, p: any) => a + Number(p.monthly_premium ?? 0) * 12, 0);
    const upcomingBdays = (birthdaysRes.data ?? []).filter((c: any) => {
      if (!c.date_of_birth) return false;
      const d = new Date(c.date_of_birth);
      const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
      const diff = (next.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    });

    const summary = {
      mtd_personal_alp: Number(m.my_prod ?? 0),
      mtd_team_alp: Number(m.team_prod ?? 0),
      mtd_personal_policies: Number(m.my_policies ?? 0),
      mtd_team_policies: Number(m.team_policies ?? 0),
      active_downline: Number(m.active_downline ?? 0),
      lapse_pending_count: lapsePolicies.length,
      lapse_pending_alp_at_risk: Math.round(lapseAlp),
      birthdays_next_7d: upcomingBdays.length,
      appointments_next_7d: (eventsRes.data ?? []).length,
    };

    const json = await callAiJson<DailyBriefing>({
      messages: [
        {
          role: "system",
          content:
            "You are a sales coach for a life-insurance agent. Read the JSON metrics and produce a concise daily briefing. Respond with valid JSON only, matching this shape: {headline: string (1 sentence), bullets: string[] (3-5 short observations), next_actions: [{title: string, reason: string, priority: 'high'|'medium'|'low'}] (3-5 items, ordered most valuable first)}. Use the agent's own data — numbers must match.",
        },
        { role: "user", content: JSON.stringify(summary) },
      ],
      maxTokens: 800,
    });
    return { briefing: json, snapshot: summary };
  });

// ------------------------------------------------------------------
// 2) Pipeline — next-best-message + stall summary for a client
// ------------------------------------------------------------------

const ClientIdSchema = z.object({ clientId: z.string().uuid() });

export type ClientAiSuggestions = {
  summary: string;
  stall_warning: string | null;
  messages: { channel: "sms" | "email" | "voicemail"; subject?: string; body: string }[];
};

export const getClientAiSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: client, error: cerr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, stage, temperature, date_of_birth, state, notes, last_opened_at, created_at")
      .eq("id", data.clientId)
      .eq("agent_id", userId)
      .maybeSingle();
    if (cerr) throw new Error(cerr.message);
    if (!client) throw new Error("Client not found");

    const { data: history } = await supabase
      .from("contact_history")
      .select("channel, outcome, notes, created_at")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(10);

    const ctx = {
      client: {
        name: `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim(),
        stage: client.stage,
        temperature: client.temperature,
        state: client.state,
        date_of_birth: client.date_of_birth,
        notes: client.notes,
        days_in_stage: Math.round(
          (Date.now() - new Date(client.last_opened_at ?? client.created_at).getTime()) / 86400000,
        ),
      },
      recent_contacts: history ?? [],
    };

    return callAiJson<ClientAiSuggestions>({
      messages: [
        {
          role: "system",
          content:
            "You are a life-insurance sales coach. Given a client and their recent contact history, return JSON: {summary: string (1-2 sentence 'where we left off'), stall_warning: string|null (only set if days_in_stage > 14 and no recent outreach — otherwise null), messages: array of 3 — one SMS, one email (include subject), and one voicemail script. Keep messages warm, specific, under 60 words each. Reference real details from the notes when possible.",
        },
        { role: "user", content: JSON.stringify(ctx) },
      ],
      maxTokens: 900,
    });
  });

// ------------------------------------------------------------------
// 3) Book of Business — lapse risk + cross-sell for a policy
// ------------------------------------------------------------------

const PolicyIdSchema = z.object({ policyId: z.string().uuid() });

export type PolicyAiInsight = {
  lapse_risk: { score: number; band: "low" | "medium" | "high"; reasons: string[] };
  save_plan: string[];
  cross_sell: { product: string; rationale: string; talk_track: string }[];
};

export const getPolicyAiInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PolicyIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: policy, error } = await supabase
      .from("policies")
      .select(
        "id, policy_number, status, monthly_premium, annual_premium, effective_date, product, carrier:carriers(name), client:clients(first_name,last_name,dob,state,notes)",
      )
      .eq("id", data.policyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!policy) throw new Error("Policy not found");

    // Pull other policies for cross-sell context
    const clientId = (policy as any).client?.id ?? null;
    let otherPolicies: any[] = [];
    if (clientId) {
      const { data: op } = await supabase
        .from("policies")
        .select("product, status, carrier:carriers(name)")
        .eq("client_id", clientId);
      otherPolicies = op ?? [];
    }

    return callAiJson<PolicyAiInsight>({
      messages: [
        {
          role: "system",
          content:
            "You analyze life-insurance policies for lapse risk and cross-sell. Return JSON: {lapse_risk: {score: 0-100 number, band: 'low'|'medium'|'high', reasons: string[] (max 4)}, save_plan: string[] (3 concrete next steps), cross_sell: array of up to 3 {product, rationale, talk_track}}. Use the policy and client data provided — do not invent numbers.",
        },
        {
          role: "user",
          content: JSON.stringify({ policy, other_policies_on_client: otherPolicies }),
        },
      ],
      maxTokens: 900,
    });
  });

// ------------------------------------------------------------------
// 4) Sophai — draft outreach (SMS / birthday / beneficiary / recovery)
// ------------------------------------------------------------------

const SophaiKindSchema = z.object({
  kind: z.enum(["sms", "birthday", "beneficiary", "recovery"]),
  limit: z.number().int().min(1).max(20).default(5).optional(),
});

export type SophaiDraft = {
  kind: "sms" | "birthday" | "beneficiary" | "recovery";
  client_id: string;
  client_name: string;
  channel: "sms";
  body: string;
  rationale: string;
};

export const generateSophaiDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SophaiKindSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = data.limit ?? 5;
    let targets: any[] = [];

    if (data.kind === "birthday") {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, first_name, last_name, dob")
        .eq("agent_id", userId)
        .not("dob", "is", null)
        .limit(200);
      const now = new Date();
      targets = (clients ?? [])
        .filter((c: any) => {
          const d = new Date(c.dob);
          const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
          const diff = (next.getTime() - now.getTime()) / 86400000;
          return diff >= 0 && diff <= 7;
        })
        .slice(0, limit);
    } else if (data.kind === "recovery") {
      const { data: pols } = await supabase
        .from("policies")
        .select("client:clients(id,first_name,last_name), monthly_premium, status, carrier:carriers(name)")
        .eq("agent_id", userId)
        .in("status", ["lapse_pending", "lapsed"])
        .limit(limit);
      targets = (pols ?? []).map((p: any) => ({
        ...p.client,
        _meta: { premium: p.monthly_premium, status: p.status, carrier: p.carrier?.name },
      }));
    } else if (data.kind === "beneficiary") {
      const { data: bens } = await supabase
        .from("beneficiaries")
        .select("name, relationship, policy:policies!inner(agent_id, client:clients(id,first_name,last_name))")
        .eq("policy.agent_id", userId)
        .limit(limit);
      targets = (bens ?? []).map((b: any) => ({
        ...b.policy?.client,
        _meta: { beneficiary: b.name, relationship: b.relationship },
      }));
    } else {
      // sms — recent appointments / calls without follow-up
      const { data: events } = await supabase
        .from("calendar_events")
        .select("title, starts_at, client:clients(id,first_name,last_name)")
        .eq("user_id", userId)
        .lte("starts_at", new Date().toISOString())
        .gte("starts_at", new Date(Date.now() - 3 * 86400000).toISOString())
        .order("starts_at", { ascending: false })
        .limit(limit);
      targets = (events ?? [])
        .filter((e: any) => e.client)
        .map((e: any) => ({ ...e.client, _meta: { event: e.title } }));
    }

    if (!targets.length) return { drafts: [] as SophaiDraft[] };

    const json = await callAiJson<{ drafts: SophaiDraft[] }>({
      messages: [
        {
          role: "system",
          content:
            "You are Sophai, an AI assistant for life-insurance agents. Generate short personalized SMS drafts (under 320 chars, warm, no emojis unless natural, no markdown). Return JSON: {drafts: [{kind, client_id, client_name, channel:'sms', body, rationale}]}. Match the kind exactly. For 'birthday' — wish a happy birthday with a soft check-in. For 'recovery' — friendly lapse-saver, no scare tactics. For 'beneficiary' — quarterly check-in to confirm contact info. For 'sms' — post-appointment follow-up.",
        },
        { role: "user", content: JSON.stringify({ kind: data.kind, targets }) },
      ],
      maxTokens: 1100,
    });
    return json;
  });

// ------------------------------------------------------------------
// 5) AI Help search across handbook, FAQ, scripts, academy
// ------------------------------------------------------------------

const AskKbSchema = z.object({ question: z.string().min(3).max(500) });

export type KbAnswer = {
  answer: string;
  sources: { title: string; source: "handbook" | "faq" | "script" | "academy"; id: string }[];
};

export const askKnowledgeBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AskKbSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Keyword grab — simple text search over each table. Cheap, no embeddings yet.
    const q = data.question;
    const ilike = `%${q.split(/\s+/).slice(0, 4).join("%")}%`;

    const [hb, faq, scr, am] = await Promise.all([
      supabase.from("handbook_sections").select("id,title,content").or(`title.ilike.${ilike},content.ilike.${ilike}`).limit(8),
      supabase.from("faq_items").select("id,question,answer").or(`question.ilike.${ilike},answer.ilike.${ilike}`).limit(8),
      supabase.from("scripts").select("id,title,body").or(`title.ilike.${ilike},body.ilike.${ilike}`).limit(6),
      supabase.from("academy_modules").select("id,title,description").or(`title.ilike.${ilike},description.ilike.${ilike}`).limit(6),
    ]);

    const corpus = [
      ...(hb.data ?? []).map((r: any) => ({ source: "handbook" as const, id: r.id, title: r.title, body: r.content })),
      ...(faq.data ?? []).map((r: any) => ({ source: "faq" as const, id: r.id, title: r.question, body: r.answer })),
      ...(scr.data ?? []).map((r: any) => ({ source: "script" as const, id: r.id, title: r.title, body: r.body })),
      ...(am.data ?? []).map((r: any) => ({ source: "academy" as const, id: r.id, title: r.title, body: r.description })),
    ];

    if (!corpus.length) {
      return {
        answer:
          "I couldn't find anything in the handbook, FAQ, scripts, or academy that matches that. Try rephrasing, or open a support ticket from this page.",
        sources: [],
      } satisfies KbAnswer;
    }

    const json = await callAiJson<KbAnswer>({
      messages: [
        {
          role: "system",
          content:
            "You answer questions for a life-insurance agent using ONLY the provided knowledge-base passages. Return JSON: {answer: string (markdown, concise), sources: [{title, source, id}] (only the passages you actually used)}. If the passages don't answer the question, say so plainly — do not invent.",
        },
        {
          role: "user",
          content: JSON.stringify({ question: q, passages: corpus.slice(0, 20) }),
        },
      ],
      maxTokens: 900,
    });
    return json;
  });
