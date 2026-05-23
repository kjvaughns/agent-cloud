
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS ssn_encrypted text,
  ADD COLUMN IF NOT EXISTS ssn_last4 text,
  ADD COLUMN IF NOT EXISTS google_oauth_connected boolean NOT NULL DEFAULT false;

-- Background questions
CREATE TABLE IF NOT EXISTS public.background_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  question_number int NOT NULL,
  answer boolean NOT NULL,
  explanation text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, question_number)
);
ALTER TABLE public.background_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bgq_owner_all ON public.background_questions;
CREATE POLICY bgq_owner_all ON public.background_questions FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Producer agreements
CREATE TABLE IF NOT EXISTS public.producer_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE,
  signature_name text NOT NULL,
  signed_date timestamptz NOT NULL DEFAULT now(),
  agreement_version text NOT NULL DEFAULT '1.0'
);
ALTER TABLE public.producer_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pa_owner_all ON public.producer_agreements;
CREATE POLICY pa_owner_all ON public.producer_agreements FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Agent landing pages
CREATE TABLE IF NOT EXISTS public.agent_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE,
  published boolean NOT NULL DEFAULT false,
  contact_email text,
  contact_phone text,
  custom_message text,
  specialties jsonb NOT NULL DEFAULT '[]'::jsonb,
  carriers jsonb NOT NULL DEFAULT '[]'::jsonb,
  licensed_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_landing_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alp_owner_all ON public.agent_landing_pages;
CREATE POLICY alp_owner_all ON public.agent_landing_pages FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.alp_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS alp_touch ON public.agent_landing_pages;
CREATE TRIGGER alp_touch BEFORE UPDATE ON public.agent_landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.alp_touch_updated_at();

-- FAQ items
CREATE TABLE IF NOT EXISTS public.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS faq_read ON public.faq_items;
CREATE POLICY faq_read ON public.faq_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS faq_admin_write ON public.faq_items;
CREATE POLICY faq_admin_write ON public.faq_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SSN audit log
CREATE TABLE IF NOT EXISTS public.ssn_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  revealed_by uuid NOT NULL,
  revealed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ssn_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ssn_audit_owner_select ON public.ssn_audit_log;
CREATE POLICY ssn_audit_owner_select ON public.ssn_audit_log FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- SSN helpers using pgsodium symmetric encryption with a key derived from server
-- We use a static derived key via pgsodium.crypto_secretbox with a project secret.
-- Simpler approach: use pgcrypto + a per-row key wrapped by server secret.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Get/set encryption key from app.settings (set via vault later); fallback to a constant for v1.
CREATE OR REPLACE FUNCTION public.ssn_set(_ssn text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_key text := coalesce(current_setting('app.ssn_key', true), 'agentcloud_default_ssn_key_v1');
  v_last4 text;
BEGIN
  IF _ssn IS NULL OR length(regexp_replace(_ssn, '\D', '', 'g')) < 4 THEN
    RAISE EXCEPTION 'invalid ssn';
  END IF;
  v_last4 := right(regexp_replace(_ssn, '\D', '', 'g'), 4);
  UPDATE public.profiles
    SET ssn_encrypted = encode(pgp_sym_encrypt(_ssn, v_key)::bytea, 'base64'),
        ssn_last4 = v_last4
    WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.ssn_reveal() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_key text := coalesce(current_setting('app.ssn_key', true), 'agentcloud_default_ssn_key_v1');
  v_enc text;
  v_plain text;
BEGIN
  SELECT ssn_encrypted INTO v_enc FROM public.profiles WHERE id = auth.uid();
  IF v_enc IS NULL THEN RETURN NULL; END IF;
  v_plain := pgp_sym_decrypt(decode(v_enc, 'base64')::bytea, v_key);
  INSERT INTO public.ssn_audit_log(agent_id, revealed_by) VALUES (auth.uid(), auth.uid());
  RETURN v_plain;
END $$;

-- Slug generator
CREATE OR REPLACE FUNCTION public.generate_agent_slug() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_base text;
  v_slug text;
  v_n int := 0;
BEGIN
  IF NEW.agent_slug IS NOT NULL AND NEW.agent_slug <> '' THEN RETURN NEW; END IF;
  v_base := lower(regexp_replace(
    coalesce(NEW.first_name,'') || '-' || coalesce(NEW.last_name,''),
    '[^a-z0-9]+', '-', 'gi'));
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN v_base := 'agent'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE agent_slug = v_slug AND id <> NEW.id) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  NEW.agent_slug := v_slug;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_agent_slug ON public.profiles;
CREATE TRIGGER profiles_agent_slug BEFORE INSERT OR UPDATE OF first_name, last_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_agent_slug();

-- Backfill slugs for existing profiles
UPDATE public.profiles SET agent_slug = NULL WHERE agent_slug IS NULL;
UPDATE public.profiles p SET agent_slug = (
  SELECT lower(regexp_replace(coalesce(p.first_name,'') || '-' || coalesce(p.last_name,''),'[^a-z0-9]+','-','gi'))
) WHERE agent_slug IS NULL;

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-documents', 'agent-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS agent_docs_owner_select ON storage.objects;
CREATE POLICY agent_docs_owner_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agent-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')
  ));
DROP POLICY IF EXISTS agent_docs_owner_insert ON storage.objects;
CREATE POLICY agent_docs_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS agent_docs_owner_update ON storage.objects;
CREATE POLICY agent_docs_owner_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS agent_docs_owner_delete ON storage.objects;
CREATE POLICY agent_docs_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed FAQ
INSERT INTO public.faq_items (section, question, answer, sort_order) VALUES
  ('Commissions & Payments','When do I get paid?','Carriers post commissions weekly. Once a policy is active, 75% of year-1 commission is advanced on the effective date. The remaining 25% pays out across months 10–12.',1),
  ('Commissions & Payments','How are commission advances calculated?','For most products: 75% advance of (annual premium × your commission level) on the effective date. The 25% balance is split across months 10, 11, and 12.',2),
  ('Commissions & Payments','What is an override?','You earn the difference between your commission level and a downline agent''s level on each of their policies.',3),
  ('Contracting','How long does contracting take?','Most carriers approve in 2–7 business days once paperwork is complete. Annuity carriers can take 10–14 days because of Best Interest training verification.',1),
  ('Contracting','What documents do I need to upload?','E&O certificate, banking info (voided check or bank letter), driver''s license, and AML certificate.',2),
  ('Platform & Technology','How do I set up my phone number?','Go to My Phone → Settings. We will provision a Twilio number for you and verify it for SMS in 24–48 hours.',1),
  ('Platform & Technology','What is Sophai?','Sophai is the AI assistant that re-engages lapsed policies and warm-transfers reconnected clients back to you.',2),
  ('Licensing & Compliance','What is AML training?','Anti-Money-Laundering training is required annually by most life carriers. Use the free LIMRA course linked from your Producer Profile.',1),
  ('Licensing & Compliance','How do I add a new state license?','Email your new state license to support and we will update your record within one business day.',2)
ON CONFLICT DO NOTHING;
