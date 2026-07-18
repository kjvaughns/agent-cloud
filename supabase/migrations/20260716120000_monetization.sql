-- Monetization & Billing (v2.1): Agency Plan, Nova Pro (dual path), Solo, White-Label,
-- Nova Partner Revenue Program. Additive only — no existing columns modified.

-- Organization billing
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive'
    CHECK (subscription_status IN ('trialing','active','past_due','cancelled','inactive')),
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'agency'
    CHECK (plan_type IN ('agency','white_label','solo')),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_seat_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_seats_purchased INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_partner_commission_rate NUMERIC DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS nova_partner_commission_ytd NUMERIC DEFAULT 0;

-- Agent billing and Nova Pro
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS nova_pro_status TEXT DEFAULT 'inactive'
    CHECK (nova_pro_status IN ('active','inactive','past_due','grace_period')),
  ADD COLUMN IF NOT EXISTS nova_pro_source TEXT
    CHECK (nova_pro_source IN ('personal','agency','solo')),
  ADD COLUMN IF NOT EXISTS nova_pro_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS nova_pro_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nova_pro_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nova_usage_calls_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_sms INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_ai_queries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_automations INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_usage_reset_at TIMESTAMPTZ;

-- Nova partner commissions audit table
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
ALTER TABLE public.nova_partner_commissions ENABLE ROW LEVEL SECURITY;

-- Org owners + super admins read their org's commission audit rows.
DROP POLICY IF EXISTS nova_partner_commissions_read ON public.nova_partner_commissions;
CREATE POLICY nova_partner_commissions_read ON public.nova_partner_commissions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
-- Writes happen via service role (webhook) only — no authenticated write policy.
