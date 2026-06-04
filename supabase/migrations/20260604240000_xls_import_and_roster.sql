-- ============================================================
-- Add tobacco_use + medical_conditions to clients
-- ============================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tobacco_use boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_conditions text;

-- ============================================================
-- Migration Roster
-- Stores Apex/AgentLink team roster rows for future agent
-- signup autofill — does NOT modify any live profiles.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.migration_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  first_name text,
  last_name text,
  status text DEFAULT 'INCOMPLETE',
  location text,
  depth text,
  contracts_ratio text,
  upline_name text,
  date_joined text,
  last_active text,
  source text NOT NULL DEFAULT 'agentlink_xls',
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT migration_roster_email_unique UNIQUE (email)
);

ALTER TABLE public.migration_roster ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'migration_roster' AND policyname = 'admin_all_migration_roster'
  ) THEN
    CREATE POLICY "admin_all_migration_roster"
      ON public.migration_roster
      USING (
        auth.uid() IN (
          SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager')
        )
      );
  END IF;
END $$;

-- Secure lookup so the public/token-based onboarding flow can check by email
-- without exposing the full table via RLS.
CREATE OR REPLACE FUNCTION public.lookup_migration_roster(p_email text)
RETURNS public.migration_roster
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.migration_roster
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_migration_roster(text) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_migration_roster(text) TO authenticated;
