import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * The scheduler's user-facing surface: what ran, and "run it now".
 *
 * Reads go through the RLS-bound client, so the automation_job_runs policy
 * decides visibility — an owner sees their own organization's runs and
 * nothing else. The manual trigger is additionally restricted to the agency
 * owner, because it can send real messages.
 */

export type JobRunRow = {
  id: string;
  job_key: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  considered: number;
  acted: number;
  skipped: number;
  errored: number;
  error: string | null;
  detail: Record<string, unknown> | null;
};

/** Static catalogue so the UI can list jobs that have never run. */
export const listAutomationJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { JOBS } = await import("@/lib/automation/jobs.server");
    return { jobs: JOBS.map((j) => ({ key: j.key, label: j.label, description: j.description })) };
  });

export const listJobRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("automation_job_runs")
      .select(
        "id, job_key, trigger, status, started_at, finished_at, considered, acted, skipped, errored, error, detail",
      )
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) return { runs: [] as JobRunRow[] };
    return { runs: (data ?? []) as JobRunRow[] };
  });

export const runAutomationJobNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobKey: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const { getMyPrimaryOrgId, assertOrgOwner } = await import("@/lib/org-guard");
    const orgId = await getMyPrimaryOrgId(userId);
    await assertOrgOwner(userId, orgId);

    const { getJob, runJob } = await import("@/lib/automation/jobs.server");
    const job = getJob(data.jobKey);
    if (!job) throw new Error(`Unknown job: ${data.jobKey}`);

    const result = await runJob(job, orgId!, "manual");
    return result;
  });
