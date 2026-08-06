-- 1. 20260805100000_drop-scrape-credentials.sql
do $$
begin
  if to_regclass('public.scrape_requests') is null then
    raise notice 'scrape_requests does not exist here; nothing to clear.';
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'scrape_requests'
       and column_name = 'source_password_encrypted'
  ) then
    update public.scrape_requests set source_password_encrypted = null
     where source_password_encrypted is not null;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'scrape_requests'
       and column_name = 'agentlink_password_encrypted'
  ) then
    update public.scrape_requests set agentlink_password_encrypted = null
     where agentlink_password_encrypted is not null;
  end if;
end $$;

comment on table public.scrape_requests is
  'Historical full-import requests. Credentials are no longer collected; the password columns are retained empty and must never be written again.';

-- 2. 20260803120000_producer-notes.sql
create table if not exists public.producer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  visibility text not null default 'internal'
    check (visibility in ('internal', 'agent_visible')),
  related_request_id uuid references public.contracting_requests(id) on delete set null,
  related_carrier_id uuid references public.org_carriers(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_producer_notes_agent
  on public.producer_notes(organization_id, agent_id, created_at desc);
create index if not exists idx_producer_notes_request
  on public.producer_notes(related_request_id) where related_request_id is not null;

grant select, insert, delete on public.producer_notes to authenticated;
grant all on public.producer_notes to service_role;

alter table public.producer_notes enable row level security;

drop policy if exists producer_notes_read on public.producer_notes;
create policy producer_notes_read on public.producer_notes
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.can_view_contracting(organization_id)
    or public.is_in_downline(auth.uid(), agent_id)
    or (agent_id = auth.uid() and visibility = 'agent_visible')
  );

drop policy if exists producer_notes_insert on public.producer_notes;
create policy producer_notes_insert on public.producer_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and organization_id in (select public.my_org_ids())
    and (
      public.can_view_contracting(organization_id)
      or public.is_in_downline(auth.uid(), agent_id)
    )
  );

drop policy if exists producer_notes_delete on public.producer_notes;
create policy producer_notes_delete on public.producer_notes
  for delete to authenticated
  using (author_id = auth.uid() and organization_id in (select public.my_org_ids()));

drop trigger if exists trg_producer_notes_org on public.producer_notes;
create trigger trg_producer_notes_org
  before insert on public.producer_notes
  for each row execute function public.stamp_organization_id('agent_id');

comment on table public.producer_notes is
  'Append-only, agent-scoped notes written by contracting staff. Internal by default.';

update public.contracting_requests
   set submission_method = 'other'
 where submission_method is not null
   and submission_method not in (
     'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
   );

alter table public.contracting_requests
  drop constraint if exists contracting_requests_submission_method_check;
alter table public.contracting_requests
  add constraint contracting_requests_submission_method_check
  check (submission_method is null or submission_method in (
    'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
  ));

update public.contracting_submissions
   set method = 'other'
 where method is not null
   and method not in (
     'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
   );

alter table public.contracting_submissions
  drop constraint if exists contracting_submissions_method_check;
alter table public.contracting_submissions
  add constraint contracting_submissions_method_check
  check (method is null or method in (
    'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
  ));

-- 3. 20260805110000_revoke-seeded-founder-admin.sql
do $$
declare
  seeded_emails text[] := array['info@kingofsales.net', 'kjvaughns13@gmail.com'];
  removed int;
begin
  delete from public.user_roles ur
   using auth.users u
   where ur.user_id = u.id
     and u.email = any (seeded_emails)
     and ur.role::text in ('super_admin', 'admin');
  get diagnostics removed = row_count;
  if removed > 0 then
    raise notice 'Revoked % seeded platform-admin grant(s).', removed;
  else
    raise notice 'No seeded platform-admin grants present; nothing to revoke.';
  end if;
end $$;

do $$
begin
  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (organization_id, performed_by, action, target_user_id, previous_value, new_value)
    values (
      null, null, 'seeded_platform_admin_revoked', null,
      jsonb_build_object('source', 'hardcoded email seed in migrations 20260605010000/20260609010000/20260610090000/20260728100000'),
      jsonb_build_object('note', 'platform admin must now be granted out of band, per 20260805110000')
    );
  end if;
end $$;

-- 4. 20260805120000_profile-completeness-and-pii.sql
alter table public.organization_settings
  add column if not exists collect_contracting_pii boolean not null default false;

comment on column public.organization_settings.collect_contracting_pii is
  'When false (default) the Producer Profile hides SSN, driver''s license and banking, and completeness ignores them.';

create or replace function public.agent_completion(_agent uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_missing text[] := array[]::text[];
  v_earned  numeric := 0;
  v_total   numeric := 0;
  v_collect_pii bool := false;
  v_has_identity bool;
  v_has_npn      bool;
  v_has_address  bool;
  v_has_contact  bool;
  v_has_eo       bool;
  v_has_aml      bool;
  v_has_license  bool;
  v_has_ssn      bool;
  v_has_gov_id   bool;
  v_has_banking  bool;
begin
  select coalesce(bool_or(os.collect_contracting_pii), false)
    into v_collect_pii
    from public.profiles p
    join public.organization_settings os on os.organization_id = p.organization_id
   where p.id = _agent;

  select
    (first_name is not null and last_name is not null and date_of_birth is not null),
    (npn_number is not null and npn_number <> ''),
    (street_address is not null and city is not null
       and state is not null and zip_code is not null),
    (email is not null and email <> '' and phone is not null and phone <> ''),
    (ssn_last4 is not null and ssn_last4 <> '')
    into v_has_identity, v_has_npn, v_has_address, v_has_contact, v_has_ssn
    from public.profiles
   where id = _agent
   limit 1;

  v_has_identity := coalesce(v_has_identity, false);
  v_has_npn      := coalesce(v_has_npn, false);
  v_has_address  := coalesce(v_has_address, false);
  v_has_contact  := coalesce(v_has_contact, false);
  v_has_ssn      := coalesce(v_has_ssn, false);

  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type in ('eo_certificate', 'eo')) into v_has_eo;
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type = 'aml_certificate') into v_has_aml;
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type = 'government_id') into v_has_gov_id;
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type = 'voided_check') into v_has_banking;
  select exists(select 1 from public.state_licenses
                 where agent_id = _agent
                   and (expires_date is null or expires_date >= current_date))
    into v_has_license;

  v_total := v_total + 15;
  if v_has_identity then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'Name and date of birth'); end if;

  v_total := v_total + 15;
  if v_has_npn then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'NPN number'); end if;

  v_total := v_total + 15;
  if v_has_address then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'Home address'); end if;

  v_total := v_total + 10;
  if v_has_contact then v_earned := v_earned + 10;
    else v_missing := array_append(v_missing, 'Email and phone'); end if;

  v_total := v_total + 20;
  if v_has_eo then v_earned := v_earned + 20;
    else v_missing := array_append(v_missing, 'E&O certificate'); end if;

  v_total := v_total + 15;
  if v_has_aml then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'AML certificate'); end if;

  v_total := v_total + 10;
  if v_has_license then v_earned := v_earned + 10;
    else v_missing := array_append(v_missing, 'State license'); end if;

  if v_collect_pii then
    v_total := v_total + 10;
    if v_has_ssn then v_earned := v_earned + 10;
      else v_missing := array_append(v_missing, 'SSN (last 4)'); end if;
    v_total := v_total + 10;
    if v_has_gov_id then v_earned := v_earned + 10;
      else v_missing := array_append(v_missing, 'Government ID'); end if;
    v_total := v_total + 10;
    if v_has_banking then v_earned := v_earned + 10;
      else v_missing := array_append(v_missing, 'Voided check'); end if;
  end if;

  return jsonb_build_object(
    'pct', case when v_total = 0 then 0 else round(100 * v_earned / v_total) end,
    'missing', to_jsonb(v_missing)
  );
end $$;

comment on function public.agent_completion(uuid) is
  'Profile completeness. Every criterion is reachable from the UI and the denominator is computed, so 100% is always attainable.';

-- 5. 20260805130000_sample-data-flag.sql
do $$
declare
  t text;
  targets text[] := array[
    'clients', 'policies', 'commission_schedule', 'state_licenses',
    'producer_documents', 'contract_requests', 'tasks',
    'contracting_requests', 'writing_numbers', 'producer_appointments',
    'calendar_events'
  ];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, not present in this database', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists is_sample boolean not null default false', t);
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'organization_id'
    ) then
      execute format(
        'create index if not exists idx_%s_is_sample on public.%I (organization_id) where is_sample', t, t);
    else
      execute format(
        'create index if not exists idx_%s_is_sample on public.%I (is_sample) where is_sample', t, t);
    end if;
  end loop;
end $$;

comment on column public.clients.is_sample is
  'Seeded demo data. Never counts toward activation metrics, always visibly labelled, and removable in one action.';

-- 6. 20260805140000_demo-org.sql
alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'Public demo tenant. Outbound email, billing, invites and webhooks are refused, and the whole org is reset nightly.';

create unique index if not exists organizations_one_demo
  on public.organizations (is_demo) where is_demo;

create table if not exists public.demo_reset_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  detail text,
  rows_cleared integer
);

comment on table public.demo_reset_log is
  'One row per nightly demo reset. A stuck ''running'' row means a reset died part-way.';

create index if not exists idx_demo_reset_log_started
  on public.demo_reset_log (started_at desc);

grant select on public.demo_reset_log to authenticated;
grant all on public.demo_reset_log to service_role;

alter table public.demo_reset_log enable row level security;

drop policy if exists demo_reset_log_admin_read on public.demo_reset_log;
create policy demo_reset_log_admin_read on public.demo_reset_log
  for select to authenticated
  using (public.is_platform_admin());

-- 7. 20260805150000_book-of-business-sample-flag.sql
drop function if exists public.get_book_of_business(text, uuid);

create function public.get_book_of_business(_scope text, _agent_id uuid default null)
returns table (
  id uuid, client_id uuid, agent_id uuid, carrier_id uuid, carrier_name text,
  product text, policy_number text, status policy_status,
  monthly_premium numeric, annual_premium numeric, face_amount numeric,
  effective_date date, posted_at timestamptz, carrier_integration text,
  is_gtl boolean, client_first_name text, client_last_name text,
  agent_first_name text, agent_last_name text,
  is_sample boolean
)
language sql stable security definer set search_path = public
as $$
  with scope_agents as (
    select s from public.scope_agent_ids(_scope) s
     where _agent_id is null or s = _agent_id
  )
  select
    pol.id, pol.client_id, pol.agent_id, pol.carrier_id,
    car.name as carrier_name,
    pol.product, pol.policy_number, pol.status,
    pol.monthly_premium, pol.annual_premium, pol.face_amount,
    pol.effective_date, pol.posted_at, pol.carrier_integration, pol.is_gtl,
    cli.first_name, cli.last_name,
    pr.first_name, pr.last_name,
    coalesce(pol.is_sample, false)
  from public.policies pol
  left join public.clients  cli on cli.id = pol.client_id
  left join public.profiles pr  on pr.id  = pol.agent_id
  left join public.carriers car on car.id = pol.carrier_id
  where pol.agent_id in (select s from scope_agents where s is not null)
  order by pol.posted_at desc;
$$;

grant execute on function public.get_book_of_business(text, uuid) to authenticated;

-- 8. 20260806100000_user-onboarding-state.sql
create table if not exists public.user_onboarding_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  dismissed_steps text[] not null default '{}',
  checklist_dismissed boolean not null default false,
  completed_tours text[] not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.user_onboarding_state is
  'Per-person onboarding preferences: what they dismissed and which tours they have seen. Step completion is derived from real data on every read.';

create index if not exists idx_user_onboarding_state_org
  on public.user_onboarding_state (organization_id);

grant select, insert, update, delete on public.user_onboarding_state to authenticated;
grant all on public.user_onboarding_state to service_role;

alter table public.user_onboarding_state enable row level security;

drop policy if exists user_onboarding_state_own on public.user_onboarding_state;
create policy user_onboarding_state_own on public.user_onboarding_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 9. 20260806110000_carrier-aliases.sql
alter table public.carriers
  add column if not exists naic_code text;

comment on column public.carriers.naic_code is
  'NAIC company code, five digits. The canonical key for carrier identity.';

create unique index if not exists carriers_naic_code_uniq
  on public.carriers (naic_code) where naic_code is not null;

create table if not exists public.carrier_aliases (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  alias text not null,
  source text not null default 'curated'
    check (source in ('curated', 'confirmed_import', 'carrier_filing')),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.carrier_aliases is
  'Alternate names one carrier is written under. Feeds the alias tier of carrier matching.';

create unique index if not exists carrier_aliases_uniq
  on public.carrier_aliases (carrier_id, lower(alias), coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_carrier_aliases_lookup
  on public.carrier_aliases (lower(alias));

grant select, insert, update, delete on public.carrier_aliases to authenticated;
grant all on public.carrier_aliases to service_role;

alter table public.carrier_aliases enable row level security;

drop policy if exists carrier_aliases_read on public.carrier_aliases;
create policy carrier_aliases_read on public.carrier_aliases
  for select to authenticated
  using (
    organization_id is null
    or organization_id in (select public.my_org_ids())
  );

drop policy if exists carrier_aliases_write on public.carrier_aliases;
create policy carrier_aliases_write on public.carrier_aliases
  for all to authenticated
  using (organization_id is not null and organization_id in (select public.my_org_ids()))
  with check (organization_id is not null and organization_id in (select public.my_org_ids()));

insert into public.carrier_aliases (carrier_id, alias, source)
select c.id, a.alias, 'curated'
  from public.carriers c
  join (values
    ('Mutual of Omaha', 'MoO'),
    ('Mutual of Omaha', 'United of Omaha'),
    ('Mutual of Omaha', 'United of Omaha Life Insurance Company'),
    ('Mutual of Omaha', 'Omaha Insurance Company'),
    ('Americo', 'Americo Financial Life and Annuity'),
    ('Americo', 'Americo Financial Life & Annuity Insurance Company'),
    ('Foresters', 'Independent Order of Foresters'),
    ('Foresters', 'Foresters Financial'),
    ('Transamerica', 'Transamerica Life Insurance Company'),
    ('Transamerica', 'TLIC'),
    ('Gerber Life', 'Gerber Life Insurance Company'),
    ('Aetna', 'Accendo Insurance Company'),
    ('CVS/Aetna', 'Accendo'),
    ('Corebridge', 'AIG Life'),
    ('Corebridge', 'American General Life'),
    ('Corebridge', 'AGL')
  ) as a(carrier_name, alias) on lower(c.name) = lower(a.carrier_name)
 where not exists (
   select 1 from public.carrier_aliases x
    where x.carrier_id = c.id
      and lower(x.alias) = lower(a.alias)
      and x.organization_id is null
 );

-- 10. 20260806120000_ai-message-log.sql
create table if not exists public.ai_message_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  kind text not null,
  channel text not null default 'sms' check (channel in ('sms', 'email', 'other')),
  body text not null,
  screen_passed boolean not null,
  screen_flagged boolean not null default false,
  screen_findings jsonb not null default '[]'::jsonb,
  ruleset_version text not null,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_message_log_org
  on public.ai_message_log(organization_id, created_at desc);
create index if not exists idx_ai_message_log_agent
  on public.ai_message_log(agent_id, created_at desc);
create index if not exists idx_ai_message_log_flagged
  on public.ai_message_log(organization_id, created_at desc) where screen_flagged;

grant select, insert on public.ai_message_log to authenticated;
grant all on public.ai_message_log to service_role;

alter table public.ai_message_log enable row level security;

drop policy if exists ai_message_log_read on public.ai_message_log;
create policy ai_message_log_read on public.ai_message_log
  for select to authenticated
  using (
    public.is_platform_admin()
    or agent_id = auth.uid()
    or organization_id in (
      select o.id from public.organizations o where o.owner_id = auth.uid()
    )
    or exists (
      select 1
        from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.role in ('admin', 'agency_owner', 'super_admin')
    )
  );

drop policy if exists ai_message_log_insert on public.ai_message_log;
create policy ai_message_log_insert on public.ai_message_log
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    and (organization_id is null or organization_id in (select public.my_org_ids()))
  );

comment on table public.ai_message_log is
  'Immutable record of every AI-drafted client message and how it screened. No update or delete is granted to authenticated.';

-- 11. 20260806130000_nova-usage-and-upsells.sql
create table if not exists public.nova_feature_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  used_at timestamptz not null default now()
);

create index if not exists idx_nova_usage_lookup
  on public.nova_feature_usage(user_id, feature, used_at desc);

grant select, insert on public.nova_feature_usage to authenticated;
grant all on public.nova_feature_usage to service_role;

alter table public.nova_feature_usage enable row level security;

drop policy if exists nova_feature_usage_read on public.nova_feature_usage;
create policy nova_feature_usage_read on public.nova_feature_usage
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists nova_feature_usage_insert on public.nova_feature_usage;
create policy nova_feature_usage_insert on public.nova_feature_usage
  for insert to authenticated
  with check (user_id = auth.uid());

comment on table public.nova_feature_usage is
  'One row per free trial run of a gated Nova Pro feature. Append-only.';

create table if not exists public.upsell_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  placement text not null,
  event text not null check (event in ('impression', 'dismissal', 'click', 'conversion')),
  created_at timestamptz not null default now()
);

create index if not exists idx_upsell_events_placement
  on public.upsell_events(placement, event, created_at desc);

grant select, insert on public.upsell_events to authenticated;
grant all on public.upsell_events to service_role;

alter table public.upsell_events enable row level security;

drop policy if exists upsell_events_read on public.upsell_events;
create policy upsell_events_read on public.upsell_events
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists upsell_events_insert on public.upsell_events;
create policy upsell_events_insert on public.upsell_events
  for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

comment on table public.upsell_events is
  'Impressions, dismissals, clicks and conversions per upsell placement. Read by platform admins only.';

notify pgrst, 'reload schema';