import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Per-user notification preferences.
 *
 * These sit beneath the org-level switches from Phase 2. A message goes out
 * only when the organization has enabled that channel AND the recipient has
 * not opted out — see public.may_notify.
 */

export const NOTIFICATION_CATEGORIES = [
  { key: "notify_task_assigned",     label: "Tasks assigned to me",      description: "When someone assigns you a task" },
  { key: "notify_policy_at_risk",    label: "Policies at risk",          description: "When one of your policies goes lapse-pending or NSF" },
  { key: "notify_commission_posted", label: "Commissions",               description: "When a commission is scheduled or paid" },
  { key: "notify_contract_updates",  label: "Contracting updates",       description: "Carrier appointments, level changes, transfers" },
  { key: "notify_team_activity",     label: "Team activity",             description: "Production and milestones across your downline" },
  { key: "notify_announcements",     label: "Announcements",             description: "Agency-wide posts" },
  { key: "notify_billing",           label: "Billing",                   description: "Payment issues and subscription changes" },
] as const;

export type NotificationPrefs = {
  email_enabled: boolean;
  sms_enabled: boolean;
  notify_task_assigned: boolean;
  notify_policy_at_risk: boolean;
  notify_commission_posted: boolean;
  notify_contract_updates: boolean;
  notify_team_activity: boolean;
  notify_announcements: boolean;
  notify_billing: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
};

// Mirrors the column defaults, so a user with no row yet sees what they will
// actually receive rather than a screen full of unchecked boxes.
const DEFAULTS: NotificationPrefs = {
  email_enabled: true,
  sms_enabled: false,
  notify_task_assigned: true,
  notify_policy_at_risk: true,
  notify_commission_posted: true,
  notify_contract_updates: true,
  notify_team_activity: false,
  notify_announcements: true,
  notify_billing: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle();
    return { prefs: { ...DEFAULTS, ...(data ?? {}) } as NotificationPrefs };
  });

const UpdateSchema = z.object({
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  notify_task_assigned: z.boolean().optional(),
  notify_policy_at_risk: z.boolean().optional(),
  notify_commission_posted: z.boolean().optional(),
  notify_contract_updates: z.boolean().optional(),
  notify_team_activity: z.boolean().optional(),
  notify_announcements: z.boolean().optional(),
  notify_billing: z.boolean().optional(),
  quiet_hours_start: z.number().int().min(0).max(23).nullable().optional(),
  quiet_hours_end: z.number().int().min(0).max(23).nullable().optional(),
  timezone: z.string().max(60).nullable().optional(),
});

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const patch: Record<string, unknown> = { profile_id: userId, updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v;

    // Personal row, written through the RLS-bound client — the policy is
    // profile_id = auth.uid(), so this cannot touch anyone else's settings.
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(patch, { onConflict: "profile_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
