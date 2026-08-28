import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildMatchIndex, classifyClient, rowKey } from "@/lib/import-match";
import { z } from "zod";
import { gridProductsByCarrier } from "@/lib/carriers/grid-products";
import { calculateAndInsertAllCommissions } from "@/lib/commission-calculator";
import { scopeSchema } from "@/lib/scope";
import { resolveScopeAgentIds } from "@/lib/scope.functions";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { saleDateToTimestamp } from "@/lib/sale-date";

type Ctx = { supabase: any; userId: string };

const stageEnum = z.enum(["new", "callback", "almost_there", "sold"]);
const temperatureEnum = z.enum(["hot", "warm", "cold"]);

// ---------- List ----------

/** An agency's whole client list is not a thing anyone reads to the bottom of. */
const AGENCY_ROW_CAP = 2000;

export const listPipelineClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scope: scopeSchema.default("mine") }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    /*
      Pick up anything the agency imported under this person's email.

      An agency commonly imports an agent's book after that agent has already
      signed up, which parks the rows against their email with no owner. Signup
      claimed what existed then; without this, everything imported afterwards
      never appears for them at all — an empty pipeline next to a book that is
      demonstrably theirs. Cheap: the update matches nothing on every subsequent
      load.
    */
    if (data.scope === "mine") {
      const { error: claimErr } = await supabase.rpc("claim_my_assigned_records", {});
      if (claimErr) console.error("Pipeline: claim failed", claimErr.message);
    }

    // Who counts as "me" for this request. Everything below narrows to this
    // set, including the beneficiary lookup — miss that one and a downline
    // client silently loses its beneficiary label, which is a wrong answer
    // rather than a missing one.
    // Pipeline never crosses an agency boundary. A parent agency's owner
    // administers its sub-agencies — levels, carriers, rollup production — but
    // their clients are not the parent's to read, so "imo" narrows to the
    // caller's own agency rather than resolving the sub-agency agents.
    const readScope = data.scope === "imo" ? "agency" : data.scope;
    const agentIds = readScope === "mine"
      ? [userId]
      : await resolveScopeAgentIds(supabase, readScope);

    // `is_sample` drives the "Sample" chip on the card. It is a pending column,
    // so naming it would fail this whole query with 42703 and empty the
    // pipeline for everybody until the migration lands — hence the retry. A
    // database without the column has no sample rows either, so the fallback
    // answers the question correctly rather than approximately.
    const COLUMNS =
      "id,first_name,last_name,phone,phone_type,email,date_of_birth,street_address,city,state,zip_code,stage,temperature,score_pct,last_opened_at,created_at,agent_id";
    const readClients = (columns: string) =>
      supabase
        .from("clients")
        .select(columns)
        .in("agent_id", agentIds)
        .order("created_at", { ascending: false })
        .limit(AGENCY_ROW_CAP);

    let { data: clients, error } = await readClients(`${COLUMNS},is_sample`);
    if (error) ({ data: clients, error } = await readClients(COLUMNS));
    if (error) throw new Error(error.message);

    // Find beneficiary back-refs: which of these clients are beneficiaries of other clients?
    const ids = (clients ?? []).map((c: any) => c.id);
    const benefMap = new Map<string, string>();
    if (ids.length) {
      // beneficiaries are linked to clients via client_id (the owner). To know if a client is a beneficiary, we'd need to match by name + agent. Use first/last name match on agent's clients.
      const { data: benefRows } = await supabase
        .from("beneficiaries")
        .select("first_name,last_name,client_id,clients!inner(first_name,last_name,agent_id)")
        .in("clients.agent_id", agentIds);
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

    // How each sold client pays. One batched read rather than one per card —
    // the same shape as the policy read above.
    const bankingMap = new Map<string, any>();
    if (soldIds.length) {
      const { data: banks } = await supabase
        .from("client_banking")
        .select("client_id, payment_method, draft_date, draft_schedule, draft_wednesday")
        .in("client_id", soldIds);
      for (const b of banks ?? []) bankingMap.set(b.client_id, b);
    }

    // Whose lead it is, but only when that could be somebody else. A board of
    // cards with no owner on them is unreadable the moment it stops being
    // one person's board.
    const nameById = new Map<string, string>();
    if (data.scope !== "mine") {
      const owners = Array.from(new Set((clients ?? []).map((c: any) => c.agent_id).filter(Boolean)));
      if (owners.length) {
        const { data: people } = await supabase
          .from("profiles").select("id, first_name, last_name").in("id", owners);
        for (const p of people ?? []) {
          nameById.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
        }
      }
    }

    return (clients ?? []).map((c: any) => ({
      ...c,
      beneficiary_of: benefMap.get(c.id) ?? null,
      latest_policy: policyMap.get(c.id) ?? null,
      banking: bankingMap.get(c.id) ?? null,
      agent_name: nameById.get(c.agent_id) ?? null,
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

    // This used to be a bare insert with no duplicate check of any kind — the
    // only protection was `clients_agent_phone_unique`, and because the whole
    // payload went in one statement, a single collision failed the entire
    // import with a Postgres error rather than skipping one row. Re-importing
    // the same CSV either blew up or, where phones were blank, quietly
    // doubled the book.
    const index = await buildMatchIndex(supabase, [userId]);

    const seen = new Set<string>();
    const payload: any[] = [];
    let skipped = 0;

    for (const r of data.rows) {
      // Within the file first: a CSV exported twice and concatenated is a
      // common shape, and neither copy is in the database yet.
      const key = rowKey("clients", r);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);

      // Only exact matches are skipped — a shared phone, email, or name plus
      // date of birth. Anything less certain is imported, because this screen
      // has nowhere to ask and silently dropping somebody's client is worse
      // than a duplicate they can merge.
      if (classifyClient(index, r).verdict === "exact") { skipped++; continue; }

      payload.push({
        ...r,
        email: r.email || null,
        date_of_birth: r.date_of_birth || null,
        stage: r.stage ?? "new",
        temperature: r.temperature ?? "cold",
        agent_id: userId,
      });
    }

    if (!payload.length) return { count: 0, skipped };

    const { error, data: ins } = await supabase.from("clients").insert(payload).select("id");
    if (error) throw new Error(error.message);
    return { count: ins?.length ?? 0, skipped };
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

    // What has happened to this client's policies, and which of them were at
    // risk. Both are dated records that the drawer had no way to show, so a
    // policy that lapsed and was recovered looked the same as one that never
    // moved. Read after the batch above because both are keyed on the policies
    // it returns.
    //
    // Cast and caught: `policy_events` arrives with 20260814230000, and a
    // timeline missing one of its five sources is worth far more than a client
    // record that will not open at all.
    let policy_events: any[] = [];
    let retention_cases: any[] = [];
    const policyIds = (policies ?? []).map((p: any) => p.id);
    if (policyIds.length > 0) {
      try {
        const [{ data: pe }, { data: rc }] = await Promise.all([
          (supabase as any)
            .from("policy_events")
            .select("*")
            .in("policy_id", policyIds)
            .order("occurred_at", { ascending: false }),
          supabase.from("retention_cases").select("*").in("policy_id", policyIds),
        ]);
        policy_events = pe ?? [];
        retention_cases = rc ?? [];
      } catch (e: any) {
        console.error("[pipeline] timeline sources unavailable:", e?.message);
      }
    }

    return { client, financials, beneficiaries: beneficiaries ?? [], contact_history: contact_history ?? [], life_events: life_events ?? [], needs_analysis: needs_analysis ?? [], policies: policies ?? [], events: events ?? [], health: health ?? null, banking: banking ?? null, policy_events, retention_cases };
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
    // .select("id") so an RLS-filtered delete is reported rather than
    // returning ok. Postgres does not treat "matched no rows" as an error,
    // so this used to succeed silently and the beneficiary stayed on screen
    // until the next refresh brought it back.
    const { data: gone, error } = await supabase
      .from("beneficiaries").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) {
      throw new Error("That beneficiary is no longer there, or it is not yours to delete.");
    }
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
    // .select("id") so an RLS-filtered delete is reported rather than
    // returning ok. Postgres does not treat "matched no rows" as an error,
    // so this used to succeed silently and the life event stayed on screen
    // until the next refresh brought it back.
    const { data: gone, error } = await supabase
      .from("life_events").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) {
      throw new Error("That life event is no longer there, or it is not yours to delete.");
    }
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
  // Social Security recipients are paid on the 2nd, 3rd, or 4th Wednesday, so
  // billing follows the weekday, not a calendar day.
  draft_schedule: z.enum(["day_of_month", "ss_wednesday"]).nullable().optional(),
  draft_wednesday: z.number().int().min(2).max(4).nullable().optional(),
  payment_method: z.string().max(50).nullable().optional(),

  // Card on file. There is no cvc field and there must never be one — PCI DSS
  // 3.2 prohibits storing it after authorization. The full PAN is likewise not
  // accepted; last4 is constrained to exactly four digits both here and by a
  // CHECK constraint, so a full number sent by mistake is rejected rather than
  // quietly written.
  card_brand: z.string().max(20).nullable().optional(),
  card_last4: z.string().regex(/^[0-9]{4}$/).nullable().optional(),
  card_name: z.string().max(120).nullable().optional(),
  card_exp_month: z.number().int().min(1).max(12).nullable().optional(),
  card_exp_year: z.number().int().min(2000).max(2100).nullable().optional(),
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
/**
 * The agency's carriers, for the client drawer's policy form.
 *
 * Same correction as `listCarriersForDeal`: this read the global catalog, so
 * adding a policy from the pipeline offered every carrier in the system rather
 * than the ones this agency contracts with. Somebody with no organization gets
 * an empty list rather than the catalog — nothing they pick would be payable.
 */
export const listCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return [];

    const { data, error } = await supabase
      .from("org_carriers")
      .select("carrier_id, product_types, carriers ( id, name, active )")
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    // The commission grid is what actually names a carrier's products — the
    // "Ethos Term Life Prime" kind of name an agent recognises. `product_types`
    // on org_carriers is a hand-filled field and is usually empty, so the grid
    // wins whenever it has rows. Shared with Post a Deal rather than restated,
    // because the two screens drifted apart once already and the difference
    // showed up as one of them quietly offering the generic catalogue.
    const gridProducts = await gridProductsByCarrier(supabase, orgId);

    return (data ?? [])
      .filter((r: any) => r.carriers?.active !== false)
      .map((r: any) => {
        const fromGrid = gridProducts.get(String(r.carrier_id)) ?? [];
        const configured = (r.product_types ?? []) as string[];
        return {
          id: r.carrier_id as string,
          name: (r.carriers?.name ?? "Carrier") as string,
          product_types: (fromGrid.length > 0 ? fromGrid : configured) as string[],
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
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
  /**
   * When the business was written. Optional: left out, the database derives it
   * the way it always has. Given, it decides which month this deal counts in
   * on production, the dashboard and the leaderboard — which is what makes a
   * backdated or imported policy read accurately.
   */
  sale_date: z.string().nullable().optional().or(z.literal("")),
});

export const addPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addPolicySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { sale_date, ...fields } = data;
    const payload: any = { ...fields, agent_id: userId, posted_at: new Date().toISOString() };
    for (const k of ["policy_number", "product", "effective_date"]) {
      if (payload[k] === "") payload[k] = null;
    }
    // `posted_at` stays the real post time for audit; the sale date is the
    // production window, and only set here when the agent chose one.
    if (sale_date) {
      payload.production_date = saleDateToTimestamp(sale_date);
      payload.production_date_set_by = userId;
      payload.production_date_set_at = new Date().toISOString();
    }
    const { data: row, error } = await supabase.from("policies").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    // Look up client name for commission tracking
    const { data: clientRow } = await supabase
      .from("clients")
      .select("first_name, last_name")
      .eq("id", data.client_id)
      .maybeSingle();
    const clientName = clientRow
      ? `${clientRow.first_name ?? ""} ${clientRow.last_name ?? ""}`.trim()
      : "";

    // The policy is already written. A commission failure must be reported,
    // not thrown — throwing here loses the deal the agent just posted.
    let commissionError: string | null = null;
    try {
      await calculateAndInsertAllCommissions(supabase, {
        policyId: row.id,
        agentId: userId,
        carrierId: data.carrier_id ?? null,
        product: data.product ?? "",
        monthlyPremium: data.monthly_premium ?? 0,
        effectiveDate: data.effective_date ?? null,
        clientName,
      });
      const { data: issue } = await (supabase as any)
        .from("commission_setup_issues")
        .select("messages")
        .eq("policy_id", row.id)
        .is("resolved_at", null)
        .maybeSingle();
      if (issue?.messages?.length) commissionError = issue.messages.join(" ");
    } catch (e: any) {
      console.error("[commissions] inline post deal failed for", row.id, e?.message);
      commissionError = e?.message ?? "The commission could not be worked out.";
    }

    return { ...row, commissionError };
  });

// ---------- Update policy ----------
const updatePolicySchema = z.object({
  id: z.string().uuid(),
  carrier_id: z.string().uuid().nullable().optional(),
  policy_number: z.string().max(100).nullable().optional().or(z.literal("")),
  product: z.string().max(200).optional().or(z.literal("")),
  status: z.string().max(50).optional(),
  annual_premium: z.number().nullable().optional(),
  monthly_premium: z.number().nullable().optional(),
  face_amount: z.number().nullable().optional(),
  effective_date: z.string().nullable().optional().or(z.literal("")),
  /** See `addPolicy`: the month this policy counts in. */
  sale_date: z.string().nullable().optional().or(z.literal("")),
});

/** The fields whose changes are worth a line in the policy's history. */
const TRACKED_FIELDS: [keyof any, string][] = [
  ["policy_number", "Policy number"],
  ["carrier_id", "Carrier"],
  ["product", "Product"],
  ["monthly_premium", "Monthly premium"],
  ["annual_premium", "Annual premium"],
  ["face_amount", "Face amount"],
  ["effective_date", "Effective date"],
];

export const updatePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updatePolicySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { id, sale_date, ...fields } = data;
    const payload: any = { ...fields };
    for (const k of ["policy_number", "product", "effective_date"]) {
      if (payload[k] === "") payload[k] = null;
    }

    // What the policy says now. Read without an `agent_id` filter: an upline
    // and an agency admin can legitimately edit somebody else's policy, and
    // the database decides that — see `policies_org_update`. Filtering here as
    // well is what made those edits match nothing and report success anyway.
    const { data: before } = await supabase
      .from("policies")
      .select(
        "id, agent_id, client_id, organization_id, production_date, effective_date, carrier_id, product, monthly_premium, annual_premium, face_amount, policy_number, status",
      )
      .eq("id", id)
      .maybeSingle();

    if (!before) {
      throw new Error("That policy could not be found, or you cannot see it.");
    }

    let saleDateChanged = false;
    if (sale_date) {
      const next = saleDateToTimestamp(sale_date);
      saleDateChanged = next !== (before?.production_date ?? null);
      if (saleDateChanged) {
        payload.production_date = next;
        // Pinned by hand from here on: the derived rule must stop overwriting
        // it the next time somebody edits the effective date.
        payload.production_date_set_by = userId;
        payload.production_date_set_at = new Date().toISOString();
      }
    }

    // Counted, because a row-level rule that refuses the write returns no
    // error — only zero rows. A save that changed nothing must not be
    // reported as a save.
    const { error, count } = await supabase
      .from("policies")
      .update(payload, { count: "exact" })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) {
      throw new Error(
        "You do not have permission to edit this policy. Only the writing agent, their upline or an agency admin can change it.",
      );
    }

    // Who changed what, on the same timeline the status trigger already
    // writes to, so the detail sheet shows edits and not just status moves.
    const changes = TRACKED_FIELDS.filter(([key]) => {
      if (!(key in payload)) return false;
      const next = (payload as any)[key] ?? null;
      const prev = (before as any)[key as string] ?? null;
      return String(next ?? "") !== String(prev ?? "");
    }).map(([key, label]) => {
      const next = (payload as any)[key] ?? null;
      const prev = (before as any)[key as string] ?? null;
      return `${label}: ${prev ?? "—"} → ${next ?? "—"}`;
    });
    if (saleDateChanged) changes.push(`Sale date set to ${sale_date}`);

    if (changes.length > 0) {
      try {
        await (supabase as any).from("policy_events").insert({
          policy_id: id,
          client_id: before.client_id,
          organization_id: before.organization_id,
          agent_id: before.agent_id,
          kind: "edited",
          source: "pipeline",
          note: changes.join("; "),
          actor_id: userId,
          occurred_at: new Date().toISOString(),
        });
      } catch (e: any) {
        console.error("[policy] history write failed for", id, e?.message);
      }
    }

    // Moving the sale date moves the money with it: the advance and the trail
    // belong on the months the business was actually written. The calculator
    // supersedes the legs it no longer produces, so this corrects rather than
    // duplicates. Non-fatal — the date change itself is already saved.
    const effChanged =
      payload.effective_date !== undefined &&
      payload.effective_date !== (before?.effective_date ?? null);
    if (saleDateChanged || effChanged) {
      try {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("first_name, last_name")
          .eq("id", before?.client_id)
          .maybeSingle();
        await calculateAndInsertAllCommissions(supabase, {
          policyId: id,
          // The money belongs to whoever wrote the policy, not to whoever
          // corrected a typo on it.
          agentId: before.agent_id ?? userId,
          carrierId: payload.carrier_id ?? before?.carrier_id ?? null,
          product: payload.product ?? before?.product ?? "",
          monthlyPremium: Number(payload.monthly_premium ?? before?.monthly_premium ?? 0),
          // The schedule is anchored on the effective date when there is one;
          // a policy backdated with no effective date falls back to the sale
          // date rather than producing nothing.
          effectiveDate:
            (payload.effective_date ?? before?.effective_date) ||
            (sale_date ? sale_date : null),
          clientName: clientRow
            ? `${clientRow.first_name ?? ""} ${clientRow.last_name ?? ""}`.trim()
            : "",
        });
      } catch (e: any) {
        console.error("[commissions] recalc after date change failed for", id, e?.message);
      }
    }

    return { ok: true, saleDateChanged };
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
