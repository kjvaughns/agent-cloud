-- Add new columns to commission_schedule for full commission tracking
ALTER TABLE public.commission_schedule
  ADD COLUMN IF NOT EXISTS annual_premium numeric,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS writing_agent_id uuid,
  ADD COLUMN IF NOT EXISTS writing_agent_name text,
  ADD COLUMN IF NOT EXISTS policy_year int,
  ADD COLUMN IF NOT EXISTS month_number int;

-- Add 'trail' to the payment_type check (keep 'deferred' for backward compat)
ALTER TABLE public.commission_schedule
  DROP CONSTRAINT IF EXISTS commission_schedule_payment_type_check;
ALTER TABLE public.commission_schedule
  ADD CONSTRAINT commission_schedule_payment_type_check
  CHECK (payment_type IN ('advance', 'deferred', 'trail', 'override', 'renewal'));

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS commission_schedule_agent_date_idx
  ON public.commission_schedule(agent_id, payment_date);
CREATE INDEX IF NOT EXISTS commission_schedule_policy_idx
  ON public.commission_schedule(policy_id);

-- Mark GTL-style carriers with advance_cap='fixed'
-- (advance_cap_amount and advance_cap_months already exist as columns)
UPDATE public.carriers
SET advance_cap = 'fixed',
    advance_cap_amount = 600,
    advance_cap_months = 6
WHERE name ILIKE '%gtl%'
   OR name ILIKE '%group term life%';
