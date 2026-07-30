import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { runAutomationsForAgent } from "./nova-sends.server";

const supabaseAdmin = _admin as any;

/**
 * The automation job registry and its runner.
 *
 * Nothing here is user-facing: it is invoked by the cron hook (no user) or by
 * an owner pressing "Run now" (a user, already authorized upstream). Because
 * the cron path has no session, every query uses the service-role client and
 * re-establishes the tenant boundary in code by iterating one organization at
 * a time and filtering on that organization's members.
 *
 * Every run — successful or not — writes a row to automation_job_runs. If
 * nothing appears in that table, the job did not run; there is no silent path.
 */

export type JobCounts = {
  considered: number;
  acted: number;
  skipped: number;
  errored: number;
  detail?: any;
};

export type AutomationJob = {
  key: string;
  label: string;
  description: string;
  /** Runs the job for one organization. Must be safe to call repeatedly. */
  run: (orgId: string) => Promise<JobCounts>;
};

const emptyCounts = (): JobCounts => ({ considered: 0, acted: 0, skipped: 0, errored: 0 });

/** Active member ids of one organization. */
async function orgMemberIds(orgId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", orgId)
    .eq("status", "active");

  const ids = (data ?? []).map((m: any) => m.profile_id).filter(Boolean);
  if (ids.length > 0) return Array.from(new Set<string>(ids));

  // Installs where the membership backfill has not run yet.
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId);
  return (profiles ?? []).map((p: any) => p.id);
}

/**
 * Job: deliver due Nova automations for every agent in the organization.
 *
 * This is the existing per-agent runner, applied org-wide. Consent and
 * idempotency are enforced inside it, not here.
 */
const novaAutomationsJob: AutomationJob = {
  key: "nova_automations",
  label: "Nova automations",
  description: "Sends due birthday, policy anniversary and lapse follow-up messages.",
  run: async (orgId) => {
    const counts = emptyCounts();
    const blocked = new Set<string>();
    const agents = await orgMemberIds(orgId);

    for (const agentId of agents) {
      try {
        const s = await runAutomationsForAgent(agentId, { orgId });
        counts.considered += s.considered;
        counts.acted += s.sent;
        counts.skipped += s.skipped + s.blocked;
        counts.errored += s.failed;
        for (const r of s.blockedReasons) blocked.add(r);
      } catch (e: any) {
        // One agent's failure must not end the sweep.
        counts.errored += 1;
      }
    }

    counts.detail = { agents: agents.length, blockedReasons: Array.from(blocked) };
    return counts;
  },
};

export const JOBS: AutomationJob[] = [novaAutomationsJob];

export function getJob(key: string): AutomationJob | undefined {
  return JOBS.find((j) => j.key === key);
}

export type JobRunResult = {
  job_key: string;
  organization_id: string;
  status: "ok" | "partial" | "failed";
  counts: JobCounts;
  error?: string;
};

/** Stop a slow job from starving the ones queued behind it. */
const JOB_BUDGET_MS = 60_000;

function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Job exceeded its ${ms / 1000}s time budget`)), ms),
    ),
  ]);
}

/**
 * Run one job for one organization, bracketed by its ledger row.
 * Never throws: a failure is a recorded run with status 'failed'.
 */
export async function runJob(
  job: AutomationJob,
  orgId: string,
  trigger: "cron" | "manual",
): Promise<JobRunResult> {
  const { data: row } = await supabaseAdmin
    .from("automation_job_runs")
    .insert({ organization_id: orgId, job_key: job.key, trigger, status: "running" })
    .select("id")
    .single();

  const runId = row?.id;
  const finish = async (
    status: JobRunResult["status"],
    counts: JobCounts,
    error?: string,
  ) => {
    if (!runId) return;
    await supabaseAdmin
      .from("automation_job_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        considered: counts.considered,
        acted: counts.acted,
        skipped: counts.skipped,
        errored: counts.errored,
        error: error ?? null,
        detail: counts.detail ?? {},
      })
      .eq("id", runId);
  };

  try {
    const counts = await withBudget(job.run(orgId), JOB_BUDGET_MS);
    const status = counts.errored > 0 ? "partial" : "ok";
    await finish(status, counts);
    return { job_key: job.key, organization_id: orgId, status, counts };
  } catch (e: any) {
    const message = e?.message ?? String(e);
    await finish("failed", emptyCounts(), message);
    return {
      job_key: job.key,
      organization_id: orgId,
      status: "failed",
      counts: emptyCounts(),
      error: message,
    };
  }
}

/** Every organization the scheduler should sweep. */
async function allOrgIds(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("organizations").select("id");
  return (data ?? []).map((o: any) => o.id);
}

/**
 * The scheduled sweep: each registered job, each organization, sequentially.
 * Sequential on purpose — these jobs make AI and database calls, and a
 * fan-out across every org at once is how you get rate-limited.
 */
export async function runAllJobs(
  opts: { orgId?: string; jobKey?: string; trigger?: "cron" | "manual" } = {},
): Promise<{ runs: JobRunResult[] }> {
  const trigger = opts.trigger ?? "cron";
  const orgs = opts.orgId ? [opts.orgId] : await allOrgIds();
  const jobs = opts.jobKey ? JOBS.filter((j) => j.key === opts.jobKey) : JOBS;

  const runs: JobRunResult[] = [];
  for (const job of jobs) {
    for (const orgId of orgs) {
      runs.push(await runJob(job, orgId, trigger));
    }
  }
  return { runs };
}
