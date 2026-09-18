ALTER TABLE public.org_carriers
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS business_hours text,
  ADD COLUMN IF NOT EXISTS contracting_speed_days integer,
  ADD COLUMN IF NOT EXISTS pay_frequency text,
  ADD COLUMN IF NOT EXISTS agent_portal_url text,
  ADD COLUMN IF NOT EXISTS training_url text,
  ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE public.org_carriers
  ADD CONSTRAINT org_carriers_pay_frequency_chk
  CHECK (pay_frequency IS NULL OR pay_frequency IN ('weekly','monthly')) NOT VALID;

ALTER TABLE public.org_carriers
  ADD CONSTRAINT org_carriers_contracting_speed_days_chk
  CHECK (contracting_speed_days IS NULL OR (contracting_speed_days >= 0 AND contracting_speed_days <= 365)) NOT VALID;