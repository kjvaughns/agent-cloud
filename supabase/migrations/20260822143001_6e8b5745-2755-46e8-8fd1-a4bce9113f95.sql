ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS renewal_pct_default numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS override_renewal_pct_default numeric NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.organization_settings.renewal_pct_default IS
  'Stored form: 3 means 3% of annual premium. Personal renewal rate used when a carrier grid has no renewal row for the policy year.';
COMMENT ON COLUMN public.organization_settings.override_renewal_pct_default IS
  'Stored form: 1 means 1% of annual premium, paid to EACH upline at every renewal when the grid is silent.';