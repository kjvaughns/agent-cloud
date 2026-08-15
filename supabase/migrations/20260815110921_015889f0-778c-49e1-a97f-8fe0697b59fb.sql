alter table public.commission_grids
  add column if not exists state_code text,
  add column if not exists risk_class text;

comment on column public.commission_grids.state_code is
  'Two-letter code when this row is a state exception. NULL means it applies in every state, which is how every existing row reads.';
comment on column public.commission_grids.risk_class is
  'tobacco or non_tobacco when the carrier splits the rate. NULL means it applies to both.';

do $$ begin
  alter table public.commission_grids
    add constraint commission_grids_risk_class_check
    check (risk_class is null or risk_class in ('tobacco', 'non_tobacco'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.commission_grids
    add constraint commission_grids_state_code_check
    check (state_code is null or state_code ~ '^[A-Za-z]{2}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.commission_grids
    add constraint commission_grids_age_band_check
    check (
      age_group_min is null
      or age_group_max is null
      or age_group_min <= age_group_max
    ) not valid;
exception when duplicate_object then null; end $$;

drop index if exists public.commission_grids_org_row_uniq;

create unique index if not exists commission_grids_org_rule_uniq
  on public.commission_grids (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    carrier_id,
    product_name,
    coalesce(level_name, ''),
    coalesce(age_group_min, -1),
    coalesce(age_group_max, -1),
    coalesce(upper(state_code), ''),
    coalesce(risk_class, '')
  );

comment on index public.commission_grids_org_rule_uniq is
  'One rate per organization, carrier, product, level, age band, state and risk class. Replaces commission_grids_org_row_uniq, which keyed on the lower age bound only and had no state or risk, so a Florida exception could not be stored beside its national row and a second band sharing a lower bound overwrote the first. The zero UUID stands in for the shared default set so NULL organizations compare equal to each other rather than to nothing.';

create unique index if not exists discord_deliveries_once
  on public.discord_deliveries (integration_id, event_type, policy_id)
  where policy_id is not null and status = 'sent';

comment on index public.discord_deliveries_once is
  'One successful delivery per channel, event type and policy. Partial on sent so a skip and a later send for the same event can both be recorded — they are different facts. Enforced here as well as in application code because the code path that needs it is a retry, which is when two requests race.';

notify pgrst, 'reload schema';