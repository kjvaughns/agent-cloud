-- Create state_licenses if it doesn't exist yet (for environments where the
-- core migration hasn't been applied yet)
CREATE TABLE IF NOT EXISTS public.state_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_code text NOT NULL,
  license_number text,
  issued_date date,
  expires_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.state_licenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'state_licenses' AND policyname = 'state_licenses_owner'
  ) THEN
    CREATE POLICY "state_licenses_owner" ON public.state_licenses
      USING (agent_id = auth.uid())
      WITH CHECK (agent_id = auth.uid());
  END IF;
END $$;

-- NIPR-specific columns
ALTER TABLE public.state_licenses
  ADD COLUMN IF NOT EXISTS npn_number text,
  ADD COLUMN IF NOT EXISTS loa text,
  ADD COLUMN IF NOT EXISTS license_type text,
  ADD COLUMN IF NOT EXISTS is_resident boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loa_status text DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique constraint: one row per (agent, state, LOA).
-- NULLS NOT DISTINCT means two rows with loa=NULL for the same (agent, state) conflict —
-- this keeps the manual-entry path (loa=null) from creating duplicates too.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'state_licenses'
      AND constraint_name = 'state_licenses_agent_state_loa_unique'
  ) THEN
    ALTER TABLE public.state_licenses
      ADD CONSTRAINT state_licenses_agent_state_loa_unique
      UNIQUE NULLS NOT DISTINCT (agent_id, state_code, loa);
  END IF;
END $$;
