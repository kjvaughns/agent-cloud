import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Nova automation worker — the callable surface.
 *
 * The sending logic itself lives in automation/nova-sends.server.ts and the
 * scheduler in automation/jobs.server.ts, so the authenticated call and the
 * cron sweep run identical code. Those modules are loaded inside handlers:
 * this file is client-reachable, and a module-scope import would drag the
 * service-role client into the browser bundle.
 */

export const runDueAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const { runAutomationsForAgent } = await import("@/lib/automation/nova-sends.server");
    return runAutomationsForAgent(userId, { dryRun: data.dryRun });
  });

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("automation_runs")
      .select("id, automation_id, subject_type, channel, status, reason, rendered_message, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { runs: [] };
    return { runs: data ?? [] };
  });
