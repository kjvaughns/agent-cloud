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
      // `*` rather than a column list on purpose — see the note above
      // listAgencyTickets. Naming `scope` breaks this query outright until
      // the migration lands.
      .select("*")
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
      .select("*")
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
// own policy decides what is visible: your own tickets, tickets assigned to
// you, your org's tickets if you may work them, and — for a platform
// operator — anything escalated to the platform desk. There is no
// cross-agency view of un-escalated tickets.

/**
 * Did that write actually land?
 *
 * When a row-level `using` clause filters an UPDATE's target out, Postgres
 * does not raise — the statement succeeds having touched nothing. Through
 * PostgREST that arrives as `{ error: null, data: [] }`, which every caller
 * here read as success and reported as one. Asking for the ids back turns the
 * silence into something a person can see.
 *
 * This is not belt-and-braces for the policy fix below it: RLS can legitimately
 * hide a row from someone whose permissions changed mid-session, and "nothing
 * happened" should never render as a green tick.
 */
function assertTouched(rows: unknown[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`You don't have permission to ${what} on this ticket.`);
  }
}

/**
 * Why these reads select `*` rather than naming their columns.
 *
 * `scope` and `escalated_at` arrive with a migration, and code ships to
 * production before a migration is applied. PostgREST answers a select naming
 * a column that does not exist with `42703 column ... does not exist` — the
 * whole query fails, not just the missing field — and these handlers throw on
 * error. Naming them took out the My Tickets tab, the ticket thread and this
 * console for the entire window between deploying and migrating.
 *
 * `*` returns whatever the table has. Before the migration the new fields are
 * simply absent, the badges that read them do not render, and everything that
 * worked before still works. After it, they appear with no second deploy.
 *
 * The general rule this is an instance of: a read may not name a column its
 * own migration adds, because the two do not land together.
 */
export const listAgencyTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "open", "pending", "resolved", "closed"]).default("all"),
      assigned: z.enum(["all", "me", "unassigned"]).default("all"),
      scope: z.enum(["all", "agency", "platform"]).default("all"),
    }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase: _sb, userId } = context;
    const supabase = _sb as any;

    let q = supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.assigned === "me") q = q.eq("assigned_to", userId);
    if (data.assigned === "unassigned") q = q.is("assigned_to", null);
    if (data.scope !== "all") q = q.eq("scope", data.scope);

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

    const { data: touched, error } = await supabase
      .from("support_tickets")
      .update({ assigned_to: data.assignee_id, updated_at: new Date().toISOString() })
      .eq("id", data.ticket_id)
      .select("id");
    if (error) throw new Error(error.message);
    assertTouched(touched, "change the assignee");
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
    //
    // Not asserted: the reply itself is the deliverable and it is already in
    // the thread by this point. If the caller may write the message but not
    // the parent row, failing here would claim the reply never sent.
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
    const { data: touched, error } = await supabase
      .from("support_tickets").update(patch).eq("id", data.ticket_id).select("id");
    if (error) throw new Error(error.message);
    assertTouched(touched, "change the status");
    return { ok: true };
  });

/**
 * Hand a ticket to the platform desk.
 *
 * The agency keeps the thread — `organization_id` is untouched — so this is
 * "we need help with this" rather than "this is no longer ours". A ticket
 * already on the platform desk is left alone instead of being escalated
 * twice, which would overwrite who first asked and when.
 */
export const escalateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ticket_id: z.string().uuid(),
      note: z.string().trim().max(2000).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase: _sb, userId } = context;
    const supabase = _sb as any;

    const { data: ticket } = await supabase
      .from("support_tickets").select("*").eq("id", data.ticket_id).maybeSingle();
    if (!ticket) throw new Error("Ticket not found or access denied.");

    // Before the migration there is no scope column and no can_work_tickets(),
    // so there is no platform desk to escalate to. Saying so is better than
    // an "column does not exist" in a toast.
    if (!("scope" in ticket)) {
      throw new Error("Escalation isn't available yet — your workspace is still being updated.");
    }
    if (ticket.scope === "platform") return { ok: true, alreadyEscalated: true };

    // Row-level security would let the reporter through here — it is their
    // ticket, so the write clause passes — and that is the wrong answer.
    // Escalating is the agency saying "this one isn't ours", not an agent
    // routing around their agency. Asked of the database rather than
    // reimplemented, so the rule has one definition.
    const { data: mayWork } = await supabase
      .rpc("can_work_tickets", { _org: ticket.organization_id });
    if (!mayWork) {
      throw new Error("Only your agency's support team can escalate a ticket.");
    }

    const { data: touched, error } = await supabase
      .from("support_tickets")
      .update({
        scope: "platform",
        escalated_at: new Date().toISOString(),
        escalated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.ticket_id)
      .select("id");
    if (error) throw new Error(error.message);
    assertTouched(touched, "escalate");

    // The reason goes into the thread rather than a column of its own: the
    // person who picks this up reads the conversation, not the schema.
    await supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticket_id,
      sender_id: userId,
      sender_role: "support",
      body: data.note?.trim()
        ? `Escalated to Agent Cloud support.\n\n${data.note.trim()}`
        : "Escalated to Agent Cloud support.",
    });

    return { ok: true, alreadyEscalated: false };
  });
