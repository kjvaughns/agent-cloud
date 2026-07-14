import { createServerFn } from "@tanstack/start-client-core";
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
    const { supabase, userId } = context;

    const { data: ticket, error: ticketErr } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, category, priority, status, description, created_at")
      .eq("id", data.ticket_id)
      .eq("agent_id", userId)
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
