ALTER TABLE public.commission_schedule
  ADD COLUMN IF NOT EXISTS pct_source text;

COMMENT ON COLUMN public.commission_schedule.pct_source IS
  'Where this row''s percentage came from: grid, agency_default, contract, level_carrier, level_base. Lets a payout be explained.';