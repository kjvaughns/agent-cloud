
-- Extend invitation_links
ALTER TABLE public.invitation_links
  ADD COLUMN IF NOT EXISTS sent_on_behalf_of uuid,
  ADD COLUMN IF NOT EXISTS existing_agent_id uuid,
  ADD COLUMN IF NOT EXISTS linked_agent_id uuid,
  ADD COLUMN IF NOT EXISTS new_agent_first_name text,
  ADD COLUMN IF NOT EXISTS new_agent_last_name text,
  ADD COLUMN IF NOT EXISTS new_agent_email text,
  ADD COLUMN IF NOT EXISTS invite_signature_html text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS surelc_agent_id text,
  ADD COLUMN IF NOT EXISTS last_resent_at timestamptz;

-- Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_signature_html text;

-- Extend carriers
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS surelc_carrier_code text,
  ADD COLUMN IF NOT EXISTS datalink_enabled boolean NOT NULL DEFAULT false;

-- ============ surelc_progress ============
CREATE TABLE IF NOT EXISTS public.surelc_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  invitation_id uuid,
  section_name text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, section_name)
);
ALTER TABLE public.surelc_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY surelc_progress_select ON public.surelc_progress FOR SELECT TO authenticated
USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY surelc_progress_modify ON public.surelc_progress FOR ALL TO authenticated
USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'));

-- ============ change_requests ============
CREATE TABLE IF NOT EXISTS public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL,
  agent_id uuid NOT NULL,
  carrier_id uuid,
  contract_request_id uuid,
  request_type text NOT NULL,
  other_description text,
  new_upline_id uuid,
  new_level_name text,
  new_level_pct numeric,
  status text NOT NULL DEFAULT 'deferred',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_requests_select ON public.change_requests FOR SELECT TO authenticated
USING (submitted_by = auth.uid() OR agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY change_requests_insert ON public.change_requests FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid());

CREATE POLICY change_requests_update_admin ON public.change_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR submitted_by = auth.uid())
WITH CHECK (public.has_role(auth.uid(),'admin') OR submitted_by = auth.uid());

CREATE POLICY change_requests_delete ON public.change_requests FOR DELETE TO authenticated
USING (submitted_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ============ onboarding_documents ============
CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  invitation_id uuid,
  uploaded_by uuid NOT NULL,
  doc_type text NOT NULL,
  file_url text,
  file_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_docs_select ON public.onboarding_documents FOR SELECT TO authenticated
USING (agent_id = auth.uid() OR uploaded_by = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY onboarding_docs_modify ON public.onboarding_documents FOR ALL TO authenticated
USING (uploaded_by = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (uploaded_by = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(),'admin'));

-- ============ get_invite_by_token (public lookup) ============
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_upline record;
  result jsonb;
BEGIN
  SELECT * INTO v_invite FROM public.invitation_links WHERE token = _token LIMIT 1;
  IF v_invite IS NULL THEN RETURN NULL; END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('expired', true);
  END IF;
  SELECT first_name, last_name INTO v_upline FROM public.profiles WHERE id = v_invite.created_by;
  RETURN jsonb_build_object(
    'id', v_invite.id,
    'token', v_invite.token,
    'name', v_invite.name,
    'status', v_invite.status,
    'onboarding_step', v_invite.onboarding_step,
    'linked_agent_id', v_invite.linked_agent_id,
    'new_agent_email', v_invite.new_agent_email,
    'new_agent_first_name', v_invite.new_agent_first_name,
    'new_agent_last_name', v_invite.new_agent_last_name,
    'created_by', v_invite.created_by,
    'carrier_assignments', v_invite.carrier_assignments,
    'upline_name', COALESCE(v_upline.first_name,'') || ' ' || COALESCE(v_upline.last_name,''),
    'expires_at', v_invite.expires_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_surelc_progress_agent ON public.surelc_progress(agent_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_agent ON public.change_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_agent ON public.onboarding_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_invitation_links_token ON public.invitation_links(token);
