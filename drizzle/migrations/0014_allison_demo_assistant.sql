CREATE TABLE public.allison_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_request_id uuid,
  email text NOT NULL,
  name text,
  subject text NOT NULL,
  thread_id text UNIQUE,
  last_message_id text,
  status text NOT NULL DEFAULT 'open',
  escalated boolean NOT NULL DEFAULT false,
  escalation_reason text,
  reply_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX allison_threads_due ON public.allison_threads(reply_after) WHERE reply_after IS NOT NULL;
CREATE TABLE public.allison_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_ref uuid NOT NULL REFERENCES public.allison_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('lead','allison','team')),
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  email_message_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allison_job_lock (
  name text PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT now(),
  paused_reason text
);
INSERT INTO public.allison_job_lock(name) VALUES ('replies');
GRANT SELECT ON public.allison_threads, public.allison_messages TO authenticated;
GRANT ALL ON public.allison_threads, public.allison_messages, public.allison_job_lock TO service_role;
ALTER TABLE public.allison_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allison_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allison_job_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read threads" ON public.allison_threads FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "platform admins read messages" ON public.allison_messages FOR SELECT TO authenticated USING (public.is_platform_admin());