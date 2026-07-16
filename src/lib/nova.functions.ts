import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

// ── Settings (sophai_settings, one row per agent) ────────────────────────────

export type NovaSettings = {
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  birthday_messages_enabled: boolean;
  anniversary_messages_enabled: boolean;
  beneficiary_engagement_enabled: boolean;
  lapse_followup_enabled: boolean;
  policy_recovery_enabled: boolean;
  sms_followup_enabled: boolean;
};

const DEFAULT_SETTINGS: NovaSettings = {
  email_notifications_enabled: true,
  sms_notifications_enabled: false,
  birthday_messages_enabled: false,
  anniversary_messages_enabled: false,
  beneficiary_engagement_enabled: false,
  lapse_followup_enabled: false,
  policy_recovery_enabled: false,
  sms_followup_enabled: false,
};

const SettingsPatchSchema = z.object({
  email_notifications_enabled: z.boolean().optional(),
  sms_notifications_enabled: z.boolean().optional(),
  birthday_messages_enabled: z.boolean().optional(),
  anniversary_messages_enabled: z.boolean().optional(),
  beneficiary_engagement_enabled: z.boolean().optional(),
  lapse_followup_enabled: z.boolean().optional(),
  policy_recovery_enabled: z.boolean().optional(),
  sms_followup_enabled: z.boolean().optional(),
});

export const getNovaSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase
      .from("sophai_settings")
      .select("*")
      .eq("agent_id", userId)
      .maybeSingle();
    return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as NovaSettings;
  });

export const updateNovaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsPatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase
      .from("sophai_settings")
      .upsert({ agent_id: userId, ...data }, { onConflict: "agent_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Custom automations (nova_automations) ────────────────────────────────────

export type NovaAutomation = {
  id: string;
  name: string;
  trigger_type: "birthday" | "policy_anniversary" | "beneficiary_checkin" | "lapse_follow_up" | "custom_date";
  channel: "email" | "sms" | "both";
  message_template: string;
  custom_date: string | null;
  enabled: boolean;
  created_at: string;
};

const AutomationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  trigger_type: z.enum(["birthday", "policy_anniversary", "beneficiary_checkin", "lapse_follow_up", "custom_date"]),
  channel: z.enum(["email", "sms", "both"]),
  message_template: z.string().trim().min(1).max(2000),
  custom_date: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("nova_automations")
      .select("*")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as NovaAutomation[] };
  });

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AutomationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("nova_automations").insert({
      agent_id: userId,
      name: data.name,
      trigger_type: data.trigger_type,
      channel: data.channel,
      message_template: data.message_template,
      custom_date: data.trigger_type === "custom_date" ? data.custom_date ?? null : null,
      enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    AutomationSchema.partial().extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("nova_automations")
      .update(patch)
      .eq("id", id)
      .eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase
      .from("nova_automations")
      .delete()
      .eq("id", data.id)
      .eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
