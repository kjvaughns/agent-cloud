-- Add new role values to app_role enum (idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin'  BEFORE 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agency_owner' BEFORE 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff'        AFTER  'agent';

-- Organizations table
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

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='super_admin_all_orgs') THEN
    CREATE POLICY "super_admin_all_orgs" ON public.organizations
      USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='owner_own_org') THEN
    CREATE POLICY "owner_own_org" ON public.organizations
      USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='members_read_own_org') THEN
    CREATE POLICY "members_read_own_org" ON public.organizations FOR SELECT
      USING (id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_for_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_org_idx ON public.profiles (organization_id);

-- Add columns to invitation_links
ALTER TABLE public.invitation_links
  ADD COLUMN IF NOT EXISTS invited_role text DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Create APEX root organization
INSERT INTO public.organizations (name, slug, accent_color, active)
VALUES ('APEX Financial Empire', 'apex', '#C9A227', true)
ON CONFLICT (slug) DO NOTHING;

-- Link Samuel and Kaeden to APEX org
UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'apex')
WHERE email IN ('info@kingofsales.net', 'kjvaughns13@gmail.com')
  AND organization_id IS NULL;

-- Give Samuel super_admin role (upsert)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin' FROM auth.users WHERE email = 'info@kingofsales.net'
ON CONFLICT DO NOTHING;

-- Give Kaeden super_admin role (upsert)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin' FROM auth.users WHERE email = 'kjvaughns13@gmail.com'
ON CONFLICT DO NOTHING;
