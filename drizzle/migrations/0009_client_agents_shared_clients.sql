-- One client can have multiple selling agents.
CREATE TABLE public.client_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'selling',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, agent_id)
);

CREATE INDEX client_agents_agent_idx ON public.client_agents (agent_id);
CREATE INDEX client_agents_client_idx ON public.client_agents (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_agents TO authenticated;
GRANT ALL ON public.client_agents TO service_role;

-- Backfill: current primary contact, then every writing agent on a policy.
INSERT INTO public.client_agents (client_id, agent_id, organization_id, role)
SELECT c.id, c.agent_id, c.organization_id, 'owner'
FROM public.clients c
WHERE c.agent_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.agent_id)
ON CONFLICT (client_id, agent_id) DO NOTHING;

INSERT INTO public.client_agents (client_id, agent_id, organization_id, role)
SELECT DISTINCT p.client_id, p.agent_id, p.organization_id, 'selling'
FROM public.policies p
WHERE p.client_id IS NOT NULL
  AND p.agent_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p.client_id)
  AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.agent_id)
ON CONFLICT (client_id, agent_id) DO NOTHING;

-- Is the caller attached to this client (as primary contact or selling agent)?
CREATE OR REPLACE FUNCTION public.is_client_agent(_client uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_agents ca
    WHERE ca.client_id = _client AND ca.agent_id = _user
  )
$$;

-- Every client id reachable by a set of agents through attachment.
CREATE OR REPLACE FUNCTION public.client_ids_for_agents(_agents uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ca.client_id
  FROM public.client_agents ca
  WHERE ca.agent_id = ANY(_agents)
$$;

ALTER TABLE public.client_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_agents_select ON public.client_agents
FOR SELECT TO authenticated
USING (
  agent_id = auth.uid()
  OR public.is_in_downline(auth.uid(), agent_id)
  OR (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
  OR public.is_client_agent(client_id, auth.uid())
);

CREATE POLICY client_agents_modify ON public.client_agents
FOR ALL TO authenticated
USING (
  agent_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
  OR public.is_client_agent(client_id, auth.uid())
)
WITH CHECK (
  agent_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
  OR public.is_client_agent(client_id, auth.uid())
);

-- Clients: attached agents get the same access as the primary contact.
DROP POLICY IF EXISTS clients_org_select ON public.clients;
CREATE POLICY clients_org_select ON public.clients
FOR SELECT
USING (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND (
      (agent_id = auth.uid())
      OR is_in_downline(auth.uid(), agent_id)
      OR is_org_owner(organization_id)
      OR public.is_client_agent(id, auth.uid())
    )
  )
  OR (
    (organization_id IS NULL)
    AND ((agent_id = auth.uid()) OR is_in_downline(auth.uid(), agent_id) OR public.is_client_agent(id, auth.uid()))
  )
);

DROP POLICY IF EXISTS clients_org_modify ON public.clients;
CREATE POLICY clients_org_modify ON public.clients
FOR ALL
USING (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND ((agent_id = auth.uid()) OR is_org_owner(organization_id) OR public.is_client_agent(id, auth.uid()))
  )
  OR ((organization_id IS NULL) AND ((agent_id = auth.uid()) OR public.is_client_agent(id, auth.uid())))
)
WITH CHECK (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND ((agent_id = auth.uid()) OR is_org_owner(organization_id) OR public.is_client_agent(id, auth.uid()))
  )
  OR ((organization_id IS NULL) AND ((agent_id = auth.uid()) OR public.is_client_agent(id, auth.uid())))
);

-- Detail tables that keyed off the client's single owner.
DROP POLICY IF EXISTS client_health_via_client ON public.client_health;
CREATE POLICY client_health_via_client ON public.client_health
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_health.client_id
      AND ((c.agent_id = auth.uid()) OR is_in_downline(auth.uid(), c.agent_id) OR is_admin_of_agent(c.agent_id) OR public.is_client_agent(c.id, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_health.client_id
      AND ((c.agent_id = auth.uid()) OR is_admin_of_agent(c.agent_id) OR public.is_client_agent(c.id, auth.uid()))
  )
);

DROP POLICY IF EXISTS client_financials_via_client ON public.client_financials;
CREATE POLICY client_financials_via_client ON public.client_financials
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_financials.client_id
      AND ((c.agent_id = auth.uid()) OR is_in_downline(auth.uid(), c.agent_id) OR is_admin_of_agent(c.agent_id) OR public.is_client_agent(c.id, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_financials.client_id
      AND ((c.agent_id = auth.uid()) OR is_admin_of_agent(c.agent_id) OR public.is_client_agent(c.id, auth.uid()))
  )
);

DROP POLICY IF EXISTS life_events_via_client ON public.life_events;
CREATE POLICY life_events_via_client ON public.life_events
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = life_events.client_id
      AND ((c.agent_id = auth.uid()) OR is_in_downline(auth.uid(), c.agent_id) OR is_admin_of_agent(c.agent_id) OR public.is_client_agent(c.id, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = life_events.client_id
      AND ((c.agent_id = auth.uid()) OR is_admin_of_agent(c.agent_id) OR public.is_client_agent(c.id, auth.uid()))
  )
);

-- Notes and needs analysis stay per-agent rows, but an attached agent may add
-- and read their own against a shared client.
DROP POLICY IF EXISTS contact_history_org_select ON public.contact_history;
CREATE POLICY contact_history_org_select ON public.contact_history
FOR SELECT
USING (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND ((agent_id = auth.uid()) OR is_in_downline(auth.uid(), agent_id) OR is_org_owner(organization_id) OR public.is_client_agent(client_id, auth.uid()))
  )
  OR (
    (organization_id IS NULL)
    AND ((agent_id = auth.uid()) OR is_in_downline(auth.uid(), agent_id) OR public.is_client_agent(client_id, auth.uid()))
  )
);

DROP POLICY IF EXISTS contact_history_org_modify ON public.contact_history;
CREATE POLICY contact_history_org_modify ON public.contact_history
FOR ALL
USING (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND ((agent_id = auth.uid()) OR is_org_owner(organization_id))
  )
  OR ((organization_id IS NULL) AND (agent_id = auth.uid()))
)
WITH CHECK (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND ((agent_id = auth.uid()) OR is_org_owner(organization_id))
  )
  OR ((organization_id IS NULL) AND (agent_id = auth.uid()))
);

DROP POLICY IF EXISTS needs_analysis_org_select ON public.needs_analysis;
CREATE POLICY needs_analysis_org_select ON public.needs_analysis
FOR SELECT
USING (
  (
    (organization_id IS NOT NULL)
    AND (organization_id IN (SELECT my_org_ids() AS my_org_ids))
    AND ((agent_id = auth.uid()) OR is_in_downline(auth.uid(), agent_id) OR is_org_owner(organization_id) OR public.is_client_agent(client_id, auth.uid()))
  )
  OR (
    (organization_id IS NULL)
    AND ((agent_id = auth.uid()) OR is_in_downline(auth.uid(), agent_id) OR public.is_client_agent(client_id, auth.uid()))
  )
);

-- Keep attachments current as policies are written.
CREATE OR REPLACE FUNCTION public.attach_policy_agent_to_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.client_agents (client_id, agent_id, organization_id, role)
    VALUES (NEW.client_id, NEW.agent_id, NEW.organization_id, 'selling')
    ON CONFLICT (client_id, agent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER policies_attach_client_agent
AFTER INSERT OR UPDATE OF agent_id, client_id ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.attach_policy_agent_to_client();

CREATE OR REPLACE FUNCTION public.attach_owner_to_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.client_agents (client_id, agent_id, organization_id, role)
    VALUES (NEW.id, NEW.agent_id, NEW.organization_id, 'owner')
    ON CONFLICT (client_id, agent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_attach_owner
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.attach_owner_to_client();