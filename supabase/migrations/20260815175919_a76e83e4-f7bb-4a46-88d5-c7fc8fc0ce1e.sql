-- 1. Full unique index on idempotency_key so ON CONFLICT can infer it.
DROP INDEX IF EXISTS public.uq_commission_schedule_idempotency;
ALTER TABLE public.commission_schedule
  ADD CONSTRAINT commission_schedule_idempotency_key UNIQUE (idempotency_key);

-- 2. Override legs are payable to an upline, written by the producing agent.
DROP POLICY IF EXISTS commission_schedule_org_modify ON public.commission_schedule;
CREATE POLICY commission_schedule_org_modify ON public.commission_schedule
FOR ALL TO authenticated
USING (
  (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT my_org_ids())
    AND (
      agent_id = auth.uid()
      OR is_org_owner(organization_id)
      -- the writing agent is in the payee's downline: an override leg
      OR (source_agent_id = auth.uid() AND is_in_downline(agent_id, auth.uid()))
    )
  )
  OR (organization_id IS NULL AND agent_id = auth.uid())
)
WITH CHECK (
  (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT my_org_ids())
    AND (
      agent_id = auth.uid()
      OR is_org_owner(organization_id)
      OR (source_agent_id = auth.uid() AND is_in_downline(agent_id, auth.uid()))
    )
  )
  OR (organization_id IS NULL AND agent_id = auth.uid())
);

-- 3. An agent may record why their own deal could not be paid.
CREATE POLICY commission_setup_issues_agent_write ON public.commission_setup_issues
FOR ALL TO authenticated
USING (agent_id = auth.uid())
WITH CHECK (agent_id = auth.uid());