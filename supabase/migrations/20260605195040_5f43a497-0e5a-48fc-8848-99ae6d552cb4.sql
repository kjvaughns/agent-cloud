
CREATE TABLE public.pending_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  location text,
  status_label text,
  depth text,
  contracts_label text,
  upline_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_date text,
  last_active_label text,
  source text DEFAULT 'agentlink_import',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pending_agents_email_lower_uidx ON public.pending_agents (lower(email));
CREATE INDEX pending_agents_upline_idx ON public.pending_agents (upline_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_agents TO authenticated;
GRANT ALL ON public.pending_agents TO service_role;

ALTER TABLE public.pending_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_agents_upline_or_admin"
  ON public.pending_agents FOR ALL
  TO authenticated
  USING (auth.uid() = upline_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (auth.uid() = upline_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

ALTER TABLE public.clients ADD COLUMN assigned_to_email text;
ALTER TABLE public.policies ADD COLUMN assigned_to_email text;
ALTER TABLE public.contact_history ADD COLUMN assigned_to_email text;

CREATE INDEX clients_assigned_to_email_idx ON public.clients (lower(assigned_to_email)) WHERE assigned_to_email IS NOT NULL;
CREATE INDEX policies_assigned_to_email_idx ON public.policies (lower(assigned_to_email)) WHERE assigned_to_email IS NOT NULL;
CREATE INDEX contact_history_assigned_to_email_idx ON public.contact_history (lower(assigned_to_email)) WHERE assigned_to_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa RECORD;
  v_email_lower text := lower(NEW.email);
BEGIN
  SELECT * INTO pa FROM public.pending_agents WHERE lower(email) = v_email_lower LIMIT 1;

  IF pa.id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, first_name, last_name, upline_id, status)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name',''), pa.first_name, ''),
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name',''),  pa.last_name,  ''),
      pa.upline_id,
      'active'
    );

    UPDATE public.clients
       SET agent_id = NEW.id, assigned_to_email = NULL
     WHERE lower(assigned_to_email) = v_email_lower;

    UPDATE public.policies
       SET agent_id = NEW.id, assigned_to_email = NULL
     WHERE lower(assigned_to_email) = v_email_lower;

    UPDATE public.contact_history
       SET agent_id = NEW.id, assigned_to_email = NULL
     WHERE lower(assigned_to_email) = v_email_lower;

    DELETE FROM public.pending_agents WHERE id = pa.id;
  ELSE
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
      NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name',''),
      COALESCE(NEW.raw_user_meta_data->>'last_name','')
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.wallet (agent_id, balance_cents) VALUES (NEW.id, 0)
    ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
