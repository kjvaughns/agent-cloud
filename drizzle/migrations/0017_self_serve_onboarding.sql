ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_code text,
  ADD COLUMN IF NOT EXISTS suite_activated_at timestamptz;
UPDATE public.organizations SET onboarding_completed_at = now() WHERE onboarding_completed_at IS NULL;

CREATE TABLE public.help_videos (
  page_key text PRIMARY KEY,
  title text NOT NULL,
  video_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.help_videos TO authenticated;
GRANT ALL ON public.help_videos TO service_role;
ALTER TABLE public.help_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read help videos" ON public.help_videos FOR SELECT TO authenticated USING (true);
INSERT INTO public.help_videos (page_key, title) VALUES
 ('post-deal','How to post a deal'),('pipeline','Working your pipeline'),('book','Your book of business'),
 ('carrier-sync','Syncing carrier statements'),('hierarchy','Comp levels and hierarchy'),
 ('contracting','Contracting your agents'),('trophy-case','The Trophy Case');

CREATE TABLE public.help_video_dismissals (
  user_id uuid NOT NULL,
  page_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_key)
);
GRANT SELECT, INSERT, DELETE ON public.help_video_dismissals TO authenticated;
GRANT ALL ON public.help_video_dismissals TO service_role;
ALTER TABLE public.help_video_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own dismissals" ON public.help_video_dismissals FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.allison_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid,
  sender text NOT NULL,
  body text NOT NULL,
  page text,
  escalated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.allison_chat_messages (user_id, created_at);
GRANT SELECT ON public.allison_chat_messages TO authenticated;
GRANT ALL ON public.allison_chat_messages TO service_role;
ALTER TABLE public.allison_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chat or platform admin" ON public.allison_chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  user_id uuid,
  organization_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.funnel_events (event, created_at);
GRANT SELECT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read funnel" ON public.funnel_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));