
-- 1. Profile status lifecycle + agreement + hidden flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_signature_html text,
  ADD COLUMN IF NOT EXISTS agreement_agency_name text DEFAULT 'APEX Financial LLC',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('not_activated','pending','active','hidden','terminated'));
EXCEPTION WHEN others THEN NULL; END $$;

-- 2. agent_current_contracts
CREATE TABLE IF NOT EXISTS public.agent_current_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  carrier_name text,
  agent_number text,
  current_level text,
  effective_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_current_contracts TO authenticated;
GRANT ALL ON public.agent_current_contracts TO service_role;
ALTER TABLE public.agent_current_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_current_contracts read" ON public.agent_current_contracts;
CREATE POLICY "agent_current_contracts read" ON public.agent_current_contracts
  FOR SELECT TO authenticated USING (
    agent_id = auth.uid()
    OR public.is_in_downline(auth.uid(), agent_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );
DROP POLICY IF EXISTS "agent_current_contracts agent write" ON public.agent_current_contracts;
CREATE POLICY "agent_current_contracts agent write" ON public.agent_current_contracts
  FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS agent_current_contracts_touch ON public.agent_current_contracts;
CREATE TRIGGER agent_current_contracts_touch
  BEFORE UPDATE ON public.agent_current_contracts
  FOR EACH ROW EXECUTE FUNCTION public.rc_touch_updated_at();

-- 3. pdb_uploads
CREATE TABLE IF NOT EXISTS public.pdb_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text,
  parsed_states text[] DEFAULT '{}',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdb_uploads TO authenticated;
GRANT ALL ON public.pdb_uploads TO service_role;
ALTER TABLE public.pdb_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pdb_uploads read" ON public.pdb_uploads;
CREATE POLICY "pdb_uploads read" ON public.pdb_uploads
  FOR SELECT TO authenticated USING (
    agent_id = auth.uid()
    OR public.is_in_downline(auth.uid(), agent_id)
    OR public.has_role(auth.uid(), 'admin')
  );
DROP POLICY IF EXISTS "pdb_uploads write" ON public.pdb_uploads;
CREATE POLICY "pdb_uploads write" ON public.pdb_uploads
  FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 4. Tighten profiles SELECT policy
-- Drop any blanket policies first
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "profiles_self_or_related_read" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR upline_id = auth.uid()
    OR public.is_in_downline(auth.uid(), id)
    OR id = (SELECT upline_id FROM public.profiles WHERE id = auth.uid())
    OR upline_id = (SELECT upline_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- 5. RPC: downline for arbitrary root (admin full-company view)
CREATE OR REPLACE FUNCTION public.get_team_downline_for(p_root_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH RECURSIVE dl AS (
    SELECT p.*, 1 AS depth_level FROM public.profiles p WHERE p.upline_id = p_root_id
    UNION ALL
    SELECT p.*, d.depth_level + 1 FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  )
  SELECT to_jsonb(dl.*) FROM dl;
END $$;
GRANT EXECUTE ON FUNCTION public.get_team_downline_for(uuid) TO authenticated;
