import { createServerFn } from "@tanstack/start-client-core";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarEvent = {
  id: string;
  agent_id: string;
  client_id: string | null;
  policy_id: string | null;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  notes: string | null;
  reminder_minutes: number | null;
  is_auto_generated: boolean;
  recurrence_rule: string | null;
  color: string | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
  client_phone?: string | null;
};

const RangeSchema = z.object({
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export const listCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Fetch direct events in the range OR annual recurring events (any year)
    const { data: rows, error } = await supabase
      .from("calendar_events")
      .select("*, clients(first_name,last_name,phone)")
      .eq("agent_id", userId)
      .order("start_at", { ascending: true });
    if (error) throw new Error(error.message);

    const events: CalendarEvent[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      agent_id: r.agent_id,
      client_id: r.client_id,
      policy_id: r.policy_id ?? null,
      title: r.title,
      event_type: r.event_type,
      start_at: r.start_at,
      end_at: r.end_at,
      all_day: r.all_day ?? false,
      notes: r.notes,
      reminder_minutes: r.reminder_minutes ?? null,
      is_auto_generated: r.is_auto_generated ?? false,
      recurrence_rule: r.recurrence_rule ?? null,
      color: r.color ?? null,
      client_first_name: r.clients?.first_name ?? null,
      client_last_name: r.clients?.last_name ?? null,
      client_phone: r.clients?.phone ?? null,
    }));

    // Expand annual recurring events into instances within range
    const start = new Date(data.rangeStart);
    const end = new Date(data.rangeEnd);
    const expanded: CalendarEvent[] = [];
    for (const ev of events) {
      const evStart = new Date(ev.start_at);
      if (ev.recurrence_rule && ev.recurrence_rule.includes("YEARLY")) {
        for (let y = start.getFullYear() - 1; y <= end.getFullYear() + 1; y++) {
          const inst = new Date(evStart);
          inst.setFullYear(y);
          if (inst >= start && inst <= end) {
            expanded.push({ ...ev, start_at: inst.toISOString() });
          }
        }
      } else if (evStart >= start && evStart <= end) {
        expanded.push(ev);
      }
    }
    return { events: expanded };
  });

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  event_type: z.enum([
    "appointment", "follow_up", "meeting", "call", "other",
  ]),
  client_id: z.string().uuid().nullable().optional(),
  start_at: z.string(),
  end_at: z.string().nullable().optional(),
  all_day: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  reminder_minutes: z.number().int().nullable().optional(),
});

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("calendar_events")
      .insert({
        agent_id: userId,
        title: data.title,
        event_type: data.event_type,
        client_id: data.client_id ?? null,
        start_at: data.start_at,
        end_at: data.end_at ?? null,
        all_day: data.all_day ?? false,
        notes: data.notes ?? null,
        reminder_minutes: data.reminder_minutes ?? null,
        is_auto_generated: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { event: row };
  });

const UpdateSchema = CreateSchema.partial().extend({ id: z.string().uuid() });

export const updateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("calendar_events").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchClientsForCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = data.q.trim();
    let query = supabase
      .from("clients")
      .select("id, first_name, last_name, phone")
      .eq("agent_id", userId)
      .limit(10);
    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { clients: rows ?? [] };
  });
