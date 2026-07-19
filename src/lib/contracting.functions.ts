import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
type Ctx = { supabase: any; userId: string };

async function getMyLevelPct(supabase: any, userId: string, carrierId: string): Promise<number | null> {
  const { data } = await supabase
    .from("agent_commission_levels")
    .select("assigned_pct")
    .eq("agent_id", userId)
    .eq("carrier_id", carrierId)
    .maybeSingle();
  if (!data) return null;
  let pct = Number(data.assigned_pct);
  if (pct > 1) pct = pct; // already percentage like 80
  return pct;
}

// ---------- carriers ----------
export const listCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("carriers")
      .select("id,name,phone,hours,website,contracting_speed_days,pay_frequency,advance_cap,advance_cap_amount,advance_cap_months,ideal_client,agent_portal_url,training_url,about_text,is_annuity_carrier,active")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: active } = await supabase
      .from("contract_requests")
      .select("carrier_id")
      .eq("agent_id", userId)
      .eq("status", "active");
    const activeSet = new Set((active ?? []).map((r: any) => r.carrier_id));

    return { carriers: (data ?? []).map((c: any) => ({ ...c, my_active: activeSet.has(c.id) })) };
  });

// ---------- add carrier (self-reported) ----------
export const addAgentCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    carrier_id: z.string().uuid(),
    writing_number: z.string().max(64).optional(),
    loa: z.enum(["life","health_accident","annuity","life_health"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("contract_requests").upsert({
      agent_id: userId,
      carrier_id: data.carrier_id,
      writing_number: data.writing_number ?? null,
      loa: data.loa,
      status: "active",
      source: "self_reported",
      activated_at: new Date().toISOString(),
    }, { onConflict: "agent_id,carrier_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- request commission level ----------
export const requestCommissionLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    carrier_id: z.string().uuid(),
    message: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("commission_level_requests").insert({
      agent_id: userId,
      carrier_id: data.carrier_id,
      message: data.message ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- my contracts ----------
export const listMyContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("contract_requests")
      .select("id,carrier_id,status,writing_number,commission_level,effective_date,products,requested_at,submitted_at,activated_at,issue_description,notes,carriers(name,agent_portal_url,is_annuity_carrier)")
      .eq("agent_id", userId)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const createContractRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ carrier_id: z.string().uuid(), notes: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: carrier, error: cErr } = await supabase
      .from("carriers").select("id,name,is_annuity_carrier").eq("id", data.carrier_id).single();
    if (cErr || !carrier) throw new Error("Carrier not found");

    if (carrier.is_annuity_carrier) {
      const { data: cert } = await supabase
        .from("producer_documents")
        .select("id,file_url")
        .eq("agent_id", userId)
        .eq("doc_type", "aml_certificate")
        .not("file_url", "is", null)
        .maybeSingle();
      if (!cert) throw new Error("Upload your Annuity Training Certificate first.");
    }

    const { data: existing } = await supabase
      .from("contract_requests")
      .select("id,status")
      .eq("agent_id", userId)
      .eq("carrier_id", data.carrier_id)
      .neq("status", "rejected")
      .maybeSingle();
    if (existing) throw new Error(`You already have a ${existing.status} contract request with ${carrier.name}.`);

    const { error } = await supabase.from("contract_requests").insert({
      agent_id: userId,
      carrier_id: data.carrier_id,
      status: "requested",
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const StatusEnum = z.enum(["requested","submitted","processing","issue","active","rejected"]);

export const updateContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: StatusEnum,
    writing_number: z.string().max(64).optional(),
    issue_description: z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const update: any = { status: data.status };
    if (data.status === "submitted") update.submitted_at = new Date().toISOString();
    if (data.status === "active") update.activated_at = new Date().toISOString();
    if (data.writing_number !== undefined) update.writing_number = data.writing_number;
    if (data.issue_description !== undefined) update.issue_description = data.issue_description;
    const { error } = await supabase.from("contract_requests").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- downline matrix ----------
export const listDownlineMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: agents, error: aErr } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .eq("upline_id", userId)
      .order("first_name", { ascending: true });
    if (aErr) throw new Error(aErr.message);

    const { data: carriers, error: cErr } = await supabase
      .from("carriers").select("id,name,is_annuity_carrier").eq("active", true).order("name");
    if (cErr) throw new Error(cErr.message);

    const agentIds = (agents ?? []).map((a: any) => a.id);
    let requests: any[] = [];
    if (agentIds.length) {
      const { data: cr } = await supabase
        .from("contract_requests")
        .select("id,agent_id,carrier_id,status,writing_number,commission_level")
        .in("agent_id", agentIds);
      requests = cr ?? [];
    }

    return { agents: agents ?? [], carriers: carriers ?? [], requests };
  });

export const assignDownlineContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    level_pct: z.number().min(0).max(200),
    level_name: z.string().max(64).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const myPct = await getMyLevelPct(supabase, userId, data.carrier_id);
    if (myPct !== null && data.level_pct > myPct) {
      throw new Error(`You cannot assign a level above your own (${myPct}%).`);
    }

    const { error: lvlErr } = await supabase
      .from("agent_commission_levels")
      .upsert({
        agent_id: data.agent_id,
        carrier_id: data.carrier_id,
        assigned_pct: data.level_pct,
        commission_level: data.level_name ?? null,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      }, { onConflict: "agent_id,carrier_id" });
    if (lvlErr) throw new Error(lvlErr.message);

    const { data: existing } = await supabase
      .from("contract_requests")
      .select("id")
      .eq("agent_id", data.agent_id)
      .eq("carrier_id", data.carrier_id)
      .neq("status", "rejected")
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("contract_requests").insert({
        agent_id: data.agent_id,
        carrier_id: data.carrier_id,
        status: "requested",
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- work inbox ----------
export const listWorkInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: agents } = await supabase
      .from("profiles").select("id,first_name,last_name").eq("upline_id", userId);
    const downlineIds = (agents ?? []).map((a: any) => a.id);
    const nameOf = (id: string) => {
      const a = (agents ?? []).find((x: any) => x.id === id);
      return a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() : "Agent";
    };

    const items: { id: string; agent: string; description: string; priority: "high"|"normal"; kind: string }[] = [];

    if (downlineIds.length) {
      const { data: pending } = await supabase
        .from("contract_requests")
        .select("id,agent_id,carriers(name)")
        .in("agent_id", downlineIds)
        .in("status", ["requested","issue"]);
      (pending ?? []).forEach((p: any) => items.push({
        id: p.id,
        agent: nameOf(p.agent_id),
        description: `Contract awaiting your review — ${p.carriers?.name ?? "carrier"}`,
        priority: "normal",
        kind: "contract",
      }));
    }

    const { data: transfers } = await supabase
      .from("transfer_requests")
      .select("id,agent_id,status,carriers(name)")
      .eq("to_upline_id", userId)
      .eq("status", "pending");
    (transfers ?? []).forEach((t: any) => items.push({
      id: t.id,
      agent: nameOf(t.agent_id),
      description: `Transfer request — ${t.carriers?.name ?? "carrier"}`,
      priority: "high",
      kind: "transfer",
    }));

    if (downlineIds.length) {
      const { data: commReqs } = await supabase
        .from("commission_level_requests")
        .select("id,agent_id,message,carriers(name)")
        .in("agent_id", downlineIds)
        .eq("status", "pending");
      (commReqs ?? []).forEach((r: any) => items.push({
        id: r.id,
        agent: nameOf(r.agent_id),
        description: `Commission level request — ${r.carriers?.name ?? "carrier"}${r.message ? `: ${r.message}` : ""}`,
        priority: "normal",
        kind: "commission_request",
      }));
    }

    return { items };
  });

// ---------- transfers ----------
export const listTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("transfer_requests")
      .select("id,status,created_at,carriers(name),from:from_upline_id(first_name,last_name),to:to_upline_id(first_name,last_name)")
      .or(`agent_id.eq.${userId},to_upline_id.eq.${userId},from_upline_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const respondTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), decision: z.enum(["accepted","declined"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("transfer_requests").update({ status: data.decision }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- invitations ----------
export const listInvitationLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("invitation_links")
      .select("id,name,token,carrier_assignments,created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const AssignmentSchema = z.object({
  carrier_id: z.string().uuid(),
  carrier_name: z.string(),
  level_name: z.string().optional().nullable(),
  level_pct: z.number().min(0).max(200),
});

export const createInvitationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(120),
    assignments: z.array(AssignmentSchema).min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // verify each level is at or below user's own
    for (const a of data.assignments) {
      const myPct = await getMyLevelPct(supabase, userId, a.carrier_id);
      if (myPct !== null && a.level_pct > myPct) {
        throw new Error(`Level for ${a.carrier_name} (${a.level_pct}%) exceeds your assigned level (${myPct}%).`);
      }
    }

    const token = crypto.randomUUID();
    const { error } = await supabase.from("invitation_links").insert({
      created_by: userId,
      name: data.name,
      token,
      carrier_assignments: data.assignments,
    });
    if (error) throw new Error(error.message);
    return { ok: true, token };
  });

export const deleteInvitationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("invitation_links").delete().eq("id", data.id).eq("created_by", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- commission grids ----------
export const listMyCarrierLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("agent_commission_levels")
      .select("carrier_id,assigned_pct,commission_level,carriers(name,is_annuity_carrier,active)")
      .eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const getCommissionGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    carrier_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Agent's assigned level for this carrier
    const { data: levelRow } = await supabase
      .from("agent_commission_levels")
      .select("assigned_pct, commission_level")
      .eq("agent_id", userId)
      .eq("carrier_id", data.carrier_id)
      .maybeSingle();

    const myPct       = levelRow ? Number(levelRow.assigned_pct) : null;
    const myLevelName = levelRow?.commission_level ?? null;

    // Super admins see ALL levels
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!roleRow;

    if (!isSuperAdmin && myPct === null) {
      return { myLevelName: null, myPct: null, rows: [], noLevelAssigned: true, isSuperAdmin: false };
    }

    let query = supabase
      .from("commission_grids")
      .select("id,product_name,age_group_min,age_group_max,level_name,year_1_pct,years_2_5_pct,years_6_plus_pct")
      .eq("carrier_id", data.carrier_id)
      .order("year_1_pct", { ascending: false })
      .order("age_group_min", { ascending: true, nullsFirst: true })
      .order("product_name", { ascending: true });

    // Non-super-admins only see their level and below
    if (!isSuperAdmin && myPct !== null) {
      query = query.lte("year_1_pct", myPct);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      myLevelName,
      myPct,
      rows: rows ?? [],
      noLevelAssigned: false,
      isSuperAdmin,
    };
  });

// ---------- annuity training ----------
export const getMyAnnuityCert = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase
      .from("producer_documents")
      .select("id,file_url,file_name,created_at")
      .eq("agent_id", userId)
      .eq("doc_type", "aml_certificate")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { cert: data ?? null };
  });

export const recordAnnuityCert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    storage_path: z.string().min(1).max(500),
    file_name: z.string().min(1).max(255),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // ensure path under user's prefix
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid path");
    // remove old rows
    await supabase.from("producer_documents").delete().eq("agent_id", userId).eq("doc_type", "aml_certificate");
    const { error } = await supabase.from("producer_documents").insert({
      agent_id: userId,
      doc_type: "aml_certificate",
      file_url: data.storage_path,
      file_name: data.file_name,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const activateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contract_id: z.string().uuid(),
    writing_number: z.string().min(1).max(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: contract } = await supabase
      .from("contract_requests")
      .select("id, status")
      .eq("id", data.contract_id)
      .eq("agent_id", userId)
      .single();
    if (!contract) throw new Error("Contract not found");
    if (contract.status !== "assigned") throw new Error("Only assigned contracts can be activated this way");
    const { error } = await supabase
      .from("contract_requests")
      .update({ writing_number: data.writing_number, status: "active", activated_at: new Date().toISOString() })
      .eq("id", data.contract_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContractRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: row } = await supabase.from("contract_requests")
      .select("agent_id, status").eq("id", data.id).single();
    if (!row || row.agent_id !== userId) throw new Error("Not found");
    if (row.status === "active") throw new Error("Cannot delete an active contract. Contact your admin.");
    const { error } = await supabase.from("contract_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- transfer workflow ----------

export const getTransferWorkflowStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("needs_transfer_request, transfer_workflow_carriers")
      .eq("id", userId)
      .maybeSingle();

    const { data: existing } = await supabase
      .from("transfer_requests")
      .select("id, status")
      .eq("agent_id", userId)
      .in("status", ["pending", "accepted", "complete"] as any)
      .limit(1);

    return {
      needs_transfer_request: (profile as any)?.needs_transfer_request ?? false,
      workflow_carriers:      (profile as any)?.transfer_workflow_carriers ?? [],
      transfer_complete:      ((existing ?? []) as any[]).length > 0,
    };
  });

export const submitTransferSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    rows: z.array(z.object({
      carrier_id:           z.string().optional(),
      carrier_name:         z.string().min(1),
      writing_number:       z.string().optional(),
      current_upline_name:  z.string().min(1),
      current_upline_email: z.string().email().optional().or(z.literal("")),
    })).min(1),
    reason: z.string().optional(),
    notes:  z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: profile } = await supabase
      .from("profiles")
      .select("upline_id, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    for (const row of data.rows) {
      let carrierId = row.carrier_id;
      if (!carrierId && row.carrier_name) {
        const { data: carrier } = await supabase
          .from("carriers")
          .select("id")
          .ilike("name", `%${row.carrier_name.split(" ")[0]}%`)
          .maybeSingle();
        carrierId = carrier?.id;
      }

      await (supabase as any).from("transfer_requests").insert({
        agent_id:             userId,
        carrier_id:           carrierId ?? null,
        to_upline_id:         profile?.upline_id ?? null,
        writing_number:       row.writing_number || null,
        current_upline_name:  row.current_upline_name,
        current_upline_email: row.current_upline_email || null,
        reason:               data.reason ?? null,
        notes:                data.notes ?? null,
        status:               "pending",
        requested_at:         new Date().toISOString(),
      });
    }

    if (profile?.upline_id) {
      const agentName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
      await supabase.from("notifications").insert({
        user_id: profile.upline_id,
        title:   `Transfer Request from ${agentName}`,
        body:    `${agentName} has submitted a carrier release request for ${data.rows.length} carrier${data.rows.length !== 1 ? "s" : ""}. Review in Transfer Requests.`,
        type:    "contracting",
        link:    "/admin/agents",
        read:    false,
      }).catch(() => {});
    }

    return { ok: true, submitted: data.rows.length };
  });

// ── Add Carrier (agency owners/admins) — Carriers reference directory ────────
export const addCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    hours: z.string().trim().max(120).optional(),
    pay_frequency: z.enum(["weekly", "monthly"]).optional(),
    advance_cap: z.string().trim().max(80).optional(),
    ideal_client: z.string().trim().max(200).optional(),
    website: z.string().trim().url().max(300).optional().or(z.literal("")),
    agent_portal_url: z.string().trim().url().max(300).optional().or(z.literal("")),
    training_url: z.string().trim().url().max(300).optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId)
      .in("role", ["super_admin", "agency_owner", "admin"]).limit(1);
    if (!roleRow?.length) throw new Error("Only agency owners and admins can add carriers");
    const { error } = await (supabase as any).from("carriers").insert({
      name: data.name,
      phone: data.phone || null,
      hours: data.hours || null,
      pay_frequency: data.pay_frequency ?? null,
      advance_cap: data.advance_cap || null,
      ideal_client: data.ideal_client || null,
      website: data.website || null,
      agent_portal_url: data.agent_portal_url || null,
      training_url: data.training_url || null,
      active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
