ALTER TABLE public.commission_schedule
  ADD COLUMN IF NOT EXISTS advance_pct numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS commission_pct numeric DEFAULT NULL;
