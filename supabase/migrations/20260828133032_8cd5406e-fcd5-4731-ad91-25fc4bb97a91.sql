-- Split the catch-all ALL policy so UPDATE can be widened without loosening
-- INSERT or DELETE.
DROP POLICY IF EXISTS policies_org_modify ON public.policies;

CREATE POLICY policies_org_insert ON public.policies
  FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL
      AND organization_id IN (SELECT my_org_ids())
      AND (agent_id = auth.uid() OR public.is_org_owner(organization_id)))
    OR (organization_id IS NULL AND agent_id = auth.uid())
  );

CREATE POLICY policies_org_delete ON public.policies
  FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL
      AND organization_id IN (SELECT my_org_ids())
      AND (agent_id = auth.uid() OR public.is_org_owner(organization_id)))
    OR (organization_id IS NULL AND agent_id = auth.uid())
  );

-- Editing: the writing agent, anyone above them in the hierarchy, the agency
-- owner, or an agency admin. `is_in_downline` already returns true for self.
CREATE POLICY policies_org_update ON public.policies
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL
      AND organization_id IN (SELECT my_org_ids())
      AND (
        agent_id = auth.uid()
        OR public.is_in_downline(auth.uid(), agent_id)
        OR public.is_org_admin(organization_id)
      ))
    OR (organization_id IS NULL
      AND (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id)))
  )
  WITH CHECK (
    (organization_id IS NOT NULL
      AND organization_id IN (SELECT my_org_ids())
      AND (
        agent_id = auth.uid()
        OR public.is_in_downline(auth.uid(), agent_id)
        OR public.is_org_admin(organization_id)
      ))
    OR (organization_id IS NULL
      AND (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id)))
  );