CREATE TABLE public.client_health (
  client_id UUID NOT NULL PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  height_ft INTEGER,
  height_in INTEGER CHECK (height_in IS NULL OR (height_in >= 0 AND height_in <= 11)),
  weight_lbs INTEGER,
  tobacco_use BOOLEAN,
  primary_physician TEXT,
  primary_physician_phone TEXT,
  conditions TEXT,
  medications TEXT,
  medical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_health TO authenticated;
GRANT ALL ON public.client_health TO service_role;

ALTER TABLE public.client_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_health_via_client" ON public.client_health FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clients c
  WHERE c.id = client_health.client_id
    AND (c.agent_id = auth.uid() OR public.is_in_downline(auth.uid(), c.agent_id) OR public.is_admin_of_agent(c.agent_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.clients c
  WHERE c.id = client_health.client_id
    AND (c.agent_id = auth.uid() OR public.is_admin_of_agent(c.agent_id))
));