
-- carriers
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS is_annuity_carrier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS advance_cap_amount numeric,
  ADD COLUMN IF NOT EXISTS advance_cap_months integer;

-- contract_requests
ALTER TABLE public.contract_requests
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS issue_description text,
  ADD COLUMN IF NOT EXISTS notes text;

-- agent_commission_levels
ALTER TABLE public.agent_commission_levels
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_commission_levels_agent_carrier_uniq'
  ) THEN
    ALTER TABLE public.agent_commission_levels
      ADD CONSTRAINT agent_commission_levels_agent_carrier_uniq UNIQUE (agent_id, carrier_id);
  END IF;
END $$;

-- producer_documents
CREATE TABLE IF NOT EXISTS public.producer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  doc_type text NOT NULL,
  file_url text,
  file_name text,
  start_date date,
  expiration_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS producer_documents_owner_select ON public.producer_documents;
CREATE POLICY producer_documents_owner_select ON public.producer_documents
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS producer_documents_owner_modify ON public.producer_documents;
CREATE POLICY producer_documents_owner_modify ON public.producer_documents
  FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_producer_documents_agent_type ON public.producer_documents(agent_id, doc_type);

-- storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('producer-docs', 'producer-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "producer_docs_owner_select" ON storage.objects;
CREATE POLICY "producer_docs_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'producer-docs' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_in_downline(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "producer_docs_owner_write" ON storage.objects;
CREATE POLICY "producer_docs_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'producer-docs' AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "producer_docs_owner_update" ON storage.objects;
CREATE POLICY "producer_docs_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'producer-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "producer_docs_owner_delete" ON storage.objects;
CREATE POLICY "producer_docs_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'producer-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
