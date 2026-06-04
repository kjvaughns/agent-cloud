import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

async function requireManagerOrAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden: manager or admin role required");
}

export const adminListAllAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, status, created_at, upline_id, npn_number, last_active_at")
      .order("created_at", { ascending: false });
    const agentIds = (data ?? []).map((p: any) => p.id);
    const { data: contracts } = await supabase
      .from("contract_requests")
      .select("agent_id, status")
      .in("agent_id", agentIds);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", agentIds);
    return { agents: data ?? [], contracts: contracts ?? [], roles: roles ?? [] };
  });

export const adminSetAgentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_user_id: z.string().uuid(),
      role: z.enum(["agent", "manager", "admin"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    if (data.role === "agent") {
      await supabase.from("user_roles").delete().eq("user_id", data.target_user_id);
    } else {
      await supabase.from("user_roles").upsert(
        { user_id: data.target_user_id, role: data.role },
        { onConflict: "user_id" }
      );
    }
    return { ok: true };
  });

export const adminListAllContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("contract_requests")
      .select("*, profiles!agent_id(first_name, last_name, email), carriers(name, agent_portal_url)")
      .order("requested_at", { ascending: false });
    return { rows: data ?? [] };
  });

export const adminUpdateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.string().optional(),
      writing_number: z.string().optional(),
      issue_description: z.string().optional(),
      activated_at: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { id, ...patch } = data;
    if (patch.status === "active" && !patch.activated_at) {
      (patch as any).activated_at = new Date().toISOString();
    }
    const { error } = await supabase.from("contract_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListCommissionGrid = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data: grids } = await supabase
      .from("commission_grids")
      .select("*, carriers(name)")
      .order("carrier_id");
    const { data: assignments } = await supabase
      .from("agent_commission_levels")
      .select("*, profiles!agent_id(first_name, last_name), carriers(name)");
    return { grids: grids ?? [], assignments: assignments ?? [] };
  });

export const adminUpsertCommissionRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      carrier_id: z.string().uuid(),
      product_name: z.string(),
      level_name: z.string().optional(),
      age_group_min: z.number().optional(),
      age_group_max: z.number().optional(),
      year_1_pct: z.number(),
      years_2_5_pct: z.number(),
      years_6_plus_pct: z.number(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    if (data.id) {
      const { id, ...patch } = data;
      await supabase.from("commission_grids").update(patch).eq("id", id);
    } else {
      await supabase.from("commission_grids").insert(data);
    }
    return { ok: true };
  });

export const adminAssignAgentLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_id: z.string().uuid(),
      carrier_id: z.string().uuid(),
      level_pct: z.number().min(0).max(200),
      level_name: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    await supabase.from("agent_commission_levels").upsert(
      {
        agent_id: data.agent_id,
        carrier_id: data.carrier_id,
        assigned_pct: data.level_pct,
        commission_level: data.level_name ?? null,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,carrier_id" }
    );
    return { ok: true };
  });

export const adminCreateCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1),
      pay_frequency: z.string().optional(),
      contracting_speed_days: z.number().optional(),
      is_annuity_carrier: z.boolean().optional(),
      agent_portal_url: z.string().optional(),
      active: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    const { error } = await supabase.from("carriers").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      pay_frequency: z.string().optional(),
      contracting_speed_days: z.number().optional(),
      is_annuity_carrier: z.boolean().optional(),
      agent_portal_url: z.string().optional(),
      active: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await supabase.from("carriers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("support_tickets")
      .select("*, profiles!agent_id(first_name, last_name, email, phone, avatar_url)")
      .order("created_at", { ascending: false });
    return { tickets: data ?? [] };
  });

export const adminGetTicketThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data: messages } = await supabase
      .from("support_ticket_messages")
      .select("*, profiles!sender_id(first_name, last_name, avatar_url)")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    return { messages: messages ?? [] };
  });

export const adminReplyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ticket_id: z.string().uuid(),
      body: z.string().min(1),
      new_status: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    await supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticket_id,
      sender_id: userId,
      sender_role: "support",
      body: data.body,
    });
    if (data.new_status) {
      await supabase.from("support_tickets").update({
        status: data.new_status,
        updated_at: new Date().toISOString(),
      }).eq("id", data.ticket_id);
    }
    return { ok: true };
  });

export const adminMoveAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_id: z.string().uuid(),
      new_upline_id: z.string().uuid().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    const { error } = await supabase
      .from("profiles")
      .update({ upline_id: data.new_upline_id })
      .eq("id", data.agent_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBatchInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agents: z.array(z.object({
        email: z.string().email(),
        first_name: z.string(),
        last_name: z.string(),
      })),
      tier_assignments: z.record(z.string(), z.number()),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    const carrierAssignments = Object.entries(data.tier_assignments).map(
      ([carrier_id, level_pct]) => ({ carrier_id, level_pct })
    );
    const results = [];
    for (const agent of data.agents) {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("invitation_links").insert({
        created_by: userId,
        name: `Invite for ${agent.first_name} ${agent.last_name}`,
        token,
        new_agent_email: agent.email,
        new_agent_first_name: agent.first_name,
        new_agent_last_name: agent.last_name,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        carrier_assignments: carrierAssignments,
        is_reusable: false,
      });
      results.push({ email: agent.email, ok: !error, token });
    }
    return { results };
  });

export const adminCreateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(200),
      body_html: z.string().min(1),
      is_pinned: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { error } = await supabase.from("announcements").insert({
      title: data.title,
      body_html: data.body_html,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200).optional(),
      body_html: z.string().min(1).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await supabase.from("announcements").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { error } = await supabase.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
