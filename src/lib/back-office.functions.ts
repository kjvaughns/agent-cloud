import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const caseSubmitSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  client_name_manual: z.string().max(200).optional().nullable(),
  coverage_amount: z.number().min(0).max(100_000_000),
  product_type: z.string().min(1).max(60),
  primary_condition: z.string().min(1).max(2000),
  additional_conditions: z.string().max(2000).optional().nullable(),
  medications: z.string().max(2000).optional().nullable(),
  height_in: z.number().int().min(36).max(96).optional().nullable(),
  weight_lbs: z.number().int().min(50).max(800).optional().nullable(),
  tobacco_use: z.string().max(80).optional().nullable(),
  prior_decline: z.boolean().default(false),
  prior_decline_details: z.string().max(2000).optional().nullable(),
  occupation: z.string().max(200).optional().nullable(),
  hobbies: z.string().max(1000).optional().nullable(),
  additional_notes: z.string().max(3000).optional().nullable(),
});

export const submitCaseDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => caseSubmitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("case_design_requests")
      .insert({ ...data, agent_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Case design submitted",
      description: "Our underwriting team will respond within 24 business hours.",
      type: "case_design",
    });
    return { id: row.id };
  });

export const listMyCaseDesigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("case_design_requests")
      .select("id,client_id,client_name_manual,coverage_amount,product_type,status,created_at,responded_at")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // hydrate client names
    const ids = (data ?? []).map((r) => r.client_id).filter(Boolean) as string[];
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: cs } = await supabase.from("clients").select("id,first_name,last_name").in("id", ids);
      for (const c of cs ?? []) names[c.id] = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    }
    return (data ?? []).map((r) => ({
      ...r,
      client_name: r.client_id ? names[r.client_id] ?? "" : r.client_name_manual ?? "",
    }));
  });

export const getCaseDesignDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("case_design_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// Admin: list all
export const listAllCaseDesignsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // ensure admin
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Forbidden");
    const { data, error } = await supabase
      .from("case_design_requests")
      .select("id,agent_id,client_name_manual,client_id,coverage_amount,product_type,status,created_at,responded_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateCaseDesignAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "complete", "needs_info"]),
      response_html: z.string().max(20000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Forbidden");
    const patch: {
      status: string;
      response_html?: string | null;
      responded_at?: string;
      responded_by?: string;
    } = { status: data.status };
    if (data.response_html !== undefined) patch.response_html = data.response_html;
    if (data.status === "complete") {
      patch.responded_at = new Date().toISOString();
      patch.responded_by = userId;
    }
    const { data: row, error } = await supabase
      .from("case_design_requests")
      .update(patch)
      .eq("id", data.id)
      .select("agent_id")
      .single();
    if (error) throw new Error(error.message);
    if (data.status === "complete") {
      await supabase.from("notifications").insert({
        user_id: row.agent_id,
        title: "Case recommendations ready",
        description: "Your case design response is ready to view.",
        type: "case_design",
      });
    } else if (data.status === "needs_info") {
      await supabase.from("notifications").insert({
        user_id: row.agent_id,
        title: "Case needs more info",
        description: "Underwriter requested additional information.",
        type: "case_design",
      });
    }
    return { ok: true };
  });

// ---------- Retirement Cases ----------

const accountsSchema = z.array(z.object({
  id: z.string(),
  type: z.string().max(60),
  name: z.string().max(120),
  balance: z.number().min(0).max(1e12),
  monthly_contrib: z.number().min(0).max(1e9),
  return_pct: z.number().min(-20).max(50),
  tax_class: z.enum(["qualified", "non_qualified", "roth", "taxable"]).default("qualified"),
}));

const incomeSourcesSchema = z.array(z.object({
  id: z.string(),
  type: z.enum(["social_security", "pension", "annuity", "other"]),
  label: z.string().max(120),
  monthly_amount: z.number().min(0).max(1e6),
  start_age: z.number().int().min(40).max(100).optional().nullable(),
}));

const rcSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  current_age: z.number().int().min(18).max(100),
  retirement_age: z.number().int().min(40).max(100).default(65),
  life_expectancy: z.number().int().min(50).max(120).default(90),
  current_savings: z.number().min(0).max(1e12).default(0),
  monthly_contribution: z.number().min(0).max(1e8).default(0),
  expected_return_pct: z.number().min(-10).max(30).default(6),
  inflation_pct: z.number().min(0).max(20).default(2.5),
  healthcare_inflation_pct: z.number().min(0).max(20).default(5.5),
  accounts: accountsSchema.default([]),
  income_sources: incomeSourcesSchema.default([]),
  linked_policy_ids: z.array(z.string().uuid()).default([]),
  expenses_monthly: z.number().min(0).max(1e7).optional().nullable(),
  healthcare_monthly: z.number().min(0).max(1e7).optional().nullable(),
  projected_nest_egg: z.number().optional().nullable(),
  projected_monthly_income: z.number().optional().nullable(),
  withdrawal_rate_pct: z.number().optional().nullable(),
  success_probability_pct: z.number().optional().nullable(),
  status: z.enum(["draft", "presented", "in_progress", "completed"]).default("draft"),
  next_meeting_date: z.string().optional().nullable(),
});

export const createRetirementCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    client_id: z.string().uuid().optional().nullable(),
    title: z.string().max(200).optional().nullable(),
    current_age: z.number().int().min(18).max(100).default(45),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("retirement_cases")
      .insert({
        agent_id: userId,
        client_id: data.client_id ?? null,
        title: data.title ?? "Untitled case",
        current_age: data.current_age,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const saveRetirementCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rcSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.id) throw new Error("Missing case id");
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("retirement_cases")
      .update({ ...patch, agent_id: userId })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRetirementCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("retirement_cases")
      .select("id,client_id,title,status,projected_nest_egg,success_probability_pct,next_meeting_date,updated_at,created_at,current_age,retirement_age")
      .eq("agent_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.client_id).filter(Boolean) as string[];
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: cs } = await supabase.from("clients").select("id,first_name,last_name").in("id", ids);
      for (const c of cs ?? []) names[c.id] = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    }
    return (data ?? []).map((r) => ({
      ...r,
      client_name: r.client_id ? names[r.client_id] ?? "" : r.title ?? "",
    }));
  });

export const getRetirementCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("retirement_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const searchClientsForCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = data.q.trim();
    let query = supabase.from("clients")
      .select("id,first_name,last_name,date_of_birth")
      .eq("agent_id", userId)
      .order("last_name", { ascending: true })
      .limit(20);
    if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listClientPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ client_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("policies")
      .select("id,policy_number,product,face_amount,monthly_premium,carrier_id")
      .eq("client_id", data.client_id)
      .eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
