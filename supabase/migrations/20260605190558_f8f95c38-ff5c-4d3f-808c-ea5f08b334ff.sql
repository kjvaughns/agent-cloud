
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.agent_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  api_key text,
  last_synced_at timestamptz,
  sync_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_integrations TO authenticated;
GRANT ALL ON public.agent_integrations TO service_role;

ALTER TABLE public.agent_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage own integrations"
  ON public.agent_integrations FOR ALL
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

CREATE TRIGGER agent_integrations_updated_at
  BEFORE UPDATE ON public.agent_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
