-- Extend existing tables
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.sms_conversations ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.sms_conversations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS twilio_sid text;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS is_auto boolean NOT NULL DEFAULT false;
ALTER TABLE public.dial_list_entries ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE public.dial_list_entries ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS stripe_payment_id text;

-- Agent phone settings
CREATE TABLE IF NOT EXISTS public.agent_phone_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE,
  phone_number text,
  twilio_sid text,
  forwarding_number text,
  forwarding_enabled boolean NOT NULL DEFAULT false,
  sms_registration_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_phone_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_phone_settings_owner_select" ON public.agent_phone_settings
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agent_phone_settings_owner_modify" ON public.agent_phone_settings
  FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Inbound SMS bump trigger
CREATE OR REPLACE FUNCTION public.sms_inbound_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.sms_conversations
       SET unread_count = COALESCE(unread_count,0) + 1,
           last_message_at = COALESCE(NEW.sent_at, now())
     WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.sms_conversations
       SET last_message_at = COALESCE(NEW.sent_at, now())
     WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sms_messages_bump ON public.sms_messages;
CREATE TRIGGER sms_messages_bump
AFTER INSERT ON public.sms_messages
FOR EACH ROW EXECUTE FUNCTION public.sms_inbound_bump();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_conversations;