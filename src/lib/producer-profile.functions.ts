import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProducerChecklist = {
  status: string;
  npn: boolean;
  agreement_signed: boolean;
  pdb_uploaded: boolean;
  state_licenses_count: number;
  current_contracts_count: number;
  banking: boolean;
  completion_pct: number;
};

export const getMyProducerChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: licenses }, { data: contracts }, { data: pdb }, { data: bank }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("status, npn_number, agreement_signed_at, onboarding_completed_at")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("state_licenses").select("id").eq("agent_id", userId),
        supabase.from("agent_current_contracts").select("id").eq("agent_id", userId),
        supabase.from("pdb_uploads").select("id").eq("agent_id", userId).limit(1).maybeSingle(),
        supabase.from("producer_banking").select("id").eq("agent_id", userId).limit(1).maybeSingle(),
      ]);

    const npn = !!profile?.npn_number;
    const agreement = !!profile?.agreement_signed_at;
    const pdbDone = !!pdb;
    const licensesCount = (licenses ?? []).length;
    const contractsCount = (contracts ?? []).length;
    const banking = !!bank;
    const items = [npn, agreement, pdbDone, licensesCount > 0, contractsCount > 0, banking];
    const completion_pct = Math.round((items.filter(Boolean).length / items.length) * 100);

    return {
      status: profile?.status ?? "pending",
      npn,
      agreement_signed: agreement,
      pdb_uploaded: pdbDone,
      state_licenses_count: licensesCount,
      current_contracts_count: contractsCount,
      banking,
      completion_pct,
    } as ProducerChecklist;
  });

export const signProducerAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signature: string }) =>
    z.object({ signature: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sig = data.signature.replace(/[<>]/g, "");
    const signatureHtml = `<span style="font-family: 'Brush Script MT', cursive; font-size: 28px;">${sig}</span>`;
    const { error } = await context.supabase
      .from("profiles")
      .update({
        agreement_signed_at: new Date().toISOString(),
        agreement_signature_html: signatureHtml,
        agreement_agency_name: "APEX Financial LLC",
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyCurrentContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_current_contracts")
      .select("id, carrier_id, carrier_name, agent_number, current_level, effective_date, notes, created_at")
      .eq("agent_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addCurrentContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    carrier_id?: string | null;
    carrier_name?: string | null;
    agent_number?: string | null;
    current_level?: string | null;
    effective_date?: string | null;
    notes?: string | null;
  }) =>
    z
      .object({
        carrier_id: z.string().uuid().nullable().optional(),
        carrier_name: z.string().trim().max(120).nullable().optional(),
        agent_number: z.string().trim().max(60).nullable().optional(),
        current_level: z.string().trim().max(60).nullable().optional(),
        effective_date: z.string().nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agent_current_contracts").insert({
      agent_id: context.userId,
      carrier_id: data.carrier_id ?? null,
      carrier_name: data.carrier_name ?? null,
      agent_number: data.agent_number ?? null,
      current_level: data.current_level ?? null,
      effective_date: data.effective_date || null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCurrentContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_current_contracts")
      .delete()
      .eq("id", data.id)
      .eq("agent_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordPdbUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storage_path: string; filename?: string; parsed_states?: string[] }) =>
    z
      .object({
        storage_path: z.string().trim().min(1).max(500),
        filename: z.string().trim().max(255).optional(),
        parsed_states: z.array(z.string().length(2)).max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pdb_uploads").insert({
      agent_id: context.userId,
      storage_path: data.storage_path,
      filename: data.filename ?? null,
      parsed_states: data.parsed_states ?? [],
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Commission level requests
export const requestCommissionLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { carrier_id: string; message?: string }) =>
    z
      .object({
        carrier_id: z.string().uuid(),
        message: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("commission_level_requests").insert({
      agent_id: context.userId,
      carrier_id: data.carrier_id,
      message: data.message ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPendingLevelRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("commission_level_requests")
      .select("id, agent_id, carrier_id, message, status, created_at, carriers(name), profiles!commission_level_requests_agent_id_fkey(first_name,last_name,email)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const decideLevelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; approve: boolean; assigned_pct?: number; commission_level?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        assigned_pct: z.number().min(0).max(2).optional(),
        commission_level: z.string().trim().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: req, error: rErr } = await supabase
      .from("commission_level_requests")
      .select("agent_id, carrier_id")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr || !req) throw new Error(rErr?.message ?? "Request not found");

    if (data.approve) {
      const { error: upErr } = await supabase.from("agent_commission_levels").upsert(
        {
          agent_id: req.agent_id,
          carrier_id: req.carrier_id,
          assigned_pct: data.assigned_pct ?? 0.7,
          commission_level: data.commission_level ?? null,
        },
        { onConflict: "agent_id,carrier_id" },
      );
      if (upErr) throw new Error(upErr.message);
    }
    const { error: sErr } = await supabase
      .from("commission_level_requests")
      .update({ status: data.approve ? "approved" : "declined" })
      .eq("id", data.id);
    if (sErr) throw new Error(sErr.message);
    return { ok: true };
  });
