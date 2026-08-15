ALTER TABLE public.discord_integrations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.discord_deliveries ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS discord_deliveries_event_key_sent_idx
  ON public.discord_deliveries (integration_id, event_key)
  WHERE status = 'sent' AND event_key IS NOT NULL;