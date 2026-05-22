
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('agent','manager','admin');
CREATE TYPE public.pipeline_stage AS ENUM ('new','callback','almost_there','sold');
CREATE TYPE public.temperature AS ENUM ('hot','warm','cold');
CREATE TYPE public.policy_status AS ENUM ('active','issued_not_paid','in_review','lapse_pending','lapsed','cancelled','withdrawn','not_taken','postponed','carrier_na');
CREATE TYPE public.contract_status AS ENUM ('requested','submitted','processing','issue','active','rejected');
CREATE TYPE public.recruiting_stage AS ENUM ('new','callback','in_course','getting_licensed','onboarded');
CREATE TYPE public.wallet_txn_type AS ENUM ('sms_out','sms_in','mms_out','mms_in','call_out','call_in','policy_recovery_ai','top_up');
CREATE TYPE public.event_type AS ENUM ('appointment','birthday','policy_anniversary','beneficiary_checkin','lapse_follow_up');
CREATE TYPE public.script_category AS ENUM ('basic','needs_analysis','objection_handling','mortgage_protection','beneficiary','check_in');
CREATE TYPE public.challenge_type AS ENUM ('daily','weekly','monthly','quarterly');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT, last_name TEXT, email TEXT, phone TEXT, avatar_url TEXT,
  upline_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_in_downline(_upline UUID, _target UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE downline AS (
    SELECT id FROM public.profiles WHERE upline_id = _upline
    UNION ALL
    SELECT p.id FROM public.profiles p INNER JOIN downline d ON p.upline_id = d.id
  )
  SELECT _target = _upline OR EXISTS (SELECT 1 FROM downline WHERE id = _target)
$$;

-- CLIENTS
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  phone TEXT, phone_type TEXT, email TEXT, date_of_birth DATE,
  street_address TEXT, city TEXT, state TEXT, zip_code TEXT, born_country_state TEXT,
  stage pipeline_stage NOT NULL DEFAULT 'new',
  temperature temperature NOT NULL DEFAULT 'cold',
  score_pct INT DEFAULT 0,
  notes TEXT, preferred_contact TEXT, best_time_to_call TEXT, communication_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_opened_at TIMESTAMPTZ
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT, relationship TEXT, phone TEXT, dob DATE, percentage NUMERIC
);
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  earned_income NUMERIC DEFAULT 0, social_security NUMERIC DEFAULT 0,
  pension NUMERIC DEFAULT 0, other_income NUMERIC DEFAULT 0,
  employment_status TEXT, retirement_age INT, savings NUMERIC DEFAULT 0
);
ALTER TABLE public.client_financials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_type TEXT, note TEXT, is_auto BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.life_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT, event_date DATE, note TEXT
);
ALTER TABLE public.life_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, website TEXT, phone TEXT, hours TEXT,
  contracting_speed_days INT, pay_frequency TEXT, advance_cap TEXT, ideal_client TEXT,
  agent_portal_url TEXT, training_url TEXT, about_text TEXT
);
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES public.carriers(id),
  product TEXT, policy_number TEXT, effective_date DATE,
  face_amount NUMERIC, monthly_premium NUMERIC, annual_premium NUMERIC,
  status policy_status NOT NULL DEFAULT 'in_review',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  carrier_integration TEXT
);
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.commission_grids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  age_group_min INT, age_group_max INT,
  year_1_pct NUMERIC, years_2_5_pct NUMERIC, years_6_plus_pct NUMERIC,
  level_name TEXT
);
ALTER TABLE public.commission_grids ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agent_commission_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  commission_level TEXT, assigned_pct NUMERIC,
  UNIQUE (agent_id, carrier_id)
);
ALTER TABLE public.agent_commission_levels ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contract_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.carriers(id),
  status contract_status NOT NULL DEFAULT 'requested',
  writing_number TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ, notes TEXT
);
ALTER TABLE public.contract_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.carriers(id),
  from_upline_id UUID REFERENCES public.profiles(id),
  to_upline_id UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invitation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  carrier_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invitation_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recruiting_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT, phone TEXT, email TEXT,
  stage recruiting_stage NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recruiting_prospects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type wallet_txn_type NOT NULL,
  amount_cents BIGINT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, body TEXT, media_url TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), status TEXT
);
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL, direction TEXT NOT NULL,
  duration_seconds INT DEFAULT 0, recording_url TEXT, summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.dial_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dial_lists ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.dial_list_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.dial_lists(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  called_at TIMESTAMPTZ, outcome TEXT
);
ALTER TABLE public.dial_list_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.needs_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL, response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.needs_analysis ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL, event_type event_type NOT NULL,
  start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ, notes TEXT
);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, category script_category NOT NULL,
  content_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.state_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL, license_number TEXT,
  issued_date DATE, expires_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.state_licenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.states_reference (
  state_code TEXT PRIMARY KEY, state_name TEXT NOT NULL,
  timezone TEXT, doi_url TEXT, prelicensing_url TEXT,
  license_fee_cents INT DEFAULT 7000
);
ALTER TABLE public.states_reference ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, body_html TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL, custom_slug TEXT,
  title TEXT, published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recruiting_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recruiting_funnels ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period TEXT, type challenge_type NOT NULL,
  target_value NUMERIC, current_value NUMERIC DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trophies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL,
  type challenge_type NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trophies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sophai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_recovery_enabled BOOLEAN DEFAULT false,
  sms_followup_enabled BOOLEAN DEFAULT false,
  birthday_messages_enabled BOOLEAN DEFAULT false,
  beneficiary_engagement_enabled BOOLEAN DEFAULT false
);
ALTER TABLE public.sophai_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sophai_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sophai_activity ENABLE ROW LEVEL SECURITY;

-- Signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name',''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  INSERT INTO public.wallet (agent_id, balance_cents) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES
CREATE POLICY "profiles_visible" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_in_downline(auth.uid(), id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Loop over tables that have either agent_id, recruiter_id, created_by, or user_id as owner column
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('clients','agent_id'),
    ('contact_history','agent_id'),
    ('policies','agent_id'),
    ('agent_commission_levels','agent_id'),
    ('contract_requests','agent_id'),
    ('transfer_requests','agent_id'),
    ('invitation_links','created_by'),
    ('recruiting_prospects','recruiter_id'),
    ('wallet','agent_id'),
    ('wallet_transactions','agent_id'),
    ('sms_conversations','agent_id'),
    ('call_logs','agent_id'),
    ('dial_lists','agent_id'),
    ('needs_analysis','agent_id'),
    ('calendar_events','agent_id'),
    ('state_licenses','agent_id'),
    ('notifications','user_id'),
    ('landing_pages','agent_id'),
    ('recruiting_funnels','agent_id'),
    ('challenges','agent_id'),
    ('trophies','agent_id'),
    ('sophai_settings','agent_id'),
    ('sophai_activity','agent_id')
  ) AS x(tbl, col)
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%I = auth.uid() OR public.is_in_downline(auth.uid(), %I) OR public.has_role(auth.uid(),''admin''))',
      rec.tbl || '_owner_select', rec.tbl, rec.col, rec.col);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%I = auth.uid() OR public.has_role(auth.uid(),''admin'')) WITH CHECK (%I = auth.uid() OR public.has_role(auth.uid(),''admin''))',
      rec.tbl || '_owner_modify', rec.tbl, rec.col, rec.col);
  END LOOP;
END $$;

-- Child via parent client
CREATE POLICY "beneficiaries_via_client" ON public.beneficiaries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.is_in_downline(auth.uid(), c.agent_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "client_financials_via_client" ON public.client_financials FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.is_in_downline(auth.uid(), c.agent_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "life_events_via_client" ON public.life_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.is_in_downline(auth.uid(), c.agent_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "sms_messages_via_conversation" ON public.sms_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sms_conversations sc WHERE sc.id = conversation_id AND (sc.agent_id = auth.uid() OR public.is_in_downline(auth.uid(), sc.agent_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sms_conversations sc WHERE sc.id = conversation_id AND (sc.agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "dial_list_entries_via_list" ON public.dial_list_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dial_lists dl WHERE dl.id = list_id AND (dl.agent_id = auth.uid() OR public.is_in_downline(auth.uid(), dl.agent_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dial_lists dl WHERE dl.id = list_id AND (dl.agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "carriers_read" ON public.carriers FOR SELECT TO authenticated USING (true);
CREATE POLICY "carriers_admin_write" ON public.carriers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "commission_grids_read" ON public.commission_grids FOR SELECT TO authenticated USING (true);
CREATE POLICY "commission_grids_admin_write" ON public.commission_grids FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "states_reference_read" ON public.states_reference FOR SELECT TO authenticated USING (true);
CREATE POLICY "scripts_read" ON public.scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "scripts_admin_write" ON public.scripts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "announcements_read" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcements_admin_write" ON public.announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- SEED
INSERT INTO public.states_reference (state_code, state_name, timezone, doi_url, prelicensing_url, license_fee_cents) VALUES
('AL','Alabama','Central','https://www.aldoi.gov/','https://nipr.com/licensing-center',7000),
('AK','Alaska','Alaska','https://www.commerce.alaska.gov/web/ins/','https://nipr.com/licensing-center',7000),
('AZ','Arizona','Mountain','https://difi.az.gov/','https://nipr.com/licensing-center',7000),
('AR','Arkansas','Central','https://insurance.arkansas.gov/','https://nipr.com/licensing-center',7000),
('CA','California','Pacific','https://www.insurance.ca.gov/','https://nipr.com/licensing-center',18800),
('CO','Colorado','Mountain','https://doi.colorado.gov/','https://nipr.com/licensing-center',7000),
('CT','Connecticut','Eastern','https://portal.ct.gov/cid','https://nipr.com/licensing-center',8000),
('DE','Delaware','Eastern','https://insurance.delaware.gov/','https://nipr.com/licensing-center',7000),
('FL','Florida','Eastern','https://www.myfloridacfo.com/division/agents','https://nipr.com/licensing-center',5000),
('GA','Georgia','Eastern','https://oci.georgia.gov/','https://nipr.com/licensing-center',10000),
('HI','Hawaii','Hawaii','https://cca.hawaii.gov/ins/','https://nipr.com/licensing-center',7000),
('ID','Idaho','Mountain','https://doi.idaho.gov/','https://nipr.com/licensing-center',8000),
('IL','Illinois','Central','https://idoi.illinois.gov/','https://nipr.com/licensing-center',18000),
('IN','Indiana','Eastern','https://www.in.gov/idoi/','https://nipr.com/licensing-center',4000),
('IA','Iowa','Central','https://iid.iowa.gov/','https://nipr.com/licensing-center',5000),
('KS','Kansas','Central','https://insurance.kansas.gov/','https://nipr.com/licensing-center',3000),
('KY','Kentucky','Eastern','https://insurance.ky.gov/','https://nipr.com/licensing-center',5000),
('LA','Louisiana','Central','https://www.ldi.la.gov/','https://nipr.com/licensing-center',5000),
('ME','Maine','Eastern','https://www.maine.gov/pfr/insurance/','https://nipr.com/licensing-center',5500),
('MD','Maryland','Eastern','https://insurance.maryland.gov/','https://nipr.com/licensing-center',5400),
('MA','Massachusetts','Eastern','https://www.mass.gov/orgs/division-of-insurance','https://nipr.com/licensing-center',22500),
('MI','Michigan','Eastern','https://www.michigan.gov/difs','https://nipr.com/licensing-center',1000),
('MN','Minnesota','Central','https://mn.gov/commerce/','https://nipr.com/licensing-center',5000),
('MS','Mississippi','Central','https://www.mid.ms.gov/','https://nipr.com/licensing-center',6000),
('MO','Missouri','Central','https://insurance.mo.gov/','https://nipr.com/licensing-center',10000),
('MT','Montana','Mountain','https://csimt.gov/','https://nipr.com/licensing-center',6000),
('NE','Nebraska','Central','https://doi.nebraska.gov/','https://nipr.com/licensing-center',5000),
('NV','Nevada','Pacific','https://doi.nv.gov/','https://nipr.com/licensing-center',12500),
('NH','New Hampshire','Eastern','https://www.nh.gov/insurance/','https://nipr.com/licensing-center',21000),
('NJ','New Jersey','Eastern','https://www.state.nj.us/dobi/','https://nipr.com/licensing-center',17000),
('NM','New Mexico','Mountain','https://www.osi.state.nm.us/','https://nipr.com/licensing-center',5000),
('NY','New York','Eastern','https://www.dfs.ny.gov/','https://nipr.com/licensing-center',8000),
('NC','North Carolina','Eastern','https://www.ncdoi.gov/','https://nipr.com/licensing-center',5000),
('ND','North Dakota','Central','https://www.insurance.nd.gov/','https://nipr.com/licensing-center',10000),
('OH','Ohio','Eastern','https://insurance.ohio.gov/','https://nipr.com/licensing-center',5000),
('OK','Oklahoma','Central','https://www.oid.ok.gov/','https://nipr.com/licensing-center',9000),
('OR','Oregon','Pacific','https://dfr.oregon.gov/','https://nipr.com/licensing-center',5000),
('PA','Pennsylvania','Eastern','https://www.insurance.pa.gov/','https://nipr.com/licensing-center',5500),
('RI','Rhode Island','Eastern','https://dbr.ri.gov/','https://nipr.com/licensing-center',7500),
('SC','South Carolina','Eastern','https://doi.sc.gov/','https://nipr.com/licensing-center',4000),
('SD','South Dakota','Central','https://dlr.sd.gov/insurance/','https://nipr.com/licensing-center',3000),
('TN','Tennessee','Central','https://www.tn.gov/commerce/insurance.html','https://nipr.com/licensing-center',5000),
('TX','Texas','Central','https://www.tdi.texas.gov/','https://nipr.com/licensing-center',5000),
('UT','Utah','Mountain','https://insurance.utah.gov/','https://nipr.com/licensing-center',7500),
('VT','Vermont','Eastern','https://dfr.vermont.gov/insurance','https://nipr.com/licensing-center',5000),
('VA','Virginia','Eastern','https://www.scc.virginia.gov/pages/Insurance','https://nipr.com/licensing-center',1300),
('WA','Washington','Pacific','https://www.insurance.wa.gov/','https://nipr.com/licensing-center',5500),
('WV','West Virginia','Eastern','https://www.wvinsurance.gov/','https://nipr.com/licensing-center',5000),
('WI','Wisconsin','Central','https://oci.wi.gov/','https://nipr.com/licensing-center',7500),
('WY','Wyoming','Mountain','http://doi.wyo.gov/','https://nipr.com/licensing-center',6000),
('DC','District of Columbia','Eastern','https://disb.dc.gov/','https://nipr.com/licensing-center',6500);

INSERT INTO public.carriers (name, website, phone, hours, contracting_speed_days, pay_frequency, advance_cap, ideal_client, agent_portal_url, training_url, about_text) VALUES
('Mutual of Omaha','https://www.mutualofomaha.com','800-775-6000','M-F 7am-7pm CT',3,'Weekly','$10,000 - 9 Month Advance','Standard-Preferred','https://sales.mutualofomaha.com','https://training.mutualofomaha.com','Fortune 500 mutual insurance and financial services company.'),
('Americo','https://www.americo.com','800-231-0801','M-F 8am-5pm CT',5,'Weekly','$5,000 - 6 Month Advance','Standard','https://agents.americo.com','https://americo.com/training','Final expense and term life specialist with quick underwriting.'),
('Foresters Financial','https://www.foresters.com','866-466-7166','M-F 8am-8pm ET',4,'Weekly','$7,500 - 9 Month Advance','Standard-Preferred','https://agentportal.foresters.com','https://foresters.com/training','International fraternal benefit society serving families.'),
('Aetna / SureBridge','https://www.surebridgeinsurance.com','844-381-8763','M-F 8am-6pm ET',7,'Weekly','$5,000 - 6 Month Advance','Senior','https://surebridge.com/agents','https://surebridge.com/training','Supplemental health and life products for the senior market.'),
('Transamerica','https://www.transamerica.com','800-797-2643','M-F 8am-6pm ET',5,'Monthly','$10,000 - 12 Month Advance','Standard-Preferred','https://agentnet.transamerica.com','https://transamerica.com/training','One of the largest life insurance providers in the country.'),
('Prosperity Life','https://www.prosperitylife.com','877-665-7376','M-F 8am-5pm CT',5,'Weekly','$7,500 - 9 Month Advance','Final Expense','https://agents.prosperitylife.com','https://prosperitylife.com/training','Final expense and life specialist.'),
('CICA Life','https://www.cicalife.com','972-308-6800','M-F 8am-5pm CT',4,'Weekly','$5,000 - 6 Month Advance','Standard','https://agents.cicalife.com','https://cicalife.com/training','Family-focused life insurance.'),
('Royal Neighbors','https://www.royalneighbors.org','800-627-4762','M-F 8am-5pm CT',5,'Weekly','$5,000 - 6 Month Advance','Women & Family','https://agents.royalneighbors.org','https://royalneighbors.org/training','Women-led fraternal benefit society.'),
('AIG / Corebridge','https://www.corebridgefinancial.com','800-340-2765','M-F 8am-7pm ET',6,'Monthly','$10,000 - 12 Month Advance','Standard-Preferred','https://agents.corebridgefinancial.com','https://corebridgefinancial.com/training','Full-service life insurance and annuities.'),
('SBLI','https://www.sbli.com','888-224-7254','M-F 8am-6pm ET',4,'Weekly','$7,500 - 9 Month Advance','Standard-Preferred','https://agents.sbli.com','https://sbli.com/training','Savings Bank Life Insurance Company.');

INSERT INTO public.scripts (title, category, content_markdown) VALUES
('Basic Script','basic','# Basic Script\n\nUse this opening for a first call:\n\n> Hi {{firstName}}, this is {{agentName}} with Agent Cloud. I''m reaching out because you recently requested information about life insurance...'),
('Script with Needs Analysis','needs_analysis','# Needs Analysis\n\nStart with: "I''m not calling to sell you anything, I''m just calling to get to know you and understand what you''re looking for..."\n\n1. Do you have kids?\n2. Any health conditions we should know about?\n3. What''s your monthly budget for coverage?'),
('Objection Handling Sheet','objection_handling','# Objections\n\n**"I need to think about it"**\n> I understand. What specifically would you like to think about? Maybe I can help right now.\n\n**"It''s too expensive"**\n> What if we could find a plan that fits your budget?'),
('Mortgage Protection Script','mortgage_protection','# Mortgage Protection\n\nWe noticed you recently bought a home. We help families protect their largest asset...'),
('Beneficiary Script','beneficiary','# Beneficiary Outreach\n\nHi {{firstName}}, I''m reaching out because you''re listed as a beneficiary on a policy...'),
('Client Check-in Script','check_in','# Annual Check-In\n\nHi {{firstName}}, just calling to make sure your coverage still fits your life...');
