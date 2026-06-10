CREATE TABLE IF NOT EXISTS public.commission_backfill_queue (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id  uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  processed  boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.commission_backfill_queue (policy_id)
SELECT p.id
FROM public.policies p
WHERE p.annual_premium > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.commission_schedule cs WHERE cs.policy_id = p.id
  )
ON CONFLICT DO NOTHING;
