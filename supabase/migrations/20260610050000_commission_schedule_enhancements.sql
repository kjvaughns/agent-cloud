-- Add metadata columns to commission_schedule
ALTER TABLE public.commission_schedule
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS writing_agent_id uuid;

-- Add 'trail' to payment_type check (trail = the balance after advance, paid monthly)
ALTER TABLE public.commission_schedule
  DROP CONSTRAINT IF EXISTS commission_schedule_payment_type_check;
ALTER TABLE public.commission_schedule
  ADD CONSTRAINT commission_schedule_payment_type_check
  CHECK (payment_type IN ('advance', 'deferred', 'trail', 'override', 'renewal'));
