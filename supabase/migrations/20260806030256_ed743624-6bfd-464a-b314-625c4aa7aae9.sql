alter table public.policies
  add column if not exists premium_mode text;

comment on column public.policies.premium_mode is
  'How the premium is paid: monthly, quarterly, semi_annual, annual, single, or free text as imported. Nullable — most historical rows have no mode recorded. Monthly-draft business lapses at several times the rate of annual, so this feeds lapse risk.';

alter table public.clients
  add column if not exists annual_income numeric;

comment on column public.clients.annual_income is
  'Stated annual household income in dollars. Written by the importer from the migration template''s "Monthly Income" column (x12) and used by the coverage-gap review.';

alter table public.retention_cases
  drop constraint if exists retention_cases_risk_reason_check;

alter table public.retention_cases
  add constraint retention_cases_risk_reason_check
  check (risk_reason = any (array[
    'lapse_pending', 'payment_failed', 'nsf', 'cancelled_pending',
    'manual', 'no_contact', 'predicted'
  ]));

notify pgrst, 'reload schema';