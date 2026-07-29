import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const submitTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().trim().min(1).max(200),
      category: z.string().min(1).max(100),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      description: z.string().trim().min(20).max(5000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ticket, error: ticketErr } = await supabase
      .from("support_tickets")
      .insert({
        agent_id: userId,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        description: data.description,
        status: "open",
      })
      .select("id, ticket_number")
      .single();

    if (ticketErr) throw new Error(ticketErr.message);

    const { error: msgErr } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: userId,
      sender_role: "agent",
      body: data.description,
    });
    if (msgErr) throw new Error(msgErr.message);

    return { ticket };
  });

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, category, priority, status, created_at, updated_at")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTicketThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ticket_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // No agent_id filter: RLS decides who may read this ticket (the reporter,
    // the assignee, or the agency owner). Filtering on agent_id here would
    // lock the assignee out of the thread they were routed.
    const { data: ticket, error: ticketErr } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, category, priority, status, description, agent_id, assigned_to, created_at")
      .eq("id", data.ticket_id)
      .single();

    if (ticketErr) throw new Error("Ticket not found or access denied.");

    const { data: messages, error: msgErr } = await supabase
      .from("support_ticket_messages")
      .select("id, sender_id, sender_role, body, created_at")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });

    if (msgErr) throw new Error(msgErr.message);

    return { ticket, messages: messages ?? [] };
  });

// ── Agency-side queue ────────────────────────────────────────────────────────
//
// Everything below reads through the RLS-bound client, so support_tickets'
// own policy (phase-2 migration) decides what is visible: your own tickets,
// tickets assigned to you, and — for an agency owner — your org's tickets.
// There is no cross-agency view.

export const listAgencyTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "open", "pending", "resolved", "closed"]).default("all"),
      assigned: z.enum(["all", "me", "unassigned"]).default("all"),
    }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase: _sb, userId } = context;
    const supabase = _sb as any;

    let q = supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, category, priority, status, agent_id, assigned_to, created_at, updated_at, first_response_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.assigned === "me") q = q.eq("assigned_to", userId);
    if (data.assigned === "unassigned") q = q.is("assigned_to", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Resolve names for the agent and assignee columns in one round trip.
    const ids = Array.from(new Set(
      (rows ?? []).flatMap((t: any) => [t.agent_id, t.assigned_to]).filter(Boolean)
    ));
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: people } = await supabase
        .from("profiles").select("id, first_name, last_name").in("id", ids);
      for (const p of people ?? []) {
        nameById.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
      }
    }

    return {
      tickets: (rows ?? []).map((t: any) => ({
        ...t,
        agent_name: nameById.get(t.agent_id) ?? null,
        assignee_name: t.assigned_to ? (nameById.get(t.assigned_to) ?? null) : null,
      })),
    };
  });

export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ticket_id: z.string().uuid(),
      // null clears the assignment.
      assignee_id: z.string().uuid().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    // The assignee must be someone the caller can already see, which RLS
    // restricts to their own org.
    if (data.assignee_id) {
      const { data: who } = await supabase
        .from("profiles").select("id").eq("id", data.assignee_id).maybeSingle();
      if (!who) throw new Error("That person is not in your organization");
    }

    const { error } = await supabase
      .from("support_tickets")
      .update({ assigned_to: data.assignee_id, updated_at: new Date().toISOString() })
      .eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ticket_id: z.string().uuid(),
      body: z.string().trim().min(1).max(5000),
      sender_role: z.enum(["agent", "support"]).default("support"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase: _sb, userId } = context;
    const supabase = _sb as any;

    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticket_id,
      sender_id: userId,
      sender_role: data.sender_role,
      body: data.body,
    });
    if (error) throw new Error(error.message);

    // Stamp first response time once, for future SLA reporting.
    const { data: ticket } = await supabase
      .from("support_tickets").select("first_response_at").eq("id", data.ticket_id).maybeSingle();
    const patch: any = { updated_at: new Date().toISOString() };
    if (data.sender_role === "support" && !ticket?.first_response_at) {
      patch.first_response_at = new Date().toISOString();
    }
    await supabase.from("support_tickets").update(patch).eq("id", data.ticket_id);

    return { ok: true };
  });

export const setTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ticket_id: z.string().uuid(),
      status: z.enum(["open", "pending", "resolved", "closed"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const patch: any = { status: data.status, updated_at: new Date().toISOString() };
    if (data.status === "resolved" || data.status === "closed") {
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
