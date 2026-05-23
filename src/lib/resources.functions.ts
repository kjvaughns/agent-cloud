import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, docs, contracts, phone, wallet, policies] = await Promise.all([
      supabase.from("profiles").select("npn_number,date_of_birth,street_address").eq("id", userId).maybeSingle(),
      supabase.from("producer_documents").select("doc_type").eq("agent_id", userId),
      supabase.from("contract_requests").select("status").eq("agent_id", userId),
      supabase.from("agent_phone_settings").select("phone_number").eq("agent_id", userId).maybeSingle(),
      supabase.from("wallet").select("balance_cents").eq("agent_id", userId).maybeSingle(),
      supabase.from("policies").select("id", { count: "exact", head: true }).eq("agent_id", userId),
    ]);
    const docTypes = new Set((docs.data ?? []).map((d) => d.doc_type));
    const steps = {
      profile: !!(profile.data?.npn_number && profile.data?.date_of_birth && profile.data?.street_address),
      eo: docTypes.has("eo_certificate"),
      aml: docTypes.has("aml_certificate"),
      banking: docTypes.has("banking"),
      contract: (contracts.data ?? []).some((c) => c.status === "active"),
      phone: !!phone.data?.phone_number,
      wallet: (wallet.data?.balance_cents ?? 0) > 0,
      deal: (policies.count ?? 0) > 0,
    };
    const completed = Object.values(steps).filter(Boolean).length;
    return { steps, completed, total: 8, pct: Math.round((completed / 8) * 100) };
  });

export const getHandbookSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("handbook_sections").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getScripts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scripts").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("academy_courses").select("*").eq("published", true).order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStatesReference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("states_reference").select("*").order("state_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyLicenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("state_licenses").select("*").eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    state_code: z.string().length(2),
    license_number: z.string().min(1).max(64),
    issued_date: z.string(),
    expires_date: z.string(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("state_licenses").upsert({
      agent_id: userId,
      state_code: data.state_code,
      license_number: data.license_number,
      issued_date: data.issued_date,
      expires_date: data.expires_date,
    }, { onConflict: "agent_id,state_code" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
