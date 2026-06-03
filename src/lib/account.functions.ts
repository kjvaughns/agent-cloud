import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProducerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profileRes, docsRes, bgRes, agreementRes, completionRes, bankingRes] = await Promise.all([
      supabase.from("profiles").select("id,first_name,last_name,email,phone,npn_number,date_of_birth,gender,ssn_last4,street_address,city,state,zip_code,agent_slug,google_oauth_connected,avatar_url,marital_status,drivers_license_number,drivers_license_state,drivers_license_expiry").eq("id", userId).maybeSingle(),
      supabase.from("producer_documents").select("id,doc_type,file_name,file_url,start_date,expiration_date,created_at,carrier_name,policy_number,coverage_amount,provider_name,certificate_number").eq("agent_id", userId),
      supabase.from("background_questions").select("question_number,answer,explanation").eq("agent_id", userId),
      supabase.from("producer_agreements").select("signature_name,signed_date,agreement_version").eq("agent_id", userId).maybeSingle(),
      supabase.rpc("agent_completion", { _agent: userId }),
      (supabase as any).from("producer_banking").select("*").eq("agent_id", userId).maybeSingle(),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    return {
      profile: profileRes.data,
      documents: docsRes.data ?? [],
      background: bgRes.data ?? [],
      agreement: agreementRes.data,
      completion: (completionRes.data as { pct: number; missing: string[] } | null) ?? { pct: 0, missing: [] },
      banking: bankingRes.data ?? null,
    };
  });

const ProfilePatch = z.object({
  first_name: z.string().trim().max(60).optional(),
  last_name: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  npn_number: z.string().trim().max(40).optional().or(z.literal("")),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().trim().max(40).optional().or(z.literal("")),
  marital_status: z.string().trim().max(40).optional().or(z.literal("")),
  street_address: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(2).optional().or(z.literal("")),
  zip_code: z.string().trim().max(10).optional().or(z.literal("")),
  drivers_license_number: z.string().trim().max(40).optional().or(z.literal("")),
  drivers_license_state: z.string().trim().max(2).optional().or(z.literal("")),
  drivers_license_expiry: z.string().optional().nullable(),
});

export const updateProducerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProfilePatch.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === "" || v === undefined) continue;
      patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch as never).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSsn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ssn: z.string().trim().min(9).max(11) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("ssn_set", { _ssn: data.ssn });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revealSsn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("ssn_reveal");
    if (error) throw new Error(error.message);
    return { ssn: (data as string | null) ?? null };
  });

const DocInput = z.object({
  doc_type: z.enum(["eo_certificate", "banking", "drivers_license", "aml_certificate", "government_id", "voided_check", "background_check", "w9", "other"]),
  file_path: z.string().trim().min(1).max(500).optional().nullable(),
  file_name: z.string().trim().min(1).max(200).optional().nullable(),
  start_date: z.string().optional().nullable(),
  expiration_date: z.string().optional().nullable(),
  carrier_name: z.string().trim().max(120).optional().nullable(),
  policy_number: z.string().trim().max(80).optional().nullable(),
  coverage_amount: z.string().trim().max(40).optional().nullable(),
  provider_name: z.string().trim().max(120).optional().nullable(),
  certificate_number: z.string().trim().max(80).optional().nullable(),
});

export const upsertProducerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DocInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("producer_documents").select("id,file_url,file_name").eq("agent_id", userId).eq("doc_type", data.doc_type).maybeSingle();
    const row: Record<string, unknown> = {
      agent_id: userId,
      doc_type: data.doc_type,
      file_url: data.file_path ?? existing?.file_url ?? null,
      file_name: data.file_name ?? existing?.file_name ?? null,
      start_date: data.start_date ?? null,
      expiration_date: data.expiration_date ?? null,
      carrier_name: data.carrier_name ?? null,
      policy_number: data.policy_number ?? null,
      coverage_amount: data.coverage_amount ?? null,
      provider_name: data.provider_name ?? null,
      certificate_number: data.certificate_number ?? null,
    };
    if (existing) {
      const { error } = await supabase.from("producer_documents").update(row as never).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("producer_documents").insert(row as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ doc_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase.from("producer_documents").select("file_url,agent_id").eq("id", data.doc_id).maybeSingle();
    if (!doc || doc.agent_id !== userId || !doc.file_url) throw new Error("not found");
    const { data: signed, error } = await supabase.storage.from("agent-documents").createSignedUrl(doc.file_url, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

const BgAnswers = z.array(z.object({
  question_number: z.number().int().min(1).max(20),
  answer: z.boolean(),
  explanation: z.string().trim().max(2000).optional().nullable(),
}));

export const saveBackgroundQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ answers: BgAnswers }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const rows = data.answers.map((a) => ({
      agent_id: userId,
      question_number: a.question_number,
      answer: a.answer,
      explanation: a.explanation || null,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("background_questions").delete().eq("agent_id", userId);
    if (rows.length) {
      const { error } = await supabase.from("background_questions").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const signProducerAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ signature_name: z.string().trim().min(2).max(120) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("producer_agreements").upsert({
      agent_id: userId,
      signature_name: data.signature_name,
      signed_date: new Date().toISOString(),
      agreement_version: "1.0",
    }, { onConflict: "agent_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- banking ----------
export const upsertProducerBanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    bank_name: z.string().trim().max(120).optional().or(z.literal("")),
    account_type: z.enum(["checking", "savings"]).optional(),
    routing_number: z.string().trim().max(9).optional().or(z.literal("")),
    account_last4: z.string().trim().max(4).optional().or(z.literal("")),
    account_number_encrypted: z.string().trim().max(500).optional().or(z.literal("")),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { agent_id: userId, updated_at: new Date().toISOString() };
    if (data.bank_name !== undefined) patch.bank_name = data.bank_name || null;
    if (data.account_type !== undefined) patch.account_type = data.account_type;
    if (data.routing_number !== undefined) patch.routing_number = data.routing_number || null;
    if (data.account_last4 !== undefined) patch.account_last4 = data.account_last4 || null;
    if (data.account_number_encrypted !== undefined) patch.account_number_encrypted = data.account_number_encrypted || null;
    const { error } = await (supabase as any).from("producer_banking").upsert(patch, { onConflict: "agent_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revealBankingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await (supabase as any).from("producer_banking").select("account_number_encrypted").eq("agent_id", userId).maybeSingle();
    return { account_number: (data as any)?.account_number_encrypted ?? null };
  });

// ---------- background disclosure ----------
export const signBackgroundDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    answers: z.array(z.object({
      question_number: z.number().int().min(1).max(20),
      answer: z.boolean(),
      explanation: z.string().trim().max(2000).optional().nullable(),
    })),
    signature_name: z.string().trim().min(2).max(120),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const rows = data.answers.map((a) => ({
      agent_id: userId,
      question_number: a.question_number,
      answer: a.answer,
      explanation: a.explanation || null,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("background_questions").delete().eq("agent_id", userId);
    if (rows.length) {
      const { error } = await supabase.from("background_questions").insert(rows);
      if (error) throw new Error(error.message);
    }
    const { error: sigErr } = await supabase.from("producer_agreements").upsert({
      agent_id: userId,
      signature_name: data.signature_name,
      signed_date: new Date().toISOString(),
      agreement_version: "background_v1",
    }, { onConflict: "agent_id" });
    if (sigErr) throw new Error(sigErr.message);
    return { ok: true };
  });

// ---------- NPN lookup (stub — AgentSync integration in Prompt 8) ----------
export const lookupNpnLicenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ npn: z.string().trim().min(5).max(20) }).parse(input))
  .handler(async ({ data }) => {
    if (!/^\d{5,10}$/.test(data.npn)) throw new Error("NPN must be 5–10 digits");
    return { ok: true, npn: data.npn, name: null, licenses: [] as any[], note: "Full license lookup via AgentSync coming in next update." };
  });

export const getLandingPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [pageRes, profileRes] = await Promise.all([
      supabase.from("agent_landing_pages").select("*").eq("agent_id", userId).maybeSingle(),
      supabase.from("profiles").select("first_name,last_name,email,phone,agent_slug,avatar_url").eq("id", userId).maybeSingle(),
    ]);
    return { page: pageRes.data, profile: profileRes.data };
  });

const LandingInput = z.object({
  contact_email: z.string().trim().max(120).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(30).optional().or(z.literal("")),
  custom_message: z.string().trim().max(500).optional().or(z.literal("")),
  specialties: z.array(z.string().max(60)).max(20),
  carriers: z.array(z.string().max(80)).max(50),
  licensed_states: z.array(z.string().max(2)).max(51),
});

export const saveLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LandingInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("agent_landing_pages").upsert({
      agent_id: userId,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      custom_message: data.custom_message || null,
      specialties: data.specialties,
      carriers: data.carriers,
      licensed_states: data.licensed_states,
      updated_at: new Date().toISOString(),
    }, { onConflict: "agent_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setLandingPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ published: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("agent_landing_pages").upsert({
      agent_id: userId,
      published: data.published,
    }, { onConflict: "agent_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateBioAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    context: z.string().trim().max(500).optional(),
    specialties: z.array(z.string()).max(20).optional(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;
    const { data: profile } = await supabase.from("profiles").select("first_name,last_name").eq("id", userId).maybeSingle();
    const name = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "the agent";
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You write short, warm, professional 2-3 sentence bios for licensed life insurance agents to display on their lead-generation landing page. First person, conversational, no buzzwords, ends with a call to learn more." },
          { role: "user", content: `Agent: ${name}. Specialties: ${(data.specialties ?? []).join(", ") || "general life insurance"}. Extra context: ${data.context || "none"}.` },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limit. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add funds in workspace settings.");
    if (!res.ok) throw new Error("AI generation failed");
    const json = await res.json();
    const text = (json?.choices?.[0]?.message?.content ?? "").trim();
    return { bio: text };
  });

export const listFaq = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase.from("faq_items").select("id,section,question,answer,sort_order").order("section").order("sort_order");
    return { items: data ?? [] };
  });
