
-- ============== Carrier Book Sync ==============
ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_source text;

CREATE TABLE IF NOT EXISTS public.carrier_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_sync_logs TO authenticated;
GRANT ALL ON public.carrier_sync_logs TO service_role;
ALTER TABLE public.carrier_sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carrier_sync_logs_select ON public.carrier_sync_logs;
CREATE POLICY carrier_sync_logs_select ON public.carrier_sync_logs
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_in_downline(auth.uid(), uploaded_by) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS carrier_sync_logs_insert ON public.carrier_sync_logs;
CREATE POLICY carrier_sync_logs_insert ON public.carrier_sync_logs
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE INDEX IF NOT EXISTS idx_carrier_sync_logs_uploader ON public.carrier_sync_logs(uploaded_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.carrier_mapping_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id uuid NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, carrier_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_mapping_templates TO authenticated;
GRANT ALL ON public.carrier_mapping_templates TO service_role;
ALTER TABLE public.carrier_mapping_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carrier_mapping_templates_own ON public.carrier_mapping_templates;
CREATE POLICY carrier_mapping_templates_own ON public.carrier_mapping_templates
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ============== Monetization ==============
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'agency',
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_seat_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_seats_purchased INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_partner_commission_rate NUMERIC DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS nova_partner_commission_ytd NUMERIC DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organizations_subscription_status_chk') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_subscription_status_chk
      CHECK (subscription_status IN ('trialing','active','past_due','cancelled','inactive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organizations_plan_type_chk') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_type_chk
      CHECK (plan_type IN ('agency','white_label','solo'));
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS nova_pro_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS nova_pro_source TEXT,
  ADD COLUMN IF NOT EXISTS nova_pro_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS nova_pro_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nova_pro_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nova_usage_calls_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_sms INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_ai_queries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_automations INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_reset_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_nova_pro_status_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_nova_pro_status_chk
      CHECK (nova_pro_status IN ('active','inactive','past_due','grace_period'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_nova_pro_source_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_nova_pro_source_chk
      CHECK (nova_pro_source IS NULL OR nova_pro_source IN ('personal','agency','solo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nova_partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  nova_subscriber_count INTEGER NOT NULL,
  commission_rate NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  stripe_credit_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','applied','disputed','reversed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.nova_partner_commissions TO authenticated;
GRANT ALL ON public.nova_partner_commissions TO service_role;
ALTER TABLE public.nova_partner_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nova_partner_commissions_read ON public.nova_partner_commissions;
CREATE POLICY nova_partner_commissions_read ON public.nova_partner_commissions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- ============== Role Permissions ==============
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  mgr_view_all_agents BOOLEAN DEFAULT false,
  mgr_edit_agent_profiles BOOLEAN DEFAULT false,
  mgr_post_deals_for_agents BOOLEAN DEFAULT false,
  mgr_view_agent_commissions BOOLEAN DEFAULT false,
  mgr_view_team_analytics BOOLEAN DEFAULT false,
  mgr_access_recruiting BOOLEAN DEFAULT false,
  mgr_submit_carrier_requests BOOLEAN DEFAULT false,
  mgr_manage_onboarding BOOLEAN DEFAULT false,
  mgr_view_client_records BOOLEAN DEFAULT false,
  mgr_edit_client_records BOOLEAN DEFAULT false,
  staff_view_clients BOOLEAN DEFAULT false,
  staff_edit_clients BOOLEAN DEFAULT false,
  staff_delete_clients BOOLEAN DEFAULT false,
  staff_view_policies BOOLEAN DEFAULT false,
  staff_post_policies BOOLEAN DEFAULT false,
  staff_edit_policies BOOLEAN DEFAULT false,
  staff_view_commissions BOOLEAN DEFAULT false,
  staff_view_recruiting BOOLEAN DEFAULT false,
  staff_edit_recruiting BOOLEAN DEFAULT false,
  staff_move_recruiting_stages BOOLEAN DEFAULT false,
  staff_view_contracts BOOLEAN DEFAULT false,
  staff_submit_carrier_requests BOOLEAN DEFAULT false,
  staff_edit_contracts BOOLEAN DEFAULT false,
  staff_view_analytics BOOLEAN DEFAULT false,
  staff_view_all_tickets BOOLEAN DEFAULT false,
  staff_respond_tickets BOOLEAN DEFAULT false,
  staff_nova_pro_enabled BOOLEAN DEFAULT false,
  staff_is_admin BOOLEAN DEFAULT false,
  admin_manage_staff_configs BOOLEAN DEFAULT false,
  admin_view_billing_readonly BOOLEAN DEFAULT false,
  admin_invite_users BOOLEAN DEFAULT false,
  admin_view_agency_tickets BOOLEAN DEFAULT false,
  staff_preset TEXT CHECK (staff_preset IN ('admin','recruiter','contracting_specialist','client_services','custom')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, organization_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_self_read ON public.role_permissions;
CREATE POLICY role_permissions_self_read ON public.role_permissions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
DROP POLICY IF EXISTS role_permissions_owner_all ON public.role_permissions;
CREATE POLICY role_permissions_owner_all ON public.role_permissions
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_role_permissions_org ON public.role_permissions(organization_id);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_owner_read ON public.audit_log;
CREATE POLICY audit_log_owner_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log(organization_id, created_at DESC);
