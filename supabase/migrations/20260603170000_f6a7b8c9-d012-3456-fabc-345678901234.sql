-- Profiles: add missing contracting fields
alter table public.profiles
  add column if not exists marital_status text,
  add column if not exists drivers_license_number text,
  add column if not exists drivers_license_state text,
  add column if not exists drivers_license_expiry date;

-- Producer documents: add metadata columns for E&O and AML details
alter table public.producer_documents
  add column if not exists carrier_name text,
  add column if not exists policy_number text,
  add column if not exists coverage_amount text,
  add column if not exists provider_name text,
  add column if not exists certificate_number text;

-- Banking / Direct deposit table
create table if not exists public.producer_banking (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.profiles(id) on delete cascade not null unique,
  bank_name text,
  account_type text default 'checking',
  routing_number text,
  account_last4 text,
  account_number_encrypted text,
  updated_at timestamptz default now()
);

alter table public.producer_banking enable row level security;

create policy "own" on public.producer_banking
  using (agent_id = auth.uid()) with check (agent_id = auth.uid());
