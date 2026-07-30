-- ============================================================================
-- LANDING PAGE — DEMO REQUESTS
-- ============================================================================

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),

  first_name text not null,
  last_name  text not null,
  email      text not null,
  phone      text,

  agency_name text,
  agent_count text,
  current_tools text,
  primary_challenge text,
  preferred_time text,

  source text,
  utm jsonb,

  status text not null default 'new'
    check (status in ('new','contacted','qualified','demo_booked','won','lost')),
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, update, delete on public.demo_requests to authenticated;
grant all on public.demo_requests to service_role;

create index if not exists idx_demo_requests_status
  on public.demo_requests(status, created_at desc);
create index if not exists idx_demo_requests_email
  on public.demo_requests(lower(email));

alter table public.demo_requests enable row level security;

drop policy if exists demo_requests_platform on public.demo_requests;
create policy demo_requests_platform on public.demo_requests
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke insert on public.demo_requests from anon, authenticated;

create or replace function public.touch_demo_request()
returns trigger language plpgsql set search_path = public
as $$ begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists trg_touch_demo_request on public.demo_requests;
create trigger trg_touch_demo_request
  before update on public.demo_requests
  for each row execute function public.touch_demo_request();

-- ============================================================================
-- CLIENT BANKING (base table was never applied) + CARD FIELDS
-- ============================================================================

create table if not exists public.client_banking (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  bank_name text,
  routing_number text,
  account_number_masked text,
  account_type text default 'checking',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

grant select, insert, update, delete on public.client_banking to authenticated;
grant all on public.client_banking to service_role;

alter table public.client_banking enable row level security;

drop policy if exists agent_own on public.client_banking;
create policy client_banking_agent_own on public.client_banking
  for all to authenticated
  using (client_id in (select id from public.clients))
  with check (client_id in (select id from public.clients));

alter table public.client_banking
  add column if not exists card_brand     text,
  add column if not exists card_last4     text,
  add column if not exists card_name      text,
  add column if not exists card_exp_month smallint,
  add column if not exists card_exp_year  smallint,
  add column if not exists payment_method text default 'bank_draft',
  add column if not exists draft_date     smallint;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_card_last4_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_card_last4_check
      check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_card_exp_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_card_exp_check
      check (
        (card_exp_month is null or card_exp_month between 1 and 12)
        and (card_exp_year is null or card_exp_year between 2000 and 2100)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_payment_method_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_payment_method_check
      check (payment_method is null or payment_method in ('bank_draft','credit_card','money_order','direct_express'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_draft_date_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_draft_date_check
      check (draft_date is null or draft_date between 1 and 28);
  end if;
end
$do$;

drop trigger if exists trg_touch_client_banking on public.client_banking;
create trigger trg_touch_client_banking
  before update on public.client_banking
  for each row execute function public.set_updated_at();