-- Roles Architecture v1.0: configurable manager/staff permissions + audit log.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Manager permissions
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

  -- Staff permissions
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

  -- Admin staff extras
  admin_manage_staff_configs BOOLEAN DEFAULT false,
  admin_view_billing_readonly BOOLEAN DEFAULT false,
  admin_invite_users BOOLEAN DEFAULT false,
  admin_view_agency_tickets BOOLEAN DEFAULT false,

  staff_preset TEXT CHECK (staff_preset IN ('admin','recruiter','contracting_specialist','client_services','custom')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(profile_id, organization_id)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Users read their own row; org owners read/write for their org.
-- (Admin-staff writes go through service-role server functions with explicit checks.)
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

-- Generic audit log for role/permission changes (and future important actions).
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
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_owner_read ON public.audit_log;
CREATE POLICY audit_log_owner_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
-- Inserts via service role only.

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log(organization_id, created_at DESC);
