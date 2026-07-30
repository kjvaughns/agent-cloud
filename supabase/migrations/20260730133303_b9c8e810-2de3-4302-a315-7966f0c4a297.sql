CREATE TABLE public.automation_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_key text NOT NULL,
  trigger text NOT NULL DEFAULT 'cron',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  considered integer NOT NULL DEFAULT 0,
  acted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  errored integer NOT NULL DEFAULT 0,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ajr_org_started ON public.automation_job_runs (organization_id, started_at DESC);
CREATE INDEX idx_ajr_job_started ON public.automation_job_runs (job_key, started_at DESC);

GRANT SELECT ON public.automation_job_runs TO authenticated;
GRANT ALL ON public.automation_job_runs TO service_role;

ALTER TABLE public.automation_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins read their org job runs"
ON public.automation_job_runs
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin()
  OR (organization_id IS NOT NULL AND organization_id IN (SELECT public.my_org_ids()))
);