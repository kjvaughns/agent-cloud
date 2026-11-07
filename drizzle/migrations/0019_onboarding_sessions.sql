CREATE TABLE public.onboarding_sessions (
  user_id uuid PRIMARY KEY,
  path text NOT NULL DEFAULT 'agent' CHECK (path IN ('agent','agency')),
  current_step text NOT NULL DEFAULT 'account',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  welcome_sent_at timestamptz,
  resume_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_sessions TO authenticated;
GRANT ALL ON public.onboarding_sessions TO service_role;
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own onboarding read" ON public.onboarding_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own onboarding insert" ON public.onboarding_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own onboarding update" ON public.onboarding_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX onboarding_sessions_resume_idx ON public.onboarding_sessions (updated_at) WHERE completed_at IS NULL AND resume_sent_at IS NULL;