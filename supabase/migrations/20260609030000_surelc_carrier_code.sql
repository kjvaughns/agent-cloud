-- Add SureLC carrier code to carriers table (used to submit contracting requests via SureLC API)
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS surelc_carrier_code text DEFAULT NULL;
