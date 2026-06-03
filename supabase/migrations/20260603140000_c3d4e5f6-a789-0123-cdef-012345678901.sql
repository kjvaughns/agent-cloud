-- Client health data table
create table if not exists public.client_health (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null unique,
  height_ft int,
  height_in int,
  weight_lbs int,
  tobacco_use boolean default false,
  primary_physician text,
  primary_physician_phone text,
  conditions text,
  medications text,
  medical_notes text,
  updated_at timestamptz default now()
);

alter table public.client_health enable row level security;

create policy "agent_own" on public.client_health using (
  client_id in (select id from public.clients where agent_id = auth.uid())
);
