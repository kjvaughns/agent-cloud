alter table public.org_contracting_settings
  add column if not exists agents_may_self_activate_carriers boolean not null default false;

comment on column public.org_contracting_settings.agents_may_self_activate_carriers is
  'When false (default) an agent reporting their own writing number creates a request for staff to confirm, rather than an active contract. When true the contract goes active but keeps source = self_reported until somebody verifies it.';