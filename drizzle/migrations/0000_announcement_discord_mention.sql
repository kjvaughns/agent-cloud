-- Per-channel default mention for announcement posts.
ALTER TABLE public.discord_integrations
  ADD COLUMN IF NOT EXISTS announcement_mention text NOT NULL DEFAULT 'none';

ALTER TABLE public.discord_integrations
  DROP CONSTRAINT IF EXISTS discord_integrations_announcement_mention_check;
ALTER TABLE public.discord_integrations
  ADD CONSTRAINT discord_integrations_announcement_mention_check
  CHECK (announcement_mention IN ('none', 'here', 'everyone'));

-- Per-post override, so a scheduled announcement pings the same way when cron
-- dispatches it long after the composer closed.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS discord_mention text NOT NULL DEFAULT 'default';

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_discord_mention_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_discord_mention_check
  CHECK (discord_mention IN ('default', 'none', 'here', 'everyone'));