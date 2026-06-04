-- ============================================================
-- Agent Integrations (stores API keys per platform per agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  api_key text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  sync_status text DEFAULT 'idle',
  last_error text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (agent_id, platform)
);
ALTER TABLE public.agent_integrations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_integrations' AND policyname = 'agents_own_integrations'
  ) THEN
    CREATE POLICY "agents_own_integrations"
      ON public.agent_integrations
      USING (agent_id = auth.uid())
      WITH CHECK (agent_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- Import Jobs (tracks each import attempt with full log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_found int DEFAULT 0,
  imported int DEFAULT 0,
  duplicates_found int DEFAULT 0,
  skipped int DEFAULT 0,
  error_log text,
  raw_data jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'import_jobs' AND policyname = 'agents_own_import_jobs'
  ) THEN
    CREATE POLICY "agents_own_import_jobs"
      ON public.import_jobs
      USING (agent_id = auth.uid())
      WITH CHECK (agent_id = auth.uid());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'import_jobs' AND policyname = 'admin_all_import_jobs'
  ) THEN
    CREATE POLICY "admin_all_import_jobs"
      ON public.import_jobs
      USING (
        auth.uid() IN (
          SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================
-- Duplicate Detection Log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_type text NOT NULL,
  confidence int NOT NULL,
  incoming_data jsonb NOT NULL,
  existing_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  existing_policy_id uuid REFERENCES public.policies(id) ON DELETE SET NULL,
  resolution text DEFAULT 'pending',
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.import_duplicates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'import_duplicates' AND policyname = 'agents_own_duplicates'
  ) THEN
    CREATE POLICY "agents_own_duplicates"
      ON public.import_duplicates
      USING (agent_id = auth.uid());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'import_duplicates' AND policyname = 'admin_all_duplicates'
  ) THEN
    CREATE POLICY "admin_all_duplicates"
      ON public.import_duplicates
      USING (
        auth.uid() IN (
          SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================
-- Admin scrape requests (credential-based full imports)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scrape_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agentlink_username text NOT NULL,
  agentlink_password_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  import_job_id uuid REFERENCES public.import_jobs(id),
  submitted_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.scrape_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scrape_requests' AND policyname = 'agents_own_scrape_requests'
  ) THEN
    CREATE POLICY "agents_own_scrape_requests"
      ON public.scrape_requests
      USING (requesting_agent_id = auth.uid())
      WITH CHECK (requesting_agent_id = auth.uid());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scrape_requests' AND policyname = 'admin_all_scrape_requests'
  ) THEN
    CREATE POLICY "admin_all_scrape_requests"
      ON public.scrape_requests
      USING (
        auth.uid() IN (
          SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================
-- Indexes for fast duplicate detection
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS clients_agent_phone_unique
  ON public.clients (agent_id, phone)
  WHERE phone IS NOT NULL AND phone != '';

CREATE INDEX IF NOT EXISTS clients_name_dob_idx
  ON public.clients (agent_id, lower(first_name), lower(last_name), date_of_birth)
  WHERE date_of_birth IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS policies_agent_policy_number_unique
  ON public.policies (agent_id, policy_number)
  WHERE policy_number IS NOT NULL AND policy_number != '';
