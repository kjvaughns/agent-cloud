
-- Fix grants on agent_integrations (table existed but missing role grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_integrations TO authenticated;
GRANT ALL ON public.agent_integrations TO service_role;

-- scrape_requests
CREATE TABLE IF NOT EXISTS public.scrape_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agentlink_username text NOT NULL,
  agentlink_password_encrypted text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_requests TO authenticated;
GRANT ALL ON public.scrape_requests TO service_role;

ALTER TABLE public.scrape_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_own_scrape_requests" ON public.scrape_requests
  FOR ALL TO authenticated
  USING (auth.uid() = requesting_agent_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (auth.uid() = requesting_agent_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- admin_import_jobs
CREATE TABLE IF NOT EXISTS public.admin_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scrape_request_id uuid REFERENCES public.scrape_requests(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_path text,
  status text NOT NULL DEFAULT 'pending',
  extracted_json jsonb,
  clients_imported int NOT NULL DEFAULT 0,
  policies_imported int NOT NULL DEFAULT 0,
  notes_imported int NOT NULL DEFAULT 0,
  duplicates_skipped int NOT NULL DEFAULT 0,
  ai_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_import_jobs TO authenticated;
GRANT ALL ON public.admin_import_jobs TO service_role;

ALTER TABLE public.admin_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_only" ON public.admin_import_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
