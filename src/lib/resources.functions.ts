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
    }, { onConflict: "agent_id,state_code,loa" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const scanNiprPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    file_base64: z.string().min(100),
    media_type: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI features unavailable — LOVABLE_API_KEY not configured.");

    const systemPrompt = `You are a data extraction assistant. Extract all insurance license records from a NIPR Producer Database (PDB) report.
Return ONLY a valid JSON object with this exact structure, no markdown fences, no explanation:
{
  "npn": "<NPN number as string>",
  "licenses": [
    {
      "state_code": "<2-letter state code>",
      "license_number": "<license number>",
      "license_type": "<license type e.g. Resident, Non-Resident>",
      "loa": "<line of authority e.g. Life, Accident & Health, Property, Casualty>",
      "loa_status": "<Active or Inactive>",
      "issued_date": "<YYYY-MM-DD or empty string>",
      "expires_date": "<YYYY-MM-DD or empty string>",
      "is_resident": <true or false>
    }
  ]
}
If the document is not a NIPR PDB report or cannot be parsed, return: {"error": "Not a valid NIPR PDB report"}`;

    const dataUrl = `data:${data.media_type};base64,${data.file_base64}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: "Extract all license records from this NIPR PDB report." },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Contact your admin.");
      throw new Error(`AI gateway error ${res.status}: ${errBody}`);
    }
    const body = await res.json();
    const raw: string = body?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (parsed.error) throw new Error(parsed.error);
    return parsed as { npn: string; licenses: any[] };
  });

export const bulkUpsertLicenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    npn: z.string().optional(),
    licenses: z.array(z.object({
      state_code: z.string().length(2),
      license_number: z.string().optional(),
      license_type: z.string().optional(),
      loa: z.string().optional(),
      loa_status: z.string().optional(),
      issued_date: z.string().optional(),
      expires_date: z.string().optional(),
      is_resident: z.boolean().optional(),
    })),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const errors: string[] = [];
    let inserted = 0;
    for (const lic of data.licenses) {
      const row = {
        agent_id: userId,
        state_code: lic.state_code,
        license_number: lic.license_number ?? null,
        license_type: lic.license_type ?? null,
        loa: lic.loa ?? null,
        loa_status: lic.loa_status ?? "Active",
        issued_date: lic.issued_date || null,
        expires_date: lic.expires_date || null,
        is_resident: lic.is_resident ?? false,
        npn_number: data.npn ?? null,
        updated_at: new Date().toISOString(),
      } as any;
      const { error } = await supabase.from("state_licenses").upsert(row, {
        onConflict: "agent_id,state_code,loa",
      });
      if (error) errors.push(`${lic.state_code} (${lic.loa ?? "no LOA"}): ${error.message}`);
      else inserted++;
    }
    if (data.npn) {
      await supabase.from("profiles").update({ npn_number: data.npn }).eq("id", userId);
    }
    return { inserted, errors, total: data.licenses.length };
  });
