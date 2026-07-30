-- ============================================================================
-- DISCORD SALES BOT
-- ============================================================================

create table if not exists public.discord_integrations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  webhook_url text not null,
  channel_label text,
  enabled boolean not null default true,
  post_deals boolean not null default true,
  post_milestones boolean not null default false,
  post_new_agents boolean not null default false,
  min_annual_premium numeric not null default 0,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.discord_integrations to authenticated;
grant all on public.discord_integrations to service_role;

alter table public.discord_integrations enable row level security;

drop policy if exists discord_integrations_owner on public.discord_integrations;
create policy discord_integrations_owner on public.discord_integrations
  for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create table if not exists public.discord_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  event_type text not null,
  policy_id uuid references public.policies(id) on delete set null,
  status text not null default 'sent' check (status in ('sent','failed','skipped')),
  http_status integer,
  error text,
  created_at timestamptz not null default now()
);

grant select on public.discord_deliveries to authenticated;
grant all on public.discord_deliveries to service_role;

create unique index if not exists idx_discord_once_per_policy
  on public.discord_deliveries(policy_id, event_type)
  where policy_id is not null and status = 'sent';

create index if not exists idx_discord_deliveries_org
  on public.discord_deliveries(organization_id, created_at desc);

alter table public.discord_deliveries enable row level security;

drop policy if exists discord_deliveries_read on public.discord_deliveries;
create policy discord_deliveries_read on public.discord_deliveries
  for select to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and public.is_org_owner(organization_id)
  );

-- ============================================================================
-- WHITE LABEL APPLICATIONS
-- ============================================================================

create table if not exists public.white_label_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_name text not null,
  tagline text,
  desired_domain text,
  accent_color text,
  logo_url text,
  agent_count text,
  timeline text,
  notes text,
  status text not null default 'submitted'
    check (status in ('submitted','in_review','approved','live','declined','withdrawn')),
  review_notes text,
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.white_label_applications to authenticated;
grant all on public.white_label_applications to service_role;

create unique index if not exists idx_white_label_one_open
  on public.white_label_applications(organization_id)
  where status in ('submitted','in_review','approved');

create index if not exists idx_white_label_status
  on public.white_label_applications(status, created_at desc);

alter table public.white_label_applications enable row level security;

drop policy if exists white_label_applications_read on public.white_label_applications;
create policy white_label_applications_read on public.white_label_applications
  for select to authenticated
  using (
    public.is_platform_admin()
    or (organization_id in (select public.my_org_ids()) and public.is_org_owner(organization_id))
  );

drop policy if exists white_label_applications_insert on public.white_label_applications;
create policy white_label_applications_insert on public.white_label_applications
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and public.is_org_owner(organization_id)
  );

drop policy if exists white_label_applications_update on public.white_label_applications;
create policy white_label_applications_update on public.white_label_applications
  for update to authenticated
  using (
    public.is_org_owner(organization_id)
    and status in ('submitted','in_review')
  )
  with check (
    public.is_org_owner(organization_id)
    and status in ('submitted','in_review','withdrawn')
  );

create or replace function public.touch_white_label_application()
returns trigger language plpgsql set search_path = public
as $$ begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists trg_touch_white_label on public.white_label_applications;
create trigger trg_touch_white_label
  before update on public.white_label_applications
  for each row execute function public.touch_white_label_application();