-- profiles + invitation_links columns FIRST (so policies can reference them)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id    uuid,
  ADD COLUMN IF NOT EXISTS staff_for_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invitation_links
  ADD COLUMN IF NOT EXISTS invited_role     text DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS organization_id  uuid;

-- organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  owner_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_org_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  logo_url       text,
  accent_color   text DEFAULT '#C9A227',
  tagline        text,
  custom_domain  text UNIQUE,
  active         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

-- now add FKs (table exists)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_organization_id_fkey,
  ADD CONSTRAINT profiles_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.invitation_links
  DROP CONSTRAINT IF EXISTS invitation_links_organization_id_fkey,
  ADD CONSTRAINT invitation_links_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_org_idx       ON public.profiles (organization_id);
CREATE INDEX IF NOT EXISTS profiles_staff_for_idx ON public.profiles (staff_for_user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_orgs"   ON public.organizations;
DROP POLICY IF EXISTS "owner_own_org"          ON public.organizations;
DROP POLICY IF EXISTS "members_read_own_org"   ON public.organizations;

CREATE POLICY "super_admin_all_orgs" ON public.organizations
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "owner_own_org" ON public.organizations
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "members_read_own_org" ON public.organizations
  FOR SELECT
  USING (id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Apex root org + backfill
INSERT INTO public.organizations (id, name, slug, accent_color, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Agent Cloud', 'agent-cloud', '#C9A227', true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
   SET organization_id = '00000000-0000-0000-0000-000000000001'
 WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- C2: Drop the duplicate-write commission trigger
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tgname, c.relname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND t.tgfoid = 'public.generate_commission_schedule'::regproc
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.relname);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.generate_commission_schedule() CASCADE;
