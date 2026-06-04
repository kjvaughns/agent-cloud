import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Ctx = { supabase: any; userId: string };

const SURELC_SECTIONS = [
  "dba",
  "personal_info",
  "drivers_license",
  "banking",
  "eo",
  "aml",
  "state_licenses",
  "carrier_questions",
] as const;

// ============ PUBLIC (token-based) ============

export const getInviteByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin.rpc("get_invite_by_token", { _token: data.token });
    if (error) throw new Error(error.message);
    const invite = (result ?? null) as any;
    let migration_match: any = null;
    if (invite?.new_agent_email) {
      const { data: roster } = await (supabaseAdmin as any)
        .from("migration_roster")
        .select("first_name, last_name, location, depth, upline_name, status")
        .eq("email", String(invite.new_agent_email).toLowerCase())
        .maybeSingle();
      migration_match = roster ?? null;
    }
    return { invite, migration_match };
  });

export const acceptInviteCreateAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    token: z.string().min(8).max(100),
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
    email: z.string().email().max(120),
    password: z.string().min(8).max(100),
    phone: z.string().min(7).max(30).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { data: invRaw } = await supabaseAdmin.rpc("get_invite_by_token", { _token: data.token });
    const inv = invRaw as any;
    if (!inv || inv.expired) throw new Error("Invite expired or not found");
    if (inv.linked_agent_id && !inv.is_reusable) throw new Error("This invite has already been used");

    const { data: created, error: signErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: data.first_name, last_name: data.last_name },
    });
    if (signErr || !created.user) throw new Error(signErr?.message ?? "Failed to create account");

    const newUserId = created.user.id;
    await supabaseAdmin.from("profiles").update({
      upline_id: inv.created_by,
      phone: data.phone ?? null,
    }).eq("id", newUserId);

    if (!inv.is_reusable) {
      await supabaseAdmin.from("invitation_links").update({
        linked_agent_id: newUserId,
        status: "in_progress",
        onboarding_step: 1,
        agent_started_at: new Date().toISOString(),
      }).eq("token", data.token);
    }

    // Create assigned contracts for each carrier in the invite's carrier_assignments
    const assignments: any[] = (inv.carrier_assignments as any[]) ?? [];
    for (const a of assignments) {
      if (!a.carrier_id) continue;
      await supabaseAdmin.from("contract_requests").upsert({
        agent_id: newUserId,
        carrier_id: a.carrier_id,
        status: "assigned" as any,
        requested_at: new Date().toISOString(),
        notes: `Assigned via invite link`,
      }, { onConflict: "agent_id,carrier_id" });
      if (a.level_pct != null) {
        await supabaseAdmin.from("agent_commission_levels").upsert({
          agent_id: newUserId,
          carrier_id: a.carrier_id,
          assigned_pct: a.level_pct,
          commission_level: a.level_name ?? `${a.level_pct}%`,
          assigned_by: inv.created_by,
          assigned_at: new Date().toISOString(),
        }, { onConflict: "agent_id,carrier_id" });
      }
    }

    return { ok: true, userId: newUserId };
  });

// ============ AUTHENTICATED onboarding-step writers ============

async function loadInviteForUser(supabase: any, token: string, userId: string) {
  const { data: inv } = await supabase.from("invitation_links").select("*").eq("token", token).maybeSingle();
  if (!inv) throw new Error("Invite not found");
  if (inv.is_reusable) return inv; // reusable links are not locked to a specific user
  if (inv.linked_agent_id && inv.linked_agent_id !== userId) throw new Error("Invite belongs to another user");
  if (!inv.linked_agent_id) {
    await supabase.from("invitation_links").update({
      linked_agent_id: userId,
      status: "in_progress",
      agent_started_at: new Date().toISOString(),
    }).eq("id", inv.id);
    inv.linked_agent_id = userId;
  }
  return inv;
}

export const linkInviteToCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(8).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const inv = await loadInviteForUser(supabase, data.token, userId);
    // also set upline if not set
    await supabase.from("profiles").update({ upline_id: inv.created_by }).eq("id", userId).is("upline_id", null);
    return { ok: true, invite: inv };
  });

export const saveOnboardingPersonal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    token: z.string().min(8).max(100),
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
    date_of_birth: z.string().min(8).max(20),
    ssn: z.string().regex(/^\d{9}$/),
    npn_number: z.string().max(40).optional().nullable(),
    street_address: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(2).max(60),
    zip_code: z.string().trim().min(3).max(20),
    phone: z.string().trim().min(7).max(30),
    contact_email: z.string().email().max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const inv = await loadInviteForUser(supabase, data.token, userId);

    await supabase.from("profiles").update({
      first_name: data.first_name,
      last_name: data.last_name,
      date_of_birth: data.date_of_birth,
      npn_number: data.npn_number || null,
      street_address: data.street_address,
      city: data.city,
      state: data.state,
      zip_code: data.zip_code,
      phone: data.phone,
      email: data.contact_email,
      ssn_last4: data.ssn.slice(-4),
    }).eq("id", userId);

    // Save SSN via existing pgcrypto path
    try {
      await supabase.rpc("ssn_set", { _ssn: data.ssn });
    } catch {
      // some envs may not yet have ssn_set; non-fatal
    }

    if (!inv.is_reusable) {
      await supabase.from("invitation_links").update({ onboarding_step: 2 }).eq("token", data.token);
    }
    return { ok: true };
  });

export const saveOnboardingCarriers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    token: z.string().min(8).max(100),
    choices: z.array(z.object({
      carrier_id: z.string().uuid(),
      include: z.boolean(),
      release_needed: z.boolean(),
    })).min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const included = data.choices.filter((c) => c.include);
    if (included.length === 0) throw new Error("Select at least one carrier");

    for (const choice of included) {
      const { data: existing } = await supabase
        .from("contract_requests").select("id")
        .eq("agent_id", userId).eq("carrier_id", choice.carrier_id)
        .neq("status", "rejected").maybeSingle();
      if (!existing) {
        await supabase.from("contract_requests").insert({
          agent_id: userId,
          carrier_id: choice.carrier_id,
          status: "requested",
          notes: choice.release_needed ? "Release needed from previous upline" : null,
        });
      }
    }

    const invForStep = await loadInviteForUser(supabase, data.token, userId);
    if (!invForStep.is_reusable) {
      await supabase.from("invitation_links").update({ onboarding_step: 3 }).eq("token", data.token);
    }
    return { ok: true, count: included.length };
  });

export const signOnboardingAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    token: z.string().min(8).max(100),
    signature_name: z.string().trim().min(2).max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const inv = await loadInviteForUser(supabase, data.token, userId);

    await supabase.from("producer_agreements").insert({
      agent_id: userId,
      signature_name: data.signature_name,
      agreement_version: "1.0",
    });

    if (!inv.is_reusable) {
      await supabase.from("invitation_links").update({
        onboarding_step: 4,
        agent_completed_at: new Date().toISOString(),
      }).eq("id", inv.id);
    }

    await supabase.from("notifications").insert({
      user_id: inv.created_by,
      title: "Agent accepted your invite",
      description: "Contracting in progress — they're joining your downline.",
      type: "contracting",
    });

    return { ok: true };
  });

export const startSurelcSso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(8).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const inv = await loadInviteForUser(supabase, data.token, userId);

    const surelcId = inv.surelc_agent_id ?? `pending_${userId.slice(0, 8)}_${Date.now()}`;

    // Seed progress rows (all incomplete) - one row per section
    for (const section of SURELC_SECTIONS) {
      await supabase.from("surelc_progress").upsert({
        agent_id: userId,
        invitation_id: inv.id,
        section_name: section,
        completed: false,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "agent_id,section_name" });
    }

    await supabase.from("invitation_links").update({
      status: "in_surelc",
      surelc_agent_id: surelcId,
    }).eq("id", inv.id);

    // SureLC integration not yet live — graceful pending state.
    return {
      ok: true,
      sso_url: null,
      pending: true,
      message: "Contracting setup is handled by your admin. You'll receive an email when your SureLC account is ready.",
    };
  });

// ============ UPLINE / ADMIN DASHBOARD ============

export const getMyContractedCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    // Commission levels assigned by upline
    const { data: commLevels } = await supabase
      .from("agent_commission_levels")
      .select("carrier_id,assigned_pct,commission_level,carriers(id,name,is_annuity_carrier)")
      .eq("agent_id", userId);

    // Self-reported active contracts (Add Active Carrier flow)
    const { data: activeContracts } = await supabase
      .from("contract_requests")
      .select("carrier_id,carriers(id,name,is_annuity_carrier)")
      .eq("agent_id", userId)
      .eq("status", "active");

    // Commission levels take precedence; add self-reported carriers not already covered
    const commCarrierIds = new Set((commLevels ?? []).map((r: any) => r.carrier_id));
    const selfReported = (activeContracts ?? [])
      .filter((r: any) => !commCarrierIds.has(r.carrier_id))
      .map((r: any) => ({
        carrier_id: r.carrier_id,
        assigned_pct: 100,
        commission_level: null,
        carriers: r.carriers,
      }));

    return { rows: [...(commLevels ?? []), ...selfReported] };
  });

export const listOnboardingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["mine","downline"]).default("mine") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    let query = supabase
      .from("invitation_links")
      .select("id,name,token,status,onboarding_step,carrier_assignments,created_at,agent_started_at,agent_completed_at,expires_at,linked_agent_id,new_agent_first_name,new_agent_last_name,new_agent_email,created_by,sent_on_behalf_of,surelc_agent_id")
      .order("created_at", { ascending: false });

    if (data.scope === "mine") {
      query = query.eq("created_by", userId);
    } else {
      // downline: get downline agents then filter
      const { data: downline } = await supabase.rpc("get_downline_agents");
      const ids = [userId, ...((downline ?? []) as any[]).map((d: any) => d.id)];
      query = query.in("created_by", ids);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // Enrich with linked agent names
    const linkedIds = Array.from(new Set(((rows ?? []) as any[]).map((r: any) => r.linked_agent_id).filter(Boolean)));
    let agentMap = new Map<string, any>();
    if (linkedIds.length) {
      const { data: agents } = await supabase.from("profiles").select("id,first_name,last_name,email").in("id", linkedIds);
      (agents ?? []).forEach((a: any) => agentMap.set(a.id, a));
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        linked_agent: r.linked_agent_id ? agentMap.get(r.linked_agent_id) ?? null : null,
      })),
    };
  });

export const addCarriersToInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    invite_id: z.string().uuid(),
    assignments: z.array(z.object({
      carrier_id: z.string().uuid(),
      carrier_name: z.string(),
      level_name: z.string().optional().nullable(),
      level_pct: z.number().min(0).max(200),
      release_needed: z.boolean().optional(),
    })).min(1).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Validate levels ≤ upline's own
    for (const a of data.assignments) {
      const { data: my } = await supabase
        .from("agent_commission_levels")
        .select("assigned_pct").eq("agent_id", userId).eq("carrier_id", a.carrier_id).maybeSingle();
      if (my && Number(my.assigned_pct) < a.level_pct) {
        throw new Error(`Level for ${a.carrier_name} exceeds your assigned level.`);
      }
    }

    const { data: inv } = await supabase.from("invitation_links").select("carrier_assignments,linked_agent_id,created_by").eq("id", data.invite_id).maybeSingle();
    if (!inv) throw new Error("Invite not found");

    const existing = Array.isArray(inv.carrier_assignments) ? inv.carrier_assignments : [];
    const existingIds = new Set(existing.map((e: any) => e.carrier_id));
    const merged = [...existing, ...data.assignments.filter((a) => !existingIds.has(a.carrier_id))];

    const { error } = await supabase.from("invitation_links").update({ carrier_assignments: merged }).eq("id", data.invite_id);
    if (error) throw new Error(error.message);

    // Notify linked agent (if exists) via in-app
    if (inv.linked_agent_id) {
      const names = data.assignments.map((a) => a.carrier_name).join(", ");
      await supabase.from("notifications").insert({
        user_id: inv.linked_agent_id,
        title: "New carrier added to your contracting",
        description: `${names} has been added to your contracting application.`,
        type: "contracting",
      });
    }

    return { ok: true };
  });

export const updateInviteCarrierLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    invite_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    level_pct: z.number().min(0).max(200),
    level_name: z.string().max(64).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: my } = await supabase.from("agent_commission_levels")
      .select("assigned_pct").eq("agent_id", userId).eq("carrier_id", data.carrier_id).maybeSingle();
    if (my && Number(my.assigned_pct) < data.level_pct) {
      throw new Error("Level exceeds your assigned level.");
    }

    const { data: inv } = await supabase.from("invitation_links")
      .select("carrier_assignments,onboarding_step").eq("id", data.invite_id).maybeSingle();
    if (!inv) throw new Error("Invite not found");
    if (inv.onboarding_step >= 4) throw new Error("Cannot edit level after SuranceBay step");

    const updated = (inv.carrier_assignments ?? []).map((c: any) =>
      c.carrier_id === data.carrier_id ? { ...c, level_pct: data.level_pct, level_name: data.level_name ?? c.level_name } : c
    );
    const { error } = await supabase.from("invitation_links").update({ carrier_assignments: updated }).eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invite_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await supabase.from("invitation_links").update({ last_resent_at: new Date().toISOString() }).eq("id", data.invite_id);
    return { ok: true };
  });

// ============ Onboarding documents ============

export const listOnboardingDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: docs, error } = await supabase
      .from("onboarding_documents")
      .select("id,doc_type,file_name,file_url,uploaded_at,uploaded_by")
      .eq("agent_id", data.agent_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { docs: docs ?? [] };
  });

export const recordOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    doc_type: z.enum(["eo_certificate","aml_certificate","drivers_license","banking","agreement"]),
    file_url: z.string().min(1).max(500),
    file_name: z.string().min(1).max(255),
    invitation_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("onboarding_documents").insert({
      agent_id: data.agent_id,
      uploaded_by: userId,
      doc_type: data.doc_type,
      file_url: data.file_url,
      file_name: data.file_name,
      invitation_id: data.invitation_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOnboardingDocSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ doc_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: doc } = await supabase.from("onboarding_documents").select("file_url").eq("id", data.doc_id).maybeSingle();
    if (!doc?.file_url) throw new Error("Not found");
    const { data: signed, error } = await supabase.storage.from("agent-documents").createSignedUrl(doc.file_url, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// ============ Change requests ============

export const listChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("change_requests")
      .select("id,request_type,other_description,new_level_name,new_level_pct,status,submitted_at,resolved_at,agent_id,carrier_id,new_upline_id,contract_request_id,carriers(name),agent:agent_id(first_name,last_name),new_upline:new_upline_id(first_name,last_name)")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const submitChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    contract_request_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    request_type: z.enum(["level_change","upline_transfer","other"]),
    other_description: z.string().max(1000).optional().nullable(),
    new_upline_id: z.string().uuid().optional().nullable(),
    new_level_name: z.string().max(64).optional().nullable(),
    new_level_pct: z.number().min(0).max(200).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Verify the contract has been active 90+ days
    const { data: cr } = await supabase
      .from("contract_requests").select("activated_at,status")
      .eq("id", data.contract_request_id).maybeSingle();
    if (!cr || cr.status !== "active" || !cr.activated_at) {
      throw new Error("Contract must be active to submit a change request.");
    }
    const ageMs = Date.now() - new Date(cr.activated_at).getTime();
    if (ageMs < 90 * 24 * 60 * 60 * 1000) {
      throw new Error("Contract must be active for at least 90 days.");
    }

    const { error } = await supabase.from("change_requests").insert({
      submitted_by: userId,
      agent_id: data.agent_id,
      carrier_id: data.carrier_id,
      contract_request_id: data.contract_request_id,
      request_type: data.request_type,
      other_description: data.other_description ?? null,
      new_upline_id: data.new_upline_id ?? null,
      new_level_name: data.new_level_name ?? null,
      new_level_pct: data.new_level_pct ?? null,
      status: "deferred",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateChangeRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["deferred","in_review","completed","denied"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const update: any = { status: data.status };
    if (data.status === "completed" || data.status === "denied") update.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("change_requests").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("change_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ SureLC Progress ============

export const listSurelcProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["mine","downline"]).default("downline") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    let agentIds: string[] = [];
    if (data.scope === "mine") {
      agentIds = [userId];
    } else {
      const { data: downline } = await supabase.rpc("get_downline_agents");
      agentIds = [userId, ...((downline ?? []) as any[]).map((d: any) => d.id)];
    }

    const { data: invites } = await supabase
      .from("invitation_links")
      .select("id,linked_agent_id,carrier_assignments,created_at,surelc_agent_id")
      .in("linked_agent_id", agentIds)
      .eq("status", "in_surelc");

    const linkedIds = Array.from(new Set(((invites ?? []) as any[]).map((i: any) => i.linked_agent_id)));
    if (linkedIds.length === 0) return { agents: [] };

    const { data: profiles } = await supabase.from("profiles").select("id,first_name,last_name").in("id", linkedIds);
    const profMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profMap.set(p.id, p));

    const { data: progress } = await supabase
      .from("surelc_progress").select("agent_id,section_name,completed,last_synced_at").in("agent_id", linkedIds);

    const agents = (invites ?? []).map((inv: any) => {
      const sections = (progress ?? []).filter((p: any) => p.agent_id === inv.linked_agent_id);
      const completed = sections.filter((s: any) => s.completed).length;
      const total = SURELC_SECTIONS.length;
      const profile = profMap.get(inv.linked_agent_id);
      const carriers = Array.isArray(inv.carrier_assignments) ? inv.carrier_assignments.map((c: any) => c.carrier_name) : [];
      return {
        agent_id: inv.linked_agent_id,
        agent_name: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "Agent",
        invite_id: inv.id,
        invite_sent_at: inv.created_at,
        carriers,
        completed_count: completed,
        total_count: total,
        sections: SURELC_SECTIONS.map((name) => {
          const row = sections.find((s: any) => s.section_name === name);
          return { name, completed: row?.completed ?? false, last_synced_at: row?.last_synced_at ?? null };
        }),
      };
    });

    return { agents };
  });

export const refreshSurelcProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agent_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Stub: randomly advance 1-2 incomplete sections per agent
    let agentIds: string[];
    if (data.agent_id) {
      agentIds = [data.agent_id];
    } else {
      const { data: downline } = await supabase.rpc("get_downline_agents");
      agentIds = [userId, ...((downline ?? []) as any[]).map((d: any) => d.id)];
    }

    for (const aid of agentIds) {
      const { data: incomplete } = await supabase
        .from("surelc_progress").select("id").eq("agent_id", aid).eq("completed", false);
      const list = (incomplete ?? []) as any[];
      if (list.length === 0) continue;
      const advanceCount = Math.min(list.length, Math.random() < 0.4 ? 2 : 1);
      const shuffled = list.sort(() => Math.random() - 0.5).slice(0, advanceCount);
      for (const row of shuffled) {
        await supabase.from("surelc_progress").update({
          completed: true,
          last_synced_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    }
    return { ok: true };
  });

// ============ Misc helpers ============

export const searchDownlineAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: downline } = await supabase.rpc("get_downline_agents");
    const q = data.query.toLowerCase().trim();
    const filtered = ((downline ?? []) as any[]).filter((a: any) => {
      if (!q) return true;
      return (`${a.first_name ?? ""} ${a.last_name ?? ""}`).toLowerCase().includes(q);
    }).slice(0, 20);
    return { agents: filtered };
  });

export const saveInviteSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ signature_html: z.string().max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("profiles").update({ invite_signature_html: data.signature_html }).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyInviteSignature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase.from("profiles").select("invite_signature_html").eq("id", userId).maybeSingle();
    return { signature_html: data?.invite_signature_html ?? "" };
  });

export const getActiveContractsForAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("contract_requests")
      .select("id,carrier_id,activated_at,status,carriers(name)")
      .eq("agent_id", data.agent_id)
      .eq("status", "active")
      .lte("activated_at", cutoff);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ============ Enhanced createInviteV2 (with full carrier assignments + new agent fields) ============

const FullAssignmentSchema = z.object({
  carrier_id: z.string().uuid(),
  carrier_name: z.string(),
  level_name: z.string().optional().nullable(),
  level_pct: z.number().min(0).max(200),
  release_needed: z.boolean().optional().default(false),
});

export const createOnboardingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    link_name: z.string().trim().min(1).max(80),
    assignments: z.array(FullAssignmentSchema).min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Validate every level ≤ upline's
    for (const a of data.assignments) {
      const { data: my } = await supabase
        .from("agent_commission_levels").select("assigned_pct")
        .eq("agent_id", userId).eq("carrier_id", a.carrier_id).maybeSingle();
      if (my && Number(my.assigned_pct) < a.level_pct) {
        throw new Error(`Level for ${a.carrier_name} (${a.level_pct}%) exceeds your assigned level.`);
      }
    }

    const token = crypto.randomUUID();

    const { data: inserted, error } = await supabase.from("invitation_links").insert({
      created_by: userId,
      name: data.link_name,
      link_name: data.link_name,
      is_reusable: true,
      new_agent_email: null,
      token,
      carrier_assignments: data.assignments,
      status: "pending",
      onboarding_step: 0,
    }).select("id,token").single();

    if (error) throw new Error(error.message);

    return { ok: true, id: inserted.id, token: inserted.token };
  });
