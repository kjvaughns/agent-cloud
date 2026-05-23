import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Types ============
export type PhoneSettings = {
  id: string;
  agent_id: string;
  phone_number: string | null;
  twilio_sid: string | null;
  forwarding_number: string | null;
  forwarding_enabled: boolean;
  sms_registration_status: string;
};

export type Conversation = {
  id: string;
  agent_id: string;
  client_id: string | null;
  phone_number: string;
  last_message_at: string;
  unread_count: number;
  client_first_name: string | null;
  client_last_name: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
};

export type SmsMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_url: string | null;
  sent_at: string;
  status: string | null;
  is_auto: boolean;
};

export type CallLog = {
  id: string;
  agent_id: string;
  client_id: string | null;
  phone_number: string;
  direction: string;
  duration_seconds: number | null;
  outcome: string | null;
  summary: string | null;
  created_at: string;
  client_first_name?: string | null;
  client_last_name?: string | null;
};

export type DialListSummary = {
  id: string;
  name: string;
  created_at: string;
  total: number;
  called: number;
};

export type DialListEntry = {
  id: string;
  list_id: string;
  client_id: string;
  position: number;
  called_at: string | null;
  outcome: string | null;
  notes: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  client_phone: string | null;
  client_stage: string | null;
};

// ============ Phone settings ============
export const getPhoneOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let { data: settings } = await supabase
      .from("agent_phone_settings")
      .select("*")
      .eq("agent_id", userId)
      .maybeSingle();
    if (!settings) {
      const { data: created } = await supabase
        .from("agent_phone_settings")
        .insert({ agent_id: userId })
        .select("*")
        .single();
      settings = created;
    }
    const { data: unread } = await supabase
      .from("sms_conversations")
      .select("unread_count")
      .eq("agent_id", userId);
    const totalUnread = (unread ?? []).reduce(
      (a: number, r: any) => a + (r.unread_count ?? 0),
      0,
    );
    return {
      settings: settings as PhoneSettings,
      unreadTotal: totalUnread,
    };
  });

export const updatePhoneSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        forwarding_number: z.string().max(32).nullable().optional(),
        forwarding_enabled: z.boolean().optional(),
        phone_number: z.string().max(32).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("agent_phone_settings")
      .upsert({ agent_id: userId, ...data, updated_at: new Date().toISOString() }, { onConflict: "agent_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Conversations ============
export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ filter: z.enum(["all", "unread"]).default("all") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("sms_conversations")
      .select("*, clients(first_name,last_name)")
      .eq("agent_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.filter === "unread") q = q.gt("unread_count", 0);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Last message preview
    const ids = (rows ?? []).map((r: any) => r.id);
    const previews = new Map<string, { body: string | null; direction: string }>();
    if (ids.length) {
      const { data: msgs } = await supabase
        .from("sms_messages")
        .select("conversation_id, body, direction, sent_at")
        .in("conversation_id", ids)
        .order("sent_at", { ascending: false });
      for (const m of msgs ?? []) {
        if (!previews.has(m.conversation_id))
          previews.set(m.conversation_id, { body: m.body, direction: m.direction });
      }
    }

    return (rows ?? []).map((r: any): Conversation => {
      const p = previews.get(r.id);
      return {
        id: r.id,
        agent_id: r.agent_id,
        client_id: r.client_id,
        phone_number: r.phone_number,
        last_message_at: r.last_message_at,
        unread_count: r.unread_count ?? 0,
        client_first_name: r.clients?.first_name ?? null,
        client_last_name: r.clients?.last_name ?? null,
        last_message_preview: p?.body ?? null,
        last_message_direction: p?.direction ?? null,
      };
    });
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("sent_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as SmsMessage[];
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("sms_conversations")
      .update({ unread_count: 0 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : d.length === 11 ? `+${d}` : p;
}

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid().optional(),
        phoneNumber: z.string().min(7).max(32),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const phone = normalizePhone(data.phoneNumber);
    // Try to find existing
    const { data: existing } = await supabase
      .from("sms_conversations")
      .select("id")
      .eq("agent_id", userId)
      .eq("phone_number", phone)
      .maybeSingle();
    if (existing?.id) return { id: existing.id as string };
    const { data: created, error } = await supabase
      .from("sms_conversations")
      .insert({
        agent_id: userId,
        client_id: data.clientId ?? null,
        phone_number: phone,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const sendSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().min(1).max(1600),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("sms_messages").insert({
      conversation_id: data.conversationId,
      direction: "outbound",
      body: data.body,
      status: "sent",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Calls ============
export const listRecents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("call_logs")
      .select("*, clients(first_name,last_name)")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any): CallLog => ({
      id: r.id,
      agent_id: r.agent_id,
      client_id: r.client_id,
      phone_number: r.phone_number,
      direction: r.direction,
      duration_seconds: r.duration_seconds,
      outcome: r.outcome,
      summary: r.summary,
      created_at: r.created_at,
      client_first_name: r.clients?.first_name ?? null,
      client_last_name: r.clients?.last_name ?? null,
    }));
  });

export const logCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone_number: z.string().min(3).max(32),
        client_id: z.string().uuid().nullable().optional(),
        direction: z.enum(["inbound", "outbound"]),
        duration_seconds: z.number().int().min(0).max(86400),
        outcome: z.enum(["connected", "no_answer", "voicemail", "busy"]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("call_logs")
      .insert({
        agent_id: userId,
        phone_number: normalizePhone(data.phone_number),
        client_id: data.client_id ?? null,
        direction: data.direction,
        duration_seconds: data.duration_seconds,
        outcome: data.outcome ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

// ============ Clients search ============
export const searchClientsForPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(120).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = data.q.trim();
    let query = supabase
      .from("clients")
      .select("id, first_name, last_name, phone, stage")
      .eq("agent_id", userId)
      .limit(20);
    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============ Dial Lists ============
export const listDialLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: lists, error } = await supabase
      .from("dial_lists")
      .select("id, name, created_at")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (lists ?? []).map((l: any) => l.id);
    const counts = new Map<string, { total: number; called: number }>();
    if (ids.length) {
      const { data: entries } = await supabase
        .from("dial_list_entries")
        .select("list_id, called_at")
        .in("list_id", ids);
      for (const e of entries ?? []) {
        const c = counts.get(e.list_id) ?? { total: 0, called: 0 };
        c.total += 1;
        if (e.called_at) c.called += 1;
        counts.set(e.list_id, c);
      }
    }
    return (lists ?? []).map((l: any): DialListSummary => ({
      id: l.id,
      name: l.name,
      created_at: l.created_at,
      total: counts.get(l.id)?.total ?? 0,
      called: counts.get(l.id)?.called ?? 0,
    }));
  });

export const getDialList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: list, error } = await supabase
      .from("dial_lists")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: entries, error: e2 } = await supabase
      .from("dial_list_entries")
      .select("*, clients(first_name,last_name,phone,stage)")
      .eq("list_id", data.id)
      .order("position", { ascending: true });
    if (e2) throw new Error(e2.message);
    const mapped = (entries ?? []).map((r: any): DialListEntry => ({
      id: r.id,
      list_id: r.list_id,
      client_id: r.client_id,
      position: r.position ?? 0,
      called_at: r.called_at,
      outcome: r.outcome,
      notes: r.notes,
      client_first_name: r.clients?.first_name ?? null,
      client_last_name: r.clients?.last_name ?? null,
      client_phone: r.clients?.phone ?? null,
      client_stage: r.clients?.stage ?? null,
    }));
    return { list, entries: mapped };
  });

export const createDialList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        clientIds: z.array(z.string().uuid()).max(500).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: list, error } = await supabase
      .from("dial_lists")
      .insert({ agent_id: userId, name: data.name })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.clientIds.length) {
      const rows = data.clientIds.map((cid, i) => ({
        list_id: list.id,
        client_id: cid,
        position: i,
      }));
      const { error: e2 } = await supabase.from("dial_list_entries").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return { id: list.id as string };
  });

export const deleteDialList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("dial_list_entries").delete().eq("list_id", data.id);
    const { error } = await supabase.from("dial_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordDialOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entryId: z.string().uuid(),
        outcome: z.enum(["connected", "no_answer", "voicemail", "callback", "removed"]),
        notes: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("dial_list_entries")
      .update({
        outcome: data.outcome,
        called_at: new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
