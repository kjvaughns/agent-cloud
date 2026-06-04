import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { supabase: any; userId: string };

const stageEnum = z.enum(["new", "callback", "almost_there", "sold"]);
const temperatureEnum = z.enum(["hot", "warm", "cold"]);

// ---------- List ----------
export const listPipelineClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id,first_name,last_name,phone,phone_type,email,date_of_birth,street_address,city,state,zip_code,stage,temperature,score_pct,last_opened_at,created_at,agent_id")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Find beneficiary back-refs: which of these clients are beneficiaries of other clients?
    const ids = (clients ?? []).map((c: any) => c.id);
    const benefMap = new Map<string, string>();
    if (ids.length) {
      // beneficiaries are linked to clients via client_id (the owner). To know if a client is a beneficiary, we'd need to match by name + agent. Use first/last name match on agent's clients.
      const { data: benefRows } = await supabase
        .from("beneficiaries")
        .select("first_name,last_name,client_id,clients!inner(first_name,last_name,agent_id)")
        .eq("clients.agent_id", userId);
      for (const c of clients ?? []) {
        const hit = (benefRows ?? []).find(
          (b: any) =>
            b.first_name?.toLowerCase() === c.first_name?.toLowerCase() &&
            b.last_name?.toLowerCase() === c.last_name?.toLowerCase(),
        );
        if (hit) benefMap.set(c.id, `${hit.clients.first_name} ${hit.clients.last_name}`);
      }
    }

    // Latest policy per sold client
    const soldIds = (clients ?? []).filter((c: any) => c.stage === "sold").map((c: any) => c.id);
    const policyMap = new Map<string, any>();
    if (soldIds.length) {
      const { data: pols } = await supabase
        .from("policies")
        .select("client_id,carrier_id,product,policy_number,effective_date,monthly_premium,status,carriers(name)")
        .in("client_id", soldIds)
        .order("posted_at", { ascending: false });
      for (const p of pols ?? []) {
        if (!policyMap.has(p.client_id)) policyMap.set(p.client_id, p);
      }
    }

    return (clients ?? []).map((c: any) => ({
      ...c,
      beneficiary_of: benefMap.get(c.id) ?? null,
      latest_policy: policyMap.get(c.id) ?? null,
    }));
  });

// ---------- Create ----------
const createClientSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30),
  phone_type: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  street_address: z.string().max(255).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(50).optional().or(z.literal("")),
  zip_code: z.string().max(20).optional().or(z.literal("")),
  stage: stageEnum.default("new"),
  temperature: temperatureEnum.default("cold"),
});

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createClientSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const payload: any = { ...data, agent_id: userId };
    for (const k of ["email", "date_of_birth", "street_address", "city", "state", "zip_code"]) {
      if (payload[k] === "") payload[k] = null;
    }
    const { data: row, error } = await supabase.from("clients").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Update ----------
const updateSchema = z.object({
  id: z.string().uuid(),
  patch: z.record(z.string(), z.any()),
});

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const allowed = [
      "first_name", "last_name", "phone", "phone_type", "email", "date_of_birth",
      "street_address", "city", "state", "zip_code", "born_country_state",
      "stage", "temperature", "score_pct", "preferred_contact", "best_time_to_call",
      "communication_notes",
    ];
    const patch: any = {};
    for (const k of allowed) if (k in data.patch) patch[k] = data.patch[k] === "" ? null : data.patch[k];
    const { error } = await supabase.from("clients").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markClientSold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("clients").update({ stage: "sold" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Import ----------
const importSchema = z.object({
  rows: z
    .array(
      z.object({
        first_name: z.string().min(1).max(100),
        last_name: z.string().min(1).max(100),
        phone: z.string().min(7).max(30),
        email: z.string().email().max(255).optional().or(z.literal("")),
        date_of_birth: z.string().optional().or(z.literal("")),
        stage: stageEnum.optional(),
        temperature: temperatureEnum.optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export const importClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const payload = data.rows.map((r) => ({
      ...r,
      email: r.email || null,
      date_of_birth: r.date_of_birth || null,
      stage: r.stage ?? "new",
      temperature: r.temperature ?? "cold",
      agent_id: userId,
    }));
    const { error, data: ins } = await supabase.from("clients").insert(payload).select("id");
    if (error) throw new Error(error.message);
    return { count: ins?.length ?? 0 };
  });

// ---------- Detail ----------
export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [
      { data: client },
      { data: financials },
      { data: beneficiaries },
      { data: contact_history },
      { data: life_events },
      { data: needs_analysis },
      { data: policies },
      { data: events },
      { data: health },
      { data: banking },
    ] = await Promise.all([
      supabase.from("clients").select("*").eq("id", data.id).single(),
      supabase.from("client_financials").select("*").eq("client_id", data.id).maybeSingle(),
      supabase.from("beneficiaries").select("*").eq("client_id", data.id),
      supabase.from("contact_history").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("life_events").select("*").eq("client_id", data.id).order("event_date", { ascending: false }),
      supabase.from("needs_analysis").select("*").eq("client_id", data.id).order("created_at", { ascending: true }),
      supabase.from("policies").select("*,carriers(name,id)").eq("client_id", data.id).order("posted_at", { ascending: false }),
      supabase.from("calendar_events").select("*").eq("client_id", data.id).gte("start_at", new Date().toISOString()).order("start_at"),
      supabase.from("client_health").select("*").eq("client_id", data.id).maybeSingle(),
      supabase.from("client_banking").select("*").eq("client_id", data.id).maybeSingle(),
    ]);
    return { client, financials, beneficiaries: beneficiaries ?? [], contact_history: contact_history ?? [], life_events: life_events ?? [], needs_analysis: needs_analysis ?? [], policies: policies ?? [], events: events ?? [], health: health ?? null, banking: banking ?? null };
  });

export const touchLastOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await supabase.from("clients").update({ last_opened_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

// ---------- Financials ----------
const finSchema = z.object({
  client_id: z.string().uuid(),
  earned_income: z.number().nullable().optional(),
  social_security: z.number().nullable().optional(),
  pension: z.number().nullable().optional(),
  other_income: z.number().nullable().optional(),
  employment_status: z.string().max(50).nullable().optional(),
  retirement_age: z.number().int().min(0).max(120).nullable().optional(),
});

export const upsertFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => finSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: existing } = await supabase.from("client_financials").select("id").eq("client_id", data.client_id).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("client_financials").update(data).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("client_financials").insert(data);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Beneficiaries ----------
const benefSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional().or(z.literal("")),
  relationship: z.string().max(50).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  dob: z.string().optional().or(z.literal("")),
  percentage: z.number().min(0).max(100).optional().nullable(),
});

export const saveBeneficiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => benefSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const payload: any = { ...data };
    for (const k of ["last_name", "relationship", "phone", "dob"]) if (payload[k] === "") payload[k] = null;
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("beneficiaries").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("beneficiaries").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteBeneficiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("beneficiaries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Life events ----------
const lifeSchema = z.object({
  client_id: z.string().uuid(),
  event_type: z.string().min(1).max(50),
  event_date: z.string().optional().or(z.literal("")),
  note: z.string().max(2000).optional().or(z.literal("")),
});

export const addLifeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => lifeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const payload: any = { ...data };
    if (payload.event_date === "") payload.event_date = null;
    if (payload.note === "") payload.note = null;
    const { error } = await supabase.from("life_events").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLifeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("life_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Contact history ----------
const contactSchema = z.object({
  client_id: z.string().uuid(),
  contact_type: z.string().min(1).max(50),
  note: z.string().max(5000).optional().or(z.literal("")),
  is_auto: z.boolean().optional(),
});

export const logContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => contactSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const payload: any = { ...data, agent_id: userId };
    if (payload.note === "") payload.note = null;
    const { error } = await supabase.from("contact_history").insert(payload);
    if (error) throw new Error(error.message);
    await supabase.from("clients").update({ last_opened_at: new Date().toISOString() }).eq("id", data.client_id);
    return { ok: true };
  });

// ---------- Needs analysis ----------
const naSchema = z.object({
  client_id: z.string().uuid(),
  question_key: z.string().min(1).max(100),
  response: z.string().max(2000),
});

export const saveNeedsAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => naSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // upsert by client+question
    const { data: existing } = await supabase
      .from("needs_analysis")
      .select("id")
      .eq("client_id", data.client_id)
      .eq("question_key", data.question_key)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("needs_analysis").update({ response: data.response }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("needs_analysis").insert({ ...data, agent_id: userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Health ----------
const healthSchema = z.object({
  client_id: z.string().uuid(),
  height_ft: z.number().int().nullable().optional(),
  height_in: z.number().int().min(0).max(11).nullable().optional(),
  weight_lbs: z.number().int().nullable().optional(),
  tobacco_use: z.boolean().nullable().optional(),
  primary_physician: z.string().max(200).nullable().optional(),
  primary_physician_phone: z.string().max(30).nullable().optional(),
  conditions: z.string().max(2000).nullable().optional(),
  medications: z.string().max(2000).nullable().optional(),
  medical_notes: z.string().max(5000).nullable().optional(),
});

export const upsertClientHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => healthSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("client_health").upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Banking ----------
const bankingSchema = z.object({
  client_id: z.string().uuid(),
  bank_name: z.string().max(200).nullable().optional(),
  routing_number: z.string().max(9).nullable().optional(),
  account_number_masked: z.string().max(50).nullable().optional(),
  account_type: z.string().max(20).nullable().optional(),
  draft_date: z.number().int().min(1).max(28).nullable().optional(),
  payment_method: z.string().max(50).nullable().optional(),
});

export const upsertClientBanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bankingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("client_banking").upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Carriers ----------
export const listCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase.from("carriers").select("id, name").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Add policy ----------
const addPolicySchema = z.object({
  client_id: z.string().uuid(),
  carrier_id: z.string().uuid().nullable().optional(),
  policy_number: z.string().max(100).optional().or(z.literal("")),
  product: z.string().max(200).optional().or(z.literal("")),
  status: z.string().max(50).default("issued_not_paid"),
  annual_premium: z.number().nullable().optional(),
  monthly_premium: z.number().nullable().optional(),
  face_amount: z.number().nullable().optional(),
  effective_date: z.string().nullable().optional().or(z.literal("")),
});

export const addPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addPolicySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const payload: any = { ...data, agent_id: userId, posted_at: new Date().toISOString() };
    for (const k of ["policy_number", "product", "effective_date"]) {
      if (payload[k] === "") payload[k] = null;
    }
    const { data: row, error } = await supabase.from("policies").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Calendar events ----------
const eventSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  event_type: z.string().min(1).max(50),
  start_at: z.string(),
  end_at: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const scheduleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => eventSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const payload: any = { ...data, agent_id: userId };
    if (payload.end_at === "") payload.end_at = null;
    if (payload.notes === "") payload.notes = null;
    const { error } = await supabase.from("calendar_events").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
