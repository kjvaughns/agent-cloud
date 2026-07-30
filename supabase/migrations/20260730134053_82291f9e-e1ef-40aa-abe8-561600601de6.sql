ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS emails_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_categories jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS send_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_send_key_unique
  ON public.email_send_log (send_key)
  WHERE send_key IS NOT NULL AND status <> 'failed';