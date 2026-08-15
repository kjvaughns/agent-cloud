ALTER TABLE public.client_banking
  ADD COLUMN IF NOT EXISTS draft_schedule text,
  ADD COLUMN IF NOT EXISTS draft_wednesday smallint;

ALTER TABLE public.client_banking
  DROP CONSTRAINT IF EXISTS client_banking_draft_schedule_check;
ALTER TABLE public.client_banking
  ADD CONSTRAINT client_banking_draft_schedule_check
  CHECK (draft_schedule IS NULL OR draft_schedule IN ('day_of_month','ss_wednesday'));

ALTER TABLE public.client_banking
  DROP CONSTRAINT IF EXISTS client_banking_draft_wednesday_check;
ALTER TABLE public.client_banking
  ADD CONSTRAINT client_banking_draft_wednesday_check
  CHECK (draft_wednesday IS NULL OR draft_wednesday BETWEEN 2 AND 4);