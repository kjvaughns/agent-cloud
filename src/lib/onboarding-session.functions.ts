import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: any };

/** Saved builder progress for the signed-in user (null when none yet). */
export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase.from("onboarding_sessions").select("path, current_step, answers, completed_at").eq("user_id", userId).maybeSingle();
    return data as null | { path: "agent" | "agency"; current_step: string; answers: Record<string, any>; completed_at: string | null };
  });

/** Upserts progress; the first save sends the path-specific welcome email once. */
export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    path: z.enum(["agent", "agency"]),
    current_step: z.string().max(40),
    answers: z.record(z.string(), z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as Ctx;
    const answers = JSON.parse(JSON.stringify(data.answers).slice(0, 20000) === JSON.stringify(data.answers) ? JSON.stringify(data.answers) : "{}");
    const { data: row, error } = await supabase.from("onboarding_sessions")
      .upsert({ user_id: userId, path: data.path, current_step: data.current_step, answers, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("welcome_sent_at").single();
    if (error) throw new Error(error.message);
    if (!row?.welcome_sent_at && claims?.email) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { queueEmail, APP_ORIGIN } = await import("@/lib/email/send.server");
      await queueEmail({
        template: "onboarding-welcome", to: claims.email, profileId: userId, category: "transactional",
        key: `onboarding-welcome:${userId}`,
        data: { firstName: answers.firstName, path: data.path, appUrl: APP_ORIGIN },
      }).catch(() => {});
      await (supabaseAdmin as any).from("onboarding_sessions").update({ welcome_sent_at: new Date().toISOString() }).eq("user_id", userId);
    }
    return { ok: true };
  });

/** Marks the build finished and sends the "you're live" email once. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row } = await admin.from("onboarding_sessions").select("path, answers, completed_at").eq("user_id", userId).maybeSingle();
    if (!row) return { ok: false };
    if (!row.completed_at) {
      await admin.from("onboarding_sessions").update({ completed_at: new Date().toISOString(), current_step: "done" }).eq("user_id", userId);
      if (claims?.email) {
        const { queueEmail, APP_ORIGIN } = await import("@/lib/email/send.server");
        await queueEmail({
          template: "onboarding-live", to: claims.email, profileId: userId, category: "transactional",
          key: `onboarding-live:${userId}`,
          data: { firstName: row.answers?.firstName, path: row.path, agencyName: row.answers?.agencyName, appUrl: APP_ORIGIN },
        }).catch(() => {});
      }
    }
    return { ok: true };
  });
